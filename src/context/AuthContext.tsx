// src/context/AuthContext.tsx
//
// Holds the login session and exposes it to the tree. The token lives in the
// client module (memory + sessionStorage); this context is the React-facing
// view of it plus the login/logout actions.
//
// Permission checks here are UI CONVENIENCE ONLY. `can()` decides which
// controls to SHOW. The Agent enforces every action regardless — a user who
// hides a button has changed nothing about what the server allows.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getSession, login as apiLogin, logout as apiLogout, setUnauthorizedHandler } from "../api/client";
import type { Role, Session } from "../api/types";

interface AuthContextValue {
  session: Session | null;
  isAuthenticated: boolean;
  login: (userId: string, password: string) => Promise<void>;
  logout: () => void;
  /** UI-only permission hint. The server is the real gate. */
  can: (permission: Permission) => boolean;
}

/** The permissions the GUI gates controls on. Extend as slices grow. */
export type Permission = "draft:view-any" | "rubric:edit" | "draft:approve";

// Convenience mapping for SHOWING controls. Mirrors the server's intent, but is
// never authoritative — admin has a wildcard server-side; here we approximate.
// draft:approve is reviewer + admin (engineer drafts, reviewer approves): the
// disposition controls are hidden for anyone else, but the server enforces it
// AND enforces APPROVER != AUTHOR on top, which no client check can see.
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: ["draft:view-any", "rubric:edit", "draft:approve"],
  reviewer: ["draft:view-any", "draft:approve"],
  engineer: ["draft:view-any"],
  service: [],
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => getSession());

  // Wire the client's 401 handler to clear our React state. The client already
  // cleared its own storage; this keeps the tree in sync and triggers redirect.
  useEffect(() => {
    setUnauthorizedHandler(() => setSession(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (userId: string, password: string) => {
    const s = await apiLogin(userId, password);
    setSession(s);
  }, []);

  const logout = useCallback(() => {
    apiLogout();
    setSession(null);
  }, []);

  const can = useCallback(
    (permission: Permission) => {
      if (!session) return false;
      return ROLE_PERMISSIONS[session.role]?.includes(permission) ?? false;
    },
    [session],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ session, isAuthenticated: session !== null, login, logout, can }),
    [session, login, logout, can],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
