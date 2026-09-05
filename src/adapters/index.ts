import {
  codexAdapter
} from "./codex.js";

import {
  claudeAdapter
} from "./claude.js";

import type {
  AgentAdapter,
  AgentId
} from "./types.js";

const adapters =
  new Map<
    AgentId,
    AgentAdapter
  >([
    [
      "codex",
      codexAdapter
    ],

    [
      "claude",
      claudeAdapter
    ]
  ]);

export function getAgentAdapter(
  id: AgentId
): AgentAdapter {

  const adapter =
    adapters.get(id);

  if (!adapter) {
    throw new Error(
      `Unsupported agent: ${id}`
    );
  }

  return adapter;
}

export function listAgentAdapters():
  AgentAdapter[] {

  return [
    ...adapters.values()
  ];
}
