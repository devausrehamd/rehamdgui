// src/components/SectionEditor.tsx
//
// Author a document's declared structure: its sections, and each section's typed
// fields. This is what the generator fills - the panels cut before the model
// sews. A field's provenance decides who supplies it: retrieved (cite a source),
// generated (model prose), or computed (a code formula the model must never
// fill). Structured controls, never raw JSON - the server validates on save.

import {
  FIELD_PROVENANCE,
  FIELD_TYPES,
  type RubricSection,
  type SectionField,
} from "../api/types";

interface Props {
  sections: RubricSection[];
  onChange: (next: RubricSection[]) => void;
}

function blankField(i: number): SectionField {
  return { name: `field_${i}`, type: "string", provenance: "generated", required: true };
}

function blankSection(i: number): RubricSection {
  return { id: `section_${i}`, title: "New Section", cardinality: "array", groundedIn: [], fields: [blankField(1)] };
}

export function SectionEditor({ sections, onChange }: Props) {
  const update = (i: number, patch: Partial<RubricSection>) =>
    onChange(sections.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  return (
    <div className="stack">
      <p className="muted small" style={{ margin: 0 }}>
        The sections the generator produces. A section's fields are typed; a
        <strong> computed</strong> field is filled by code from its formula, never
        by the model.
      </p>

      {sections.map((sec, i) => (
        <div className="card" key={i} style={{ marginBottom: 0 }}>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <div style={{ flex: "0 0 12rem" }}>
              <label>Section ID</label>
              <input className="mono" value={sec.id} onChange={(e) => update(i, { id: e.target.value })} />
            </div>
            <div style={{ flex: 1, minWidth: "10rem" }}>
              <label>Title</label>
              <input value={sec.title} onChange={(e) => update(i, { title: e.target.value })} />
            </div>
            <div style={{ flex: "0 0 8rem" }}>
              <label>Cardinality</label>
              <select
                value={sec.cardinality}
                onChange={(e) => update(i, { cardinality: e.target.value as RubricSection["cardinality"] })}
              >
                <option value="array">array (many rows)</option>
                <option value="single">single (one row)</option>
              </select>
            </div>
            <button className="small danger" style={{ alignSelf: "flex-end" }} onClick={() => onChange(sections.filter((_, idx) => idx !== i))}>
              Remove
            </button>
          </div>

          <div className="field" style={{ marginTop: "0.5rem" }}>
            <label>Grounded in (comma-separated recipe step ids)</label>
            <input
              className="mono"
              placeholder="e.g. sop, data"
              value={sec.groundedIn.join(", ")}
              onChange={(e) => update(i, { groundedIn: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })}
            />
          </div>

          <FieldList fields={sec.fields} onChange={(fields) => update(i, { fields })} />
        </div>
      ))}

      <button onClick={() => onChange([...sections, blankSection(sections.length + 1)])}>+ Add section</button>
    </div>
  );
}

function FieldList({ fields, onChange }: { fields: SectionField[]; onChange: (f: SectionField[]) => void }) {
  const update = (i: number, patch: Partial<SectionField>) =>
    onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));

  return (
    <div style={{ marginTop: "0.5rem" }}>
      <label>Fields</label>
      {fields.map((f, i) => (
        <div className="card" key={i} style={{ background: "var(--surface-2)", marginBottom: "0.4rem", padding: "0.6rem" }}>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: "9rem" }}>
              <label>Name</label>
              <input className="mono" value={f.name} onChange={(e) => update(i, { name: e.target.value })} />
            </div>
            <div style={{ flex: "0 0 8rem" }}>
              <label>Type</label>
              <select value={f.type} onChange={(e) => update(i, { type: e.target.value as SectionField["type"] })}>
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: "0 0 9rem" }}>
              <label>Provenance</label>
              <select value={f.provenance} onChange={(e) => update(i, { provenance: e.target.value as SectionField["provenance"] })}>
                {FIELD_PROVENANCE.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <label style={{ display: "flex", gap: "0.3rem", alignItems: "center", marginBottom: "0.45rem" }}>
              <input type="checkbox" checked={f.required ?? true} onChange={(e) => update(i, { required: e.target.checked })} />
              required
            </label>
            <button className="small danger" style={{ alignSelf: "flex-end" }} onClick={() => onChange(fields.filter((_, idx) => idx !== i))}>
              ✕
            </button>
          </div>

          {/* Provenance/type-specific controls, shown only when relevant. */}
          {f.provenance === "computed" && (
            <div className="field" style={{ marginTop: "0.4rem", marginBottom: 0 }}>
              <label>Formula (code computes this — model leaves it null)</label>
              <input className="mono" placeholder="e.g. severity * occurrence * detection" value={f.formula ?? ""} onChange={(e) => update(i, { formula: e.target.value })} />
            </div>
          )}
          {f.type === "enum" && (
            <div className="field" style={{ marginTop: "0.4rem", marginBottom: 0 }}>
              <label>Allowed values (comma-separated)</label>
              <input value={(f.domain ?? []).join(", ")} onChange={(e) => update(i, { domain: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
            </div>
          )}
          {f.type === "reference" && (
            <div className="field" style={{ marginTop: "0.4rem", marginBottom: 0 }}>
              <label>Reference export (the upstream export this points at)</label>
              <input className="mono" value={f.referenceExport ?? ""} onChange={(e) => update(i, { referenceExport: e.target.value })} />
            </div>
          )}
        </div>
      ))}
      <button className="small" onClick={() => onChange([...fields, blankField(fields.length + 1)])}>
        + Add field
      </button>
    </div>
  );
}
