// src/components/ui.tsx — tiny presentational helpers shared across screens.

import type { ReactNode } from "react";
import type { Health } from "../api/types";

export function HealthBadge({ health }: { health: Health }) {
  const cls = health === "healthy" ? "ok" : health === "degraded" ? "warn" : "neutral";
  return <span className={`badge ${cls}`}>{health}</span>;
}

/** Gate → colour. Purely cosmetic; the gate's MEANING is enforced server-side. */
export function GateBadge({ gate }: { gate: string }) {
  const cls =
    gate === "critical" ? "error" : gate === "major" ? "warn" : gate === "minor" ? "neutral" : "neutral";
  return <span className={`badge ${cls}`}>{gate}</span>;
}

export function Alert({
  kind = "info",
  children,
}: {
  kind?: "error" | "warn" | "info";
  children: ReactNode;
}) {
  return <div className={`alert ${kind}`}>{children}</div>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span>
      <span className="spin" /> {label ?? "Loading…"}
    </span>
  );
}

export function CenterMessage({ children }: { children: ReactNode }) {
  return <div className="center-msg">{children}</div>;
}
