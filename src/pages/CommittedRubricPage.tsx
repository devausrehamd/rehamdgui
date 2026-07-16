// src/pages/CommittedRubricPage.tsx
//
// Read-only view of a committed (live, git-backed) rubric. The GUI cannot write
// committed rubrics — the only mutating action here is "New draft from this",
// which copies the rubric into an editable draft.

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, NetworkError, getRubric, saveDraft } from "../api/client";
import type { Rubric } from "../api/types";
import { useAgent } from "../context/AgentContext";
import { useAuth } from "../context/AuthContext";
import { Alert, CenterMessage, GateBadge, Spinner } from "../components/ui";

export function CommittedRubricPage() {
  const { type = "" } = useParams();
  const { agent } = useAgent();
  const { can } = useAuth();
  const navigate = useNavigate();
  const addr = agent!.address;

  const [data, setData] = useState<{ rubric: Rubric; hash: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setError(null);
    getRubric(addr, type)
      .then((r) => alive && setData({ rubric: r.rubric, hash: r.hash }))
      .catch((err) => alive && setError(errMsg(err, "Could not load the rubric.")));
    return () => {
      alive = false;
    };
  }, [addr, type]);

  async function createDraft() {
    if (!data) return;
    setBusy(true);
    try {
      const res = await saveDraft(addr, { documentType: data.rubric.documentType, content: data.rubric });
      navigate(`/drafts/${res.id}`);
    } catch (err) {
      setError(errMsg(err, "Could not create a draft."));
      setBusy(false);
    }
  }

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data) {
    return (
      <CenterMessage>
        <Spinner label="Loading rubric…" />
      </CenterMessage>
    );
  }

  const r = data.rubric;

  return (
    <div>
      <div className="row" style={{ marginBottom: "0.5rem" }}>
        <button className="small" onClick={() => navigate("/rubrics")}>
          ← Rubrics
        </button>
        {can("rubric:edit") && (
          <button className="primary right" onClick={() => void createDraft()} disabled={busy}>
            {busy ? "Creating…" : "New draft from this"}
          </button>
        )}
      </div>

      <h1>
        {r.displayName} <span className="badge neutral">committed · read-only</span>
      </h1>
      <p className="muted small">
        <span className="mono">{r.documentType}</span> · v{r.version} · content hash{" "}
        <span className="mono">{data.hash.slice(0, 12)}</span>
      </p>

      <section className="card">
        <div className="row small">
          <span>
            Review threshold: <strong>{Math.round(r.reviewThreshold * 100)}%</strong>
          </span>
          {r.aliases.length > 0 && (
            <span className="muted">aliases: {r.aliases.join(", ")}</span>
          )}
        </div>
      </section>

      <h2>Criteria ({r.criteria.length})</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Criterion</th>
              <th>Gate</th>
              <th>Weight</th>
              <th>Assessment</th>
              <th>Primary</th>
            </tr>
          </thead>
          <tbody>
            {r.criteria.map((c) => (
              <tr key={c.id}>
                <td className="mono">{c.id}</td>
                <td style={{ maxWidth: 380 }}>
                  {c.criterion || <span className="muted">—</span>}
                  {c.explanation && <div className="small muted">{c.explanation}</div>}
                </td>
                <td>
                  <GateBadge gate={c.gate} />
                </td>
                <td>{c.weight}</td>
                <td className="small">{c.assessmentType}</td>
                <td>{c.primary ? "yes" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function errMsg(err: unknown, fallback: string): string {
  if (err instanceof ApiError || err instanceof NetworkError) return err.message;
  return fallback;
}
