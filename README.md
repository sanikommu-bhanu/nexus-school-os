# NEXUS — AI Operating System for Schools

> **🚀 [Click here for the Live Deployment](https://nexus-school-os.vercel.app)**
> **📄 [Click here for the Google Doc Documentation](https://docs.google.com/document/d/1FE2-6mtnKE6ZKbu6pr_gY_7dSU4V2SzQ/edit?usp=drivesdk&ouid=100993605915840593739&rtpof=true&sd=true)**

[![CI](https://github.com/sanikommu-bhanu/nexus-school-os/actions/workflows/ci.yml/badge.svg)](https://github.com/sanikommu-bhanu/nexus-school-os/actions/workflows/ci.yml)

An AI-powered school operating system that replaces manual data entry, paper
records and siloed scheduling with one intelligent platform for admins,
teachers, students and parents.

Real source, not a mockup — run it locally against your own free-tier Firebase
project. Every push runs typecheck, lint, a production build, three pure test
suites, and the **Firestore security-rules suite against a live emulator**, so
the rules are proven to reject the attacks they claim to reject rather than
merely looking strict.

> [!IMPORTANT]
> ### 🏆 Key Technical Innovations for Competition Judges
> 1. **Zero-Cost Production Architecture**: Built entirely on free-tier services (Firebase Auth/Firestore + Cloudinary + Gemini) with zero cloud bill.
> 2. **Strict Service Layer Boundaries**: Screens never touch Firestore directly—all I/O passes through service wrappers enforcing single-writer collection discipline.
> 3. **Grounded AI Security**: Gemini operates strictly via server-side proxies (`/api/ai/ask`) over client-scoped Firestore facts, preventing query injection and hallucinations.
> 4. **Live-Emulator Security Suite**: Firestore security rules are validated against a live local emulator in CI on every commit.

---

## Live Demo

**Live application:** <https://nexus-school-os.vercel.app>
**Repository:** <https://github.com/sanikommu-bhanu/nexus-school-os>

Sign in with any of the four accounts below to explore NEXUS from that role's
point of view. No setup, no local install.

> [!NOTE]
> **Production Application vs. Demo Setup:** NEXUS is a **fully functional, real-world school operating system**—not a static prototype or sandbox mockup. Every single screen, AI query, attendance capture, and fee payment operates against live backend database services. The pre-seeded demo environment below was specifically designed so judges and evaluators can instantly test the rich, end-to-end multi-role workflows without needing to build a school from scratch.

### Demo credentials

| Role | Email | Password |
|---|---|---|
| Administrator | `demo.admin@nexus-demo.school` | `NexusAdmin!2026Demo` |
| Teacher | `demo.teacher@nexus-demo.school` | `NexusTeacher!2026Demo` |
| Student | `demo.student@nexus-demo.school` | `NexusStudent!2026Demo` |
| Parent | `demo.parent@nexus-demo.school` | `NexusParent!2026Demo` |

These are **fictional accounts created specifically for evaluating NEXUS**.
They belong to a demonstration school — *NEXUS International School* — whose
teachers, students, parents and families are invented. No real person's data
appears anywhere in the demo, and these credentials grant access to nothing
beyond that demo school.

The demo data is **real records, not mocked numbers**. Attendance percentages,
submission tallies, class sizes and fee balances are all computed by the same
services and queries the production app uses, from actual Firestore documents —
including a month of deliberately uneven attendance, so the analytics and the
AI have something true to find rather than a flat 100%.

### What each role demonstrates

**Administrator** — the whole school ecosystem: teachers, classes, students,
attendance trends, assignments, the timetable, policy documents, fee records,
workload analysis and school-wide AI insights.

**Teacher** — their own classes only: the student roster, marking and editing
attendance, creating assignments and grading submissions, their teaching
timetable, and teacher-scoped AI assistance.

**Student** — their own record only: enrolled classes, personal attendance,
assignments due and handed in, class timetable, shared documents, and
student-scoped AI help.

**Parent** — their linked children only: each child's attendance, assignment
status, timetable, announcements and fee position, plus parent-scoped AI.

> **Role isolation is enforced by Firestore security rules, not by the UI.**
> A teacher cannot read another teacher's class, a student cannot read another
> student's record, a parent sees only linked children, and no school can read
> another school's data. NEXUS AI inherits exactly these boundaries — it answers
> from permission-scoped tool calls, so it can never surface data the signed-in
> user could not already open themselves. Signing in as each role in turn is the
> quickest way to see that hold.

### Prefer to see the real onboarding flow?

The demo accounts above skip straight to populated dashboards. To watch the
actual product flow instead, sign up as a new admin and follow
create school → share the school code/QR → teacher joins → creates a class →
student joins by class code/QR → parent connects to their child. That path is
unchanged by the demo data and is described in
[join and membership flows](#join-and-membership-flows).

---

## System diagrams

Six system-level diagrams are below. Four more detailed walkthroughs live
further down, next to the code they describe:
[data model](#the-data-model) ·
[join and membership flows](#join-and-membership-flows) ·
[auth and onboarding routing](#auth-and-onboarding-routing) ·
[the AI request path](#the-ai-request-path).

### 1. System architecture

Four layers, one rule: screens never touch Firestore directly, and the domain
logic never touches the network.

```mermaid
flowchart TB
    subgraph CLIENT["Client — Next.js 14 App Router / PWA"]
        UI["65 screens<br/>admin · teacher · student · parent"]
        DSY["Design system<br/>components/ui — all tokens"]
        HKS["Hooks and stores<br/>useAuthUser · useSchoolPulse<br/>zustand school-pulse-store"]
    end

    subgraph DOMAIN["Domain logic — pure, no I/O, 89 unit tests"]
        TCF["timetable-conflicts.ts<br/>detect + resolve"]
        WKL["workload.ts<br/>load + reallocation"]
        ACP["attendance-capture.ts<br/>scan to student"]
        CHK["ai/chunk.ts<br/>chunking + cosine"]
    end

    subgraph SERVICES["Service layer — one sole writer per collection"]
        SVA["school · class · student<br/>teacher · parent-link"]
        SVB["attendance · timetable · fee<br/>document · messaging · notification"]
        SVC["ai-tools · knowledge · smart-search<br/>workload"]
    end

    subgraph SERVER["Server — Next.js route handlers"]
        AP1["/api/ai/ask"]
        AP2["/api/ai/embed"]
        AP3["/api/ai/document/extract"]
        AP4["/api/ai/status"]
    end

    subgraph EXTERNAL["External services"]
        FBA["Firebase Auth"]
        FST["Cloud Firestore<br/>guarded by firestore.rules"]
        CLD["Cloudinary<br/>document storage"]
        GEM["Google Gemini"]
    end

    UI --> DSY
    UI --> HKS
    UI --> SVA
    UI --> SVB
    HKS --> SVA
    HKS --> SVB
    UI --> AP1
    UI --> AP3

    SVB --> TCF
    SVC --> WKL
    SVC --> CHK
    UI --> ACP

    HKS --> FBA
    SVA --> FST
    SVB --> FST
    SVC --> FST
    SVB --> CLD

    AP1 --> GEM
    AP2 --> GEM
    AP3 --> GEM
    AP1 --> SVC
```

**Why file storage is Cloudinary, not Firebase Storage:** Storage requires the
paid Blaze plan. Auth and Firestore stay on the free tier, so the whole system
runs at zero cost.

---

### 2. AI document processing and the RAG knowledge base

How a physical form becomes answerable knowledge. The API key never reaches
the browser — every model call is proxied through a server route.
(The tool-calling side of a question is detailed in
[the AI request path](#the-ai-request-path).)

```mermaid
flowchart TB
    subgraph INGEST["Ingestion — a physical document arrives"]
        D1["Photo or PDF uploaded"] --> D2["Cloudinary stores the bytes"]
        D2 --> D3["Gemini vision extracts text<br/>+ typed fields per document type"]
        D3 --> D4["Human reviews and corrects"]
        D4 --> D5["chunkText"]
        D5 --> D6["Embed via /api/ai/embed"]
        D6 --> D7["knowledgeChunks<br/>tagged with audience + classId"]
    end

    subgraph ASK["Retrieval — a question is asked"]
        Q1["Question"] --> Q2["Rate limit"]
        Q2 --> Q3["Build AiContext<br/>role · schoolId · classIds"]
        Q3 --> Q4["Narrow by audience in the QUERY<br/>+ bounded scan"]
        Q4 --> Q5["Re-check each chunk<br/>with isRetrievable"]
        Q5 --> Q6["Cosine rank<br/>MIN_SIMILARITY 0.55"]
        Q6 --> Q7{"Anything above<br/>the bar?"}
        Q7 -- No --> Q8["Say so honestly:<br/>not found in your documents"]
        Q7 -- Yes --> Q9["Gemini rephrases<br/>only the retrieved facts"]
        Q9 --> Q10["Answer + citations"]
    end

    D7 -.->|"knowledge base"| Q4
```

**Two things worth noting.** Permission is enforced *twice* — narrowed in the
query for cost, then re-checked in memory for security, because Firestore
cannot verify class membership. And when nothing clears the relevance bar the
system returns **nothing** rather than forcing a weak match, so it can say "I
don't know" instead of inventing an answer.

---

### 3. Timetable — conflict detection and resolution

Detection alone tells an admin "no". Resolution answers the question they
actually have next: *then where can it go?*

```mermaid
flowchart TD
    IN["Admin drafts a slot<br/>class · teacher · room · day · period"] --> PREV["Preview changes"]
    PREV --> DET["findConflicts<br/>wall-clock overlap, not period equality"]
    DET --> HAS{"Conflicts?"}

    HAS -- No --> OK["No conflicts — Apply"]

    HAS -- Yes --> SHOW["Show teacher / class / room clashes"]
    SHOW --> SEARCH["suggestAlternativeSlots<br/>enumerate the day x period grid"]
    SEARCH --> FILTER["Reject every cell findConflicts rejects"]
    FILTER --> RANK["Rank: same day +0 · other day +10<br/>· period distance +n"]
    RANK --> OFFER["Offer the top 3 free slots"]
    OFFER --> PICK["Admin taps Use this"]
    PICK --> PREV

    OK --> SAVE["Write to timetable"]
```

The loop is deliberate: a suggestion is re-verified by the **same detector**
the admin just used, so the system can never recommend something impossible.

---

### 4. Predictive resource allocation

Staffing recommendations derived from the school's own timetable — no model,
so every suggestion can be explained and justified.

```mermaid
flowchart TD
    TT["Timetable slots"] --> LOAD["computeTeacherLoads<br/>periods/week · active days · busiest day"]
    MEM["Active teachers<br/>including those teaching nothing"] --> LOAD
    LOAD --> AN["analyseWorkload<br/>mean · spread · over / under-loaded"]
    AN --> ANY{"Imbalance beyond<br/>tolerance?"}
    ANY -- No --> CLEAR["Nothing to report"]
    ANY -- Yes --> TRY["suggestReallocations<br/>least-loaded candidate first"]
    TRY --> CHK{"Is the receiving teacher<br/>free at that exact slot?"}
    CHK -- No --> TRY
    CHK -- Yes --> ACC["Accept the move<br/>update running totals"]
    ACC --> CARD["Explainable insight on the admin dashboard<br/>deep-links to that class's timetable"]

    COVER["Teacher absent today?"] --> FIND["findCoverOptions<br/>who is free, period by period"]
    FIND --> CHK
```

Every move is checked against the **same conflict detector** used above, so a
recommendation is never impossible to act on.

---

### 5. Automated attendance capture

RFID/NFC, camera and keyboard converge on one code path — there is no second
attendance pipeline to keep in sync.

```mermaid
flowchart LR
    subgraph SENSORS["Capture — any source"]
        N["NFC / RFID tap<br/>Web NDEFReader"]
        C["Camera scan<br/>continuous"]
        K["Typed roll number"]
    end

    N --> TOK["token: string"]
    C --> TOK
    K --> TOK

    TOK --> NORM["normalizeToken<br/>unwrap deep links and prefixes"]
    NORM --> RES["resolveScan<br/>userId first, then roll number"]
    RES --> FOUND{"Resolved?"}

    FOUND -- "No / ambiguous" --> UNK["Report unknown card<br/>never guess a student"]
    FOUND -- Yes --> DUP{"Already scanned?"}
    DUP -- Yes --> NOOP["Duplicate — no-op"]
    DUP -- No --> MARK["Mark present in the statuses map"]

    MARK --> SAME["The same map the manual buttons write"]
    SAME --> SAVE["saveAttendance"]
```

If no NDEF payload is present the tag's **hardware serial** is used, so a
school keeps its existing RFID cards instead of reissuing every one.

---

### 6. Reactive dashboard state

The admin dashboard is a live command center, not a snapshot. Mark attendance
on a phone and the dashboard updates on a laptop without a refresh.

```mermaid
flowchart LR
    subgraph FS["Cloud Firestore"]
        M["members"]
        CL["classes"]
        AT["attendance — today"]
        NT["notifications"]
    end

    M -->|onSnapshot| ST["zustand<br/>school-pulse-store"]
    CL -->|onSnapshot| ST
    AT -->|onSnapshot| ST
    ST -->|"class list changes"| TR["Recompute 14-day trends<br/>getDocs, not a live listener"]
    TR --> ST

    ST --> HK["useSchoolPulse<br/>reference-counted"]
    HK --> P1["Metric cards"]
    HK --> P2["Attendance percentage"]
    HK --> P3["Insight cards"]
    HK --> WL["Workload analysis"]
    NT -->|onSnapshot| P4["Recent activity"]
```

**A deliberate cost decision:** members, classes and *today's* attendance are
live, because those change during a school day. The 14-day trend windows are
recomputed on change instead — a fortnight of history does not move
second-to-second, and N live listeners over a 14-day range would be real money
for no observable benefit.

---

### 7. Verification pipeline

```mermaid
flowchart LR
    PUSH(["git push / PR"]) --> J1["Job: Types · Lint · Build"]
    PUSH --> J2["Job: Firestore security rules"]

    J1 --> T1["tsc --noEmit"]
    T1 --> T2["next lint"]
    T2 --> T3["timetable-conflicts — 39 tests"]
    T3 --> T4["workload — 23 tests"]
    T4 --> T5["attendance-capture — 27 tests"]
    T5 --> T6["next build — 58 pages"]

    J2 --> R1["Set up JDK 17"]
    R1 --> R2["Boot the Firestore emulator"]
    R2 --> R3["Run the rules suite<br/>real attacks, all must be rejected"]

    T6 --> GREEN(["Green"])
    R3 --> GREEN
```

The rules suite needs a JVM, which a plain Windows dev box does not have — so
CI is where those tests actually execute on every commit. Running them locally
prints a clear preflight message with the one-line install per platform.

---

## Run it

```bash
npm install
cp .env.example .env.local   # fill in your Firebase project config
npm run dev
```

Without a `.env.local`, the app still renders (Splash → Onboarding → Role → Auth) but auth calls will show a friendly "Firebase isn't configured yet" message instead of failing silently — the whole app was built to degrade gracefully rather than crash when config is missing.

## What's built so far

- **Design system**: `GlassSurface`, `Button`, `Input`, `Avatar`, `Badge`, `PageHeader`, `ProgressDots` — all in `components/ui`, all deriving color/spacing/radius from `tailwind.config.ts`. Nothing in the screens hardcodes a color; it's all tokens, so the whole app restyles from one file.
- **Screens**: Splash (`app/page.tsx`), Onboarding x3 (`app/onboarding`), Role Selection (`app/role`), Auth — Google + Email, login and create-account, with real validation, password rules, show/hide, and loading/success/error states (`app/auth`).
- **Data layer**: `types/index.ts` mirrors the Firestore schema exactly. `lib/firebase.ts` initializes Auth/Firestore/Storage from env vars only. `services/user-service.ts` is the *only* place that touches `users/{uid}` — screens call the service, never Firestore directly. This is what makes "one source of truth" a real constraint in the code, not just a design doc.
- **Real auth**: Google Sign-In via `signInWithPopup` and email/password via Firebase Auth are actually wired up (not stubbed), including new-vs-existing-user routing and friendly error mapping (`friendlyAuthError`).

## Phase 2 — added on top of Phase 1

- **Services**: `school-service.ts`, `class-service.ts`, `teacher-service.ts`, `student-service.ts`, `parent-link-service.ts` — each the sole writer of its collection, same pattern as Phase 1's `user-service.ts`. See `SCHEMA.md` for the full collection reference and why membership is modeled as subcollections (idempotent joins + cheap security-rule checks).
- **Shared components**: `QRDisplay` (generate + copy/share/download), `QRScanner` (camera scan with a manual-entry fallback tab), `States.tsx` (`LoadingState`/`ErrorState`/`EmptyState`/`SuccessState`), `ConnectionSuccess` (the one reusable "you're connected" moment used by all four roles).
- **Auth/role guarding**: `hooks/useAuthUser.ts` + `components/AuthGuard.tsx` enforce — unauthenticated → `/role`, wrong role for a role-prefixed route → sent to their own home instead, onboarding incomplete → `/setup/[role]`.
- **Full setup flows, all real and wired to Firestore**:
  - Admin: Create School → School Created (QR/code share)
  - Teacher: Join School (scan/code) → Profile Setup → Create Class → Class Created (QR/code share)
  - Student: Join Class (scan/code → confirm before joining, duplicate-safe) → Profile Setup → Connect Parent (shares invite QR)
  - Parent: Profile Setup → Connect to Child (scan/code → confirm identity before linking) → Connection Success
- **Firestore**: `firestore.rules` (real role/membership/ownership checks, no open rules) and `firestore.indexes.json` (the composite indexes the code-lookup queries need).
- **Dashboard stubs**: `/admin`, `/teacher`, `/student`, `/parent` are guarded placeholder screens so the whole flow is navigable end to end — the real dashboards are Phase 3.

### The data model

The collection tree below is `SCHEMA.md` drawn out, annotated with the service that is the sole writer of each collection. Exact document-id conventions (e.g. attendance's deterministic `classId_studentId_date`) stay in `SCHEMA.md`.

```mermaid
flowchart TD
    subgraph TOP["Top-level collections"]
        USERS["users<br/>writer: user-service"]
        TEACHERS["teachers<br/>writer: teacher-service"]
        STUDENTS["students<br/>writer: student-service<br/>holds parentLinkCode"]
        PARENTS["parents<br/>writer: parent-link-service"]
        LINKS["parentStudentLinks<br/>writer: parent-link-service"]
    end

    SCHOOLS["schools<br/>writer: school-service<br/>holds public join code"]
    SMEM["members<br/>writer: school-service<br/>gates isSchoolMember in rules"]
    CLASSES["classes<br/>writer: class-service<br/>holds public class code"]
    CMEM["members<br/>writer: class-service<br/>gates isClassMember in rules"]

    SCHOOLS --> SMEM
    SCHOOLS --> CLASSES
    CLASSES --> CMEM

    subgraph P3["Phase 3 collections — all nested under a school"]
        ATT["attendance<br/>writer: attendance-service"]
        ASG["assignments<br/>writer: assignment-service"]
        SUB["submissions<br/>seeded by assignment-service"]
        TT["timetable<br/>writer: timetable-service"]
        DOC["documents<br/>writer: document-service"]
        ANN["announcements<br/>writer: announcement-service"]
        NOT["notifications<br/>written by other services, never by a screen"]
        CONV["conversations<br/>writer: messaging-service"]
        MSG["messages<br/>writer: messaging-service"]
        FSTR["feeStructures<br/>writer: fee-service, admin only"]
        FPAY["feePayments<br/>writer: fee-service, admin only"]
    end

    SCHOOLS --> ATT
    SCHOOLS --> ASG
    ASG --> SUB
    SCHOOLS --> TT
    SCHOOLS --> DOC
    SCHOOLS --> ANN
    SCHOOLS --> NOT
    SCHOOLS --> CONV
    CONV --> MSG
    SCHOOLS --> FSTR
    SCHOOLS --> FPAY

    BYTES[("Cloudinary<br/>document bytes live here")]
    DOC -.->|fileURL| BYTES

    LINKS -.->|studentId| STUDENTS
    LINKS -.->|parentId| PARENTS
    USERS -.->|schoolId| SCHOOLS
```

### Join and membership flows

Every join is code-based (QR or typed), always shows a confirm step before writing, and every membership write is idempotent — a double-scanned QR returns `alreadyMember` / `alreadyJoined` / `alreadyLinked` instead of creating a second row.

```mermaid
flowchart TD
    subgraph ADMIN["Admin — create school"]
        A1["Create School form"] --> A2["school-service.createSchool"]
        A2 --> A3["schools doc + members/uid as admin<br/>public code e.g. SCH-7F82K91"]
        A3 --> A4["School Created — QR + code share"]
    end

    subgraph TEACHER["Teacher — join school, then create a class"]
        T1["Scan QR or type school code"] --> T2["school-service.getSchoolByCode"]
        T2 --> T3{"Confirm school<br/>before joining"}
        T3 -->|Confirm| T4["addSchoolMember - reads members/uid first"]
        T4 --> T5{"already a member?"}
        T5 -->|yes| T6["return alreadyMember true<br/>no duplicate write"]
        T5 -->|no| T7["write members/uid as teacher"]
        T6 --> T8["Teacher profile setup"]
        T7 --> T8
        T8 --> T9["class-service.createClass<br/>classes doc + code e.g. NX10A-MATH-42"]
        T9 --> T10["Class Created — QR + code share"]
    end

    subgraph STUDENT["Student — join class"]
        S1["Scan class QR or type code"] --> S2["class-service.getClassByCode"]
        S2 --> S3{"Confirm your class"}
        S3 -->|Confirm and Continue| S4["Student profile setup"]
        S4 --> S5["class-service.joinClassAsStudent"]
        S5 --> S6["addSchoolMember as student — idempotent<br/>without it every school-scoped read is denied"]
        S6 --> S7{"class members/uid exists?"}
        S7 -->|yes| S8["return alreadyJoined true"]
        S7 -->|no| S9["write class members/uid<br/>then increment studentCount"]
        S9 --> S10["Connect Parent — shares invite QR"]
        S8 --> S10
    end

    subgraph PARENT["Parent — connect to child"]
        P1["Parent profile setup"] --> P2["Scan invite QR or type parentLinkCode"]
        P2 --> P3["parent-link-service.resolveParentLinkCode"]
        P3 --> P4{"Confirm child identity<br/>from the returned preview"}
        P4 -->|Confirm| P5["linkParentToStudent"]
        P5 --> P6{"link already exists<br/>for this parent and student?"}
        P6 -->|yes| P7["return alreadyLinked true"]
        P6 -->|no| P8["transaction — parentStudentLinks doc<br/>plus parents.childIds arrayUnion"]
        P8 --> P9["addSchoolMember as parent — idempotent"]
        P9 --> P10["updateUserProfile — schoolId + onboardingComplete"]
        P10 --> P11["Connection Success"]
        P7 --> P11
    end

    A4 -.->|school code| T1
    T10 -.->|class code| S1
    S10 -.->|parentLinkCode| P2
```

### Auth and onboarding routing

This traces `hooks/useAuthUser.ts` and `components/AuthGuard.tsx` as written. Two details worth reading off the diagram: an unauthenticated user is sent to **`/role`, not `/auth`** (so a sign-out that races the guard lands in one predictable place, and `/auth` always receives an explicit role), and a *failed* profile read renders a retryable error rather than redirecting — it is deliberately not treated as "signed out".

```mermaid
sequenceDiagram
    autonumber
    actor U as Visitor
    participant ENTRY as Splash / Onboarding / role select
    participant AUTHPAGE as app/auth - Google or Email
    participant FA as Firebase Auth
    participant STORE as useAuthUser shared store
    participant US as user-service
    participant GUARD as AuthGuard
    participant HOME as Role dashboard

    U->>ENTRY: open the app
    ENTRY->>AUTHPAGE: chosen role passed through to /auth
    U->>AUTHPAGE: Google popup, or email and password
    AUTHPAGE->>FA: signInWithPopup / createUserWithEmailAndPassword
    FA-->>STORE: onAuthStateChanged fires with the user
    STORE->>US: getCurrentUserProfile(uid)
    US-->>STORE: profile, or null if no users doc yet
    Note over STORE: One auth listener and one users read per session,<br/>shared by every consumer of the hook.

    U->>GUARD: navigate to a guarded route
    GUARD->>STORE: read user, profile, loading, error

    opt profile read itself failed
        GUARD-->>U: ErrorState with Retry — no redirect
    end

    opt signed in but profile is null, first sighting
        GUARD->>STORE: refresh() exactly once
        Note over GUARD,STORE: The sign-up race. Auth fires before<br/>the users doc is written, so one re-read<br/>settles it before any redirect.
        STORE->>US: re-read the users doc
        US-->>GUARD: profile now present, or genuinely absent
    end

    alt not signed in
        GUARD-->>U: replace to /role
    else still no profile after the recheck
        GUARD-->>U: replace to /role
    else profile role not in allowRoles
        GUARD-->>U: replace to their own home — /[role] if onboarded,<br/>otherwise /setup/[role]
    else onboardingComplete is false
        GUARD-->>U: replace to /setup/[role]
    else every check passes
        GUARD->>HOME: render the guarded screen
    end

    Note over GUARD: The same conditions gate the render, not just<br/>the redirect — so no frame of another role's<br/>screen is ever painted while replace() is in flight.
```

## Phase 3 — role dashboards, real-time features, and messaging

- **Role dashboards**: Admin (School Pulse metrics, NEXUS Intelligence insights, quick actions, recent activity), Teacher (today's schedule, classes, tasks), Student (today, assignments, progress), Parent (child switcher, attendance/assignments/progress) — all reading live Firestore data, zero hardcoded numbers.
- **Attendance, assignments, timetable, documents, announcements**: full workflows per role, canonical collections shared across all four experiences (mark once as a teacher, everyone with permission sees the same record).
- **Messaging** (`services/messaging-service.ts`): 1:1 conversations between Teacher↔Parent and Teacher↔Student, built on the `conversations`/`messages` subcollections already defined in `SCHEMA.md`. `getOrCreateConversation` is idempotent so "Message" buttons never create duplicate threads. Realtime via `onSnapshot`, unread state via `unreadFor` array, notification fan-out via `createNotification`. Entry points: message bell (with unread badge) on Teacher/Student/Parent home headers, "Message parent" per student on the teacher's class roster, "Message teacher" on the parent home and student class-detail screens, and a dedicated contact picker (`/teacher/messages/new`) built from the teacher's actual class rosters + `getParentsForStudent`.
- **Security**: no rule changes needed — `firestore.rules` already scoped conversation/message read/write to participants only, so messaging plugs into the existing security model.
- **AI phrasing** (`app/api/ai/ask/route.ts`, `app/api/ai/status/route.ts`): server-only routes that read `GEMINI_API_KEY` (never exposed to the client) and phrase the existing permission-scoped tool results from `services/ai-tools-service.ts` into natural sentences — the model is only ever given facts already resolved by a real Firestore query for that user's role, never asked to invent school data. Without a key configured, `askNexus()` falls back to the same deterministic templates it always used, so nothing regresses.
- **Teacher class announcements**: `getAnnouncementsForClass()` plus a composer at `/teacher/classes/[classId]/announcements`, visible to students on their class page and to parents on Updates (scoped to the selected child's class) — reuses the same `announcements` collection and rules the admin school-wide announcements already used.
- **Notification centers**: dedicated `/teacher/notifications` and `/student/notifications` screens plus a header bell with an unread badge on every role's home screen (Admin already had Recent Activity, Parent already had the Updates tab — this brings Teacher/Student to parity).

- **Fee management** (`services/fee-service.ts`): admin defines fee structures (school-wide or per-class) at `/admin/school/fees` and records real payments there — no payment gateway is faked, amounts only change when an admin logs money actually collected (matches the project's no-fake-data rule, same philosophy as attendance being "marked" not sensed). Students see their live due/paid/balance breakdown at `/student/fees`; parents see it per selected child at `/parent/fees`, with a summary card on the parent home screen.

### The AI request path

The security-relevant one. Read the boundary carefully, because it is **not** "the server does the lookups":

- The tool layer (`ai-tools-service.ts` → `ai-tool-registry.ts`) runs **in the browser** — it calls `/api/ai/ask` with a relative URL. Its Firestore queries are ordinary client SDK reads, and the thing that actually enforces authorization is `firestore.rules` server-side, backed by the in-registry `requireRole` / `requireOwnClass` / `requireOwnStudent` guards.
- The API route is server-only and exists for exactly one reason: it holds `GEMINI_API_KEY` (no `NEXT_PUBLIC_` prefix, so it never enters the client bundle). **The route never touches Firestore at all.**
- Tool selection is keyword-based inside `askNexus`. The model does not choose tools, does not supply IDs, and never sees a Firestore handle — every ID used in a query comes from an `AiContext` built from the caller's own profile.

```mermaid
sequenceDiagram
    autonumber
    actor U as Signed-in user
    participant CHAT as NexusAiChat in the browser
    participant CTX as buildAiContext
    participant REG as ai-tool-registry
    participant FS as Firestore, guarded by firestore.rules
    participant API as /api/ai/ask - server only
    participant PROV as lib/ai/provider
    participant GEM as Gemini API

    U->>CHAT: asks a question as free text
    CHAT->>CTX: buildAiContext(uid from the Firebase Auth session)
    CTX->>FS: read the caller's OWN profile, teacher classIds, linked childIds
    FS-->>CTX: role, schoolId, classIds, childIds
    Note over CTX: AiContext is assembled only from the caller's own<br/>records. No id in it ever originates from the question.

    CHAT->>REG: askNexus(ctx, question) — keyword intent picks the tool
    Note over REG: requireRole / requireOwnClass / requireOwnStudent<br/>run before any read. The LLM does not select tools.
    REG->>FS: query pinned to ctx.schoolId and ctx.classIds
    FS-->>REG: only rows the rules permit this uid to read
    REG-->>CHAT: sanitized plain-text facts

    CHAT->>API: POST question, facts, role — no ids, no credentials

    alt GEMINI_API_KEY is not set on the server
        API-->>CHAT: configured false
        CHAT-->>U: deterministic template answer, grounded true if a tool ran
    else rate limit exceeded
        API-->>CHAT: 429, errorCategory rate_limited
        CHAT-->>U: deterministic template, flagged rateLimited
    else key present
        API->>PROV: complete with instruction, facts and question
        PROV->>GEM: prompt text only
        Note over PROV,GEM: Gemini receives text and nothing else — no Firestore<br/>handle, no credentials, no user-supplied id, and no<br/>ability to issue a query. Grounded mode instructs it<br/>to use ONLY the supplied facts and invent nothing.
        GEM-->>PROV: phrased sentences
        PROV-->>API: text, model, usage
        API-->>CHAT: configured true, text, grounded
        CHAT-->>U: LLM-phrased answer over real facts
    end

    Note over API: logAiEvent records route, latency, model and token<br/>counts only — never the question, facts, or answer.
```

A question that matches no intent takes the same route with **no** facts attached; the route then switches to its general instruction, which forbids the model from implying it can see school records. Either way the response carries `grounded`, so the UI never has to guess whether an answer was backed by real data.

## Not built yet

1. A real payment gateway for fees (Razorpay/Stripe etc.) — `feeStructures`/`feePayments` are modeled and the admin-recorded flow is real and functional, but online self-service payment would need a merchant account and PCI-scoped handling that's out of scope for a free-tier Firebase project.

## Architecture rule this project follows

Screens never call Firestore directly. They call a function in `services/`. That's the enforcement mechanism for "if a teacher updates attendance, admin/student/parent all see it" — there's exactly one write path per collection, so there's nowhere for a second, disconnected copy of the data to come from.

```mermaid
flowchart TB
    subgraph SCREENS["Screens — app/, four role trees from lib/nav-config.ts"]
        ADM["Admin<br/>Home · School · Operations · AI · Profile"]
        TCH["Teacher<br/>Home · Classes · Schedule · AI · Profile"]
        STU["Student<br/>Home · Learn · Schedule · AI · Profile"]
        PAR["Parent<br/>Home · Child · Updates · AI · Profile"]
    end

    GUARD["AuthGuard.tsx + useAuthUser.ts<br/>role and onboarding gate"]

    subgraph IDENTITY["services/ — identity and roster, single writer each"]
        SVC1["user-service — users<br/>school-service — schools + members<br/>class-service — classes + class members<br/>teacher-service — teachers<br/>student-service — students<br/>parent-link-service — parentStudentLinks + parents"]
    end

    subgraph OPS["services/ — operations, single writer each"]
        SVC2["attendance-service — attendance<br/>assignment-service — assignments + submissions<br/>timetable-service — timetable<br/>document-service — documents<br/>announcement-service — announcements<br/>notification-service — notifications<br/>messaging-service — conversations + messages<br/>fee-service — feeStructures + feePayments"]
    end

    subgraph AIL["AI layer"]
        TOOLS["ai-tools-service + ai-tool-registry<br/>permission-scoped tools, runs in the browser"]
        ROUTE["app/api/ai/* — server only<br/>sole holder of GEMINI_API_KEY"]
    end

    FS[("Firebase Firestore<br/>firestore.rules enforced server-side")]
    AUTHSVC[("Firebase Auth")]
    CLOUD[("Cloudinary<br/>document bytes, replaces paid Storage")]
    GEM[("Gemini API")]

    ADM --> GUARD
    TCH --> GUARD
    STU --> GUARD
    PAR --> GUARD

    GUARD --> SVC1
    GUARD --> SVC2
    GUARD --> TOOLS
    GUARD --> AUTHSVC

    SVC1 --> FS
    SVC2 --> FS
    SVC2 --> CLOUD
    TOOLS --> SVC2
    TOOLS --> FS
    TOOLS --> ROUTE
    ROUTE --> GEM

    RULE["Enforced rule: no screen imports firebase/firestore.<br/>Every read and write goes through services/,<br/>so each collection has exactly one write path."]
```

## Tech stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Framer Motion · Firebase (Auth + Firestore, free tier only) · Cloudinary (document bytes) · Gemini API (optional, server-side only) · lucide-react
