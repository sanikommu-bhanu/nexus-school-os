// ============================================================
// The demo school's shape. Pure data + pure generators — no
// Firestore, no network, so this stays trivially reviewable and
// the numbers below are the only place the demo is defined.
//
// EVERY id here is deterministic and prefixed. That is what makes
// the seed idempotent (a second run addresses the same documents
// rather than creating new ones) and what makes the reset safe
// (it can only ever match documents carrying these ids).
//
// All people are fictional. Emails are on example.com, which is
// reserved by RFC 2606 and can never route to a real inbox.
// ============================================================
import type { AttendanceStatus, SubmissionStatus, Weekday } from "@/types";

/** The one school this seed is allowed to touch. Every guard keys off this. */
export const DEMO_SCHOOL_ID = "nexus-demo-school";
export const DEMO_SCHOOL_CODE = "SCH-DEMO01";
/** Marks every document the seed owns, so a reset can find them and nothing else. */
export const DEMO_TAG = "nexus-demo";

/** Prefix on every seeded uid — also how the reset identifies its own users. */
export const DEMO_UID_PREFIX = "demo-";

// The four accounts a judge actually logs in as. Their uids are fixed
// so re-seeding updates the same accounts instead of orphaning them.
export const DEMO_ADMIN_UID = "demo-admin";
export const DEMO_TEACHER_UID = "demo-teacher";
export const DEMO_STUDENT_UID = "demo-student";
export const DEMO_PARENT_UID = "demo-parent";

export interface DemoTeacher {
  uid: string;
  fullName: string;
  email: string;
  subject: string;
  department: string;
}

/**
 * Eight teachers, not six: the timetable generator below assigns
 * teacher `(classIndex + period) % teachers.length` for each period,
 * which is only collision-free when there are at least as many
 * teachers as classes. Eight teachers and eight classes means no
 * teacher is ever double-booked, without needing a search.
 */
export const DEMO_TEACHERS: DemoTeacher[] = [
  { uid: DEMO_TEACHER_UID, fullName: "Ananya Sharma", email: "ananya.sharma@demo.example.com", subject: "Mathematics", department: "Science & Mathematics" },
  { uid: "demo-t-02", fullName: "Rahul Mehta", email: "rahul.mehta@demo.example.com", subject: "Physics", department: "Science & Mathematics" },
  { uid: "demo-t-03", fullName: "Priya Nair", email: "priya.nair@demo.example.com", subject: "English", department: "Languages" },
  { uid: "demo-t-04", fullName: "Arjun Rao", email: "arjun.rao@demo.example.com", subject: "Computer Science", department: "Science & Mathematics" },
  { uid: "demo-t-05", fullName: "Meera Kapoor", email: "meera.kapoor@demo.example.com", subject: "Biology", department: "Science & Mathematics" },
  { uid: "demo-t-06", fullName: "Vikram Singh", email: "vikram.singh@demo.example.com", subject: "History", department: "Humanities" },
  { uid: "demo-t-07", fullName: "Sunita Desai", email: "sunita.desai@demo.example.com", subject: "Geography", department: "Humanities" },
  { uid: "demo-t-08", fullName: "Imran Qureshi", email: "imran.qureshi@demo.example.com", subject: "Chemistry", department: "Science & Mathematics" },
];

export interface DemoClass {
  id: string;
  name: string;
  grade: string;
  section: string;
  /** Index into DEMO_TEACHERS — the class's form teacher. */
  teacherIndex: number;
  code: string;
  room: string;
}

