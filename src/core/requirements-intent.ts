import { parseRegistryReference } from "./registry-context.js";

export const inferredRequirementsReason = "intent:unresolved behavior";

export function isRequirementsSkill(id: string): boolean {
  return parseRegistryReference(id).id === "global/requirements-discovery";
}

/** A hint about this turn. Claude can resolve an open decision from earlier turns or the repo. */
function clauseIntent(prompt: string): "requested" | "possible" | "settled" | "declined" | "read-only" | undefined {
  const words = prompt.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, " ");
  const text = ` ${words.trim()} `;
  const mentions = (...terms: string[]) => terms.some(term => text.includes(` ${term} `));

  if (mentions("đừng hỏi lại", "không cần hỏi", "không cần làm rõ", "skip clarification",
    "đừng dùng requirements discovery", "không dùng requirements discovery", "skip requirements discovery",
    "do not use requirements discovery", "don t use requirements discovery",
    "do not ask", "don t ask", "do not clarify", "don t clarify", "no need to clarify", "no clarification needed")) return "declined";
  if (mentions("làm rõ yêu cầu", "làm rõ phạm vi", "hỏi tôi trước", "hỏi lại tôi trước",
    "clarify requirements", "clarify the requirements", "clarify the scope", "ask me first")) return "requested";
  if (mentions("đã chốt", "đã thống nhất", "the agreed behavior", "requirements are settled",
    "requirements are final", "requirements are already settled")) return "settled";
  const readOnlyRequest = /^(?:(?:please|can you|could you|hãy|bạn hãy|giúp tôi) )*(?:review|giải thích|mô tả|explain|how does|how is)(?: |$)/u;
  if (readOnlyRequest.test(words.trim()) ||
      (mentions("đang xử lý") && mentions("thế nào", "ra sao"))) return "read-only";

  // Limit proactive hints to two policy choices: which failures may be retried,
  // and what to do with conflicting records. The topic alone is insufficient.
  const addRetries = mentions("thêm retry", "thêm cơ chế thử lại", "thêm cơ chế retry",
    "add retry", "add retries", "implement retries", "implement retry");
  if (addRetries && mentions("lỗi", "thất bại", "failure", "failures", "fails", "error", "errors") &&
      !mentions("chỉ", "chưa khởi động", "mã lỗi", "only", "failed to start", "timeout", "http")) return "possible";

  const handleConflict = mentions("xử lý", "giải quyết", "handle", "handling", "resolve") &&
    mentions("trùng", "xung đột", "duplicate", "duplicates", "conflict", "conflicts");
  if (handleConflict && mentions("hay", "hoặc", "whether", "or") && mentions("chưa biết", "chưa rõ", "nên", "whether", "unsure")) return "possible";
  if (handleConflict && !mentions("bằng cách", "bỏ qua", "ghi đè", "cập nhật", "giữ", "gộp",
    "từ chối", "skip", "overwrite", "update", "keep", "merge", "reject")) return "possible";
}


export function requirementsIntent(clauses: string[]) {
  let decision: ReturnType<typeof clauseIntent>;
  let remaining: string[] = [];
  for (const clause of clauses) {
    const next = clauseIntent(clause);
    if (next === "declined" || next === "settled" || next === "requested") {
      decision = next;
      remaining = [];
    } else {
      remaining.push(clause);
    }
  }
  const contextual = clauseIntent(remaining.join(" "));
  if (decision === "requested" || decision === "declined") return decision;
  return contextual ?? decision;
}
