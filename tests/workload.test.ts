// ============================================================
// Staff workload / resource reallocation — pure unit tests.
//   npm run test:workload
// Runs on Node's native type stripping; no emulator, no network.
// ============================================================
import {
  computeTeacherLoads,
  analyseWorkload,
  suggestReallocations,
  findCoverOptions,
} from "../lib/workload.ts";
import { findConflicts, type SlotLike } from "../lib/timetable-conflicts.ts";

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

const RAO = "t_rao";
const KHAN = "t_khan";
const IYER = "t_iyer";
const TEACHERS = [RAO, KHAN, IYER];

const PERIOD_TIME: Record<number, [string, string]> = {
  1: ["09:00", "10:00"],
  2: ["10:00", "11:00"],
  3: ["11:00", "12:00"],
  4: ["12:00", "13:00"],
};

let seq = 0;
function slot(teacherId: string, day: string, period: number, over: Partial<SlotLike> = {}) {
  const [startTime, endTime] = PERIOD_TIME[period];
  return {
    id: `s${++seq}`,
    classId: `class_${day}${period}`,
    teacherId,
    subject: "Mathematics",
    day,
    period,
    startTime,
    endTime,
    ...over,
  };
}

// ------------------------------------------------------------
console.log("\n\x1b[1mcomputeTeacherLoads\x1b[0m");

seq = 0;
const spread = [
  slot(RAO, "MO", 1),
  slot(RAO, "MO", 2),
  slot(RAO, "MO", 3),
  slot(RAO, "TU", 1),
  slot(RAO, "TU", 2),
  slot(RAO, "TU", 3),
  slot(KHAN, "MO", 4),
  // IYER teaches nothing at all.
];

check(
  "counts weekly periods per teacher",
  computeTeacherLoads(spread, TEACHERS).map((l) => `${l.teacherId}:${l.periodsPerWeek}`),
  ["t_rao:6", "t_khan:1", "t_iyer:0"]
);

check(
  "a teacher with an empty timetable still appears",
  computeTeacherLoads(spread, TEACHERS).find((l) => l.teacherId === IYER),
  { teacherId: IYER, periodsPerWeek: 0, daysActive: 0, busiestDay: null }
);

check(
  "reports distinct active days",
  computeTeacherLoads(spread, TEACHERS).find((l) => l.teacherId === RAO)?.daysActive,
  2
);

check(
  "identifies the busiest single day",
  computeTeacherLoads(spread, TEACHERS).find((l) => l.teacherId === RAO)?.busiestDay,
  { day: "MO", periods: 3 }
);

// ------------------------------------------------------------
console.log("\n\x1b[1manalyseWorkload\x1b[0m");

const analysis = analyseWorkload(computeTeacherLoads(spread, TEACHERS));

check("mean is the staff average", analysis.meanPeriods, 2.3);
check("spread is max minus min", analysis.spread, 6);
check("flags the overloaded teacher", analysis.overloaded.map((l) => l.teacherId), [RAO]);
check("flags the underloaded teachers", analysis.underloaded.map((l) => l.teacherId), [IYER]);
check("loads are returned heaviest-first", analysis.loads.map((l) => l.teacherId), [RAO, KHAN, IYER]);

check(
  "a perfectly balanced staff flags nobody",
  (() => {
    seq = 0;
    const even = [slot(RAO, "MO", 1), slot(KHAN, "MO", 2), slot(IYER, "MO", 3)];
    const a = analyseWorkload(computeTeacherLoads(even, TEACHERS));
    return [a.overloaded.length, a.underloaded.length, a.spread];
  })(),
  [0, 0, 0]
);

check("an empty staff list is handled", analyseWorkload([]), {
  loads: [],
  meanPeriods: 0,
  spread: 0,
  overloaded: [],
  underloaded: [],
});

// ------------------------------------------------------------
console.log("\n\x1b[1msuggestReallocations\x1b[0m");

const reallocs = suggestReallocations(spread, analysis, findConflicts);

check("proposes at least one move", reallocs.length > 0, true);

check(
  "moves work AWAY from the overloaded teacher",
  reallocs.every((r) => r.fromTeacherId === RAO),
  true
);

check(
  "moves work TOWARDS an underloaded teacher",
  reallocs.every((r) => analysis.underloaded.some((u) => u.teacherId === r.toTeacherId)),
  true
);

// The contract that matters: a proposed move must actually be legal.
check(
  "every proposed move is conflict-free for the receiving teacher",
  reallocs.every((r) => {
    const moved = spread.find((s) => s.id === r.slotId)!;
    return findConflicts({ ...moved, teacherId: r.toTeacherId }, spread, moved.id).length === 0;
  }),
  true
);

check(
  "never proposes a move that would invert the imbalance",
  (() => {
    seq = 0;
    // 2 vs 1 — too close to be worth moving (would become 1 vs 2).
    const tight = [slot(RAO, "MO", 1), slot(RAO, "MO", 2), slot(KHAN, "MO", 3)];
    const a = analyseWorkload(computeTeacherLoads(tight, [RAO, KHAN]), 0);
    return suggestReallocations(tight, a, findConflicts).length;
  })(),
  0
);

check(
  "no suggestions when nobody is underloaded",
  suggestReallocations(spread, { ...analysis, underloaded: [] }, findConflicts),
  []
);

check(
  "a receiving teacher who is already busy at that time is skipped",
  (() => {
    seq = 0;
    // RAO overloaded on MO; IYER is free, but KHAN is busy every period.
    const s = [
      slot(RAO, "MO", 1),
      slot(RAO, "MO", 2),
      slot(RAO, "MO", 3),
      slot(RAO, "MO", 4),
      slot(KHAN, "MO", 1, { classId: "other1" }),
      slot(KHAN, "MO", 2, { classId: "other2" }),
      slot(KHAN, "MO", 3, { classId: "other3" }),
      slot(KHAN, "MO", 4, { classId: "other4" }),
    ];
    const a = analyseWorkload(computeTeacherLoads(s, [RAO, KHAN, IYER]));
    // Only IYER (0 periods, always free) can legally receive anything.
    return suggestReallocations(s, a, findConflicts).every((r) => r.toTeacherId === IYER);
  })(),
  true
);

check("respects the suggestion limit", suggestReallocations(spread, analysis, findConflicts, 1).length, 1);

// ------------------------------------------------------------
console.log("\n\x1b[1mfindCoverOptions\x1b[0m");

seq = 0;
const monday = [
  slot(RAO, "MO", 1),
  slot(RAO, "MO", 2),
  slot(KHAN, "MO", 1, { classId: "other" }), // KHAN busy in period 1 only
];

const cover = findCoverOptions(RAO, "MO", monday, TEACHERS, findConflicts);

check("returns one entry per absent teacher's period", cover.length, 2);

check(
  "period 1 excludes the teacher who is already busy then",
  cover.find((c) => c.period === 1)?.available,
  [IYER]
);

check(
  "period 2 offers everyone who is free",
  cover.find((c) => c.period === 2)?.available,
  [KHAN, IYER]
);

check("a teacher with no lessons that day needs no cover", findCoverOptions(IYER, "MO", monday, TEACHERS, findConflicts), []);

// ------------------------------------------------------------
console.log(
  `\n\x1b[1m${pass}/${pass + failures.length} passed\x1b[0m` +
    (failures.length ? `  \x1b[31m(${failures.length} failed)\x1b[0m` : "")
);
if (failures.length) {
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
