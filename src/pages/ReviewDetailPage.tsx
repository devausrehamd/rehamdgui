// src/pages/ReviewDetailPage.tsx
//
// One draft, for a human to disposition. The reviewer needs to see WHY the
// agent would not approve it, read the document, and decide: approve, reject,
// or send it back for a rerun.
//
// Everything shown is the SERVER's verdict - score, gate, trajectory,
// per-criterion pass/fail. The GUI displays; it never recomputes. And every
// control here is UX only: the disposition endpoint enforces draft:approve,
// enforces APPROVER != AUTHOR, and refuses approval on a debug agent, whatever
// the buttons allow.

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, NetworkError, dispositionDraft, getReview } from "../api/client";
import type { Disposition, DraftCriterionResults, ReviewDetail, ReviewDocument } from "../api/types";
import { useAgent } from "../context/AgentContext";
import { useAuth } from "../context/AuthContext";
import { pct } from "../lib/format";
import { Alert, CenterMessage, Spinner } from "../components/ui";

export function ReviewDetailPage() {
  const { correlationId = "" } = useParams();
  const { agent } = useAgent();
  const { can } = useAuth();
  const navigate = useNavigate();
  const addr = agent!.address;

  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setDetail(await getReview(addr, correlationId));
    } catch (err) {
      setError(err instanceof ApiError || err instanceof NetworkError ? err.message : "Could not load the draft.");
    }
  }, [addr, correlationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(decision: Disposition) {
    setBusy(true);
    setActionError(null);
    try {
      const res = await dispositionDraft(addr, correlationId, { decision, reason: reason.trim() || undefined });
      setDone(`Recorded: ${res.decision} → ${res.status}.`);
    } catch (err) {
      // The server's message is the point here: "The approver must not be the
      // author", "debug agent cannot approve", "not permitted" each read very
      // differently and the reviewer needs to see which fired.
      setActionError(err instanceof ApiError || err instanceof NetworkError ? err.message : "Disposition failed.");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!detail) {
    return (
      <CenterMessage>
        <Spinner label="Loading draft…" />
      </CenterMessage>
    );
  }

  const canApprove = can("draft:approve");
  // The rubric result is per document; a set shares one, so read the first.
  const cr = detail.documents[0]?.criterionResults ?? null;

  return (
    <div>
      <div className="row" style={{ marginBottom: "0.5rem" }}>
        <button className="small" onClick={() => navigate("/review")}>
          ← Queue
        </button>
        <span className="badge warn right">{detail.status}</span>
      </div>

      <h1>
        Review <span className="mono small muted">{detail.documentType}</span>
      </h1>
      <p className="muted small mono">{detail.correlationId}</p>

      {done ? (
        <Alert kind="info">{done} You can return to the queue.</Alert>
      ) : (
        <>
          <WhyReview cr={cr} />

          {/* --- The documents --- */}
          {detail.documents.map((doc) => (
            <DocumentView key={doc.documentId} doc={doc} />
          ))}

          {/* --- Disposition --- */}
          <section className="card">
            <h2>Decision</h2>
            {!canApprove && (
              <Alert kind="info">
                Your role can view this draft but not disposition it. This needs{" "}
                <code>draft:approve</code> (reviewer or admin).
              </Alert>
            )}
            {actionError && <Alert kind="error">{actionError}</Alert>}

            <div className="field">
              <label htmlFor="reason">Reason (recorded with the decision)</label>
              <textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                style={{ minHeight: "3rem", fontFamily: "var(--sans)" }}
                placeholder="Why you are approving, rejecting, or requesting a rerun…"
              />
            </div>

            <div className="row">
              <button className="primary" disabled={!canApprove || busy} onClick={() => void decide("approve")}>
                Approve
              </button>
              <button className="danger" disabled={!canApprove || busy} onClick={() => void decide("reject")}>
                Reject
              </button>
              <button disabled={!canApprove || busy} onClick={() => void decide("rerun")}>
                Request rerun
              </button>
            </div>
            <p className="muted small" style={{ marginTop: "0.5rem" }}>
              Approval is refused if you are the author, or if this is a debug agent —
              the server enforces both regardless of these buttons.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

/**
 * Why this draft is not auto-approved, stated plainly and first.
 *
 * A reviewer opening a 90%-scoring draft that is still "review required" needs
 * the reason up front, or the high score reads as an approval the system is
 * inexplicably withholding. The reasons are ranked by how decisive they are: a
 * trajectory miss or a critical-gate failure is an auto-fail no score overrides;
 * a below-threshold score is a softer flag.
 */
function WhyReview({ cr }: { cr: DraftCriterionResults | null }) {
  if (!cr) {
    return (
      <Alert kind="warn">
        No rubric result was recorded for this draft, so the agent could not judge it —
        it needs a human decision by default.
      </Alert>
    );
  }

  const reasons: { severity: "error" | "warn"; text: string }[] = [];
  if (cr.trajectory && !cr.trajectory.passed) {
    reasons.push({
      severity: "error",
      text: cr.trajectory.unknown
        ? "Trajectory unknown — no record that the required sources were consulted. Auto-fail."
        : "Trajectory failed — a required source was not consulted (or a forbidden one was). Auto-fail, regardless of score.",
    });
  }
  if (!cr.gatePassed) {
    reasons.push({ severity: "error", text: `Critical gate failed: ${cr.criticalFailures.join(", ")}. Blocks approval regardless of score.` });
  }
  if (cr.primaryFailures.length > 0) {
    reasons.push({ severity: "warn", text: `Primary criteria failed: ${cr.primaryFailures.join(", ")}.` });
  }

  return (
    <section className="card">
      <div className="row">
        <h2 style={{ margin: 0 }}>
          Outcome:{" "}
          {cr.approved ? (
            <span className="badge ok">approved by score</span>
          ) : (
            <span className="badge error">review required</span>
          )}
        </h2>
        <span className="right" style={{ fontSize: "1.3rem", fontWeight: 700 }}>
          {pct(cr.score, 1)}
        </span>
      </div>

      {reasons.length === 0 && cr.reviewRequired && (
        <p className="small muted">The score is below the rubric's approval threshold.</p>
      )}
      {reasons.map((r, i) => (
        <div key={i} className={`alert ${r.severity}`} style={{ marginTop: "0.5rem", marginBottom: 0 }}>
          {r.text}
        </div>
      ))}

      {/* The trajectory findings in full — the specific missing source. */}
      {cr.trajectory && cr.trajectory.findings.length > 0 && (
        <div className="small" style={{ marginTop: "0.6rem" }}>
          {cr.trajectory.findings.map((f, i) => (
            <div key={i} className="issue">
              <span className="badge error">{f.violation.replace(/_/g, " ")}</span>
              <span>
                {f.detail}
                <div className="muted">why it matters: {f.reason}</div>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Per-criterion verdicts + the judge's rationale on each fail. */}
      <div className="table-scroll" style={{ marginTop: "0.75rem" }}>
        <table>
          <thead>
            <tr>
              <th>Criterion</th>
              <th>Verdict</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {cr.perCriterion.map((c) => (
              <tr key={c.id}>
                <td className="mono">{c.id}</td>
                <td>
                  {c.verdict === "pass" ? (
                    <span className="badge ok">pass</span>
                  ) : (
                    <span className="badge error">fail</span>
                  )}
                </td>
                <td className="small">{c.verdict === "fail" ? c.rationale : <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * One document: the human-readable rendering, and the typed rows underneath.
 *
 * Markdown is read-only, for reading. The typed rows are the artifact - and a
 * field the code computes (RPN, a total) is shown locked, because a reviewer
 * editing a computed value would desync it from the inputs it is derived from.
 * Which fields are locked comes from the server, not a guess here.
 */
function DocumentView({ doc }: { doc: ReviewDocument }) {
  const locked = new Set(doc.lockedFields);
  const columns = doc.rows.length > 0 ? Object.keys(doc.rows[0] ?? {}).filter((k) => !k.endsWith("__source")) : [];

  return (
    <section className="card">
      <h3>
        Section <span className="mono">{doc.sectionId}</span>{" "}
        <span className="small muted">
          {doc.rows.length} row{doc.rows.length === 1 ? "" : "s"}
        </span>
      </h3>

      {doc.markdown && (
        <details>
          <summary className="small muted" style={{ cursor: "pointer" }}>
            Rendered document (read-only)
          </summary>
          <pre className="table-scroll" style={{ whiteSpace: "pre-wrap", fontSize: "0.8rem", marginTop: "0.4rem" }}>
            {doc.markdown}
          </pre>
        </details>
      )}

      {columns.length > 0 && (
        <div className="table-scroll" style={{ marginTop: "0.5rem" }}>
          <table>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c}>
                    {c} {locked.has(c) && <span className="badge neutral" title="Computed by code — not editable">locked</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {doc.rows.map((row, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c} className="small">
                      {formatCell(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
