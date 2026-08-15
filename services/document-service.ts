// ============================================================
// Document service — Cloudinary for bytes,
// schools/{schoolId}/documents/{id} for metadata. Part 15/16.
//
// Document Intelligence Foundation: aiStatus is set to
// "unavailable" (not faked as "complete") whenever no AI key is
// configured — see isAiConfigured(). The pipeline shape is real;
// what's optional is only whether the extraction step actually runs.
// ============================================================
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, collection, query, where, getDocs, serverTimestamp, orderBy, updateDoc } from "firebase/firestore";
import { uploadToCloudinary } from "@/lib/cloudinary";
import type { DocumentMeta, DocumentType } from "@/types";

export async function isAiConfigured(): Promise<boolean> {
  try {
    const res = await fetch("/api/ai/status");
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data.configured);
  } catch {
    return false;
  }
}

export async function getDocumentsForClass(schoolId: string, classId: string): Promise<DocumentMeta[]> {
  if (!db) return [];
  const snap = await getDocs(
    query(collection(db, "schools", schoolId, "documents"), where("classId", "==", classId), orderBy("createdAt", "desc"))
  );
  return snap.docs.map((d) => d.data() as DocumentMeta);
}

export async function getSchoolDocuments(schoolId: string): Promise<DocumentMeta[]> {
  if (!db) return [];
  const snap = await getDocs(query(collection(db, "schools", schoolId, "documents"), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => d.data() as DocumentMeta);
}

export async function getDocumentById(schoolId: string, documentId: string): Promise<DocumentMeta | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, "schools", schoolId, "documents", documentId));
  return snap.exists() ? (snap.data() as DocumentMeta) : null;
}

// ============================================================
// Document Intelligence pipeline (Part 12-14).
//
//   UPLOADING   -> bytes to Cloudinary, metadata row created
//   READING     -> file bytes sent to Gemini (multimodal) for PDFs/
//                  images/plain text; skipped honestly for other
//                  types or when AI isn't configured
//   UNDERSTANDING -> model returns extracted text + a summary +
//                  documentType-shaped structured fields
//   INDEXING    -> extracted text chunked + embedded + stored so
//                  NEXUS AI can cite it later (lib/ai/rag.ts)
//
// Every step reports real, awaited state through onStep — nothing is
// a fixed-duration fake spinner. If AI isn't configured, or the file
// type isn't one Gemini can read directly, the pipeline still
// completes the Uploading step (the file is always safely stored)
// and honestly reports aiStatus "unavailable" rather than pretending
// the later steps ran.
// ============================================================

export type PipelineStepName = "uploading" | "reading" | "understanding" | "indexing";
export type PipelineStepStatus = "active" | "done" | "skipped" | "error";

export interface PipelineStepEvent {
  step: PipelineStepName;
  status: PipelineStepStatus;
  detail?: string;
}

export interface DocumentProcessResult {
  document: DocumentMeta;
  extractedText?: string;
}

const SUPPORTED_AI_MIME = (mime: string) => mime === "application/pdf" || mime.startsWith("image/") || mime === "text/plain";

// Friendly, fast client-side check (Part 15/34/36: "verify friendly
// error", never a raw upload error dialog). Since uploads moved to
// Cloudinary, storage.rules no longer enforces this — the backstop is
// now the Cloudinary upload preset's own size/format restrictions,
// configured in the dashboard.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_UPLOAD_MIME =
  /^(application\/pdf|image\/.*|text\/plain|application\/vnd\.openxmlformats-officedocument\..*|application\/msword|application\/vnd\.ms-excel)$/;

export class DocumentValidationError extends Error {}

export function validateUploadFile(file: File): void {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new DocumentValidationError(`"${file.name}" is too large — the max upload size is 10MB.`);
  }
  if (file.type && !ALLOWED_UPLOAD_MIME.test(file.type)) {
    throw new DocumentValidationError(`"${file.name}" isn't a supported file type. Try a PDF, image, Word, Excel, or plain text file.`);
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data: URL prefix — the API wants raw base64 only.
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(new Error("Couldn't read the file."));
    reader.readAsDataURL(file);
  });
}

/**
 * Runs the full Uploading -> Reading -> Understanding -> Indexing
 * pipeline for one file, reporting real step transitions via onStep.
 * Always returns a DocumentMeta — even on AI failure, since the file
 * itself is safely stored either way (Part 12 principle: storage
 * success and AI success are independent, and only the former is
 * required for the upload to "succeed").
 */
