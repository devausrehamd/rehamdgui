// src/components/RecipeEditor.tsx
//
// Author the ordered program that produces the document. Each step is a
// closed-vocabulary kind, and the controls shown depend on the kind: a
// retrieve_sections needs a source, a generate_section needs a sectionId, and so
// on. Steps run in order; a step's `inputs` name prior step ids it consumes (the
// intra-document DAG the server validates - a step cannot consume a later one).
//
// Structured controls, never raw JSON. The server validates the whole recipe on
// save (DAG well-formed, section ids exist), and shows issues inline.

import { RECIPE_STEP_KINDS, type RecipeStep, type RubricRecipe } from "../api/types";

interface Props {
  recipe: RubricRecipe | undefined;
  /** Section ids available to reference from generate/validate steps. */
  sectionIds: string[];
  onChange: (next: RubricRecipe) => void;
}

const EMPTY: RubricRecipe = { steps: [] };

function blankStep(kind: RecipeStep["kind"], i: number): RecipeStep {
  const base = { id: `step_${i}`, kind, inputs: [] as string[] };
  switch (kind) {
    case "retrieve_sections": return { ...base, source: "", sections: [] };
    case "query_table": return { ...base, collection: "" };
    case "recall_prior": return { ...base, documentType: "", export: "" };
    case "generate_section": return { ...base, sectionId: "", bestOf: 1 };
    case "validate_section": return { ...base, sectionId: "" };
    case "judge": return { ...base, criteria: [] };
    case "require_human": return { ...base, prompt: "Review and disposition this draft." };
  }
}

export function RecipeEditor({ recipe, sectionIds, onChange }: Props) {
  const steps = recipe?.steps ?? EMPTY.steps;
  const priorIds = (i: number) => steps.slice(0, i).map((s) => s.id);

  const update = (i: number, patch: Partial<RecipeStep>) =>
    onChange({ steps: steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange({ steps: next });
  };

  return (
    <div className="stack">
      <p className="muted small" style={{ margin: 0 }}>
        The ordered steps that generate the document. Steps run top to bottom; a
        step's <strong>inputs</strong> reference the ids of steps above it.
      </p>

      {steps.map((step, i) => (
        <div className="card" key={i} style={{ marginBottom: 0 }}>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <span className="badge neutral mono">{i + 1}</span>
            <div style={{ flex: "0 0 8rem" }}>
              <label>Step ID</label>
              <input className="mono" value={step.id} onChange={(e) => update(i, { id: e.target.value })} />
            </div>
            <div style={{ flex: "0 0 11rem" }}>
              <label>Kind</label>
              <select
                value={step.kind}
                onChange={(e) => onChange({ steps: steps.map((s, idx) => (idx === i ? blankStep(e.target.value as RecipeStep["kind"], i + 1) : s)) })}
              >
                {RECIPE_STEP_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
            <div className="right" style={{ display: "flex", gap: "0.25rem" }}>
              <button className="small" onClick={() => move(i, -1)} disabled={i === 0} title="Move up">↑</button>
              <button className="small" onClick={() => move(i, 1)} disabled={i === steps.length - 1} title="Move down">↓</button>
              <button className="small danger" onClick={() => onChange({ steps: steps.filter((_, idx) => idx !== i) })}>Remove</button>
            </div>
          </div>

          <StepFields step={step} sectionIds={sectionIds} onChange={(patch) => update(i, patch)} />

          {i > 0 && (
            <div className="field" style={{ marginTop: "0.4rem", marginBottom: 0 }}>
              <label>Inputs (prior step ids this consumes)</label>
              <input
                className="mono"
                placeholder={priorIds(i).join(", ") || "(no prior steps)"}
                value={(step.inputs ?? []).join(", ")}
                onChange={(e) => update(i, { inputs: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })}
              />
            </div>
          )}
        </div>
      ))}

      <div className="row" style={{ gap: "0.35rem", flexWrap: "wrap" }}>
        {RECIPE_STEP_KINDS.map((k) => (
          <button key={k} className="small" onClick={() => onChange({ steps: [...steps, blankStep(k, steps.length + 1)] })}>
            + {k}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The controls specific to a step's kind. */
function StepFields({
  step,
  sectionIds,
  onChange,
}: {
  step: RecipeStep;
  sectionIds: string[];
  onChange: (patch: Partial<RecipeStep>) => void;
}) {
  const sectionSelect = (value: string | undefined) => (
    <select value={value ?? ""} onChange={(e) => onChange({ sectionId: e.target.value })}>
      <option value="">— pick a section —</option>
      {sectionIds.map((id) => (
        <option key={id} value={id}>
          {id}
        </option>
      ))}
    </select>
  );

  switch (step.kind) {
    case "retrieve_sections":
      return (
        <div className="row" style={{ marginTop: "0.4rem" }}>
          <div style={{ flex: 1, minWidth: "12rem" }}>
            <label>Source (corpus path fragment)</label>
            <input className="mono" placeholder="e.g. Field_Quality_and_CAPA_Management" value={step.source ?? ""} onChange={(e) => onChange({ source: e.target.value })} />
          </div>
          <div style={{ flex: 1, minWidth: "10rem" }}>
            <label>Section ids (comma-separated; blank = all)</label>
            <input className="mono" value={(step.sections ?? []).join(", ")} onChange={(e) => onChange({ sections: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
          </div>
        </div>
      );
    case "query_table":
      return (
        <div className="field" style={{ marginTop: "0.4rem", marginBottom: 0 }}>
          <label>Collection to query</label>
          <input className="mono" value={step.collection ?? ""} onChange={(e) => onChange({ collection: e.target.value })} />
        </div>
      );
    case "recall_prior":
      return (
        <div className="row" style={{ marginTop: "0.4rem" }}>
          <div style={{ flex: 1 }}>
            <label>Upstream document type</label>
            <input className="mono" value={step.documentType ?? ""} onChange={(e) => onChange({ documentType: e.target.value })} />
          </div>
          <div style={{ flex: 1 }}>
            <label>Export to pull</label>
            <input className="mono" value={step.export ?? ""} onChange={(e) => onChange({ export: e.target.value })} />
          </div>
        </div>
      );
    case "generate_section":
      return (
        <div className="row" style={{ marginTop: "0.4rem" }}>
          <div style={{ flex: 1 }}>
            <label>Section to generate</label>
            {sectionSelect(step.sectionId)}
          </div>
          <div style={{ flex: "0 0 7rem" }}>
            <label>Best of (samples)</label>
            <input type="number" min={1} max={5} value={step.bestOf ?? 1} onChange={(e) => onChange({ bestOf: e.target.valueAsNumber || 1 })} />
          </div>
        </div>
      );
    case "validate_section":
      return (
        <div className="field" style={{ marginTop: "0.4rem", marginBottom: 0 }}>
          <label>Section to validate</label>
          {sectionSelect(step.sectionId)}
        </div>
      );
    case "judge":
      return (
        <div className="field" style={{ marginTop: "0.4rem", marginBottom: 0 }}>
          <label>Criteria ids (comma-separated; blank = all)</label>
          <input className="mono" value={(step.criteria ?? []).join(", ")} onChange={(e) => onChange({ criteria: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
        </div>
      );
    case "require_human":
      return (
        <div className="field" style={{ marginTop: "0.4rem", marginBottom: 0 }}>
          <label>Prompt shown to the reviewer</label>
          <input value={step.prompt ?? ""} onChange={(e) => onChange({ prompt: e.target.value })} />
        </div>
      );
  }
}
