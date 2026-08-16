// ============================================================
// Server-only route — the only place batchEmbedContents is called.
// Same key-safety and error-shape conventions as /api/ai/ask.
// ============================================================
import { getAiProvider, AiProviderError } from "@/lib/ai/provider";
import { checkRateLimit } from "@/lib/ai/rate-limit";
import { logAiEvent } from "@/lib/ai/observability";

const MAX_TEXTS_PER_REQUEST = 100;

export async function POST(request: Request) {
  const startedAt = Date.now();
  const provider = getAiProvider();

  if (!provider.isConfigured()) {
    return Response.json({ configured: false });
  }

  const rateKey = request.headers.get("x-forwarded-for") ?? "anonymous";
  const rl = checkRateLimit(rateKey);
  if (!rl.allowed) {
    return Response.json(
      { configured: true, error: "AI usage limit reached. Please try again later.", errorCategory: "rate_limited" },
      { status: 429 }
    );
  }

  let body: { texts?: string[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ configured: true, error: "Invalid request body" }, { status: 400 });
  }

  const texts = body.texts;
  if (!texts || !Array.isArray(texts) || texts.length === 0) {
    return Response.json({ configured: true, error: "texts must be a non-empty array" }, { status: 400 });
  }
  if (texts.length > MAX_TEXTS_PER_REQUEST) {
    return Response.json({ configured: true, error: `Too many texts in one request (max ${MAX_TEXTS_PER_REQUEST})` }, { status: 400 });
  }

  try {
    const embeddings = await provider.embed(texts);
    logAiEvent({ route: "/api/ai/embed", requestType: "embed", ok: true, latencyMs: Date.now() - startedAt });
    return Response.json({ configured: true, embeddings, model: "gemini-embedding-001" });
  } catch (err) {
    const category = err instanceof AiProviderError ? err.category : "unknown";
    logAiEvent({ route: "/api/ai/embed", requestType: "embed", ok: false, latencyMs: Date.now() - startedAt, errorCategory: category });
    const status =
      category === "rate_limited" ? 429 : category === "timeout" ? 504 : category === "overloaded" ? 503 : 502;
    return Response.json(
      {
        configured: true,
        error:
          category === "overloaded"
            ? "Knowledge search is busy right now. Please try again in a moment."
            : "Knowledge search is temporarily unavailable.",
        errorCategory: category,
      },
      { status }
    );
  }
}
