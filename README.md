# NEXUS — AI Operating System for Schools

Phase 1 build. Real source, not a mockup — run it locally against your own free-tier Firebase project.

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
- **Auth/role guarding**: `hooks/useAuthUser.ts` + `components/AuthGuard.tsx` enforce — unauthenticated → `/auth`, wrong role for a role-prefixed route → sent to their own home instead, onboarding incomplete → `/setup/[role]`.
- **Full setup flows, all real and wired to Firestore**:
  - Admin: Create School → School Created (QR/code share)
  - Teacher: Join School (scan/code) → Profile Setup → Create Class → Class Created (QR/code share)
  - Student: Join Class (scan/code → confirm before joining, duplicate-safe) → Profile Setup → Connect Parent (shares invite QR)
  - Parent: Profile Setup → Connect to Child (scan/code → confirm identity before linking) → Connection Success
- **Firestore**: `firestore.rules` (real role/membership/ownership checks, no open rules) and `firestore.indexes.json` (the composite indexes the code-lookup queries need).
- **Dashboard stubs**: `/admin`, `/teacher`, `/student`, `/parent` are guarded placeholder screens so the whole flow is navigable end to end — the real dashboards are Phase 3.

## Phase 3 — role dashboards, real-time features, and messaging

- **Role dashboards**: Admin (School Pulse metrics, NEXUS Intelligence insights, quick actions, recent activity), Teacher (today's schedule, classes, tasks), Student (today, assignments, progress), Parent (child switcher, attendance/assignments/progress) — all reading live Firestore data, zero hardcoded numbers.
- **Attendance, assignments, timetable, documents, announcements**: full workflows per role, canonical collections shared across all four experiences (mark once as a teacher, everyone with permission sees the same record).
- **Messaging** (`services/messaging-service.ts`): 1:1 conversations between Teacher↔Parent and Teacher↔Student, built on the `conversations`/`messages` subcollections already defined in `SCHEMA.md`. `getOrCreateConversation` is idempotent so "Message" buttons never create duplicate threads. Realtime via `onSnapshot`, unread state via `unreadFor` array, notification fan-out via `createNotification`. Entry points: message bell (with unread badge) on Teacher/Student/Parent home headers, "Message parent" per student on the teacher's class roster, "Message teacher" on the parent home and student class-detail screens, and a dedicated contact picker (`/teacher/messages/new`) built from the teacher's actual class rosters + `getParentsForStudent`.
- **Security**: no rule changes needed — `firestore.rules` already scoped conversation/message read/write to participants only, so messaging plugs into the existing security model.
- **AI phrasing** (`app/api/ai/ask/route.ts`, `app/api/ai/status/route.ts`): server-only routes that read `GEMINI_API_KEY` (never exposed to the client) and phrase the existing permission-scoped tool results from `services/ai-tools-service.ts` into natural sentences — the model is only ever given facts already resolved by a real Firestore query for that user's role, never asked to invent school data. Without a key configured, `askNexus()` falls back to the same deterministic templates it always used, so nothing regresses.
- **Teacher class announcements**: `getAnnouncementsForClass()` plus a composer at `/teacher/classes/[classId]/announcements`, visible to students on their class page and to parents on Updates (scoped to the selected child's class) — reuses the same `announcements` collection and rules the admin school-wide announcements already used.
- **Notification centers**: dedicated `/teacher/notifications` and `/student/notifications` screens plus a header bell with an unread badge on every role's home screen (Admin already had Recent Activity, Parent already had the Updates tab — this brings Teacher/Student to parity).

- **Fee management** (`services/fee-service.ts`): admin defines fee structures (school-wide or per-class) at `/admin/school/fees` and records real payments there — no payment gateway is faked, amounts only change when an admin logs money actually collected (matches the project's no-fake-data rule, same philosophy as attendance being "marked" not sensed). Students see their live due/paid/balance breakdown at `/student/fees`; parents see it per selected child at `/parent/fees`, with a summary card on the parent home screen.

## Not built yet

1. A real payment gateway for fees (Razorpay/Stripe etc.) — `feeStructures`/`feePayments` are modeled and the admin-recorded flow is real and functional, but online self-service payment would need a merchant account and PCI-scoped handling that's out of scope for a free-tier Firebase project.

## Architecture rule this project follows

Screens never call Firestore directly. They call a function in `services/`. That's the enforcement mechanism for "if a teacher updates attendance, admin/student/parent all see it" — there's exactly one write path per collection, so there's nowhere for a second, disconnected copy of the data to come from.

## Tech stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Framer Motion · Firebase (Auth/Firestore/Storage, free tier only) · lucide-react
