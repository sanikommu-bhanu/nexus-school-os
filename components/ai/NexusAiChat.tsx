"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Sparkles, Send, ShieldCheck, AlertCircle, X } from "lucide-react";
import { GlassSurface } from "@/components/ui/GlassSurface";
import { LoadingState, ErrorState } from "@/components/ui/States";
import { buildAiContext, askNexus } from "@/services/ai-tools-service";
import type { AiContext, AiAction } from "@/services/ai-tools-service";
import { executeAiAction } from "@/services/ai-actions-service";
import { SmartSearchBar } from "@/components/ai/SmartSearchBar";
import { getConversationHistory, appendConversationMessage, clearConversationHistory } from "@/services/ai-conversation-service";

interface ChatMessage {
  role: "user" | "ai";
  title?: string;
  text: string;
  grounded?: boolean;
  actions?: AiAction[];
  unavailable?: boolean;
  rateLimited?: boolean;
}

export function NexusAiChat({ uid, prompts }: { uid: string; prompts: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reduceMotion = useReducedMotion();
  const [ctx, setCtx] = useState<AiContext | null>(null);
  const [ctxError, setCtxError] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [confirming, setConfirming] = useState<AiAction | null>(null);
  const [executing, setExecuting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    buildAiContext(uid)
      .then((c) => (c ? setCtx(c) : setCtxError(true)))
      .catch(() => setCtxError(true));
  }, [uid]);

  // Conversation memory (Part 25) — restore this user's last turns so
  // the chat survives a reload. Best-effort: if it fails, the chat
  // just starts empty rather than blocking anything.
  useEffect(() => {
    if (!ctx) return;
    getConversationHistory(ctx.schoolId, ctx.uid)
      .then((history) => {
        if (history.length > 0) {
          setMessages(history.map((h) => ({ role: h.role, title: h.title, text: h.text, grounded: h.grounded, unavailable: h.unavailable, rateLimited: h.rateLimited })));
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.uid]);

  // Deep-linked prompt, e.g. from an action's "Create Study Plan" href
  // (?prompt=...). Sent once, as soon as ctx is ready.
  useEffect(() => {
    const prompt = searchParams?.get("prompt");
    if (prompt && ctx) send(prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const send = async (text: string) => {
    if (!ctx || !text.trim()) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setThinking(true);
    appendConversationMessage(ctx.schoolId, ctx.uid, { role: "user", text });
    const answer = await askNexus(ctx, text);
    setThinking(false);
    setMessages((m) => [
      ...m,
      { role: "ai", title: answer.title, text: answer.text, grounded: answer.grounded, actions: answer.actions, unavailable: answer.unavailable, rateLimited: answer.rateLimited },
    ]);
    appendConversationMessage(ctx.schoolId, ctx.uid, {
      role: "ai",
      title: answer.title,
      text: answer.text,
      grounded: answer.grounded,
      unavailable: answer.unavailable,
      rateLimited: answer.rateLimited,
    });
  };

  const newConversation = async () => {
    if (!ctx) return;
    setMessages([]);
    await clearConversationHistory(ctx.schoolId, ctx.uid).catch(() => {});
  };

  const handleAction = (a: AiAction) => {
    if (a.kind === "navigate") {
      if (a.href) router.push(a.href);
      return;
    }
    setConfirming(a);
  };

  const confirmAction = async () => {
    if (!ctx || !confirming) return;
    setExecuting(true);
    const result = await executeAiAction(ctx, confirming);
    setExecuting(false);
    setConfirming(null);
    setToast(result.message);
  };

  if (ctxError) {
    return <ErrorState message="NEXUS AI couldn't load your school context. Please try again." onRetry={() => window.location.reload()} />;
  }
  if (!ctx) return <LoadingState message="Preparing NEXUS AI…" />;

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-1 flex items-center justify-end gap-2">
        {messages.length > 0 && (
          <button onClick={newConversation} className="rounded-full glass-surface px-3 py-1.5 text-xs font-medium text-ink-muted active:scale-95 transition-transform">
            New conversation
          </button>
        )}
        <SmartSearchBar ctx={ctx} />
      </div>

      {messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-6 text-center">
          <motion.div
            animate={reduceMotion ? undefined : { boxShadow: ["0 0 24px 4px rgba(139,92,246,0.25)", "0 0 40px 10px rgba(139,92,246,0.4)", "0 0 24px 4px rgba(139,92,246,0.25)"] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
            className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-action"
          >
            <Sparkles className="h-6 w-6 text-white" />
          </motion.div>
          <div>
            <p className="text-base font-semibold text-ink">What can I help you understand?</p>
            <p className="mt-1 max-w-[260px] text-sm text-ink-muted">Grounded in your real, role-scoped school data.</p>
          </div>
          <div className="flex w-full flex-col gap-2">
            {prompts.map((p) => (
              <button
                key={p}
                onClick={() => send(p)}
                className="glass-surface rounded-2xl px-4 py-3 text-left text-sm text-ink-muted active:scale-[0.98] transition-transform"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto py-4">
          {messages.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={m.role === "user" ? "ml-auto max-w-[85%]" : "mr-auto max-w-[90%]"}
            >
              {m.role === "user" ? (
                <GlassSurface rounded="2xl" className="bg-accent/15">
                  <p className="text-sm text-ink">{m.text}</p>
                </GlassSurface>
              ) : m.unavailable ? (
                <GlassSurface rounded="2xl" className="border-danger/25">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                    <div>
                      <p className="text-sm font-semibold text-ink">NEXUS AI is temporarily unavailable</p>
                      <p className="mt-1 text-sm text-ink-muted">{m.text}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const last = [...messages].reverse().find((x) => x.role === "user");
                      if (last) send(last.text);
                    }}
                    className="mt-3 text-sm font-semibold text-accent-soft"
                  >
                    Try again
                  </button>
                </GlassSurface>
              ) : (
                <GlassSurface rounded="2xl">
                  {m.title && <p className="text-sm font-semibold text-ink">{m.title}</p>}
                  <p className={m.title ? "mt-1 text-sm text-ink-muted whitespace-pre-line" : "text-sm text-ink whitespace-pre-line"}>{m.text}</p>
                  {m.grounded && (
                    <p className="mt-1.5 flex items-center gap-1 text-[10px] text-ink-faint">
                      <ShieldCheck className="h-3 w-3" /> Grounded in your live school data
                    </p>
                  )}
                  {m.rateLimited && (
                    <p className="mt-1 flex items-center gap-1 text-[10px] text-warning">
                      <AlertCircle className="h-3 w-3" /> AI phrasing is busy right now — showing a quick answer instead.
                    </p>
                  )}
                  {m.actions && m.actions.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {m.actions.map((a) => (
                        <button
                          key={a.id}
                          onClick={() => handleAction(a)}
                          className={
                            a.kind === "confirm"
                              ? "rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent-soft active:scale-95 transition-transform"
                              : "rounded-full bg-white/8 px-3 py-1.5 text-xs font-semibold text-ink active:scale-95 transition-transform"
                          }
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  )}
                </GlassSurface>
              )}
            </motion.div>
          ))}
          {thinking && (
            <div className="mr-auto max-w-[85%]">
              <GlassSurface rounded="2xl">
                <div className="flex items-center gap-2">
                  <span className="flex gap-1">
                    {[0, 1, 2].map((d) => (
                      <motion.span
                        key={d}
                        className="h-1.5 w-1.5 rounded-full bg-accent-soft"
                        animate={reduceMotion ? { opacity: 0.7 } : { opacity: [0.3, 1, 0.3] }}
                        transition={reduceMotion ? undefined : { duration: 1, repeat: Infinity, delay: d * 0.15 }}
                      />
                    ))}
                  </span>
                  <p className="text-sm text-ink-faint">Thinking…</p>
                </div>
              </GlassSurface>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder="Ask about attendance, schedule, assignments…"
          className="input-glass flex-1"
        />
        <button onClick={() => send(input)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full btn-action !w-11 !px-0">
          <Send className="h-4 w-4" />
        </button>
      </div>

      {/* PROPOSED ACTION — Part 6. Nothing consequential executes without this explicit step. */}
      <AnimatePresence>
        {confirming && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 px-4 pb-6"
            onClick={() => !executing && setConfirming(null)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ type: "spring", damping: 26, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm"
            >
              <GlassSurface rounded="3xl">
                <div className="flex items-start justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-accent-soft">Proposed Action</p>
                  <button onClick={() => !executing && setConfirming(null)}>
                    <X className="h-4 w-4 text-ink-faint" />
                  </button>
                </div>
                <p className="mt-2 text-base font-semibold text-ink">{confirming.confirmTitle ?? confirming.label}</p>
                {confirming.confirmBody && <p className="mt-1 text-sm text-ink-muted">{confirming.confirmBody}</p>}
                <div className="mt-5 flex gap-2">
                  <button
                    onClick={() => setConfirming(null)}
                    disabled={executing}
                    className="flex-1 rounded-2xl bg-white/8 py-3 text-sm font-semibold text-ink disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmAction}
                    disabled={executing}
                    className="flex-1 rounded-2xl btn-action py-3 text-sm font-semibold disabled:opacity-60"
                  >
                    {executing ? "Sending…" : "Confirm"}
                  </button>
                </div>
              </GlassSurface>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2"
          >
            <GlassSurface rounded="2xl" className="!py-2.5 !px-4">
              <p className="text-sm text-ink">{toast}</p>
            </GlassSurface>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
