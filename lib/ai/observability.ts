// ============================================================
// Lightweight AI observability (Part 28).
//
// Console-based on purpose: this project has no paid logging/APM
// service. Never logs prompt/answer content, document text, or
// anything that could contain personal data — only shape/metadata.
// ============================================================

export interface AiLogEvent {
  route: string;
  requestType: string; // e.g. "ask", "rag", "tool:getSchoolOverview"
  ok: boolean;
  latencyMs: number;
  errorCategory?: string;
  model?: string;
  usage?: { promptTokens?: number; outputTokens?: number };
}

export function logAiEvent(event: AiLogEvent) {
  // Structured single-line log — easy to grep, cheap to store.
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      at: new Date().toISOString(),
      kind: "ai_event",
      ...event,
    })
  );
}
