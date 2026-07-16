// src/components/Layout.tsx
//
// The app shell: a persistent header showing WHO is logged in and — crucially —
// WHICH agent is selected (name + short commit). Rubrics are per-agent, so the
// user must always be able to see which agent they are editing.

import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useAgent } from "../context/AgentContext";
import { shortCommit } from "../lib/format";
import { HealthBadge } from "./ui";

export function Layout() {
  const { session, logout } = useAuth();
  const { agent, clear } = useAgent();
  const navigate = useNavigate();

  function onLogout() {
    clear();
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <>
      <header className="app-header">
        <span className="brand">QMS</span>
        <nav>
          <NavLink to="/agents">Agents</NavLink>
          {agent && <NavLink to="/rubrics">Rubrics</NavLink>}
        </nav>
        <span className="spacer" />

        {agent && (
          <span className="agent-chip" title={`GUID ${agent.guid}`}>
            <strong>{agent.name}</strong>
            <span className="mono muted">{shortCommit(agent.gitCommit)}</span>
            <HealthBadge health={agent.health} />
          </span>
        )}

        {session && (
          <span className="small muted">
            {session.userId} · {session.role}
          </span>
        )}
        <button className="small" onClick={onLogout}>
          Log out
        </button>
      </header>

      <main className="container">
        <Outlet />
      </main>
    </>
  );
}
