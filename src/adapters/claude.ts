import type {
  AgentAdapter,
  AgentInvocation,
  AgentRunOptions
} from "./types.js";

import type {
  PreparedAgentTask
} from "../core/agent-task.js";

export const claudeAdapter:
  AgentAdapter = {

  id: "claude",

  displayName: "Claude Code",

  binary: "claude",

  createInvocation(
    prepared:
      PreparedAgentTask,

    options:
      AgentRunOptions
  ): AgentInvocation {

    const routingHint = [
      "askills has identified the following project skills",
      "as especially relevant to this task:",
      "",
      ...prepared.activeSkills.map(
        skill =>
          `- ${skill.name}`
      ),
      "",
      "Use these discovered skills when they are relevant.",
      "Do not force a skill when it does not apply."
    ].join("\n");

    const args = [
      "--append-system-prompt",
      routingHint
    ];

    if (
      options.nonInteractive
    ) {
      args.push("-p");
    }

    args.push(
      prepared.task
    );

    const preview = [
      "claude",
      "",
      routingHint,
      "",
      "Task:",
      prepared.task
    ].join("\n");

    return {
      args,
      preview
    };
  }
};
