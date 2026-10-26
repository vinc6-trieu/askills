import {
  runAgent
} from "../core/agent-runner.js";

import {
  claudeAdapter
} from "../adapters/claude.js";
import type { RoutingOptions } from "../core/task-routing.js";

interface ClaudeOptions extends RoutingOptions {
  print?: boolean;
  dryRun?: boolean;
}

export async function claudeCommand(
  task: string,
  options: ClaudeOptions
): Promise<void> {

  await runAgent(
    claudeAdapter,
    task,
    {
      ...options,
      dryRun:
        options.dryRun,

      nonInteractive:
        options.print
    }
  );
}
