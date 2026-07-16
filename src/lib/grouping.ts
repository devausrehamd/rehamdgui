// src/lib/grouping.ts
//
// Organise agents into the deployments they claim to belong to, and check that
// claim against something an operator cannot mistype.
//
// The distinction this file exists to preserve:
//
//   `group`         - a LABEL. Somebody typed QMS_AGENT_GROUP. It says what the
//                     deployment is meant to be. It can be wrong.
//   `rubricSetHash` - a FACT. The agent hashed the rubric files it actually
//                     loaded. Two agents agreeing here serve identical rubrics.
//   `gitCommit`     - only HEAD as it was when the process STARTED. It says
//                     nothing about uncommitted changes, and two instances
//                     running identical code can advertise different commits.
//                     Informational; never treat it as proof.
//
// So when a group's agents disagree on rubricSetHash, the label is lying: you
// would steer a rubric on one and run the other against different files. The
// GUI must say so rather than draw a tidy box around them.
//
// No decisions are made here — this only arranges what Discovery reported.

import type { Agent } from "../api/types";

export interface AgentGroup {
  /** The declared group name, or null for agents that declare none. */
  name: string | null;
  agents: Agent[];
  /** True when every agent here reports the SAME rubricSetHash — i.e. the
   *  group label is corroborated by the rubric files themselves. */
  rubricsAgree: boolean;
  /** True when a hash is missing somewhere, so agreement cannot be established.
   *  Unknown is not agreement, and is reported separately from disagreement. */
  rubricsUnknown: boolean;
  /** Distinct short commits present. More than one is worth showing: it usually
   *  means one instance was started before a change landed. */
  commits: string[];
}

/** Group agents by their declared group; ungrouped agents each stand alone. */
export function groupAgents(agents: Agent[]): AgentGroup[] {
  const byName = new Map<string, Agent[]>();
  const ungrouped: Agent[] = [];

  for (const a of agents) {
    if (a.group) {
      const list = byName.get(a.group) ?? [];
      list.push(a);
      byName.set(a.group, list);
    } else {
      ungrouped.push(a);
    }
  }

  const groups: AgentGroup[] = [];
  for (const [name, list] of byName) groups.push(describe(name, list));
  // Ungrouped agents are their own single-member groups, rendered without a
  // heading — an agent that declares nothing should not be dressed up as a
  // deployment it never claimed to be part of.
  for (const a of ungrouped) groups.push(describe(null, [a]));

  groups.sort((x, y) => (x.name ?? "￿").localeCompare(y.name ?? "￿"));
  return groups;
}

function describe(name: string | null, agents: Agent[]): AgentGroup {
  const hashes = agents.map((a) => a.rubricSetHash);
  const known = hashes.filter((h): h is string => typeof h === "string" && h.length > 0);
  const rubricsUnknown = known.length !== agents.length;
  const distinct = new Set(known);
  const commits = Array.from(new Set(agents.map((a) => a.gitCommit.slice(0, 8))));

  return {
    name,
    agents,
    // Agreement requires every agent to have reported a hash AND all of them to
    // match. A single agent trivially agrees with itself.
    rubricsAgree: !rubricsUnknown && distinct.size <= 1,
    rubricsUnknown,
    commits,
  };
}