export const DEMO_CLASSES: DemoClass[] = [
  { id: "demo-class-6a", name: "Grade 6-A", grade: "6", section: "A", teacherIndex: 0, code: "NX6A-MATH-01", room: "R101" },
  { id: "demo-class-6b", name: "Grade 6-B", grade: "6", section: "B", teacherIndex: 1, code: "NX6B-PHYS-02", room: "R102" },
  { id: "demo-class-7a", name: "Grade 7-A", grade: "7", section: "A", teacherIndex: 2, code: "NX7A-ENGL-03", room: "R103" },
  { id: "demo-class-7b", name: "Grade 7-B", grade: "7", section: "B", teacherIndex: 3, code: "NX7B-COMP-04", room: "R104" },
  { id: "demo-class-8a", name: "Grade 8-A", grade: "8", section: "A", teacherIndex: 4, code: "NX8A-BIOL-05", room: "R105" },
  { id: "demo-class-8b", name: "Grade 8-B", grade: "8", section: "B", teacherIndex: 5, code: "NX8B-HIST-06", room: "R106" },
  { id: "demo-class-9a", name: "Grade 9-A", grade: "9", section: "A", teacherIndex: 6, code: "NX9A-GEOG-07", room: "R107" },
  { id: "demo-class-10a", name: "Grade 10-A", grade: "10", section: "A", teacherIndex: 7, code: "NX10A-CHEM-08", room: "R108" },
];

const FIRST_NAMES = [
  "Aarav", "Diya", "Kabir", "Ishani", "Rohan", "Anika", "Vivaan", "Saanvi",
  "Aditya", "Myra", "Reyansh", "Kiara", "Advait", "Aadhya", "Kian", "Zara",
  "Neel", "Riya", "Yuvan", "Tara", "Ayaan", "Nitya", "Dhruv", "Sara",
  "Arnav", "Pihu", "Krish", "Avni", "Shaurya", "Ira", "Laksh", "Mira",
  "Veer", "Anaya", "Rudra", "Naisha", "Atharv", "Kyra", "Ansh", "Prisha",
  "Devansh", "Aarohi", "Samar", "Vanya", "Rishi", "Ahana", "Nirvaan", "Amaira",
];

const SURNAMES = [
  "Iyer", "Banerjee", "Chauhan", "Pillai", "Ghosh", "Malhotra", "Reddy", "Joshi",
  "Sethi", "Bhatt", "Menon", "Chopra", "Verma", "Rane", "Kulkarni", "Dutta",
];

export interface DemoStudent {
  uid: string;
  fullName: string;
  email: string;
  classId: string;
  rollNumber: string;
  gender: string;
  dateOfBirth: string;
  parentLinkCode: string;
  /** 0-1. Drives how attendance is generated — see attendanceStatusFor(). */
  attendanceProfile: number;
}

/**
 * Six students per class across eight classes = 48.
 *
 * `attendanceProfile` is spread deliberately rather than randomly so
 * the analytics and AI have something real to find: most students sit
 * in a healthy band, a few sit in the 70s, and two per cohort fall
 * below 70% so "which students need attention" has a true answer.
 */
export function buildDemoStudents(): DemoStudent[] {
  const students: DemoStudent[] = [];
  let n = 0;

  for (const cls of DEMO_CLASSES) {
    for (let i = 0; i < 6; i++) {
      const idx = n;
      const first = FIRST_NAMES[idx % FIRST_NAMES.length];
      const last = SURNAMES[(idx * 3) % SURNAMES.length];
      const seq = String(idx + 1).padStart(3, "0");

      // Deterministic spread: two low, one borderline, three healthy
      // in every class of six.
      const profile = i === 0 ? 0.66 : i === 1 ? 0.74 : i === 2 ? 0.79 : i === 3 ? 0.88 : i === 4 ? 0.93 : 0.97;

      // The very first student of the very first class IS the demo
      // student account, so a judge logging in as "Demo Student" lands
      // inside a class that has real classmates, attendance and work.
      const isDemoAccount = idx === 0;

      students.push({
        uid: isDemoAccount ? DEMO_STUDENT_UID : `demo-s-${seq}`,
        fullName: isDemoAccount ? "Aarav Iyer" : `${first} ${last}`,
        email: isDemoAccount ? "aarav.iyer@demo.example.com" : `${first.toLowerCase()}.${last.toLowerCase()}${seq}@demo.example.com`,
        classId: cls.id,
        rollNumber: String(i + 1).padStart(2, "0"),
        gender: idx % 2 === 0 ? "Male" : "Female",
        dateOfBirth: `${2016 - Number(cls.grade)}-0${(idx % 9) + 1}-1${idx % 10}`,
        parentLinkCode: `NXP-D${seq}`,
        // The demo student is deliberately mid-band, not perfect: a
        // judge asking "what is my attendance" should get a real,
        // interesting number rather than a flat 100%.
        attendanceProfile: isDemoAccount ? 0.86 : profile,
      });
      n++;
    }
  }
  return students;
}

