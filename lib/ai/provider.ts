// ============================================================
// AI provider abstraction (Part "AI PROVIDER").
//
// Server-only module — never import this from a "use client" file.
// The rest of the app talks to `getAiProvider()` and never to Gemini
// directly, so the model/vendor can change later without touching
// application logic (services/ai-tools-service.ts, app/api/ai/*).
// ============================================================

export type AiErrorCategory =
  | "not_configured"
  | "rate_limited"
  | "quota_exceeded"
  | "timeout"
  | "network"
  | "invalid_response"
  | "model_unavailable"
  | "unknown";

export class AiProviderError extends Error {
  category: AiErrorCategory;
  retryable: boolean;
  constructor(category: AiErrorCategory, message: string, retryable = false) {
    super(message);
    this.name = "AiProviderError";
    this.category = category;
    this.retryable = retryable;
  }
}

export interface AiCompleteRequest {
  /** System-style instruction. Kept separate from prompt for clarity/logging. */
  instruction: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** Optional JSON schema hint — provider does best-effort JSON-only output. */
  jsonMode?: boolean;
}

export interface AiCompleteResult {
  text: string;
  model: string;
  usage?: { promptTokens?: number; outputTokens?: number };
}

export interface AiDocumentAnalyzeRequest {
  /** Raw base64 bytes of the file — never written to disk, held in memory for the duration of the request only. */
  dataBase64: string;
  mimeType: string;
  instruction: string;
}

export interface AIProvider {
  readonly name: string;
  /** True if this provider has the config it needs (e.g. an API key) to be called at all. */
  isConfigured(): boolean;
  complete(req: AiCompleteRequest): Promise<AiCompleteResult>;
  /** Embeds a batch of strings into fixed-length vectors, for RAG (Part 8/9). */
  embed(texts: string[]): Promise<number[][]>;
  /**
   * Multimodal document understanding (Part 12-14) — sends file bytes
   * directly to the model (no OCR/pdf-parse dependency needed) and asks
   * for plain-text extraction + structured fields as JSON in one call.
   * Only PDF/image/plain-text mime types are supported by the caller;
   * this method itself is format-agnostic and just forwards bytes.
   */
  analyzeDocument(req: AiDocumentAnalyzeRequest): Promise<AiCompleteResult>;
}

// ------------------------------------------------------------
// GeminiProvider
// ------------------------------------------------------------
// Tries a small ordered list of free-tier-compatible models and
// falls back to the next one on 404/model-unavailable, so a account
// that doesn't have access to the newest model degrades gracefully
// instead of hard-failing the whole AI screen.
const MODEL_CANDIDATES = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-1.5-flash"] as const;

const DEFAULT_TIMEOUT_MS = 12_000;

function withTimeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  private apiKey: string | undefined;

  constructor(apiKey?: string) {
    // Never accept a key from client input — always process.env, server-side only.
    this.apiKey = apiKey ?? process.env.GEMINI_API_KEY;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async complete(req: AiCompleteRequest): Promise<AiCompleteResult> {
    if (!this.apiKey) {
      throw new AiProviderError("not_configured", "GEMINI_API_KEY is not set on the server.");
    }

    let lastErr: AiProviderError | null = null;

    for (const model of MODEL_CANDIDATES) {
      const { signal, cancel } = withTimeout(DEFAULT_TIMEOUT_MS);
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal,
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: `${req.instruction}\n\n${req.prompt}` }] }],
              generationConfig: {
                temperature: req.temperature ?? 0.3,
                maxOutputTokens: req.maxOutputTokens ?? 300,
                ...(req.jsonMode ? { responseMimeType: "application/json" } : {}),
              },
            }),
          }
        );
        cancel();

        if (res.status === 429) {
          // Quota/rate limit on this model — try the next candidate rather than
          // burning retries against a model that just told us to back off.
          lastErr = new AiProviderError("rate_limited", `Gemini rate-limited on ${model}`, true);
          continue;
        }
        if (res.status === 404) {
          lastErr = new AiProviderError("model_unavailable", `${model} not available for this account`, false);
          continue;
        }
        if (!res.ok) {
          lastErr = new AiProviderError("unknown", `Gemini request failed (${res.status}) on ${model}`, res.status >= 500);
          continue;
        }

        const data = await res.json();
        const candidate = data?.candidates?.[0];
        const text: string | undefined = candidate?.content?.parts?.[0]?.text;
        const finishReason = candidate?.finishReason;

        if (!text) {
          if (finishReason === "SAFETY" || finishReason === "RECITATION") {
            throw new AiProviderError("invalid_response", `Gemini declined to answer (${finishReason})`);
          }
          lastErr = new AiProviderError("invalid_response", `No text in Gemini response from ${model}`);
          continue;
        }

        return {
          text: text.trim(),
          model,
          usage: {
            promptTokens: data?.usageMetadata?.promptTokenCount,
            outputTokens: data?.usageMetadata?.candidatesTokenCount,
          },
        };
      } catch (err) {
        cancel();
        if (err instanceof AiProviderError) throw err;
        if ((err as Error)?.name === "AbortError") {
          lastErr = new AiProviderError("timeout", `Gemini timed out on ${model}`, true);
          continue;
        }
        lastErr = new AiProviderError("network", `Network error calling Gemini (${model})`, true);
        continue;
      }
    }

    throw lastErr ?? new AiProviderError("unknown", "Gemini request failed for an unknown reason");
  }

  async analyzeDocument(req: AiDocumentAnalyzeRequest): Promise<AiCompleteResult> {
    if (!this.apiKey) {
      throw new AiProviderError("not_configured", "GEMINI_API_KEY is not set on the server.");
    }

    let lastErr: AiProviderError | null = null;

    // Document understanding needs more headroom than a chat reply
    // (a school policy or question paper can run several pages) and a
    // longer timeout since multimodal calls are slower than text-only.
    for (const model of MODEL_CANDIDATES) {
      const { signal, cancel } = withTimeout(25_000);
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal,
            body: JSON.stringify({
              contents: [
                {
                  role: "user",
                  parts: [
                    { text: req.instruction },
                    { inlineData: { mimeType: req.mimeType, data: req.dataBase64 } },
                  ],
                },
              ],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 2000,
                responseMimeType: "application/json",
              },
            }),
          }
        );
        cancel();

        if (res.status === 429) {
          lastErr = new AiProviderError("rate_limited", `Gemini rate-limited on ${model}`, true);
          continue;
        }
        if (res.status === 404) {
          lastErr = new AiProviderError("model_unavailable", `${model} not available for this account`, false);
          continue;
        }
        if (!res.ok) {
          lastErr = new AiProviderError("unknown", `Gemini request failed (${res.status}) on ${model}`, res.status >= 500);
          continue;
        }

        const data = await res.json();
        const candidate = data?.candidates?.[0];
        const text: string | undefined = candidate?.content?.parts?.[0]?.text;
        const finishReason = candidate?.finishReason;

        if (!text) {
          if (finishReason === "SAFETY" || finishReason === "RECITATION") {
            throw new AiProviderError("invalid_response", `Gemini declined to analyze this document (${finishReason})`);
          }
          lastErr = new AiProviderError("invalid_response", `No text in Gemini response from ${model}`);
          continue;
        }

        return {
          text: text.trim(),
          model,
          usage: {
            promptTokens: data?.usageMetadata?.promptTokenCount,
            outputTokens: data?.usageMetadata?.candidatesTokenCount,
          },
        };
      } catch (err) {
        cancel();
        if (err instanceof AiProviderError) throw err;
        if ((err as Error)?.name === "AbortError") {
          lastErr = new AiProviderError("timeout", `Gemini timed out on ${model}`, true);
          continue;
        }
        lastErr = new AiProviderError("network", `Network error calling Gemini (${model})`, true);
        continue;
      }
    }

    throw lastErr ?? new AiProviderError("unknown", "Gemini document analysis failed for an unknown reason");
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      throw new AiProviderError("not_configured", "GEMINI_API_KEY is not set on the server.");
    }
    if (texts.length === 0) return [];

    const EMBED_MODEL = "gemini-embedding-001";
    const { signal, cancel } = withTimeout(DEFAULT_TIMEOUT_MS);
    try {
      // batchEmbedContents keeps this to one request per chunk batch
      // instead of one round-trip per chunk, which matters on a free
      // per-minute request quota.
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents?key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({
            requests: texts.map((text) => ({
              model: `models/${EMBED_MODEL}`,
              content: { parts: [{ text }] },
            })),
          }),
        }
      );
      cancel();

      if (res.status === 429) throw new AiProviderError("rate_limited", "Gemini embeddings rate-limited", true);
      if (res.status === 404) throw new AiProviderError("model_unavailable", "Embedding model not available for this account");
      if (!res.ok) throw new AiProviderError("unknown", `Embedding request failed (${res.status})`, res.status >= 500);

      const data = await res.json();
      const embeddings = data?.embeddings;
      if (!Array.isArray(embeddings) || embeddings.length !== texts.length) {
        throw new AiProviderError("invalid_response", "Unexpected embedding response shape");
      }
      return embeddings.map((e: any) => e.values as number[]);
    } catch (err) {
      cancel();
      if (err instanceof AiProviderError) throw err;
      if ((err as Error)?.name === "AbortError") throw new AiProviderError("timeout", "Gemini embeddings timed out", true);
      throw new AiProviderError("network", "Network error calling Gemini embeddings", true);
    }
  }
}

let cachedProvider: AIProvider | null = null;

/** Singleton accessor — swap the implementation here to change providers app-wide. */
export function getAiProvider(): AIProvider {
  if (!cachedProvider) cachedProvider = new GeminiProvider();
  return cachedProvider;
}
