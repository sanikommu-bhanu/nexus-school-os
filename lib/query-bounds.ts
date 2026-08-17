// ============================================================
// Query bounds — the single place that decides how much this app is
// ever willing to read in one go.
//
// WHY THIS EXISTS
// Every collection read used to be unbounded: `getDocs(collection(...))`
// with no limit. That is fine for a demo school and quietly ruinous for
// a real one — a 2,000-student school pulled 2,000 documents to render
// a member list, and `feePayments` grows forever and was read whole.
// Firestore bills per document read, so an unbounded query is an
// unbounded bill as well as an unbounded render.
//
// THE RULE THIS FILE ENCODES
//   * LISTS are bounded. A page of data is a page, never "everything".
//   * COUNTS never come from a list. `getCountFromServer` returns a
//     count as an aggregation without downloading the documents, so a
//     bounded list and an exact total are no longer in conflict — which
//     is the trap that makes people leave reads unbounded in the first
//     place.
//
// Bounds are generous on purpose. They are a CEILING that stops runaway
// cost, not a page size: no real school hits them, and a school that
// does gets truncation rather than a stalled screen or a surprise bill.
// ============================================================
import { getCountFromServer, type Query, type CollectionReference } from "firebase/firestore";

/** Roster-shaped collections: members, classes, enrolments, students. */
export const MAX_ROSTER = 1000;

/** Append-only ledgers that grow forever: payments, submissions. */
export const MAX_LEDGER = 500;

/** Timetable slots for one school — a full week across every class. */
export const MAX_TIMETABLE = 2000;

/** One AI conversation's message history. */
export const MAX_THREAD = 200;

/**
 * Exact size of a collection or query WITHOUT downloading it.
 *
 * This is what lets the dashboard show a true "1,284 students" while
 * only ever reading a bounded page of them. Server-side aggregation is
 * billed at a small fraction of reading the matching documents.
 *
 * Returns 0 rather than throwing: a count is decoration on a dashboard,
 * and a failed count must never take down the screen around it.
 */
export async function countOf(q: Query | CollectionReference): Promise<number> {
  try {
    const snap = await getCountFromServer(q);
    return snap.data().count;
  } catch {
    return 0;
  }
}
