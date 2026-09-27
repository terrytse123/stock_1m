export type UniverseName = { symbol: string; sector: string };

export const UNIVERSE: UniverseName[] = [
  { symbol: "AAPL", sector: "科技" },
  { symbol: "MSFT", sector: "科技" },
  { symbol: "NVDA", sector: "科技" },
  { symbol: "GOOGL", sector: "科技" },
  { symbol: "AVGO", sector: "科技" },
  { symbol: "AMD", sector: "科技" },
  { symbol: "ORCL", sector: "科技" },
  { symbol: "CRM", sector: "科技" },
  { symbol: "AMZN", sector: "平台" },
  { symbol: "META", sector: "平台" },
  { symbol: "NFLX", sector: "平台" },
  { symbol: "DIS", sector: "平台" },
  { symbol: "TSLA", sector: "汽車" },
  { symbol: "JPM", sector: "金融" },
  { symbol: "V", sector: "金融" },
  { symbol: "MA", sector: "金融" },
  { symbol: "GS", sector: "金融" },
  { symbol: "BAC", sector: "金融" },
  { symbol: "LLY", sector: "醫療" },
  { symbol: "UNH", sector: "醫療" },
  { symbol: "JNJ", sector: "醫療" },
  { symbol: "ABBV", sector: "醫療" },
  { symbol: "WMT", sector: "消費" },
  { symbol: "COST", sector: "消費" },
  { symbol: "HD", sector: "消費" },
  { symbol: "MCD", sector: "消費" },
  { symbol: "NKE", sector: "消費" },
  { symbol: "XOM", sector: "能源" },
  { symbol: "CVX", sector: "能源" },
  { symbol: "CAT", sector: "工業" },
  { symbol: "GE", sector: "工業" },
  { symbol: "BA", sector: "工業" },
];

export const BENCHMARKS = ["SPY", "QQQ", "DIA", "IWM"] as const;

export const TAPE_LABEL: Record<string, string> = {
  SPY: "標普 500",
  QQQ: "納斯達克 100",
  DIA: "道瓊",
  IWM: "羅素 2000",
};

const sectorBySymbol = new Map(UNIVERSE.map((row) => [row.symbol, row.sector]));

export function sectorFor(symbol: string): string {
  return sectorBySymbol.get(symbol) ?? "自訂";
}

export function normalizeSymbol(raw: string): string | null {
  const symbol = raw.trim().toUpperCase().replace(/\./g, "-");
  if (!/^[A-Z][A-Z0-9-]{0,9}$/.test(symbol)) return null;
  return symbol;
}
