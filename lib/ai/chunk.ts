// ============================================================
// Chunking + similarity utilities for RAG (Part 8/9).
//
// Kept dependency-free on purpose — no free tier is spent on a
// chunking/tokenizer library. Chunk sizes are character-based, which
// is adequate for the school-policy-length documents this targets.
// ============================================================

export interface TextChunk {
  text: string;
  index: number;
}

const DEFAULT_CHUNK_CHARS = 1100;
const DEFAULT_OVERLAP_CHARS = 150;

/** Cleans raw extracted text: collapses whitespace, drops empty lines. */
export function cleanText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Splits cleaned text into overlapping chunks, breaking on paragraph/sentence boundaries where possible. */
export function chunkText(
  text: string,
  chunkChars = DEFAULT_CHUNK_CHARS,
  overlapChars = DEFAULT_OVERLAP_CHARS
): TextChunk[] {
  const cleaned = cleanText(text);
  if (!cleaned) return [];

  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < cleaned.length) {
    let end = Math.min(start + chunkChars, cleaned.length);

    if (end < cleaned.length) {
      // Prefer to break at a paragraph, then sentence, then word boundary
      // so we don't split mid-sentence when we don't have to.
      const window = cleaned.slice(start, end);
      const lastParagraph = window.lastIndexOf("\n\n");
      const lastSentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf(".\n"));
      const lastSpace = window.lastIndexOf(" ");
      const breakAt = lastParagraph > chunkChars * 0.5 ? lastParagraph : lastSentence > chunkChars * 0.5 ? lastSentence + 1 : lastSpace;
      if (breakAt > 0) end = start + breakAt;
    }

    const slice = cleaned.slice(start, end).trim();
    if (slice) chunks.push({ text: slice, index });
    index += 1;
    if (end >= cleaned.length) break;
    start = Math.max(end - overlapChars, start + 1);
  }

  return chunks;
}

/** Cosine similarity between two equal-length vectors. Safe against zero vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
