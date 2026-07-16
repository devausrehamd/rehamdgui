// src/pages/LoginPage.tsx — userId + password against the ID Server.

import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError, NetworkError } from "../api/client";
import { Alert } from "../components/ui";

export function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already logged in (e.g. reopened tab) — go straight to the picker.
  if (isAuthenticated) {
    navigate("/agents", { replace: true });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(userId.trim(), password);
      navigate("/agents", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Invalid credentials.");
      } else if (err instanceof ApiError || err instanceof NetworkError) {
        setError(err.message);
      } else {
        setError("Login failed. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={onSubmit}>
        <h1>QMS sign in</h1>
        <p className="muted small">
          Authenticate against the ID Server. Your token is held for this session
          only and sent to the agent you select.
        </p>

        {error && <Alert kind="error">{error}</Alert>}

        <div className="field">
          <label htmlFor="userId">User ID</label>
          <input
            id="userId"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        <button className="primary" type="submit" disabled={busy || !userId || !password} style={{ width: "100%" }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
