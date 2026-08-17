// ============================================================
// Timetable conflict detection — pure unit tests.
//   npm run test:timetable
// Runs on Node's native type stripping; no emulator, no network.
// ============================================================
import {
  findConflicts,
  slotsOverlap,
  toMinutes,
  slotDuration,
  suggestAlternativeSlots,
  type SlotLike,
} from "../lib/timetable-conflicts.ts";

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

const RAO = "teacher_rao";
const KHAN = "teacher_khan";
const C10A = "class_10a";
const C9B = "class_9b";

function slot(over: Partial<SlotLike>): SlotLike {
  return {
    id: "existing",
    classId: C10A,
    teacherId: RAO,
    subject: "Mathematics",
    day: "MO",
    period: 1,
    startTime: "09:00",
    endTime: "10:00",
    ...over,
  };
}

console.log("\n\x1b[1mtoMinutes\x1b[0m");
check("parses HH:MM", toMinutes("09:45"), 585);
check("parses single-digit hour", toMinutes("9:05"), 545);
check("midnight is 0", toMinutes("00:00"), 0);
check("rejects garbage", toMinutes("nope"), null);
check("rejects out-of-range hour", toMinutes("25:00"), null);
check("rejects out-of-range minute", toMinutes("10:75"), null);
check("undefined is null", toMinutes(undefined), null);

console.log("\n\x1b[1mslotsOverlap\x1b[0m");
check(
  "identical times overlap",
  slotsOverlap(slot({}), slot({ id: "b" })),
  true
);
check(
  "PARTIAL overlap across different periods is caught (the original bug)",
  slotsOverlap(slot({}), slot({ id: "b", period: 2, startTime: "09:30", endTime: "10:15" })),
  true
);
check(
  "back-to-back periods do NOT overlap (10:00 end vs 10:00 start)",
  slotsOverlap(slot({}), slot({ id: "b", period: 2, startTime: "10:00", endTime: "11:00" })),
  false
);
check(
  "a slot fully containing another overlaps",
  slotsOverlap(slot({ startTime: "09:00", endTime: "12:00" }), slot({ id: "b", startTime: "10:00", endTime: "10:30" })),
  true
);
check(
  "different days never overlap",
  slotsOverlap(slot({}), slot({ id: "b", day: "TU" })),
  false
);
check(
  "missing times fall back to period equality (same period)",
  slotsOverlap(slot({ startTime: undefined, endTime: undefined }), slot({ id: "b", period: 1 })),
  true
);
check(
  "missing times fall back to period equality (different period)",
  slotsOverlap(slot({ startTime: undefined, endTime: undefined }), slot({ id: "b", period: 4 })),
  false
);
check(
  "malformed times fall back to period equality",
  slotsOverlap(slot({ startTime: "9am", endTime: "10am" }), slot({ id: "b", period: 1 })),
  true
);
check(
  "inverted range (end before start) falls back to period equality",
  slotsOverlap(slot({ startTime: "11:00", endTime: "09:00" }), slot({ id: "b", period: 7 })),
  false
);

console.log("\n\x1b[1mfindConflicts — real overlapping slots\x1b[0m");

check("no existing slots means no conflicts", findConflicts(slot({ id: "new" }), []), []);

check(
  "teacher double-booked across overlapping times",
  findConflicts(
    slot({ id: "new", classId: C9B, subject: "Extra Maths", period: 2, startTime: "09:30", endTime: "10:15" }),
    [slot({ id: "a" })]
  ),
  ["Teacher is already scheduled for Mathematics (09:00–10:00)."]
);

check(
  "class double-booked across overlapping times",
  findConflicts(
    slot({ id: "new", teacherId: KHAN, subject: "Physics", period: 2, startTime: "09:30", endTime: "10:15" }),
    [slot({ id: "a" })]
  ),
  ["Class already has Mathematics (09:00–10:00) scheduled."]
);

check(
  "teacher AND class AND room all clash on one slot",
  findConflicts(
    slot({ id: "new", room: "R1", period: 2, startTime: "09:30", endTime: "10:15" }),
    [slot({ id: "a", room: "R1" })]
  ),
  [
    "Teacher is already scheduled for Mathematics (09:00–10:00).",
    "Class already has Mathematics (09:00–10:00) scheduled.",
    "Room R1 is already booked for Mathematics (09:00–10:00).",
  ]
);

check(
  "room clash alone, different teacher and class",
  findConflicts(
    slot({ id: "new", teacherId: KHAN, classId: C9B, subject: "Chemistry", room: "LAB", startTime: "09:15", endTime: "10:00" }),
    [slot({ id: "a", room: "LAB" })]
  ),
  ["Room LAB is already booked for Mathematics (09:00–10:00)."]
);

check(
  "back-to-back slots for the same teacher are ALLOWED",
  findConflicts(
    slot({ id: "new", classId: C9B, subject: "Maths", period: 2, startTime: "10:00", endTime: "11:00" }),
    [slot({ id: "a" })]
  ),
  []
);

check(
  "same teacher on a different day is fine",
  findConflicts(
    slot({ id: "new", classId: C9B, day: "TU" }),
    [slot({ id: "a" })]
  ),
  []
);

check(
  "editing a slot does not conflict with itself (excludeId)",
  findConflicts(slot({ id: "a", room: "R1" }), [slot({ id: "a", room: "R1" })], "a"),
  []
);

