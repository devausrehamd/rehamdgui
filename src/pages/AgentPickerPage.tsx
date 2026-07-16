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
import { groupAgents, type AgentGroup } from "../lib/grouping";
import { Alert, CenterMessage, HealthBadge, ModeBadge, Spinner } from "../components/ui";

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
          {groupAgents(agents).map((g) => (
            <GroupCard
              key={g.name ?? g.agents[0]?.guid}
              group={g}
              selectedGuid={selected?.guid}
              onChoose={choose}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One deployment: the agents that declare the same group, listed together so a
 * production/debug pair reads as a pair.
 *
 * The heading is the label somebody configured. The line under it is the part
 * that matters — whether those agents actually serve the same rubric files. A
 * tidy box drawn around two agents that disagree would be worse than no box at
 * all: it would let you steer a rubric on debug while production runs against
 * different files, believing the two were linked.
 */
function GroupCard({
  group,
  selectedGuid,
  onChoose,
}: {
  group: AgentGroup;
  selectedGuid?: string;
  onChoose: (a: Agent) => void;
}) {
  const grouped = group.name !== null;
  const many = group.agents.length > 1;

  return (
    <div className="card" style={{ marginBottom: 0 }}>
      {grouped && (
        <div style={{ marginBottom: "0.6rem" }}>
          <div className="row" style={{ gap: "0.5rem" }}>
            <h2 style={{ margin: 0 }}>{group.name}</h2>
            <span className="badge neutral">
              {group.agents.length} agent{many ? "s" : ""}
            </span>
            {group.rubricsAgree && many && (
              <span className="badge ok" title="Every agent in this group reports the same rubric-set fingerprint.">
                same rubrics ✓
              </span>
            )}
          </div>

          {/* The label claims these belong together; the fingerprint decides
              whether they do. Disagreement is a misconfiguration, not a detail. */}
          {!group.rubricsAgree && !group.rubricsUnknown && many && (
            <div className="alert error" style={{ margin: "0.5rem 0 0" }}>
              <strong>These agents do not serve the same rubrics.</strong> They are
              labelled as one deployment, but their committed rubric files differ — a
              change steered on one will not apply to the other. Treat the grouping as
              wrong until the rubric fingerprints match.
            </div>
          )}
          {group.rubricsUnknown && many && (
            <div className="alert warn" style={{ margin: "0.5rem 0 0" }}>
              At least one agent reported no rubric fingerprint, so it cannot be
              confirmed that these serve the same rubrics. Unknown is not agreement.
            </div>
          )}
          {group.commits.length > 1 && (
            <div className="small muted" style={{ marginTop: "0.35rem" }}>
              Different commits here ({group.commits.join(", ")}). An agent reports the
              commit that was checked out when it started, so this can simply mean one
              was restarted at a different time — the rubric fingerprint above is what
              decides whether they match.
            </div>
          )}
        </div>
      )}

      <div className="stack">
        {group.agents.map((a) => {
          const isSelected = selectedGuid === a.guid;
          return (
            <div
              key={a.guid}
              className="row"
              style={{
                paddingTop: grouped ? "0.6rem" : undefined,
                borderTop: grouped ? "1px solid var(--border)" : undefined,
              }}
            >
              <div>
                <div className="row" style={{ gap: "0.5rem" }}>
                  <strong>{a.name}</strong>
                  <ModeBadge mode={a.mode} />
                  <HealthBadge health={a.health} />
                  {isSelected && <span className="badge ok">selected</span>}
                </div>
                {a.mode === "debug" && (
                  <div className="small" style={{ color: "var(--coinflip)" }}>
                    Debug agent — may evaluate against uncommitted draft rubrics. Anything
                    it produces is provisional and cannot be approved.
                  </div>
                )}
                <div className="small muted">
                  <span className="mono">{shortCommit(a.gitCommit)}</span>
                  {" · "}
                  last seen {ago(a.lastSeen)}
                  {a.capabilities.length > 0 && <> · {a.capabilities.join(", ")}</>}
                </div>
                <div className="small muted mono">
                  {a.address}
                  {a.rubricSetHash && <> · rubrics {a.rubricSetHash.slice(0, 8)}</>}
                </div>
              </div>
              <button className="primary right" onClick={() => onChoose(a)}>
                {isSelected ? "Re-enter" : "Select"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
