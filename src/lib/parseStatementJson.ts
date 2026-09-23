export type RawTxn = Record<string, unknown>;

export type StatementParse = {
  docType: string | null;
  docHint: string | null;
  cardLast4: string | null;
  transactions: RawTxn[];
  skipped: number;
  truncated: boolean;
  recovered: boolean;
};

/**
 * The model answers with JSON, but one bad character in a merchant name — an
 * unescaped quote, a stray newline — or an answer cut short by the token limit
 * used to throw the whole statement away with a raw English parser message.
 * A strict parse is tried first; failing that the transactions array is walked
 * object by object, keeping every one that parses and counting the rest.
 */
export function parseStatementJson(text: string): StatementParse {
  const empty: StatementParse = {
    docType: null,
    docHint: null,
    cardLast4: null,
    transactions: [],
    skipped: 0,
    truncated: false,
    recovered: false,
  };

  const strict = (() => {
    try {
      return JSON.parse(text.trim()) as Record<string, unknown>;
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return null;
      try {
        return JSON.parse(m[0]) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
  })();

  if (strict) {
    return {
      ...empty,
      docType: typeof strict.doc_type === "string" ? strict.doc_type : null,
      docHint: typeof strict.doc_hint === "string" ? strict.doc_hint : null,
      cardLast4: strict.card_last4 == null ? null : String(strict.card_last4),
      transactions: Array.isArray(strict.transactions) ? (strict.transactions as RawTxn[]) : [],
    };
  }

  const docType = text.match(/"doc_type"\s*:\s*"([^"]*)"/)?.[1] ?? null;
  const docHint = text.match(/"doc_hint"\s*:\s*"([^"]*)"/)?.[1] ?? null;
  const cardLast4 = text.match(/"card_last4"\s*:\s*"?([0-9]{2,4})"?/)?.[1] ?? null;

  const arrayAt = text.indexOf("[", text.indexOf('"transactions"'));
  if (text.indexOf('"transactions"') === -1 || arrayAt === -1) {
    return { ...empty, docType, docHint, cardLast4, recovered: true, truncated: true };
  }

  const transactions: RawTxn[] = [];
  let skipped = 0;
  let truncated = false;
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = arrayAt; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
      continue;
    }
    if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        const chunk = text.slice(start, i + 1);
        try {
          transactions.push(JSON.parse(chunk) as RawTxn);
        } catch {
          skipped++;
        }
        start = -1;
      }
      continue;
    }
    if (ch === "]" && depth === 0) break;
  }

  // An object still open at the end means the answer stopped mid-way.
  if (depth > 0) truncated = true;

  return { docType, docHint, cardLast4, transactions, skipped, truncated, recovered: true };
}
