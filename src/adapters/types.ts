import type {
  PreparedAgentTask
} from "../core/agent-task.js";

export type AgentId =
  | "codex"
  | "claude";

export interface AgentRunOptions {
  dryRun?: boolean;

  /**
   * Codex:
   *   codex exec
   *
   * Claude:
   *   claude -p
   */
  nonInteractive?: boolean;
}

export interface AgentInvocation {
  args: string[];

  /**
   * Human-readable representation used by
   * --dry-run.
   */
  preview: string;
}

export interface AgentAdapter {
  id: AgentId;

  displayName: string;

  binary: string;

  createInvocation(
    prepared: PreparedAgentTask,
    options: AgentRunOptions
  ): AgentInvocation;
}