export interface DemoParent {
  uid: string;
  fullName: string;
  email: string;
  contactPhone: string;
  childIds: string[];
  relationship: string;
}

/**
 * One parent per two students where possible, which exercises the
 * multi-child path the parent dashboard already supports rather than
 * assuming every family has exactly one child.
 */
export function buildDemoParents(students: DemoStudent[]): DemoParent[] {
  const parents: DemoParent[] = [];
  for (let i = 0; i < students.length; i += 2) {
    const pair = students.slice(i, i + 2);
    const seq = String(Math.floor(i / 2) + 1).padStart(3, "0");
    const isDemoAccount = i === 0;
    const surname = pair[0].fullName.split(" ").slice(-1)[0];

    parents.push({
      uid: isDemoAccount ? DEMO_PARENT_UID : `demo-p-${seq}`,
      fullName: isDemoAccount ? `Rekha ${surname}` : `${i % 4 === 0 ? "Sunil" : "Kavita"} ${surname}`,
      email: isDemoAccount ? "rekha.iyer@demo.example.com" : `parent${seq}@demo.example.com`,
      contactPhone: `+91 90000 ${String(10000 + Math.floor(i / 2)).slice(-5)}`,
      childIds: pair.map((s) => s.uid),
      relationship: i % 4 === 0 ? "Father" : "Mother",
    });
  }
  return parents;
}

// ---- Attendance -------------------------------------------------

export const ATTENDANCE_DAYS = 30;

/**
 * Turns a student's profile into a status for a given day.
 *
 * Deterministic on (studentIndex, dayIndex) rather than random, so a
 * re-seed produces byte-identical attendance and the deterministic doc
 * id `${classId}_${studentId}_${date}` overwrites cleanly instead of
 * drifting. The mix of absent/late/excused is what lets the existing
 * summariseAttendance() produce a believable spread.
 */
export function attendanceStatusFor(studentIndex: number, dayIndex: number, profile: number): AttendanceStatus {
  // Cheap deterministic hash in [0,1).
  const h = ((studentIndex * 73 + dayIndex * 137 + 17) % 100) / 100;
  if (h < profile) return "present";
  if (h < profile + 0.04) return "late";
  if (h < profile + 0.07) return "excused";
  return "absent";
}

/** The last N weekdays, oldest first. Weekends are skipped — schools don't mark them. */
export function recentSchoolDays(count: number, from = new Date()): string[] {
  const days: string[] = [];
  const cursor = new Date(from);
  while (days.length < count) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() - 1);
  }
  return days.reverse();
}

// ---- Assignments ------------------------------------------------

export interface DemoAssignmentSpec {
  idSuffix: string;
  title: string;
  description: string;
  /** Days from today. Negative = already overdue, positive = upcoming. */
  dueInDays: number;
}

export const DEMO_ASSIGNMENT_SPECS: DemoAssignmentSpec[] = [
  {
    idSuffix: "a1",
    title: "Chapter Review Worksheet",
    description: "Complete the end-of-chapter review questions and show your working for each problem.",
    dueInDays: -4,
  },
  {
    idSuffix: "a2",
    title: "Practical Report",
    description: "Write up the classroom practical: aim, method, observations, and what you concluded.",
    dueInDays: 3,
  },
  {
    idSuffix: "a3",
    title: "Term Project Outline",
    description: "Submit a one-page outline of your term project, including your research question.",
    dueInDays: 9,
  },
];

