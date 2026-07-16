// src/pages/RubricListPage.tsx
//
// Two worlds, clearly separated (mirroring the backend):
//   COMMITTED — git-backed, live, READ ONLY here. Click to view; "New draft
//               from this" copies it into an editable draft.
//   DRAFTS    — the user's editable working copies. Never live. Promotion to
//               committed is a GIT action (export + commit), not an API call.
//
// Editing needs `rubric:edit`; we hide the draft controls for users who lack it
// (UI only — the server enforces).

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ApiError,
  NetworkError,
  getRubric,
  listDrafts,
  listRubrics,
  saveDraft,
  updateRubrics,
} from "../api/client";
import type { CommittedRubricSummary, DraftSummary, RubricUpdateResult } from "../api/types";
import { useAgent } from "../context/AgentContext";
import { useAuth } from "../context/AuthContext";
import { blankRubric } from "../lib/rubric";
import { dateTime } from "../lib/format";
import { Alert, CenterMessage, Spinner } from "../components/ui";

export function RubricListPage() {
  const { agent } = useAgent();
  const { can } = useAuth();
  const navigate = useNavigate();
  const addr = agent!.address;
  const canEdit = can("rubric:edit");

  const [committed, setCommitted] = useState<CommittedRubricSummary[] | null>(null);
  const [drafts, setDrafts] = useState<DraftSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [update, setUpdate] = useState<RubricUpdateResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const committedP = listRubrics(addr);
      // Drafts require rubric:edit — only fetch if the UI thinks we can.
      const draftsP = canEdit ? listDrafts(addr) : Promise.resolve<DraftSummary[]>([]);
      const [c, d] = await Promise.all([committedP, draftsP]);
      setCommitted(c);
      setDrafts(d);
    } catch (err) {
      setError(errMsg(err, "Could not load rubrics from the agent."));
    } finally {
      setLoading(false);
    }
  }, [addr, canEdit]);

  useEffect(() => {
    void load();
  }, [load]);

  async function newBlankDraft() {
    setCreating(true);
    setError(null);
    try {
      const res = await saveDraft(addr, {
        documentType: "new-document-type",
        content: blankRubric(),
      });
      navigate(`/drafts/${res.id}`);
    } catch (err) {
      setError(errMsg(err, "Could not create a draft."));
      setCreating(false);
    }
  }

  /** Pull the released rubric set. The agent decides what moved and whether it
   *  may — we show what it reports, including "nothing changed". */
  async function pullRelease() {
    setUpdating(true);
    setError(null);
    setUpdate(null);
    try {
      const res = await updateRubrics(addr);
      setUpdate(res);
      // The committed list may now be different — re-read rather than patch it.
      if (!res.upToDate) await load();
    } catch (err) {
      // The server's message is the useful part here: a missing release ref, a
      // dirty rubrics/, or a released set that won't validate all read very
      // differently and each needs a different fix.
      setError(errMsg(err, "Could not update rubrics from git."));
    } finally {
      setUpdating(false);
    }
  }

  async function newDraftFrom(type: string) {
    setCreating(true);
    setError(null);
    try {
      const { rubric } = await getRubric(addr, type);
      const res = await saveDraft(addr, { documentType: rubric.documentType, content: rubric });
      navigate(`/drafts/${res.id}`);
    } catch (err) {
      setError(errMsg(err, "Could not create a draft from the committed rubric."));
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <CenterMessage>
        <Spinner label="Loading rubrics…" />
      </CenterMessage>
    );
  }

  return (
    <div>
      <h1>Rubrics</h1>
      {error && <Alert kind="error">{error}</Alert>}

      {/* --- Drafts --- */}
      {canEdit ? (
        <section className="card">
          <div className="row">
            <h2 style={{ margin: 0 }}>Your drafts</h2>
            <button className="primary right" onClick={() => void newBlankDraft()} disabled={creating}>
              {creating ? "Creating…" : "New blank draft"}
            </button>
          </div>
          <p className="muted small">
            Editable working copies. They can never judge a real document — promote
            one by exporting its JSON and committing it to git.
          </p>

          {drafts && drafts.length === 0 && (
            <p className="muted">No drafts yet. Create a blank one, or start from a committed rubric below.</p>
          )}

          {drafts && drafts.length > 0 && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Document type</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {drafts.map((d) => (
                    <tr key={d.id}>
                      <td className="mono">{d.documentType}</td>
                      <td>
                        <span className={`badge ${d.status === "validated" ? "ok" : "neutral"}`}>{d.status}</span>
                      </td>
                      <td className="small muted">{dateTime(d.updatedAt)}</td>
                      <td>
                        <button className="small" onClick={() => navigate(`/drafts/${d.id}`)}>
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <Alert kind="info">
          Your role can view committed rubrics but not edit drafts. Draft editing
          requires the <code>rubric:edit</code> permission.
        </Alert>
      )}

      {/* --- Committed --- */}
      <section className="card">
        <div className="row">
          <h2 style={{ margin: 0 }}>Committed rubrics</h2>
          {canEdit && (
            <button className="right" onClick={() => void pullRelease()} disabled={updating}>
              {updating ? "Updating…" : "Update from git"}
            </button>
          )}
        </div>
        <p className="muted small">
          Live, git-backed, read-only. Click to view. "Update from git" pulls the
          released rubric set into this agent — it is how a rubric committed in one
          sandbox reaches the others.
        </p>

        {update && <UpdateResult result={update} />}

        {committed && committed.length === 0 && <p className="muted">No committed rubrics on this agent.</p>}

        {committed && committed.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Version</th>
                  <th>Criteria</th>
                  <th>Recipe</th>
                  <th>Hash</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {committed.map((r) => (
                  <tr key={r.documentType}>
                    <td>{r.displayName}</td>
                    <td className="mono">{r.documentType}</td>
                    <td>{r.version}</td>
                    <td>{r.criteriaCount}</td>
                    <td>{r.hasRecipe ? "yes" : "—"}</td>
                    <td className="mono small muted">{r.hash.slice(0, 10)}</td>
                    <td>
                      <div className="row" style={{ gap: "0.4rem", flexWrap: "nowrap" }}>
                        <button
                          className="small"
                          onClick={() => navigate(`/rubrics/committed/${encodeURIComponent(r.documentType)}`)}
                        >
                          View
                        </button>
                        {canEdit && (
                          <button
                            className="small"
                            onClick={() => void newDraftFrom(r.documentType)}
                            disabled={creating}
                          >
                            New draft
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * What a release pull did.
 *
 * "Up to date" is reported as plainly as a change. Showing a success tick after
 * a no-op would let someone believe they had picked up a rubric that is still
 * sitting unreleased on a branch — the two outcomes look identical from the
 * button, so the UI has to separate them.
 */
function UpdateResult({ result }: { result: RubricUpdateResult }) {
  const moved = result.changed.filter((c) => c.change !== "unchanged");

  if (result.upToDate) {
    return (
      <Alert kind="info">
        Already on the released rubric set — nothing changed.{" "}
        <span className="mono small">
          {result.ref} @ {result.refCommit.slice(0, 8)}
        </span>
      </Alert>
    );
  }

  return (
    <div className="alert ok" style={{ background: "var(--ok-bg)", borderColor: "var(--ok)" }}>
      <div>
        <strong>
          Updated {moved.length} rubric{moved.length === 1 ? "" : "s"} from{" "}
          <span className="mono">{result.ref}</span> @{" "}
          <span className="mono">{result.refCommit.slice(0, 8)}</span>
        </strong>
      </div>
      <div className="small" style={{ marginTop: "0.35rem" }}>
        {moved.map((c) => (
          <div key={c.documentType} className="mono">
            {c.change === "added" ? "+ " : c.change === "removed" ? "− " : "~ "}
            {c.documentType} <span className="muted">({c.change})</span>
            {c.change === "updated" && c.fromHash && c.toHash && (
              <span className="muted">
                {" "}
                {c.fromHash.slice(0, 8)} → {c.toHash.slice(0, 8)}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="small muted" style={{ marginTop: "0.35rem" }}>
        Rubric set {result.fromSetHash.slice(0, 8)} → {result.toSetHash.slice(0, 8)}. This agent now
        judges against the released standard; the change is recorded in custody.
      </div>
    </div>
  );
}

function errMsg(err: unknown, fallback: string): string {
  if (err instanceof ApiError || err instanceof NetworkError) return err.message;
  return fallback;
}
