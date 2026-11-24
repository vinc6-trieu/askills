/** Separate instructions from quoted examples before scoring natural-language matches. */
export function taskDirectives(prompt: string) {
  const normalized = prompt.normalize("NFC").toLowerCase();
  const unquoted = normalized.replace(
    /```[\s\S]*?```|`([^`\n]+)`|“([^”]*)”|"([^"\n]*)"|(?<![\p{L}\p{N}])['‘]([^'’\n]*)['’]/gu,
    (quoted, code, curly, double, single, offset: number) => {
      // A quoted identifier can itself be the operand of an instruction.
      const operand = code ?? curly ?? double ?? single;
      const before = normalized.slice(Math.max(0, offset - 40), offset);
      return operand && /^\/?[\w:/-]+$/u.test(operand) && /(?:use|using|skip|apply|dùng|sử dụng)\s+$/u.test(before)
        ? operand : " ";
    });
  const clauses = unquoted.split(/[;!?\n,]+|\.(?=\s|$)|\s+(?:but|nhưng)\s+|\s+(?:and|và)\s+(?=(?:please |hãy )?(?:use|review|clarify|dùng|làm rõ)\s)/u)
    .map(clause => clause.trim()).filter(Boolean);
  const refused = new Set<string>();
  const positive: string[] = [];
  const negation = /(?:^|\s)(?:đừng|không(?: cần)?|do not|don['’]t|never|without|skip|avoid)\s+/u;
  const action = /^(?:(?:use|using|apply|run|invoke|call|dùng|sử dụng|chạy|gọi|áp dụng)\s+)?(?:the\s+)?(?:skills?\s+)?/u;
  function namedOperands(text: string) {
    const list = text.replace(action, "").match(/^\/?[\w:/-]+(?:\s+(?:and|or|và|hoặc)\s+\/?[\w:/-]+)*/u)?.[0] ?? "";
    return list.split(/\s+(?:and|or|và|hoặc)\s+/u).map(id => id.replace(/^\//, "")).filter(Boolean);
  }
  for (const clause of clauses) {
    const negated = negation.exec(clause);
    const active = negated ? clause.slice(0, negated.index) : clause;
    if (active) positive.push(active);
    const use = /(?:^|\s)(?:use|apply|invoke|dùng|sử dụng)\s+/u.exec(active);
    if (use) {
      for (const id of namedOperands(active.slice(use.index + use[0].length))) refused.delete(id);
    }
    if (negated) {
      for (const id of namedOperands(clause.slice(negated.index + negated[0].length))) refused.add(id);
    }
  }
  return { clauses, positive: positive.join(" "), refused };
}

export function refusesSkill(refused: Set<string>, reference: string, nativeName?: string) {
  const id = reference.slice(reference.indexOf(":") + 1);
  return [reference, id, id.split("/").at(-1)!, nativeName ?? ""].some(name => refused.has(name.toLowerCase()));
}
