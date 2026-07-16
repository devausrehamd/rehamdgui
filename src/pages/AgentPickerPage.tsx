// src/pages/AgentPickerPage.tsx
//
// Log in, then pick an agent. The picker lists agents from Discovery with the
// facts that matter for traceability: friendly name, short git commit (which
// codebase), health, and how long since it was last seen (so a stale one is
// visible). Selecting one stores its GUID in session context and enters the
// rubric workspace. Agents are DISCOVERED — never hardcoded.

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listAgents, ApiError, NetworkError } from "../api/client";
import type { Agent } from "../api/types";
import { useAgent } from "../context/AgentContext";
import { ago, shortCommit } from "../lib/format";
import { Alert, CenterMessage, HealthBadge, Spinner } from "../components/ui";

export function AgentPickerPage() {
  const { agent: selected, select } = useAgent();
  const navigate = useNavigate();
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAgents(await listAgents());
    } catch (err) {
      if (err instanceof ApiError || err instanceof NetworkError) setError(err.message);
      else setError("Could not load agents from Discovery.");
      setAgents(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll-on-load (no live streaming in this slice — §12). Refresh is manual.
  useEffect(() => {
    void load();
  }, [load]);

  function choose(a: Agent) {
    select(a);
    navigate("/rubrics");
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: "1rem" }}>
        <h1 style={{ margin: 0 }}>Select an agent</h1>
        <button className="small right" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <p className="muted small">
        Each agent is a running instance of the QMS codebase. Rubrics are
        per-agent, so pick the one whose commit you intend to edit against.
      </p>

      {error && <Alert kind="error">{error}</Alert>}

      {loading && !agents && (
        <CenterMessage>
          <Spinner label="Loading agents from Discovery…" />
        </CenterMessage>
      )}

      {agents && agents.length === 0 && (
        <CenterMessage>
          No agents are registered with Discovery right now. Start an agent, then
          Refresh.
        </CenterMessage>
      )}

      {agents && agents.length > 0 && (
        <div className="stack">
          {agents.map((a) => {
            const isSelected = selected?.guid === a.guid;
            return (
              <div className="card" key={a.guid} style={{ marginBottom: 0 }}>
                <div className="row">
                  <div>
                    <div className="row" style={{ gap: "0.5rem" }}>
                      <strong>{a.name}</strong>
                      <HealthBadge health={a.health} />
                      {isSelected && <span className="badge ok">selected</span>}
                    </div>
                    <div className="small muted">
                      <span className="mono">{shortCommit(a.gitCommit)}</span>
                      {" · "}
                      last seen {ago(a.lastSeen)}
                      {a.capabilities.length > 0 && <> · {a.capabilities.join(", ")}</>}
                    </div>
                    <div className="small muted mono">{a.address}</div>
                  </div>
                  <button className="primary right" onClick={() => choose(a)}>
                    {isSelected ? "Re-enter" : "Select"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
