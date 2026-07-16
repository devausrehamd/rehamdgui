// src/lib/format.ts — small display formatters. No logic, just rendering.

/** A 0..1 rate as a percentage string. */
export function pct(rate: number, digits = 0): string {
  return `${(rate * 100).toFixed(digits)}%`;
}

/** First 8 chars of a git commit, for traceability in the picker. */
export function shortCommit(commit: string): string {
  return commit.slice(0, 8);
}

/**
 * A readable prefix of an agent's GUID, e.g. "agt_037e923c".
 *
 * The GUID identifies the RUNNING INSTANCE and is the only field guaranteed to
 * distinguish one agent from another: with one agent per sandbox, n sandboxes
 * routinely produce n agents sharing a name, a commit, and a rubric set. Names
 * are for humans; this is the identity. The full value stays available on hover
 * and is what the GUI stores and resolves through Discovery.
 *
 * Keeps the `agt_` prefix so it is recognisable as an agent id, plus 8 hex
 * chars — 32 bits, ample to tell apart the handful of agents a person is
 * looking at, while staying short enough to sit next to a name.
 */
export function shortGuid(guid: string): string {
  return guid.slice(0, 12);
}

/** Human "age" of an ISO timestamp, e.g. "12s ago", "3m ago". Used to make a
 *  stale agent visible. */
export function ago(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown";
  const secs = Math.max(0, Math.round((now - then) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/** Local date-time for draft/batch timestamps. */
export function dateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}
