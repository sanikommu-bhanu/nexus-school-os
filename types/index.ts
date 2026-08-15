// ============================================================
// NEXUS — CORE DOMAIN TYPES
// These mirror the Firestore schema 1:1 so UI, mock data, and
// the real backend can be swapped without touching components.
// ============================================================

export type Role = "admin" | "teacher" | "student" | "parent";

export interface Timestamped {
  createdAt: string; // ISO string client-side; Firestore Timestamp server-side
  updatedAt: string;
}

export interface UserProfile extends Timestamped {
  id: string; // == Firebase Auth uid
  fullName: string;
  email: string | null;
  phone?: string;
  photoURL?: string;
  role: Role;
  onboardingComplete: boolean;
  // Denormalized pointers — kept in sync by the service layer,
  // never treated as the source of truth for authorization.
  schoolId?: string;
  primaryClassId?: string; // students
}

export interface School extends Timestamped {
  id: string;
  name: string;
  type: string; // e.g. CBSE, ICSE, State Board, International
  city: string;
  state: string;
  logoURL?: string;
  contactEmail?: string;
  contactPhone?: string;
  code: string; // public join code, e.g. SCH-7F82K91
  ownerId: string; // admin uid who created it
}

export interface SchoolMember extends Timestamped {
  userId: string;
  schoolId: string;
  role: Role;
  status: "active" | "pending" | "removed";
}

export interface TeacherProfile extends Timestamped {
  userId: string;
  schoolId: string;
  subject: string;
  department?: string;
  classIds: string[];
}

export interface StudentProfile extends Timestamped {
  userId: string;
  schoolId: string;
  classId: string;
  rollNumber?: string;
  dateOfBirth?: string;
  gender?: string;
  parentLinkCode: string; // used to invite a parent
}

export interface ParentProfile extends Timestamped {
  userId: string;
  childIds: string[]; // student userIds
  contactPhone?: string;
}

export interface ClassEntity extends Timestamped {
  id: string;
  schoolId: string;
  name: string; // e.g. "10-A"
  grade: string;
  section: string;
  subject: string;
  teacherId: string;
  /** Denormalized display name — see class-service.ts's createClass for why. */
  teacherName?: string;
  code: string; // e.g. NX-10A-MATH-42
  studentCount: number;
}

export interface ClassMember extends Timestamped {
  userId: string;
  classId: string;
  schoolId: string;
  role: "teacher" | "student";
}

export interface ParentStudentLink extends Timestamped {
  id: string;
  parentId: string;
  studentId: string;
  relationship: string; // Mother, Father, Guardian
  verified: boolean;
}

// ============================================================
// PHASE 3 — operational domain types
// ============================================================

export type AttendanceStatus = "present" | "absent" | "late" | "excused";

/**
 * One record per student per class per day.
 * Doc id is deterministic: `${classId}_${studentId}_${YYYY-MM-DD}` —
 * this is what makes "prevent duplicate attendance, allow edit" free:
 * writing again with the same key overwrites, it never inserts twice.
 */
export interface AttendanceRecord extends Timestamped {
  id: string;
  schoolId: string;
  classId: string;
  studentId: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  markedBy: string; // teacher uid
}

export interface Assignment extends Timestamped {
  id: string;
  schoolId: string;
  classId: string;
  teacherId: string;
  title: string;
  description: string;
  subject: string;
  dueDate: string; // ISO date
  attachmentURL?: string;
  attachmentName?: string;
}

export type SubmissionStatus = "pending" | "submitted" | "late" | "graded";

export interface AssignmentSubmission extends Timestamped {
  id: string; // `${assignmentId}_${studentId}`
  assignmentId: string;
  studentId: string;
  classId: string;
  status: SubmissionStatus;
  submittedAt?: string;
  grade?: string;
}

export const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface TimetableSlot extends Timestamped {
  id: string;
  schoolId: string;
  classId: string;
  teacherId: string;
  subject: string;
  day: Weekday;
  period: number; // 1-based period index
  startTime: string; // "09:00"
  endTime: string; // "09:45"
  room?: string;
}

export type DocumentType = "syllabus" | "notes" | "question_paper" | "assignment" | "policy" | "other";

