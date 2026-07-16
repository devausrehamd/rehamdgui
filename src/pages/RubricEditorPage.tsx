// src/pages/RubricEditorPage.tsx
//
// The draft editor + steering panel. The user edits TYPED fields (never
// markdown); the server validates on every save and decides validity; "Export
// to git" downloads the clean JSON for a human to commit. Promotion to committed
// is a git action, not an API call — this GUI is not a deploy path.
//
// Everything the server decides (validity, whether export is allowed, batch
// stats) is displayed, never recomputed.

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ApiError,
  NetworkError,
  exportDraft,
  getDraft,
  saveDraft,
  validateDraft,
} from "../api/client";
import type { Criterion, Rubric, RubricValidationResult } from "../api/types";
import { useAgent } from "../context/AgentContext";
import { CriteriaEditor } from "../components/CriteriaEditor";
import { TrajectoryEditor } from "../components/TrajectoryEditor";
import { SectionEditor } from "../components/SectionEditor";
import { RecipeEditor } from "../components/RecipeEditor";
import { ValidationView } from "../components/ValidationView";
import { BatchPanel } from "../components/BatchPanel";
import { Alert, CenterMessage, Spinner } from "../components/ui";

export function RubricEditorPage() {
  const { id = "" } = useParams();
  const { agent } = useAgent();
  const navigate = useNavigate();
  const addr = agent!.address;

  const [content, setContent] = useState<Rubric | null>(null);
  const [validation, setValidation] = useState<RubricValidationResult | null>(null);
  const [status, setStatus] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showJson, setShowJson] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoadError(null);
    getDraft(addr, id)
      .then((d) => {
        if (!alive) return;
        setContent(d.content);
        setValidation(d.validation);
        setStatus(d.status);
      })
      .catch((err) => alive && setLoadError(errMsg(err, "Could not load the draft.")));
    return () => {
      alive = false;
    };
  }, [addr, id]);

  // Mutating the in-memory content marks the draft dirty (unsaved).
  const patch = useCallback((p: Partial<Rubric>) => {
    setContent((prev) => (prev ? { ...prev, ...p } : prev));
    setDirty(true);
    setMessage(null);
  }, []);

  async function save() {
    if (!content) return;
    setSaving(true);
    setActionError(null);
    setMessage(null);
    try {
      const res = await saveDraft(addr, { id, documentType: content.documentType, content });
      setValidation(res.validation);
      setStatus(res.status);
      setDirty(false);
      setMessage(res.validation.valid ? "Saved and validated." : "Saved. Validation found errors — see below.");
    } catch (err) {
      setActionError(errMsg(err, "Save failed."));
    } finally {
      setSaving(false);
    }
  }

  async function revalidate() {
    setBusy(true);
    setActionError(null);
    try {
      const res = await validateDraft(addr, id);
      setValidation(res.validation);
      setMessage("Re-validated against the current committed set.");
    } catch (err) {
      setActionError(errMsg(err, "Validation failed."));
    } finally {
      setBusy(false);
    }
  }

  async function doExport() {
    setBusy(true);
    setActionError(null);
    setMessage(null);
    try {
      const { filename, json } = await exportDraft(addr, id);
      download(filename, json);
      setMessage(`Exported ${filename}. Commit it to git to promote it.`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        // Server refused: draft invalid. It also returns the validation result.
        const body = err.body as { validation?: RubricValidationResult } | undefined;
        if (body?.validation) setValidation(body.validation);
        setActionError("Draft is not valid — fix the errors before exporting to git.");
      } else {
        setActionError(errMsg(err, "Export failed."));
      }
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <Alert kind="error">{loadError}</Alert>;
  if (!content) {
    return (
      <CenterMessage>
        <Spinner label="Loading draft…" />
      </CenterMessage>
    );
  }

  const canExport = validation?.valid === true;

  return (
    <div>
      <div className="row" style={{ marginBottom: "0.5rem" }}>
        <button className="small" onClick={() => navigate("/rubrics")}>
          ← Rubrics
        </button>
        <span className={`badge ${status === "validated" ? "ok" : "neutral"} right`}>{status || "draft"}</span>
        {dirty && <span className="badge warn">unsaved</span>}
      </div>

      <h1>
        Editing draft <span className="mono small muted">{content.documentType}</span>
      </h1>
      <Alert kind="info">
        Drafts are staging only — they can never judge a real document. To make
        this live, Export the JSON and commit it to git.
      </Alert>

      {actionError && <Alert kind="error">{actionError}</Alert>}
      {message && <Alert kind="info">{message}</Alert>}

      {/* --- Top-level fields --- */}
      <section className="card">
        <div className="row">
          <div style={{ flex: 1, minWidth: "12rem" }}>
            <label>Document type</label>
            <input className="mono" value={content.documentType} onChange={(e) => patch({ documentType: e.target.value })} />
          </div>
          <div style={{ flex: 1, minWidth: "12rem" }}>
            <label>Display name</label>
            <input value={content.displayName} onChange={(e) => patch({ displayName: e.target.value })} />
          </div>
          <div style={{ flex: "0 0 7rem" }}>
            <label>Version</label>
            <input value={content.version} onChange={(e) => patch({ version: e.target.value })} />
          </div>
        </div>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: "14rem" }}>
            <label>Aliases (comma-separated)</label>
            <input
              value={content.aliases.join(", ")}
              onChange={(e) =>
                patch({ aliases: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })
              }
            />
          </div>
          <div style={{ flex: "0 0 12rem" }}>
            <label>Review threshold (0–1)</label>
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={content.reviewThreshold}
              onChange={(e) => patch({ reviewThreshold: clamp01(e.target.valueAsNumber) })}
            />
          </div>
        </div>
      </section>

      {/* --- Actions --- */}
      <div className="row" style={{ marginBottom: "1rem" }}>
        <button className="primary" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save (validates)"}
        </button>
        <button onClick={() => void revalidate()} disabled={busy || dirty} title={dirty ? "Save first" : undefined}>
          Re-validate
        </button>
        <button
          onClick={() => void doExport()}
          disabled={busy || !canExport || dirty}
          title={!canExport ? "Draft must be valid to export" : dirty ? "Save first" : undefined}
        >
          Export to git{canExport ? "" : " (invalid)"}
        </button>
        <button className="small right" onClick={() => setShowJson((s) => !s)}>
          {showJson ? "Hide JSON" : "View JSON"}
        </button>
      </div>

      {/* --- Validation (server-decided) --- */}
      <section className="card">
        <h2>Validation</h2>
        {dirty && <p className="small" style={{ color: "var(--warn)" }}>Unsaved edits — save to re-validate.</p>}
        <ValidationView result={validation} />
      </section>

      {showJson && (
        <section className="card">
          <h3>Rubric JSON (read-only)</h3>
          <pre className="table-scroll" style={{ margin: 0, fontSize: "0.8rem" }}>
            {JSON.stringify(content, null, 2)}
          </pre>
        </section>
      )}

      {/* --- Criteria --- */}
      <h2>Criteria ({content.criteria.length})</h2>
      <CriteriaEditor
        criteria={content.criteria}
        onChange={(criteria: Criterion[]) => patch({ criteria })}
      />

      {/* --- Sections: the document's declared structure --- */}
      <h2 style={{ marginTop: "2rem" }}>Sections ({content.sections?.length ?? 0})</h2>
      <section className="card">
        <SectionEditor
          sections={content.sections ?? []}
          onChange={(sections) => patch({ sections })}
        />
      </section>

      {/* --- Recipe: the ordered program that generates the document --- */}
      <h2 style={{ marginTop: "2rem" }}>Recipe ({content.recipe?.steps?.length ?? 0} steps)</h2>
      <section className="card">
        <RecipeEditor
          recipe={content.recipe}
          sectionIds={(content.sections ?? []).map((s) => s.id)}
          onChange={(recipe) => patch({ recipe })}
        />
      </section>

      {/* --- Trajectory: what the run must have DONE (auto-fail if not) --- */}
      <h2 style={{ marginTop: "2rem" }}>Trajectory</h2>
      <section className="card">
        <TrajectoryEditor
          trajectory={content.trajectory}
          onChange={(trajectory) => patch({ trajectory })}
        />
      </section>

      {/* --- Batch steering --- */}
      <h2 style={{ marginTop: "2rem" }}>k-sampling steering</h2>
      <BatchPanel addr={addr} draftId={id} />
    </div>
  );
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function errMsg(err: unknown, fallback: string): string {
  if (err instanceof ApiError || err instanceof NetworkError) return err.message;
  return fallback;
}
