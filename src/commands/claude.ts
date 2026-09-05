import {
  runAgent
} from "../core/agent-runner.js";

import {
  claudeAdapter
} from "../adapters/claude.js";

interface ClaudeOptions {
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
      dryRun:
        options.dryRun,

      nonInteractive:
        options.print
    }
  );
}