check(
  "two clashing slots each report their own time window",
  findConflicts(
    slot({ id: "new", classId: C9B, subject: "Extra", startTime: "09:00", endTime: "10:00" }),
    [slot({ id: "a" }), slot({ id: "b", period: 2, startTime: "09:30", endTime: "10:30" })]
  ),
  [
    "Teacher is already scheduled for Mathematics (09:00–10:00).",
    "Teacher is already scheduled for Mathematics (09:30–10:30).",
  ]
);

check(
  "identical messages from two identical-time slots ARE collapsed",
  findConflicts(
    slot({ id: "new", classId: C9B, subject: "Extra" }),
    [slot({ id: "a" }), slot({ id: "b" })]
  ),
  ["Teacher is already scheduled for Mathematics (09:00–10:00)."]
);

check(
  "a genuinely free slot reports nothing",
  findConflicts(
    slot({ id: "new", teacherId: KHAN, classId: C9B, room: "R2", startTime: "14:00", endTime: "15:00" }),
    [slot({ id: "a", room: "R1" }), slot({ id: "b", period: 2, startTime: "10:00", endTime: "11:00" })]
  ),
  []
);


// ============================================================
// Conflict RESOLUTION (suggestAlternativeSlots)
// ============================================================
console.log("\n\x1b[1msuggestAlternativeSlots\x1b[0m");

const PERIOD_TIMES: Record<number, string> = { 1: "09:00", 2: "10:00", 3: "11:00", 4: "12:00" };
const GRID = { days: ["MO", "TU"], periods: [1, 2, 3, 4], periodStartTimes: PERIOD_TIMES };

check("slotDuration reads the candidate's own length", slotDuration(slot({})), 60);
check("slotDuration is null when times are unusable", slotDuration(slot({ startTime: "bad" })), null);

// The teacher is busy MO p1; everything else is free.
const busyMondayP1 = [slot({ id: "s1", period: 1, startTime: "09:00", endTime: "10:00" })];

check(
  "prefers the nearest period on the SAME day",
  suggestAlternativeSlots(slot({ id: undefined, period: 1 }), busyMondayP1, { ...GRID, limit: 1 }).map(
    (s) => `${s.day} p${s.period} ${s.startTime}-${s.endTime}`
  ),
  ["MO p2 10:00-11:00"]
);

check(
  "suggestion length matches the requested duration",
  suggestAlternativeSlots(
    slot({ id: undefined, period: 1, startTime: "09:00", endTime: "09:45" }),
    busyMondayP1,
    { ...GRID, limit: 1 }
  ).map((s) => `${s.startTime}-${s.endTime}`),
  ["10:00-10:45"]
);

check(
  "never suggests the placement the caller already has",
  suggestAlternativeSlots(slot({ id: undefined, period: 1 }), busyMondayP1, GRID).some(
    (s) => s.day === "MO" && s.period === 1
  ),
  false
);

// Every Monday period is taken by this teacher -> must roll to Tuesday.
const mondayFull = [1, 2, 3, 4].map((p) =>
  slot({ id: `s${p}`, period: p, startTime: PERIOD_TIMES[p], endTime: `${10 + p - 1}:00` })
);

check(
  "rolls to the next day when the whole day is full",
  suggestAlternativeSlots(slot({ id: undefined, period: 1 }), mondayFull, { ...GRID, limit: 1 }).map((s) => s.day),
  ["TU"]
);

check(
  "returns nothing when the entire grid is blocked",
  suggestAlternativeSlots(
    slot({ id: undefined, period: 1 }),
    [
      ...mondayFull,
      ...[1, 2, 3, 4].map((p) =>
        slot({ id: `t${p}`, day: "TU", period: p, startTime: PERIOD_TIMES[p], endTime: `${10 + p - 1}:00` })
      ),
    ],
    GRID
  ),
  []
);

check(
  "a free grid excludes only the current placement",
  // 2 days x 4 periods = 8 cells, minus the slot's own MO p1.
  suggestAlternativeSlots(slot({ id: undefined, period: 1 }), [], { ...GRID, limit: 20 }).length,
  7
);

check(
  "results are capped by the default limit",
  suggestAlternativeSlots(slot({ id: undefined, period: 1 }), [], GRID).length,
  5
);

check(
  "editing a slot ignores itself via excludeId",
  suggestAlternativeSlots(slot({ id: "s1", period: 2 }), busyMondayP1, { ...GRID, limit: 1 }, "s1").map(
    (s) => `${s.day} p${s.period}`
  ),
  ["MO p1"]
);

check(
  "a room clash also removes a candidate cell",
  suggestAlternativeSlots(
    slot({ id: undefined, teacherId: KHAN, classId: C9B, room: "R1", period: 1 }),
    [slot({ id: "r1", teacherId: RAO, classId: C10A, room: "R1", period: 2, startTime: "10:00", endTime: "11:00" })],
    { ...GRID, limit: 1 }
  ).map((s) => `p${s.period}`),
  ["p3"]
);

// The contract that matters: resolution can never contradict detection.
check(
  "every suggestion passes findConflicts",
  suggestAlternativeSlots(slot({ id: undefined, period: 1 }), busyMondayP1, GRID).every(
    (s) =>
      findConflicts(
        { ...slot({ id: undefined }), day: s.day, period: s.period, startTime: s.startTime, endTime: s.endTime },
        busyMondayP1
      ).length === 0
  ),
  true
);

console.log(
  `\n\x1b[1m${pass}/${pass + failures.length} passed\x1b[0m` +
    (failures.length ? `  \x1b[31m(${failures.length} failed)\x1b[0m` : "")
);
if (failures.length) {
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
