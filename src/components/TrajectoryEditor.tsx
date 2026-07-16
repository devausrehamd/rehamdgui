// src/components/TrajectoryEditor.tsx
//
// Author what the agent must have DONE to earn the document — not what the
// document must say. A trajectory miss is an AUTO FAIL, decided server-side; the
// editor just captures the rules and states the consequence, loudly, because an
// author needs to know a rule here can fail an otherwise-perfect document.

import type { Rubric, TrajectoryRule } from "../api/types";

interface Props {
  trajectory: Rubric["trajectory"];
  onChange: (next: NonNullable<Rubric["trajectory"]>) => void;
}

const EMPTY: NonNullable<Rubric["trajectory"]> = { description: "", required: [], forbidden: [] };

function blankRule(kind: TrajectoryRule["kind"], index: number): TrajectoryRule {
  return kind === "document"
    ? { kind, id: `doc-${index}`, documentType: "", reason: "" }
    : { kind, id: `agent-${index}`, agent: "web", query: "", reason: "" };
}

export function TrajectoryEditor({ trajectory, onChange }: Props) {
  const t = trajectory ?? EMPTY;

  const setList = (which: "required" | "forbidden", rules: TrajectoryRule[]) =>
    onChange({ ...t, [which]: rules });

  return (
    <div className="stack">
      <p className="muted small" style={{ margin: 0 }}>
        Trajectory rules check what the run <em>did</em>, against what it produced. A
        document can read perfectly and still fail here — that is the point. Any
        <strong> required</strong> rule unmet, or any <strong>forbidden</strong> rule
        hit, is an <strong>auto-fail</strong> that no score can outweigh.
      </p>

      <RuleList
        title="Required — the run must have done all of these"
        rules={t.required}
        onChange={(r) => setList("required", r)}
      />
      <RuleList
        title="Forbidden — the run must have done none of these"
        rules={t.forbidden}
        onChange={(r) => setList("forbidden", r)}
      />
    </div>
  );
}

function RuleList({
  title,
  rules,
  onChange,
}: {
  title: string;
  rules: TrajectoryRule[];
  onChange: (next: TrajectoryRule[]) => void;
}) {
  function update(i: number, patch: Partial<TrajectoryRule>) {
    onChange(rules.map((r, idx) => (idx === i ? ({ ...r, ...patch } as TrajectoryRule) : r)));
  }

  return (
    <div>
      <label>{title}</label>
      {rules.length === 0 && <div className="small muted">None.</div>}

      {rules.map((r, i) => (
        <div className="card" key={i} style={{ marginBottom: "0.5rem", background: "var(--surface-2)" }}>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <div style={{ flex: "0 0 9rem" }}>
              <label>Kind</label>
              <select
                value={r.kind}
                onChange={(e) =>
                  // Switching kind swaps to a fresh rule of that kind — the two
                  // shapes share no fields beyond id/reason, and carrying stale
                  // ones over would produce an invalid rule.
                  onChange(rules.map((rr, idx) => (idx === i ? blankRule(e.target.value as TrajectoryRule["kind"], i) : rr)))
                }
              >
                <option value="document">document retrieved</option>
                <option value="agent">agent called</option>
              </select>
            </div>

            {r.kind === "document" ? (
              <div style={{ flex: 1, minWidth: "12rem" }}>
                <label>Document type</label>
                <input
                  className="mono"
                  placeholder="e.g. capa-procedure"
                  value={r.documentType}
                  onChange={(e) => update(i, { documentType: e.target.value })}
                />
              </div>
            ) : (
              <>
                <div style={{ flex: "0 0 8rem" }}>
                  <label>Agent</label>
                  <input className="mono" value={r.agent} onChange={(e) => update(i, { agent: e.target.value })} />
                </div>
                <div style={{ flex: 1, minWidth: "12rem" }}>
                  <label>Query</label>
                  <input
                    placeholder="e.g. current exchange rate AUD to USD"
                    value={r.query}
                    onChange={(e) => update(i, { query: e.target.value })}
                  />
                </div>
              </>
            )}

            <button className="small danger" style={{ alignSelf: "flex-end" }} onClick={() => onChange(rules.filter((_, idx) => idx !== i))}>
              ✕
            </button>
          </div>

          <div className="field" style={{ marginTop: "0.5rem", marginBottom: 0 }}>
            <label>Why this is required (for the auditor)</label>
            <input value={r.reason} onChange={(e) => update(i, { reason: e.target.value })} />
          </div>
        </div>
      ))}

      <div className="row" style={{ gap: "0.4rem" }}>
        <button className="small" onClick={() => onChange([...rules, blankRule("document", rules.length)])}>
          + Document rule
        </button>
        <button className="small" onClick={() => onChange([...rules, blankRule("agent", rules.length)])}>
          + Agent rule
        </button>
      </div>
    </div>
  );
}
