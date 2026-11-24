import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { runClaudePromptHook } from "../src/commands/claude-hook.js";
import { createRegistryContext } from "../src/core/registry-config.js";
import { registryFingerprint } from "./harness.js";

// These labels grade the skill hint sent to Claude. Conversation quality is
// graded separately, using the same prompts and the rubric in the design doc.
const cases = [
  { id: "explicit-vi", clarify: true, prompt: "Giúp tôi làm rõ yêu cầu này trước: thêm retry khi runner lỗi." },
  { id: "explicit-en", clarify: true, prompt: "Help me clarify the requirements before adding retries to the runner." },
  { id: "retry-open", clarify: true, prompt: "Thêm retry khi runner lỗi." },
  { id: "retry-specified", clarify: false, prompt: "Thêm retry đúng một lần nếu chưa khởi động được runner. Nếu lệnh đã chạy rồi thoát với mã lỗi thì trả lỗi ngay." },
  { id: "import-open", clarify: true, prompt: "Khi import gặp mã học sinh trùng, xử lý giúp tôi để người dùng tiếp tục được." },
  { id: "import-specified", clarify: false, prompt: "Khi import gặp mã học sinh trùng, bỏ qua dòng đó, ghi số dòng vào báo cáo và tiếp tục các dòng còn lại." },
  { id: "file-review", clarify: false, otherSkill: "code-review", prompt: "review @src/core/agent-runner.ts cho tôi nhé" },
  { id: "lookup", clarify: false, prompt: "Runner đang xử lý exit code khác 0 thế nào? Đọc @src/core/agent-runner.ts giúp tôi." },
  { id: "settled-en", clarify: false, absentSkill: "domain-modeling", prompt: "The requirements are settled. Retry once only if the process failed to start. Implement that behavior." },
  { id: "follow-up", clarify: false, prompt: "Chốt chỉ thử lại một lần nếu tiến trình chưa khởi động được. Làm theo phương án đó nhé." },
  { id: "settled-plus-design", clarify: false, otherSkill: "domain-modeling", prompt: "Requirements are settled. Design a domain model for invoices." },
  { id: "open-alternatives", clarify: true, prompt: "Khi import gặp mã trùng, chưa biết nên ghi đè hay bỏ qua. Xử lý thế nào?" },
  { id: "review-spec", clarify: false, otherSkill: "code-review", prompt: "Review the implementation against the requirements in @src/core/agent-runner.ts." }
];

const { values } = parseArgs({ options: { "report-only": { type: "boolean" } } });
const root = fileURLToPath(new URL("../", import.meta.url));
await fs.access(path.join(root, "src/core/agent-runner.ts"));
const context = await createRegistryContext(root);

async function suggestedSkills(prompt: string): Promise<string[]> {
  const hint = await runClaudePromptHook(JSON.stringify({ hook_event_name: "UserPromptSubmit", cwd: root, prompt }));
  const message = hint?.hookSpecificOutput.additionalContext ?? "";
  return [...message.matchAll(/(?:^|\s)\/([\w-]+)/g)].map(match => match[1]);
}

// A missing registry or skill link also yields silence. Distinguish an invalid
// setup from a successful negative case before counting any result.
for (const skill of ["requirements-discovery", "code-review"]) {
  if (!(await suggestedSkills(`use ${skill}`)).includes(skill)) {
    throw new Error(`Cannot route /${skill} in this checkout. Check the project profile, registry and bootstrap links.`);
  }
}

const results = [];
for (const entry of cases) {
  const skills = await suggestedSkills(entry.prompt);
  const matches = skills.includes("requirements-discovery") === entry.clarify;
  results.push({
    ...entry, skills, pass: matches && (!entry.otherSkill || skills.includes(entry.otherSkill)) &&
      (!entry.absentSkill || !skills.includes(entry.absentSkill))
  });
}
const registries = await Promise.all(context.registries.map(async registry => ({
  name: registry.name, fingerprint: await registryFingerprint(registry.root)
})));
console.log(JSON.stringify({
  registries, passed: results.filter(row => row.pass).length, total: results.length, results
}, null, 2));
if (!values["report-only"] && results.some(row => !row.pass)) process.exitCode = 1;
