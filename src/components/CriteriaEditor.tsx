// src/components/CriteriaEditor.tsx
//
// The structured criterion editor. Each field gets the right control — weight is
// a number, gate/assessmentType are dropdowns over the server's enums, primary
// is a checkbox. We edit TYPED ROWS, never markdown (rule §3). The rubric is
// never presented as raw-JSON-in-a-textarea as the primary editor (the editor
// page offers a read-only JSON view as a separate power-user affordance).
//
// This component is pure state plumbing: it computes nothing the server decides.

import {
  ASSESSMENT_TYPES,
  GATE_LEVELS,
  type Criterion,
  type PatternRule,
} from "../api/types";
import { blankCriterion } from "../lib/rubric";
import { suggestPatterns } from "../lib/pattern-suggest";

interface Props {
  criteria: Criterion[];
  onChange: (next: Criterion[]) => void;
}

export function CriteriaEditor({ criteria, onChange }: Props) {
  function update(index: number, patch: Partial<Criterion>) {
    onChange(criteria.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }
  function remove(index: number) {
    onChange(criteria.filter((_, i) => i !== index));
  }
  function add() {
    onChange([...criteria, blankCriterion(`criterion-${criteria.length + 1}`)]);
  }

  return (
    <div className="stack">
      {criteria.map((c, i) => (
        <div className="card" key={i} style={{ marginBottom: 0 }}>
          <div className="row">
            <div style={{ flex: 1 }}>
              <label>Criterion ID</label>
              <input value={c.id} onChange={(e) => update(i, { id: e.target.value })} className="mono" />
            </div>
            <button className="small danger" style={{ alignSelf: "flex-end" }} onClick={() => remove(i)}>
              Remove
            </button>
          </div>

          <div className="field">
            <label>Rule (what the judge is asked)</label>
            <textarea
              value={c.criterion}
              onChange={(e) => update(i, { criterion: e.target.value })}
              style={{ minHeight: "3.5rem" }}
            />
          </div>

          <div className="field">
            <label>Explanation (why; what a FAIL looks like)</label>
            <textarea
              value={c.explanation}
              onChange={(e) => update(i, { explanation: e.target.value })}
              style={{ minHeight: "3rem" }}
            />
          </div>

          <div className="row" style={{ alignItems: "flex-end" }}>
            <div style={{ flex: "0 0 6rem" }}>
              <label>Weight</label>
              <input
                type="number"
                min={0}
                step={1}
                value={c.weight}
                onChange={(e) => update(i, { weight: e.target.valueAsNumber || 0 })}
              />
            </div>
            <div style={{ flex: 1, minWidth: "8rem" }}>
              <label>Gate</label>
              <select value={c.gate} onChange={(e) => update(i, { gate: e.target.value as Criterion["gate"] })}>
                {GATE_LEVELS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: "9rem" }}>
              <label>Assessment</label>
              <select
                value={c.assessmentType}
                onChange={(e) => update(i, { assessmentType: e.target.value as Criterion["assessmentType"] })}
              >
                {ASSESSMENT_TYPES.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <label style={{ display: "flex", gap: "0.35rem", alignItems: "center", marginBottom: "0.45rem" }}>
              <input type="checkbox" checked={c.primary} onChange={(e) => update(i, { primary: e.target.checked })} />
              Primary
            </label>
          </div>

          <div className="field">
            <label>Scope</label>
            <input value={c.scope} onChange={(e) => update(i, { scope: e.target.value })} />
          </div>

          <SuggestPatterns
            criterion={c.criterion}
            existing={c.requiredPatterns}
            onAccept={(rules, makeHybrid) =>
              update(i, {
                requiredPatterns: [...c.requiredPatterns, ...rules],
                // Accepting a pattern means the criterion now has a deterministic
                // pre-check, so it must run as hybrid (pattern AND judge). Leaving
                // it llm_judge would ignore the pattern entirely.
                ...(makeHybrid && c.assessmentType === "llm_judge" ? { assessmentType: "hybrid" as const } : {}),
              })
            }
          />
          <PatternList
            title="Forbidden patterns (a FAIL if any appear)"
            rules={c.forbiddenPatterns}
            onChange={(forbiddenPatterns) => update(i, { forbiddenPatterns })}
          />
          <PatternList
            title="Required patterns (a FAIL if any are absent)"
            rules={c.requiredPatterns}
            onChange={(requiredPatterns) => update(i, { requiredPatterns })}
          />
        </div>
      ))}

      <button onClick={add}>+ Add criterion</button>
    </div>
  );
}

/**
 * Propose deterministic patterns derived from the rule's literals, for the
 * author to accept. Suggestions are NECESSARY conditions only — the button
 * exists to save typing, never to decide anything. Accepting one wires the
 * criterion to hybrid so the pattern actually runs alongside the judge.
 */
function SuggestPatterns({
  criterion,
  existing,
  onAccept,
}: {
  criterion: string;
  existing: PatternRule[];
  onAccept: (rules: PatternRule[], makeHybrid: boolean) => void;
}) {
  const already = new Set(existing.map((p) => p.pattern));
  const suggestions = suggestPatterns(criterion).filter((s) => !already.has(s.pattern));

  if (suggestions.length === 0) return null;

  return (
    <div className="field" style={{ background: "var(--surface-2)", padding: "0.5rem", borderRadius: 6 }}>
      <label style={{ marginBottom: "0.25rem" }}>Suggested required patterns (necessary conditions)</label>
      <div className="small muted" style={{ marginBottom: "0.4rem" }}>
        Derived from the rule's identifiers. A necessary condition, never sufficient — the
        judge still decides. Accepting runs this criterion as hybrid.
      </div>
      {suggestions.map((s) => (
        <div className="row" key={s.pattern} style={{ marginBottom: "0.35rem", alignItems: "flex-start" }}>
          <span className="mono badge neutral">{s.label}</span>
          <span className="small muted" style={{ flex: 1 }}>
            {s.rationale}
          </span>
          <button
            className="small"
            onClick={() => onAccept([{ pattern: s.pattern, label: s.label }], true)}
          >
            Accept
          </button>
        </div>
      ))}
    </div>
  );
}

function PatternList({
  title,
  rules,
  onChange,
}: {
  title: string;
  rules: PatternRule[];
  onChange: (next: PatternRule[]) => void;
}) {
  function update(index: number, patch: Partial<PatternRule>) {
    onChange(rules.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  return (
    <div className="field">
      <label>{title}</label>
      {rules.length === 0 && <div className="small muted">None.</div>}
      {rules.map((r, i) => (
        <div className="row" key={i} style={{ marginBottom: "0.35rem", flexWrap: "nowrap" }}>
          <input
            className="mono"
            placeholder="regex"
            value={r.pattern}
            onChange={(e) => update(i, { pattern: e.target.value })}
          />
          <input
            placeholder="label"
            value={r.label}
            onChange={(e) => update(i, { label: e.target.value })}
          />
          <button className="small danger" onClick={() => onChange(rules.filter((_, j) => j !== i))}>
            ✕
          </button>
        </div>
      ))}
      <button className="small" onClick={() => onChange([...rules, { pattern: "", label: "" }])}>
        + Add pattern
      </button>
    </div>
  );
}
