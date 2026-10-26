import {
  runAgent
} from "../core/agent-runner.js";

import {
  codexAdapter
} from "../adapters/codex.js";
import type { RoutingOptions } from "../core/task-routing.js";

interface CodexOptions extends RoutingOptions {
  exec?: boolean;
  dryRun?: boolean;
}

export async function codexCommand(
  task: string,
  options: CodexOptions
): Promise<void> {

  await runAgent(
    codexAdapter,
    task,
    {
      ...options,
      dryRun:
        options.dryRun,

      nonInteractive:
        options.exec
    }
  );
}
