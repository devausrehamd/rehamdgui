// src/components/guards.tsx — route guards.
//
// RequireAuth: no session => login. RequireAgent: session but no selected
// (resolved) agent => agent picker. Neither is a security boundary — the server
// enforces every call. They just keep the UI from rendering a screen that has
// no data to show.

import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useAgent } from "../context/AgentContext";
import { Alert, CenterMessage, Spinner } from "./ui";

export function RequireAuth() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

export function RequireAgent() {
  const { agent, status } = useAgent();

  // While re-resolving a persisted GUID after a page refresh.
  if (status === "resolving") {
    return (
      <CenterMessage>
        <Spinner label="Resolving selected agent…" />
      </CenterMessage>
    );
  }

  if (status === "stale") {
    return (
      <div>
        <Alert kind="warn">
          The agent you had selected is no longer registered with Discovery (its
          lease expired). Pick another to continue.
        </Alert>
        <Navigate to="/agents" replace />
      </div>
    );
  }

  if (!agent) {
    return <Navigate to="/agents" replace />;
  }

  return <Outlet />;
}
