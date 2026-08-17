"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Search, X, Users, FileText, Sparkles, School } from "lucide-react";
import { GlassSurface } from "@/components/ui/GlassSurface";
import { smartSearch, type SmartSearchResult, type DirectoryHit } from "@/services/smart-search-service";
import type { AiContext } from "@/services/ai-tools-service";

const TYPE_ICON: Record<DirectoryHit["type"], typeof Users> = {
  class: School,
  student: Users,
  teacher: Users,
  document: FileText,
};

const KIND_LABEL: Record<SmartSearchResult["kind"], string> = {
  structured: "From your school data",
  document: "From a document",
  reasoning: "NEXUS reasoning",
  empty: "",
};

export function SmartSearchBar({ ctx }: { ctx: AiContext }) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<SmartSearchResult | null>(null);

  const runSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setResult(null);
    try {
      const r = await smartSearch(ctx, query);
      setResult(r);
    } finally {
      setSearching(false);
    }
  };

  const close = () => {
    setOpen(false);
    setQuery("");
    setResult(null);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Smart Search"
        className="tap-target flex h-9 w-9 shrink-0 items-center justify-center rounded-full glass-surface active:scale-95 transition-transform"
      >
        <Search className="h-4 w-4 text-ink-muted" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : undefined}
            className="fixed inset-0 z-50 flex flex-col bg-base-950/95 px-6 pt-6 backdrop-blur-xl"
          >
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runSearch()}
                  placeholder="Search students, classes, documents, or ask anything…"
                  className="input-glass pl-10"
                />
              </div>
              <button onClick={close} aria-label="Close search" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full glass-surface">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 flex-1 overflow-y-auto">
              {searching ? (
                <div className="flex flex-col items-center gap-2 py-12">
                  <span className="flex gap-1">
                    {[0, 1, 2].map((d) => (
                      <motion.span
                        key={d}
                        className="h-1.5 w-1.5 rounded-full bg-accent-soft"
                        animate={reduceMotion ? undefined : { opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1, repeat: Infinity, delay: d * 0.15 }}
                      />
                    ))}
                  </span>
                  <p className="text-sm text-ink-faint">Searching…</p>
                </div>
              ) : !result ? (
                <p className="py-12 text-center text-sm text-ink-faint">Try a student name, a class, a document title, or a question.</p>
              ) : result.kind === "empty" ? (
                <p className="py-12 text-center text-sm text-ink-faint">No matches found for &quot;{query}&quot;.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-accent-soft">{KIND_LABEL[result.kind]}</p>

                  {result.kind === "structured" &&
                    result.hits.map((h) => {
                      const Icon = TYPE_ICON[h.type];
                      return (
                        <button
                          key={`${h.type}-${h.id}`}
                          onClick={() => {
                            close();
                            router.push(h.href);
                          }}
                          className="glass-surface flex items-center gap-3 rounded-2xl p-4 text-left active:scale-[0.98] transition-transform"
                        >
                          <Icon className="h-4.5 w-4.5 shrink-0 text-accent-soft" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-ink">{h.label}</p>
                            {h.subtitle && <p className="truncate text-xs text-ink-muted capitalize">{h.subtitle}</p>}
                          </div>
                          <span className="shrink-0 rounded-full bg-white/8 px-2 py-0.5 text-[10px] font-medium capitalize text-ink-faint">{h.type}</span>
                        </button>
                      );
                    })}

                  {result.kind === "document" &&
                    result.chunks.map((c, i) => (
                      <GlassSurface key={i} rounded="2xl">
                        <div className="flex items-start gap-2">
                          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-accent-soft" />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-ink">{c.documentTitle}</p>
                            <p className="mt-1 text-xs text-ink-muted whitespace-pre-line">{c.text.slice(0, 260)}{c.text.length > 260 ? "…" : ""}</p>
                          </div>
                        </div>
                      </GlassSurface>
                    ))}

                  {result.kind === "reasoning" && (
                    <GlassSurface rounded="2xl">
                      <div className="flex items-start gap-2">
                        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent-soft" />
                        <div className="min-w-0">
                          {result.answer.title && <p className="text-sm font-semibold text-ink">{result.answer.title}</p>}
                          <p className="mt-1 text-sm text-ink-muted whitespace-pre-line">{result.answer.text}</p>
                        </div>
                      </div>
                    </GlassSurface>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
