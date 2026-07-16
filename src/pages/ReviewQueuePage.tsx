// src/pages/ReviewQueuePage.tsx
//
// Drafts awaiting a human decision. Every generated document that could not be
// auto-approved - a failed gate, a score below threshold, a trajectory miss -
// lands here for a reviewer to disposition. Approval is a human act; the agent
// only ever produces a pending draft.

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, NetworkError, listPendingDrafts } from "../api/client";
import type { PendingDraft } from "../api/types";
import { useAgent } from "../context/AgentContext";
import { useAuth } from "../context/AuthContext";
import { dateTime } from "../lib/format";
import { Alert, CenterMessage, Spinner } from "../components/ui";

export function ReviewQueuePage() {
  const { agent } = useAgent();
  const { can } = useAuth();
  const navigate = useNavigate();
  const addr = agent!.address;

  const [drafts, setDrafts] = useState<PendingDraft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDrafts(await listPendingDrafts(addr));
    } catch (err) {
      setError(err instanceof ApiError || err instanceof NetworkError ? err.message : "Could not load the review queue.");
    } finally {
      setLoading(false);
    }
  }, [addr]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <CenterMessage>
        <Spinner label="Loading review queue…" />
      </CenterMessage>
    );
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: "0.5rem" }}>
        <h1 style={{ margin: 0 }}>Review queue</h1>
        <button className="small right" onClick={() => void load()}>
          Refresh
        </button>
      </div>
      <p className="muted small">
        Generated documents awaiting a human decision. A draft is here because the
        agent would not approve it on its own — open one to see why.
      </p>

      {!can("draft:approve") && (
        <Alert kind="info">
          Your role can view drafts but not disposition them. Approving, rejecting, or
          requesting a rerun needs the <code>draft:approve</code> permission
          (reviewer or admin).
        </Alert>
      )}

      {error && <Alert kind="error">{error}</Alert>}

      {drafts && drafts.length === 0 && (
        <CenterMessage>Nothing awaiting review. Generated drafts that need a decision appear here.</CenterMessage>
      )}

      {drafts && drafts.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Document type</th>
                <th>Subject</th>
                <th>Status</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {drafts.map((d) => (
                <tr key={d.setId}>
                  <td className="mono">{d.documentType}</td>
                  <td>{d.subject ?? <span className="muted">—</span>}</td>
                  <td>
                    <span className="badge warn">{d.status}</span>
                  </td>
                  <td className="small muted">{dateTime(d.createdAt)}</td>
                  <td>
                    {d.correlationId ? (
                      <button className="small" onClick={() => navigate(`/review/${encodeURIComponent(d.correlationId!)}`)}>
                        Review
                      </button>
                    ) : (
                      <span className="small muted" title="This set has no documents recorded.">no documents</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
