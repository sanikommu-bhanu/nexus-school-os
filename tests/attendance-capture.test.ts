// ============================================================
// Automated attendance capture — pure unit tests.
//   npm run test:capture
// Runs on Node's native type stripping; no emulator, no camera.
// ============================================================
import {
  normalizeToken,
  resolveScan,
  applyScan,
  summarizeSession,
  type ScannableStudent,
} from "../lib/attendance-capture.ts";

let pass = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
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

const ROSTER: ScannableStudent[] = [
  { id: "u_aarav", rollNumber: "12", name: "Aarav Sharma" },
  { id: "u_diya", rollNumber: "13", name: "Diya Verma" },
  { id: "u_rohan", rollNumber: "10A-7", name: "Rohan Singh" },
  { id: "u_kavya", name: "Kavya Gupta" }, // no roll number on file
];

// ------------------------------------------------------------
console.log("\n\x1b[1mnormalizeToken\x1b[0m");

check("passes a bare id through", normalizeToken("u_aarav"), "u_aarav");
check("trims whitespace", normalizeToken("  12  "), "12");
check("unwraps nexus:// deep links", normalizeToken("nexus://student/u_aarav"), "u_aarav");
check("unwraps https deep links", normalizeToken("https://nexus.app/student/u_diya"), "u_diya");
check("unwraps nested https paths", normalizeToken("https://nexus.app/join/student/u_rohan"), "u_rohan");
check("unwraps the prefixed form", normalizeToken("nexus:student:u_kavya"), "u_kavya");
check("unwraps the short prefixed form", normalizeToken("student:u_kavya"), "u_kavya");
check("drops a query string", normalizeToken("https://nexus.app/student/u_diya?src=card"), "u_diya");
check("an empty scan stays empty", normalizeToken("   "), "");

// ------------------------------------------------------------
console.log("\n\x1b[1mresolveScan\x1b[0m");

check("matches on userId", resolveScan("u_aarav", ROSTER)?.id, "u_aarav");
check("matches on roll number", resolveScan("13", ROSTER)?.id, "u_diya");
check("roll numbers are case-insensitive", resolveScan("10a-7", ROSTER)?.id, "u_rohan");
check("roll numbers tolerate whitespace", resolveScan("  13 ", ROSTER)?.id, "u_diya");
check("resolves through a deep link", resolveScan("nexus://student/u_kavya", ROSTER)?.id, "u_kavya");
check("an unknown token resolves to nothing", resolveScan("u_nobody", ROSTER), null);
check("an empty token resolves to nothing", resolveScan("", ROSTER), null);
check(
  "a student with no roll number is never matched by an empty roll",
  resolveScan("   ", ROSTER),
  null
);
check(
  "an AMBIGUOUS roll number is refused rather than guessed",
  resolveScan(
    "12",
    [
      { id: "u_a", rollNumber: "12" },
      { id: "u_b", rollNumber: "12" },
    ]
  ),
  null
);
check(
  "userId wins over a roll number that collides with it",
  resolveScan("u_aarav", [{ id: "u_aarav", rollNumber: "99" }, { id: "u_x", rollNumber: "u_aarav" }])?.id,
  "u_aarav"
);

// ------------------------------------------------------------
console.log("\n\x1b[1mapplyScan\x1b[0m");

check("a first scan marks the student", applyScan("12", ROSTER, new Set()), {
  kind: "marked",
  student: ROSTER[0],
});

check("a repeat scan is a duplicate, not an error", applyScan("12", ROSTER, new Set(["u_aarav"])), {
  kind: "duplicate",
  student: ROSTER[0],
});

check("an unrecognised card reports the normalised token", applyScan("nexus://student/ghost", ROSTER, new Set()), {
  kind: "unknown",
  token: "ghost",
});

check(
  "applyScan does not mutate the scanned set",
  (() => {
    const seen = new Set(["u_aarav"]);
    applyScan("13", ROSTER, seen);
    return [...seen];
  })(),
  ["u_aarav"]
);

// ------------------------------------------------------------
console.log("\n\x1b[1msummarizeSession\x1b[0m");

check("an empty session has everyone missing", summarizeSession(ROSTER, new Set()), {
  scanned: 0,
  total: 4,
  missing: ROSTER,
});

check(
  "counts scanned and lists only the absentees",
  (() => {
    const s = summarizeSession(ROSTER, new Set(["u_aarav", "u_rohan"]));
    return [s.scanned, s.total, s.missing.map((m) => m.id)];
  })(),
  [2, 4, ["u_diya", "u_kavya"]]
);

check(
  "a fully scanned class has nobody missing",
  summarizeSession(ROSTER, new Set(ROSTER.map((s) => s.id))).missing,
  []
);

check("an empty roster is handled", summarizeSession([], new Set()), {
  scanned: 0,
  total: 0,
  missing: [],
});

// ------------------------------------------------------------
console.log(
  `\n\x1b[1m${pass}/${pass + failures.length} passed\x1b[0m` +
    (failures.length ? `  \x1b[31m(${failures.length} failed)\x1b[0m` : "")
);
if (failures.length) {
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
