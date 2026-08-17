// ============================================================
// Server-only route (Part 12-14). The only place document bytes are
// ever sent to Gemini. Bytes arrive as base64 in the request body,
// are forwarded to the model, and are never written to disk or
// logged — see lib/ai/observability.ts, which only logs shape/metadata.
//
// Same degrade-gracefully contract as /api/ai/ask and /api/ai/embed:
// no key configured -> { configured: false } and the caller falls
// back to "aiStatus: unavailable" rather than a fake success.
// ============================================================
import { getAiProvider, AiProviderError } from "@/lib/ai/provider";
import { checkRateLimit } from "@/lib/ai/rate-limit";
import { logAiEvent } from "@/lib/ai/observability";
import type { DocumentType } from "@/types";

// Keep this well under Gemini's inline-data request-size ceiling and
// under typical serverless body-size limits — anything larger should
// use a resumable/Files-API upload, which is out of scope for the
// free-tier target of this project. 8MB of base64 is roughly a 6MB file.
const MAX_BASE64_CHARS = 8_000_000;

const FIELD_HINTS: Record<DocumentType, string> = {
  syllabus: `{"subject": string, "grade": string, "topics": string (comma-separated), "term": string}`,
  notes: `{"subject": string, "topic": string, "keyPoints": string (comma-separated, max 5)}`,
  question_paper: `{"subject": string, "totalMarks": string, "duration": string, "questionCount": string}`,
  assignment: `{"subject": string, "dueDate": string (if stated in the document, else empty), "instructions": string}`,
  policy: `{"title": string, "keyPoints": string (comma-separated, max 5), "appliesTo": string}`,
  other: `{"documentTitle": string, "category": string}`,
};

export async function POST(request: Request) {
  const startedAt = Date.now();
  const provider = getAiProvider();

  if (!provider.isConfigured()) {
    return Response.json({ configured: false });
  }

  const rateKey = request.headers.get("x-forwarded-for") ?? "anonymous";
  const rl = await checkRateLimit(rateKey);
  if (!rl.allowed) {
    return Response.json(
      { configured: true, error: "AI usage limit reached. Please try again in a minute.", errorCategory: "rate_limited" },
      { status: 429, headers: rl.retryAfterMs ? { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } : undefined }
    );
  }

  let body: { dataBase64?: string; mimeType?: string; documentType?: DocumentType; fileName?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ configured: true, error: "Invalid request body" }, { status: 400 });
  }

  const { dataBase64, mimeType, documentType, fileName } = body;
  if (!dataBase64 || !mimeType) {
    return Response.json({ configured: true, error: "dataBase64 and mimeType are required" }, { status: 400 });
  }
  if (dataBase64.length > MAX_BASE64_CHARS) {
    return Response.json({ configured: true, error: "File is too large for AI analysis (max ~6MB)." }, { status: 413 });
  }

  const supported = mimeType === "application/pdf" || mimeType.startsWith("image/") || mimeType === "text/plain";
  if (!supported) {
    return Response.json({
      configured: true,
      error: "This file type isn't supported for AI reading yet (PDF, image, or plain text only).",
      errorCategory: "invalid_response",
    });
  }

  const fields = FIELD_HINTS[documentType ?? "other"];
  const instruction = [
    "You are a document intelligence engine inside a school operating system.",
    `The file is named "${fileName ?? "document"}" and is categorized as "${documentType ?? "other"}".`,
    "Read the document and respond with ONLY a JSON object (no markdown, no commentary) matching exactly this shape:",
    `{"extractedText": string (the document's plain text content, condensed if long, max ~4000 characters), "summary": string (2-3 sentence plain-English summary), "fields": ${fields}}`,
    "If a field can't be determined from the document, use an empty string for it rather than guessing.",
    "Never invent content that isn't in the document.",
  ].join("\n");

  try {
    const result = await provider.analyzeDocument({ dataBase64, mimeType, instruction });
    let parsed: { extractedText?: string; summary?: string; fields?: Record<string, string> };
    try {
      parsed = JSON.parse(result.text);
    } catch {
      throw new AiProviderError("invalid_response", "Model did not return valid JSON");
    }

    logAiEvent({
      route: "/api/ai/document/extract",
      requestType: "document_extract",
      ok: true,
      latencyMs: Date.now() - startedAt,
      model: result.model,
      usage: result.usage,
    });

    return Response.json({
      configured: true,
      extractedText: parsed.extractedText ?? "",
      summary: parsed.summary ?? "",
      fields: parsed.fields ?? {},
    });
  } catch (err) {
    const category = err instanceof AiProviderError ? err.category : "unknown";
    logAiEvent({
      route: "/api/ai/document/extract",
      requestType: "document_extract",
      ok: false,
      latencyMs: Date.now() - startedAt,
      errorCategory: category,
    });

    const status =
      category === "rate_limited" ? 429 : category === "timeout" ? 504 : category === "overloaded" ? 503 : 502;
    const message =
      category === "rate_limited"
        ? "AI usage limit reached. Please try again in a minute."
        : category === "timeout"
        ? "Reading this document is taking too long. Please try again."
        : category === "invalid_response"
        ? "NEXUS AI couldn't make sense of this document."
        : category === "overloaded"
        ? "NEXUS AI is busy right now. Please try again in a moment."
        : "NEXUS AI is temporarily unavailable.";

    return Response.json({ configured: true, error: message, errorCategory: category }, { status });
  }
}