/**
 * Submission state for a student on an assignment.
 *
 * An assignment that is not yet due cannot be "late", and a student
 * with poor attendance is likelier to have nothing handed in — both so
 * the seeded data tells a coherent story rather than a random one.
 */
export function submissionStatusFor(
  studentIndex: number,
  assignmentIndex: number,
  profile: number,
  overdue: boolean
): SubmissionStatus {
  const h = ((studentIndex * 31 + assignmentIndex * 61 + 7) % 100) / 100;
  if (!overdue) return h < profile - 0.25 ? "submitted" : "pending";
  if (h < profile - 0.15) return "graded";
  if (h < profile + 0.05) return "submitted";
  if (h < profile + 0.15) return "late";
  return "pending";
}

/** Free-text grade, matching AssignmentSubmission.grade being a string not a number. */
export function gradeFor(studentIndex: number, assignmentIndex: number): string {
  const marks = 12 + ((studentIndex * 7 + assignmentIndex * 3) % 9); // 12..20
  return `${marks}/20`;
}

// ---- Timetable --------------------------------------------------

export const TIMETABLE_DAYS: Weekday[] = ["MO", "TU", "WE", "TH", "FR"];
export const PERIODS = [
  { period: 1, startTime: "09:00", endTime: "09:45" },
  { period: 2, startTime: "09:50", endTime: "10:35" },
  { period: 3, startTime: "10:50", endTime: "11:35" },
  { period: 4, startTime: "11:40", endTime: "12:25" },
  { period: 5, startTime: "13:10", endTime: "13:55" },
  { period: 6, startTime: "14:00", endTime: "14:45" },
];

// ---- Announcements ----------------------------------------------

export const DEMO_ANNOUNCEMENTS = [
  {
    idSuffix: "an1",
    title: "Parent-Teacher Meeting — Saturday",
    message: "The term parent-teacher meeting is on Saturday from 9:00am to 1:00pm. Slots are 10 minutes per family; please arrive five minutes early.",
    audience: "school" as const,
    priority: "important" as const,
  },
  {
    idSuffix: "an2",
    title: "Annual Sports Day",
    message: "Annual Sports Day will be held next month on the main ground. Trials for track events begin this week during games period.",
    audience: "school" as const,
    priority: "normal" as const,
  },
  {
    idSuffix: "an3",
    title: "Library Books Due",
    message: "All borrowed library books must be returned before the end of term. Replacement charges apply to unreturned titles.",
    audience: "student" as const,
    priority: "normal" as const,
  },
];

export const DEMO_CLASS_ANNOUNCEMENT = {
  idSuffix: "anc",
  title: "Unit Test Next Week",
  message: "The unit test covering the first three chapters will be held next week during the second period. Bring your own instruments.",
  priority: "important" as const,
};

// ---- Fees -------------------------------------------------------

export const DEMO_FEE_STRUCTURES = [
  { idSuffix: "f1", title: "Term 1 Tuition Fee", amount: 18000, dueInDays: -10 },
  { idSuffix: "f2", title: "Laboratory & Activity Fee", amount: 4500, dueInDays: 20 },
];

// ---- School knowledge (RAG) -------------------------------------

export interface DemoPolicyDoc {
  idSuffix: string;
  title: string;
  text: string;
}

/**
 * Fictional policies, written as a real school would write them so the
 * existing RAG pipeline has genuine prose to chunk, embed and retrieve.
 * These are the source of truth for policy questions asked of NEXUS AI
 * — nothing about them is hardcoded into an AI answer.
 */
