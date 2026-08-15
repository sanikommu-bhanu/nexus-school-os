// ============================================================
// Server-only route. This is the ONE place in the app that talks
// to the Gemini API, and it never touches Firestore itself.
//
// Callers (services/ai-tools-service.ts) resolve the user's question
// against permission-scoped tools first and pass the resulting facts
// here as plain text. Gemini is only asked to phrase those facts
// naturally — it is explicitly instructed not to add information —
// so a wrong or missing GEMINI_API_KEY, a quota error, or a timeout
// all degrade to the deterministic template in ai-tools-service.ts
// rather than ever letting the model invent school data it wasn't
// given, or the UI showing a fake "AI is thinking" success.
// ============================================================
import { getAiProvider, AiProviderError } from "@/lib/ai/provider";
import { checkRateLimit } from "@/lib/ai/rate-limit";
import { logAiEvent } from "@/lib/ai/observability";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const provider = getAiProvider();

  if (!provider.isConfigured()) {
    return Response.json({ configured: false });
  }

  // Best-effort client identifier for rate limiting. Not used for auth —
  // permission scoping happens entirely client-side against Firestore
  // rules before this route is ever reached (see ai-tools-service.ts).
  const rateKey = request.headers.get("x-forwarded-for") ?? "anonymous";
  const rl = checkRateLimit(rateKey);
  if (!rl.allowed) {
    return Response.json(
      { configured: true, error: "AI usage limit reached. Please try again later.", errorCategory: "rate_limited" },
      { status: 429, headers: rl.retryAfterMs ? { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } : undefined }
    );
  }

  let body: { question?: string; facts?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ configured: true, error: "Invalid request body" }, { status: 400 });
  }

  const { question, facts, role } = body;
  if (!question || !facts) {
    return Response.json({ configured: true, error: "question and facts are required" }, { status: 400 });
  }

  const instruction = [
    "You are NEXUS AI, a school operating system assistant.",
    `You are speaking to a ${role ?? "user"}.`,
    "Answer the user's question in 1-3 warm, concise sentences using ONLY the facts below.",
    "Never invent numbers, names, or details that are not present in the facts.",
    "If the facts don't fully answer the question, say what you do know and stop there.",
  ].join("\n");
  const prompt = `Facts:\n${facts}\n\nQuestion: ${question}`;

  try {
    const result = await provider.complete({ instruction, prompt, temperature: 0.3, maxOutputTokens: 200 });
    logAiEvent({
      route: "/api/ai/ask",
      requestType: "ask",
      ok: true,
      latencyMs: Date.now() - startedAt,
      model: result.model,
      usage: result.usage,
    });
    return Response.json({ configured: true, text: result.text });
  } catch (err) {
    const category = err instanceof AiProviderError ? err.category : "unknown";
    logAiEvent({
      route: "/api/ai/ask",
      requestType: "ask",
      ok: false,
      latencyMs: Date.now() - startedAt,
      errorCategory: category,
    });

    const status = category === "rate_limited" || category === "quota_exceeded" ? 429 : category === "timeout" ? 504 : 502;
    const message =
      category === "rate_limited" || category === "quota_exceeded"
        ? "AI usage limit reached. Please try again later."
        : category === "timeout"
        ? "NEXUS AI is taking too long to respond. Please try again."
        : category === "model_unavailable"
        ? "NEXUS AI is temporarily unavailable."
        : "NEXUS AI is temporarily unavailable.";

    return Response.json({ configured: true, error: message, errorCategory: category }, { status });
  }
}
