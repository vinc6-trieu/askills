import type { PreparedAgentTask } from "../core/agent-task.js";

export function routingContext(prepared: PreparedAgentTask): string {
  return [
    `askills profiles: ${prepared.resolution.profiles.join(", ")}`,
    ...(prepared.paths.length > 0 ? [`Task paths (relative to project root): ${JSON.stringify(prepared.paths)}`] : [])
  ].join("\n");
}
