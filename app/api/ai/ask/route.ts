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
  const rl = await checkRateLimit(rateKey);
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
  if (!question) {
    return Response.json({ configured: true, error: "question is required" }, { status: 400 });
  }

  // Two distinct modes, and the difference is a safety boundary, not a
  // convenience:
  //
  //  - GROUNDED (facts present): the caller has already resolved the
  //    question against permission-scoped tools. The model may only
  //    rephrase those facts and is forbidden from adding anything.
  //
  //  - GENERAL (no facts): nothing was looked up, so the model has NO
  //    school data and must not pretend otherwise. This is what makes
  //    open-ended questions ("explain photosynthesis") answerable at all
  //    — previously they never reached the model, and the UI told the
  //    user to "connect a Gemini API key" even when one was connected
  //    and working.
  //
  // The general path must never imply it can see school records; if the
  // question needs them, it says so and stops.
  const grounded = typeof facts === "string" && facts.trim().length > 0;

  const instruction = grounded
    ? [
        "You are NEXUS AI, a school operating system assistant.",
        `You are speaking to a ${role ?? "user"}.`,
        "Answer the user's question in 1-3 warm, concise sentences using ONLY the facts below.",
        "Never invent numbers, names, or details that are not present in the facts.",
        "If the facts don't fully answer the question, say what you do know and stop there.",
      ].join("\n")
    : [
        "You are NEXUS AI, a school operating system assistant.",
        `You are speaking to a ${role ?? "user"}.`,
        "You have NOT been given any data from this school for this question.",
        "If the question asks about this specific school's attendance, schedule, assignments, announcements, fees, students or staff, do not guess: reply that you couldn't look that up and suggest they ask about attendance, schedule, assignments, announcements or rosters.",
        "Otherwise answer as a knowledgeable, encouraging school assistant in 1-4 concise sentences.",
        "Never state or imply that you have looked at this school's records.",
      ].join("\n");

  const prompt = grounded ? `Facts:\n${facts}\n\nQuestion: ${question}` : `Question: ${question}`;

  try {
    const result = await provider.complete({
      instruction,
      prompt,
      temperature: 0.3,
      // A general answer is allowed a little more room than a one-line
      // rephrasing of supplied facts.
      maxOutputTokens: grounded ? 200 : 400,
    });
    logAiEvent({
      route: "/api/ai/ask",
      requestType: "ask",
      ok: true,
      latencyMs: Date.now() - startedAt,
      model: result.model,
      usage: result.usage,
    });
    // `grounded` is echoed back so the client never has to infer whether
    // an answer was backed by real school data.
    return Response.json({ configured: true, text: result.text, grounded });
  } catch (err) {
    const category = err instanceof AiProviderError ? err.category : "unknown";
    logAiEvent({
      route: "/api/ai/ask",
      requestType: "ask",
      ok: false,
      latencyMs: Date.now() - startedAt,
      errorCategory: category,
    });

    const status =
      category === "rate_limited" || category === "quota_exceeded"
        ? 429
        : category === "timeout"
        ? 504
        : category === "overloaded"
        ? 503
        : 502;
    const message =
      category === "rate_limited" || category === "quota_exceeded"
        ? "AI usage limit reached. Please try again later."
        : category === "timeout"
        ? "NEXUS AI is taking too long to respond. Please try again."
        : category === "overloaded"
        ? // Explicitly not phrased as a setup problem: the key and config
          // are fine, Google's model is just busy. The old wording sent
          // people off to re-check their API key for a 30-second blip.
          "NEXUS AI is busy right now. Please try again in a moment."
        : "NEXUS AI is temporarily unavailable.";

    return Response.json({ configured: true, error: message, errorCategory: category }, { status });
  }
}