export async function uploadAndProcessDocument(
  schoolId: string,
  uploadedBy: string,
  file: File,
  meta: { documentType: DocumentType; classId?: string; ownerId: string },
  onStep?: (event: PipelineStepEvent) => void
): Promise<DocumentProcessResult> {
  if (!db) throw new Error("Firebase isn't configured.");
  validateUploadFile(file);
  const emit = (event: PipelineStepEvent) => onStep?.(event);

  // ---- UPLOADING ----
  emit({ step: "uploading", status: "active" });
  const { url: fileURL } = await uploadToCloudinary(file, `schools/${schoolId}/documents`);
  emit({ step: "uploading", status: "done" });

  const ref = doc(collection(db, "schools", schoolId, "documents"));
  const aiConfigured = await isAiConfigured();
  const aiEligible = aiConfigured && SUPPORTED_AI_MIME(file.type);

  let aiStatus: DocumentMeta["aiStatus"] = "unavailable";
  let aiSummary: string | undefined;
  let extractedFields: Record<string, string> | undefined;
  let extractedText: string | undefined;
  let pipelineStep: DocumentMeta["aiPipelineStep"] = "uploading";

  if (!aiEligible) {
    emit({
      step: "reading",
      status: "skipped",
      detail: aiConfigured ? "This file type isn't supported for AI reading yet." : "AI isn't configured for this school.",
    });
    emit({ step: "understanding", status: "skipped" });
    emit({ step: "indexing", status: "skipped" });
  } else {
    // ---- READING ----
    emit({ step: "reading", status: "active" });
    try {
      const dataBase64 = await fileToBase64(file);
      const res = await fetch("/api/ai/document/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataBase64, mimeType: file.type, documentType: meta.documentType, fileName: file.name }),
      });
      const data = await res.json();

      if (!res.ok || !data.configured || data.error) {
        emit({ step: "reading", status: "error", detail: data.error ?? "Couldn't read this document." });
        emit({ step: "understanding", status: "skipped" });
        emit({ step: "indexing", status: "skipped" });
        aiStatus = "error";
        pipelineStep = "reading";
      } else {
        emit({ step: "reading", status: "done" });

        // ---- UNDERSTANDING ----
        emit({ step: "understanding", status: "active" });
        extractedText = data.extractedText as string;
        aiSummary = data.summary as string;
        extractedFields = data.fields as Record<string, string>;
        emit({ step: "understanding", status: "done" });
        pipelineStep = "understanding";

        // ---- INDEXING ----
        if (extractedText && extractedText.trim().length > 0) {
          emit({ step: "indexing", status: "active" });
          try {
            const { ingestDocumentText } = await import("@/lib/ai/rag");
            const audience = meta.documentType === "policy" ? "school" : meta.classId ? "class" : "school";
            const result = await ingestDocumentText({
              schoolId,
              documentId: ref.id,
              documentTitle: file.name,
              text: extractedText,
              audience,
              classId: meta.classId,
            });
            aiStatus = result.chunkCount > 0 ? "complete" : "error";
            emit({ step: "indexing", status: aiStatus === "complete" ? "done" : "error" });
            pipelineStep = "done";
          } catch {
            aiStatus = "error";
            emit({ step: "indexing", status: "error", detail: "Couldn't index this document for search." });
            pipelineStep = "understanding";
          }
        } else {
          aiStatus = "error";
          emit({ step: "indexing", status: "skipped", detail: "No readable text was found in this document." });
        }
      }
    } catch (err) {
      emit({ step: "reading", status: "error", detail: "Network error while reading this document." });
      emit({ step: "understanding", status: "skipped" });
      emit({ step: "indexing", status: "skipped" });
      aiStatus = "error";
    }
  }

  const document: DocumentMeta = {
    id: ref.id,
    schoolId,
    uploadedBy,
    fileName: file.name,
    fileURL,
    fileSize: file.size,
    mimeType: file.type,
    aiStatus,
    ...(aiSummary !== undefined ? { aiSummary } : {}),
    ...(extractedFields !== undefined ? { extractedFields } : {}),
    aiPipelineStep: pipelineStep,
    ...meta,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  // Firestore's client SDK rejects `undefined` field values by default
  // (no ignoreUndefinedProperties set on this project's db instance —
  // see lib/firebase.ts) — the spreads above keep aiSummary/
  // extractedFields out of the write entirely rather than writing them
  // as undefined, instead of risking a silent setDoc failure here.
  await setDoc(ref, { ...document, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });

  return { document, extractedText };
}

/**
 * Lets the uploader correct extracted fields/summary on the "Document
 * Ready" review screen before they're treated as final — the pipeline
 * proposes, the human confirms, same propose->confirm posture as the
 * AI actions layer (Part 5-7), applied here to extraction accuracy.
 */
export async function updateDocumentReview(
  schoolId: string,
  documentId: string,
  updates: { aiSummary?: string; extractedFields?: Record<string, string> }
): Promise<void> {
  if (!db) throw new Error("Firebase isn't configured.");
  await updateDoc(doc(db, "schools", schoolId, "documents", documentId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

/** Back-compat wrapper — the admin "paste policy text" flow still calls this shape directly. */
export async function uploadDocument(
  schoolId: string,
  uploadedBy: string,
  file: File,
  meta: { documentType: DocumentType; classId?: string; ownerId: string },
  knowledgeText?: string
): Promise<DocumentMeta> {
  if (!db) throw new Error("Firebase isn't configured.");
  validateUploadFile(file);

  const { url: fileURL } = await uploadToCloudinary(file, `schools/${schoolId}/documents`);

  const ref = doc(collection(db, "schools", schoolId, "documents"));
  let aiStatus: DocumentMeta["aiStatus"] = (await isAiConfigured()) ? "processing" : "unavailable";

  if (knowledgeText && knowledgeText.trim().length > 0) {
    try {
      const { ingestDocumentText } = await import("@/lib/ai/rag");
      const audience = meta.documentType === "policy" ? "school" : meta.classId ? "class" : "school";
      const result = await ingestDocumentText({
        schoolId,
        documentId: ref.id,
        documentTitle: file.name,
        text: knowledgeText,
        audience,
        classId: meta.classId,
      });
      aiStatus = result.chunkCount > 0 ? "complete" : "error";
    } catch {
      aiStatus = "error";
    }
  }

  const document: DocumentMeta = {
    id: ref.id,
    schoolId,
    uploadedBy,
    fileName: file.name,
    fileURL,
    fileSize: file.size,
    mimeType: file.type,
    aiStatus,
    ...meta,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await setDoc(ref, { ...document, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });

  return document;
}
