import {
  runAgent
} from "../core/agent-runner.js";

import {
  getAgentAdapter
} from "../adapters/index.js";

import type {
  AgentId
} from "../adapters/types.js";
import type { RoutingOptions } from "../core/task-routing.js";

interface RunOptions extends RoutingOptions {
  nonInteractive?: boolean;
  dryRun?: boolean;
}

export async function runCommand(
  agent: string,
  task: string,
  options: RunOptions
): Promise<void> {

  if (
    agent !== "codex" &&
    agent !== "claude"
  ) {
    throw new Error(
      [
        `Unsupported agent: ${agent}`,
        "",
        "Supported agents:",
        "  codex",
        "  claude"
      ].join("\n")
    );
  }

  const adapter =
    getAgentAdapter(
      agent as AgentId
    );

  await runAgent(
    adapter,
    task,
    {
      ...options,
      dryRun:
        options.dryRun,

      nonInteractive:
        options.nonInteractive
    }
  );
}
