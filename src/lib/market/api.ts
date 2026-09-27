import { createServerFn } from "@tanstack/react-start";
import { parseScanInput, parseSymbolInput } from "./input";
import type { ExplainResult, ScanInput, ScanResult } from "./types";

export const scanMarket = createServerFn({ method: "POST" })
  .validator((input: ScanInput) => parseScanInput(input))
  .handler(async ({ data }): Promise<ScanResult> => {
    try {
      const { scanUniverse } = await import("./engine.server");
      return await scanUniverse(data);
    } catch {
      return { ok: false, error: "掃描時發生問題。請再試一次。", failed: [] };
    }
  });

export const explainStock = createServerFn({ method: "POST" })
  .validator((input: { symbol: string }) => parseSymbolInput(input))
  .handler(async ({ data }): Promise<ExplainResult> => {
    const { explainSymbol } = await import("./engine.server");
    return explainSymbol(data.symbol);
  });