export interface DocumentMeta extends Timestamped {
  id: string;
  schoolId: string;
  classId?: string; // absent => school-level document
  ownerId: string; // entity the doc belongs to conceptually
  uploadedBy: string;
  documentType: DocumentType;
  fileName: string;
  fileURL: string;
  fileSize: number;
  mimeType: string;
  // Document Intelligence Foundation (Part 16) — populated by the
  // processing pipeline; absent/"unavailable" if AI isn't configured.
  aiStatus: "not_started" | "processing" | "complete" | "unavailable" | "error";
  aiSummary?: string;
  /**
   * Structured fields extracted by the document intelligence pipeline
   * (Part 12-14) — shape depends on documentType (e.g. a question_paper
   * might have {"subject": "...", "totalMarks": "..."}, an assignment
   * {"dueDate": "...", "instructions": "..."}). Always editable by the
   * uploader before being saved — never presented as ground truth the
   * user can't correct. Absent when extraction never ran.
   */
  extractedFields?: Record<string, string>;
  /** Which pipeline step last completed — lets the UI resume/represent state honestly after a reload. */
  aiPipelineStep?: "uploading" | "reading" | "understanding" | "indexing" | "done";
}

export type AnnouncementAudience = "school" | "class" | "teacher" | "student" | "parent";
export type AnnouncementPriority = "normal" | "important" | "urgent";

export interface Announcement extends Timestamped {
  id: string;
  schoolId: string;
  classId?: string; // set when audience === "class"
  createdBy: string;
  title: string;
  message: string;
  audience: AnnouncementAudience;
  priority: AnnouncementPriority;
  attachmentURL?: string;
}

export type NotificationType =
  | "attendance"
  | "assignment"
  | "announcement"
  | "timetable"
  | "document"
  | "parent_connection"
  | "teacher_update"
  | "system";

export interface NotificationItem extends Timestamped {
  id: string;
  schoolId: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  relatedEntityId?: string;
  relatedEntityPath?: string;
}

export interface ConversationMeta extends Timestamped {
  id: string;
  schoolId: string;
  participantIds: string[]; // exactly 2 for Phase 3 (teacher<->parent/student)
  lastMessage?: string;
  lastMessageAt?: string;
  lastSenderId?: string;
  unreadFor: string[]; // uids that have unread messages in this conversation
}

export interface MessageItem extends Timestamped {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
}

// ---- Fee management ----
// No payment gateway is wired up (would need a real merchant account
// and PCI-scoped handling, out of scope for a free-tier Firebase
// project) — this models real dues and real payments-as-recorded,
// e.g. cash/cheque/UPI collected at the school office, entered by an
// admin. Nothing here is a fabricated "paid" state.
export type FeePaymentMethod = "cash" | "cheque" | "bank_transfer" | "upi" | "other";

export interface FeeStructure extends Timestamped {
  id: string;
  schoolId: string;
  classId?: string; // absent = applies school-wide
  title: string; // e.g. "Term 1 Tuition Fee"
  amount: number;
  dueDate: string;
  createdBy: string;
}

export interface FeePayment extends Timestamped {
  id: string;
  schoolId: string;
  studentId: string;
  feeStructureId: string;
  amountPaid: number;
  method: FeePaymentMethod;
  paidAt: string;
  recordedBy: string; // admin uid who logged the payment
  note?: string;
}

// ---- AI knowledge base (RAG) ----
// Same audience vocabulary as Announcement, reused deliberately: a
// chunk is only ever retrievable by the roles/scope its audience
// implies, checked in lib/ai/rag.ts before it ever reaches Gemini.
export type KnowledgeAudience = "school" | "class" | "teacher" | "student" | "parent";

export interface KnowledgeChunk extends Timestamped {
  id: string;
  schoolId: string;
  documentId: string;
  documentTitle: string;
  classId?: string; // set when audience === "class"
  audience: KnowledgeAudience;
  chunkIndex: number;
  text: string;
  embedding: number[];
  embeddingModel: string;
}

// ---- AI conversation memory (Part 25) ----
// Persisted per-user so NEXUS AI chat survives a reload/app restart.
// Stored under schools/{schoolId}/aiConversations/{uid}/messages —
// scoped to one user's own uid, never cross-readable (see firestore.rules).
export interface AiMessageRecord extends Timestamped {
  id: string;
  uid: string;
  role: "user" | "ai";
  title?: string;
  text: string;
  grounded?: boolean;
  unavailable?: boolean;
  rateLimited?: boolean;
}

// ---- UI-only types ----

export interface RoleOption {
  role: Role;
  label: string;
  description: string;
}

export type AsyncStatus = "idle" | "loading" | "success" | "error";
