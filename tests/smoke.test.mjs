// ============================================================
// HTTP integration smoke suite.
//   npm run test:smoke          (against an already-running server)
//   npm run test:smoke:ci       (builds, starts, tests, tears down)
//
// WHY THIS SHAPE
// The other three suites are pure unit tests — they never boot Next,
// touch the router, or render a page. That leaves a real gap: a broken
// import, a bad dynamic segment, a server component throwing during
// render, or a route deleted by accident all typecheck and lint
// perfectly and only fail when something actually requests the page.
//
// This closes that gap the cheap way. It is deliberately NOT a
// jsdom/Testing-Library stack: those assert component internals, need
// a large dependency tree, and would still not have caught any of the
// failures above. Asking the real production server for every route
// and checking what comes back does, with zero new dependencies.
//
// What it verifies:
//   * every route in the app answers 200 (no broken/renamed routes)
//   * public screens actually render their content, not an empty shell
//   * an unknown URL renders the branded 404, not Next's default
//   * the accessibility and theme guarantees survive in the HTML
// ============================================================

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";

let pass = 0;
const failures = [];

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failures.push(name);
    console.log(`  \x1b[31m✗ ${name}\x1b[0m\n      expected ${e}\n      actual   ${a}`);
  }
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
  return { status: res.status, body: await res.text() };
}

// Every route the app serves. A deleted or renamed route fails here.
const ROUTES = [
  "/", "/onboarding", "/role", "/auth", "/auth/email",
  "/setup/admin", "/setup/admin/success",
  "/setup/teacher", "/setup/teacher/profile", "/setup/teacher/create-class", "/setup/teacher/class-share",
  "/setup/student", "/setup/student/profile", "/setup/student/parent-connect",
  "/setup/parent", "/setup/parent/profile", "/setup/parent/connect-child",
  "/admin", "/admin/school", "/admin/school/fees", "/admin/school/parents",
  "/admin/classes", "/admin/students", "/admin/teachers",
  "/admin/operations", "/admin/ai", "/admin/profile",
  "/teacher", "/teacher/classes", "/teacher/schedule", "/teacher/messages",
  "/teacher/messages/new", "/teacher/notifications", "/teacher/ai", "/teacher/profile",
  "/student", "/student/learn", "/student/schedule", "/student/fees",
  "/student/messages", "/student/notifications", "/student/ai", "/student/profile",
  "/parent", "/parent/child", "/parent/fees", "/parent/updates",
  "/parent/messages", "/parent/ai", "/parent/profile",
];

// Dynamic segments — these only fail at request time, never at build.
const DYNAMIC = [
  "/admin/classes/smoke-id",
  "/admin/classes/smoke-id/timetable",
  "/admin/students/smoke-id",
  "/admin/teachers/smoke-id",
  "/admin/operations/documents/smoke-id",
  "/teacher/classes/smoke-id",
  "/teacher/classes/smoke-id/attendance",
  "/teacher/classes/smoke-id/documents",
  "/teacher/classes/smoke-id/announcements",
  "/teacher/classes/smoke-id/assignments/new",
  "/student/learn/smoke-id",
];

console.log(`\n\x1b[1mSmoke: ${BASE}\x1b[0m`);

console.log("\n\x1b[1mstatic routes\x1b[0m");
const bad = [];
for (const r of ROUTES) {
  const { status } = await get(r);
  if (status !== 200) bad.push(`${r} -> ${status}`);
}
check(`all ${ROUTES.length} static routes return 200`, bad, []);

console.log("\n\x1b[1mdynamic routes\x1b[0m");
const badDyn = [];
for (const r of DYNAMIC) {
  const { status } = await get(r);
  if (status !== 200) badDyn.push(`${r} -> ${status}`);
}
check(`all ${DYNAMIC.length} dynamic routes return 200`, badDyn, []);

console.log("\n\x1b[1mpublic screens render real content\x1b[0m");
const role = await get("/role");
check("/role renders the role chooser", role.body.includes("Choose your role"), true);
check("/role lists a role description", role.body.includes("Manage your entire school"), true);

const onboarding = await get("/onboarding");
check("/onboarding renders its first slide", onboarding.body.includes("Smarter Schools"), true);

console.log("\n\x1b[1m404 handling\x1b[0m");
const nf = await get("/this-route-does-not-exist");
check("unknown URL returns 404", nf.status, 404);
check("404 is the branded page, not Next's default", nf.body.includes("Page not found"), true);
check("404 offers a route back", nf.body.includes("Back to NEXUS"), true);

console.log("\n\x1b[1maccessibility and theme guarantees\x1b[0m");
const home = await get("/role");
check(
  "pinch-zoom is not disabled (WCAG 1.4.4)",
  /maximum-scale|user-scalable=no/.test(home.body),
  false
);
check("viewport allows scaling", home.body.includes("user-scalable=yes"), true);
check("theme colour is the Blush Noir ground", home.body.includes("#120E13"), true);

console.log("\n\x1b[1mapi\x1b[0m");
const status = await get("/api/ai/status");
check("/api/ai/status responds 200", status.status, 200);
check("/api/ai/status reports a provider", /"provider"/.test(status.body), true);

console.log(
  `\n\x1b[1m${pass}/${pass + failures.length} passed\x1b[0m` +
    (failures.length ? `  \x1b[31m(${failures.length} failed)\x1b[0m` : "")
);
if (failures.length) {
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
