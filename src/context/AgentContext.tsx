// src/context/AgentContext.tsx
//
// The selected agent for this session. We store the agent's stable GUID (in
// sessionStorage so a refresh keeps the selection) and resolve GUID -> live
// address through Discovery. The address is a LEASE — never persisted, always
// re-resolved. If a selected agent falls out of the registry (lease expired),
// we mark it `stale` and the UI prompts a re-pick rather than firing calls into
// a dead address.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { resolveAgent } from "../api/client";
import type { Agent } from "../api/types";

type AgentStatus = "none" | "resolving" | "ready" | "stale" | "error";

interface AgentContextValue {
  /** The resolved agent, with a live address. Null until one is selected. */
  agent: Agent | null;
  status: AgentStatus;
  error: string | null;
  /** Select an agent (from the picker's already-resolved card). */
  select: (agent: Agent) => void;
  /** Drop the selection (e.g. on logout or when stale). */
  clear: () => void;
  /** Re-resolve the stored GUID; flips to `stale` if it's gone from Discovery. */
  refresh: () => Promise<void>;
}

const GUID_KEY = "qms.agentGuid";

const AgentContext = createContext<AgentContextValue | null>(null);

export function AgentProvider({ children }: { children: ReactNode }) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [status, setStatus] = useState<AgentStatus>("none");
  const [error, setError] = useState<string | null>(null);

  const select = useCallback((next: Agent) => {
    try {
      sessionStorage.setItem(GUID_KEY, next.guid);
    } catch {
      // memory-only is fine
    }
    setAgent(next);
    setStatus("ready");
    setError(null);
  }, []);

  const clear = useCallback(() => {
    try {
      sessionStorage.removeItem(GUID_KEY);
    } catch {
      // ignore
    }
    setAgent(null);
    setStatus("none");
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    let guid: string | null = null;
    try {
      guid = sessionStorage.getItem(GUID_KEY);
    } catch {
      guid = null;
    }
    if (!guid) {
      setStatus("none");
      return;
    }
    setStatus("resolving");
    setError(null);
    try {
      const resolved = await resolveAgent(guid);
      if (!resolved) {
        // 404: the lease expired. Keep the GUID off — the user must re-pick.
        setAgent(null);
        setStatus("stale");
        return;
      }
      setAgent(resolved);
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not resolve the selected agent.");
    }
  }, []);

  // On mount, if a GUID was persisted from a prior view, resolve it.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AgentContextValue>(
    () => ({ agent, status, error, select, clear, refresh }),
    [agent, status, error, select, clear, refresh],
  );

  return <AgentContext value={value}>{children}</AgentContext>;
}

export function useAgent(): AgentContextValue {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error("useAgent must be used within an AgentProvider");
  return ctx;
}
