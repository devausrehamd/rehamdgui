// src/components/ValidationView.tsx
//
// Renders the SERVER's validation result. The GUI never decides validity — it
// shows what validateRubric returned: errors in red, warnings in amber, and the
// derived summary. The Export button's enabled-ness keys off `valid` here, but
// the server also refuses to export an invalid draft (rule §2).

import type { RubricValidationResult } from "../api/types";

export function ValidationView({ result }: { result: RubricValidationResult | null }) {
  if (!result) {
    return <p className="muted small">Not validated yet — save the draft to validate.</p>;
  }

  const errors = result.issues.filter((i) => i.severity === "error");
  const warnings = result.issues.filter((i) => i.severity === "warning");

  return (
    <div>
      <div className="row" style={{ marginBottom: "0.5rem" }}>
        {result.valid ? (
          <span className="badge ok">valid</span>
        ) : (
          <span className="badge error">invalid — {errors.length} error{errors.length === 1 ? "" : "s"}</span>
        )}
        {warnings.length > 0 && (
          <span className="badge warn">
            {warnings.length} warning{warnings.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {result.summary && (
        <div className="small muted" style={{ marginBottom: "0.5rem" }}>
          {result.summary.criteriaCount} criteria · total weight {result.summary.totalWeight} ·{" "}
          {result.summary.criticalCount} critical · {result.summary.sectionCount} sections ·{" "}
          {result.summary.hasRecipe ? "has recipe" : "no recipe"}
        </div>
      )}

      {result.issues.length === 0 ? (
        <p className="muted small">No issues.</p>
      ) : (
        <div>
          {errors.map((i, idx) => (
            <div className="issue" key={`e${idx}`}>
              <span className="badge error">error</span>
              <span className="path">{i.path || "—"}</span>
              <span>{i.message}</span>
            </div>
          ))}
          {warnings.map((i, idx) => (
            <div className="issue" key={`w${idx}`}>
              <span className="badge warn">warning</span>
              <span className="path">{i.path || "—"}</span>
              <span>{i.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