export const DEMO_POLICY_DOCS: DemoPolicyDoc[] = [
  {
    idSuffix: "p1",
    title: "Attendance Policy",
    text: `NEXUS International School — Attendance Policy

1. Minimum attendance. Every student must maintain at least 75% attendance across the academic term. A student below 75% at the end of a term is not eligible to sit the term examination without written approval from the Principal.

2. Marking. Attendance is recorded once per class per day by the class teacher. A student arriving more than ten minutes after the period begins is marked late. Three late marks are counted as one absence.

3. Absence. A parent or guardian must inform the class teacher of an absence before 9:00am on the day. Absences supported by a written note or medical certificate within three working days are recorded as excused.

4. Medical leave. Continuous medical leave beyond five days requires a medical certificate. Excused medical absence is not counted against the 75% minimum.

5. Intervention. When a student falls below 80%, the class teacher contacts the parent that week. Below 70%, the student is referred to the year coordinator and a support plan is opened.

6. Corrections. A teacher may correct an attendance entry for the same day. Changes after the day require the year coordinator's approval.`,
  },
  {
    idSuffix: "p2",
    title: "Student Code of Conduct",
    text: `NEXUS International School — Student Code of Conduct

1. Respect. Students treat classmates, teachers and support staff with courtesy. Harassment, bullying and discrimination of any kind are not tolerated and are escalated to the Principal immediately.

2. Punctuality. Students are in their classroom before the first bell. Repeated lateness is addressed with the parent.

3. Uniform. The prescribed uniform is worn on all instructional days. House colours are worn on activity days.

4. Devices. Mobile phones remain switched off and in bags during instructional periods. Devices are permitted in computer laboratories under a teacher's supervision.

5. Academic honesty. Work submitted must be the student's own. Copying, plagiarism and unauthorised assistance in assessments result in the work being cancelled and the parent informed.

6. Care of property. Students are responsible for school property issued to them, including library books and laboratory equipment.`,
  },
  {
    idSuffix: "p3",
    title: "Examination Guidelines",
    text: `NEXUS International School — Examination Guidelines

1. Schedule. The examination timetable is published at least two weeks before the first paper.

2. Eligibility. A student must have at least 75% attendance and no outstanding fee dues to be eligible to sit an examination.

3. Reporting. Students report to the examination hall fifteen minutes before the paper begins. Entry is not permitted more than thirty minutes after the paper starts.

4. Materials. Only permitted instruments and stationery are allowed. Mobile phones and smart watches are prohibited in the hall.

5. Malpractice. Any form of malpractice results in cancellation of that paper and a report to the Principal.

6. Results. Results are published within three weeks. A re-evaluation may be requested in writing within seven days of publication.

7. Missed papers. A paper missed for a documented medical reason may be taken in the supplementary window.`,
  },
  {
    idSuffix: "p4",
    title: "Assignment Policy",
    text: `NEXUS International School — Assignment Policy

1. Purpose. Assignments consolidate classroom learning and are part of continuous assessment.

2. Load. No class is set more than two major assignments in the same week. Teachers coordinate through the class teacher to avoid clashes.

3. Deadlines. Assignments are submitted by the stated due date. Work submitted after the due date is recorded as late.

4. Late work. Late submissions are accepted up to five days after the due date with a deduction. Beyond five days, work is accepted only with the year coordinator's approval.

5. Extensions. A student may request an extension before the due date, supported by a reason. Extensions granted are recorded by the teacher.

6. Feedback. Teachers return marked work with feedback within ten working days of the due date.

7. Integrity. Assignments must be the student's own work. Sources must be acknowledged.`,
  },
  {
    idSuffix: "p5",
    title: "Parent Communication Policy",
    text: `NEXUS International School — Parent Communication Policy

1. Primary channel. The NEXUS parent portal is the school's official channel for attendance, assignments, announcements and fee information.

2. Response times. Teachers respond to parent messages within two working days. Urgent safety matters are escalated to the Principal the same day.

3. Meetings. Parent-teacher meetings are held once per term. Additional meetings may be requested through the class teacher.

4. Progress updates. Parents can view their own child's attendance and assignment status at any time through the portal. A parent has access only to children linked to their account.

5. Absence notification. Parents inform the class teacher of an absence before 9:00am on the day of absence.

6. Escalation. Concerns are raised first with the class teacher, then the year coordinator, then the Principal.`,
  },
];
