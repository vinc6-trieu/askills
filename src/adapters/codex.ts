import type {
  AgentAdapter,
  AgentInvocation,
  AgentRunOptions
} from "./types.js";

import type {
  PreparedAgentTask
} from "../core/agent-task.js";

export const codexAdapter:
  AgentAdapter = {

  id: "codex",

  displayName: "Codex",

  binary: "codex",

  createInvocation(
    prepared:
      PreparedAgentTask,

    options:
      AgentRunOptions
  ): AgentInvocation {

    const markers =
      prepared.activeSkills
        .map(
          skill =>
            `$${skill.name}`
        )
        .join(" ");

    const prompt = [
      markers,
      "",
      prepared.task
    ]
      .filter(Boolean)
      .join("\n");

    if (
      options.nonInteractive
    ) {
      return {
        args: [
          "exec",
          prompt
        ],

        preview: [
          "codex exec",
          "",
          prompt
        ].join("\n")
      };
    }

    return {
      args: [
        prompt
      ],

      preview: [
        "codex",
        "",
        prompt
      ].join("\n")
    };
  }
};
