// src/pages/RunsPage.tsx
//
// Every run that went through this agent's graph. The way in to asking "why did
// this score badly" — pick a run, read what each stage was given and returned.

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, NetworkError, listRuns } from "../api/client";
import type { RunSummary } from "../api/types";
import { useAgent } from "../context/AgentContext";
import { ago, dateTime } from "../lib/format";
import { Alert, CenterMessage, Spinner } from "../components/ui";

export function RunsPage() {
  const { agent } = useAgent();
  const navigate = useNavigate();
  const addr = agent!.address;

  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [scope, setScope] = useState<"own" | "all">("own");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listRuns(addr);
      setRuns(res.runs);
      setScope(res.scope);
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof NetworkError
          ? err.message
          : "Could not load runs from the agent.",
      );
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
        <Spinner label="Loading runs…" />
      </CenterMessage>
    );
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: "0.5rem" }}>
        <h1 style={{ margin: 0 }}>Runs</h1>
        <button className="small right" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      <p className="muted small">
        Every request that went through this agent's graph, with what each stage was
        given and what it returned. Open one to see where a low score came from —
        whether the retrieval missed, or the model ignored what it was handed.
      </p>

      {/* The server decides scope; saying so avoids the reading that this agent
          has only ever run what you personally ran. */}
      {scope === "own" && (
        <Alert kind="info">
          Showing <strong>your</strong> runs only. A run's trace holds the documents
          retrieved under that user's access labels, so reading someone else's needs{" "}
          <code>audit:read</code>.
        </Alert>
      )}

      {error && <Alert kind="error">{error}</Alert>}

      {runs && runs.length === 0 && (
        <CenterMessage>
          No runs recorded yet. Ask this agent something and it will appear here.
        </CenterMessage>
      )}

      {runs && runs.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Run</th>
                <th>Steps</th>
                <th>Duration</th>
                <th>Outcome</th>
                <th>Mode</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.correlationId}>
                  <td className="small" title={dateTime(r.startedAt)}>
                    {ago(r.finishedAt)}
                  </td>
                  <td className="mono small">{r.correlationId.slice(0, 16)}</td>
                  <td>{r.steps}</td>
                  <td className="small">{(r.totalLatencyMs / 1000).toFixed(1)}s</td>
                  <td>
                    {r.errors > 0 ? (
                      <span className="badge error">
                        {r.errors} failed step{r.errors === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <span className="badge ok">ok</span>
                    )}
                  </td>
                  <td>
                    {r.mode === "debug" ? (
                      <span className="badge coinflip">debug</span>
                    ) : (
                      <span className="small muted">{r.mode ?? "—"}</span>
                    )}
                  </td>
                  <td>
                    <button
                      className="small"
                      onClick={() => navigate(`/runs/${encodeURIComponent(r.correlationId)}`)}
                    >
                      Trace
                    </button>
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
