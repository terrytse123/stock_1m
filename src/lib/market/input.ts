import { normalizeSymbol } from "./universe";
import type { ScanInput } from "./types";

export function parseScanInput(input: ScanInput): ScanInput {
  const extra: string[] = [];
  const source = Array.isArray(input?.extra) ? input.extra : [];
  for (const item of source) {
    if (typeof item !== "string") continue;
    const symbol = normalizeSymbol(item);
    if (!symbol || extra.includes(symbol)) continue;
    extra.push(symbol);
    if (extra.length >= 12) break;
  }
  return { refresh: input?.refresh === true, extra };
}

export function parseSymbolInput(input: { symbol: string }): { symbol: string } {
  const symbol = typeof input?.symbol === "string" ? normalizeSymbol(input.symbol) : null;
  if (!symbol) throw new Error("代碼不正確");
  return { symbol };
}
