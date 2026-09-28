import { analyzeStock, trailingReturn, type Bar } from "./model";
import { formatMoney, priceAt } from "./format";
import type { ExplainResult, MarketPulse, ScanInput, ScanOk, ScanResult, StockSnapshot } from "./types";
import { BENCHMARKS, normalizeSymbol, sectorFor, UNIVERSE } from "./universe";

const TTL_MS = 8 * 60 * 1000;
const NOTE_TTL_MS = 6 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MAX_NOTES_PER_HOUR = 24;

type RawChart = {
  symbol: string;
  name: string;
  exchange: string;
  price: number;
  prevClose: number;
  high52: number | null;
  low52: number | null;
  marketTime: number;
  bars: Bar[];
};

type SpyRets = { ret10: number | null; ret20: number | null; ret30: number | null; ret63: number | null };

type Cache = {
  at: number;
  extraKey: string;
  result: ScanOk;
  spy: SpyRets;
};

let cache: Cache | null = null;
const singles = new Map<string, { at: number; snap: StockSnapshot }>();
const notes = new Map<string, { at: number; text: string }>();
const noteCalls: number[] = [];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function fetchChart(symbol: string): Promise<RawChart | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y&includePrePost=false`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (response.status === 429 || response.status >= 500) {
        await delay(280 * (attempt + 1));
        continue;
      }
      if (!response.ok) return null;
      const json = (await response.json()) as {
        chart?: { result?: Array<Record<string, unknown>> | null };
      };
      const result = json.chart?.result?.[0];
      if (!result) return null;
      return parseChart(symbol, result);
    } catch {
      if (attempt === 1) return null;
      await delay(200);
    }
  }
  return null;
}

function parseChart(symbol: string, result: Record<string, unknown>): RawChart | null {
  const meta = (result.meta ?? {}) as Record<string, unknown>;
  const timestamps = Array.isArray(result.timestamp) ? result.timestamp : [];
  const indicators = result.indicators as { quote?: Array<Record<string, unknown>> } | undefined;
  const quote = indicators?.quote?.[0];
  const closes = Array.isArray(quote?.close) ? quote.close : [];
  const volumes = Array.isArray(quote?.volume) ? quote.volume : [];
  const bars: Bar[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i];
    const time = timestamps[i];
    if (typeof close !== "number" || !Number.isFinite(close) || close <= 0) continue;
    if (typeof time !== "number" || !Number.isFinite(time)) continue;
    const volume = volumes[i];
    bars.push({
      t: time,
      c: close,
      v: typeof volume === "number" && Number.isFinite(volume) ? volume : 0,
    });
  }
  const price = finiteOrNull(meta.regularMarketPrice) ?? bars[bars.length - 1]?.c ?? 0;
  if (!(price > 0) || bars.length < 40) return null;
  const last = bars[bars.length - 1];
  if (last) bars[bars.length - 1] = { ...last, c: price };
  const prevClose = bars.length >= 2 ? (bars[bars.length - 2]?.c ?? price) : price;
  const nameRaw = meta.longName ?? meta.shortName ?? symbol;
  const exchangeRaw = meta.fullExchangeName ?? meta.exchangeName ?? "";
  return {
    symbol: typeof meta.symbol === "string" ? meta.symbol : symbol,
    name: typeof nameRaw === "string" ? nameRaw : symbol,
    exchange: typeof exchangeRaw === "string" ? exchangeRaw : "",
    price,
    prevClose,
    high52: finiteOrNull(meta.fiftyTwoWeekHigh),
    low52: finiteOrNull(meta.fiftyTwoWeekLow),
    marketTime: finiteOrNull(meta.regularMarketTime) ?? last?.t ?? 0,
    bars,
  };
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      out[index] = await fn(items[index] as T);
    }
  }
  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return out;
}

function toPulse(snap: StockSnapshot): MarketPulse {
  return {
    symbol: snap.symbol,
    name: snap.name,
    price: snap.price,
    changePct: snap.changePct,
    ret21: snap.ret21,
    score: snap.score,
    bias: snap.bias,
  };
}

function snapshotFromRaw(raw: RawChart, spy: SpyRets): StockSnapshot | null {
  return analyzeStock({
    symbol: raw.symbol,
    name: raw.name,
    exchange: raw.exchange,
    sector: sectorFor(raw.symbol),
    price: raw.price,
    prevClose: raw.prevClose,
    high52: raw.high52,
    low52: raw.low52,
    bars: raw.bars,
    spyRet10: spy.ret10,
    spyRet20: spy.ret20,
    spyRet30: spy.ret30,
    spyRet63: spy.ret63,
  });
}

export async function scanUniverse(input: ScanInput): Promise<ScanResult> {
  const extra = input.extra
    .map((symbol) => normalizeSymbol(symbol))
    .filter((symbol): symbol is string => Boolean(symbol));
  const extraKey = [...new Set(extra)].sort().join(",");
  if (
    !input.refresh &&
    cache &&
    cache.extraKey === extraKey &&
    Date.now() - cache.at < TTL_MS &&
    cache.result.stocks.some((stock) => stock.horizons?.length === 3)
  ) {
    return cache.result;
  }

  const symbols = [...new Set([...BENCHMARKS, ...UNIVERSE.map((row) => row.symbol), ...extra])];
  const charts = await mapPool(symbols, 6, (symbol) => fetchChart(symbol));
  const bySymbol = new Map<string, RawChart>();
  const failed: string[] = [];
  symbols.forEach((symbol, index) => {
    const chart = charts[index];
    if (!chart) failed.push(symbol);
    else bySymbol.set(symbol, chart);
  });

  const spyBars = bySymbol.get("SPY")?.bars.map((bar) => bar.c) ?? [];
  const spy = {
    ret10: trailingReturn(spyBars, 10),
    ret20: trailingReturn(spyBars, 20),
    ret30: trailingReturn(spyBars, 30),
    ret63: trailingReturn(spyBars, 63),
  };
  const stockSet = new Set([...UNIVERSE.map((row) => row.symbol), ...extra]);
  const stocks: StockSnapshot[] = [];
  const market: MarketPulse[] = [];

  for (const symbol of BENCHMARKS) {
    const raw = bySymbol.get(symbol);
    if (!raw) continue;
    const snap = snapshotFromRaw(raw, spy);
    if (snap) market.push(toPulse(snap));
  }

  for (const symbol of stockSet) {
    const raw = bySymbol.get(symbol);
    if (!raw) continue;
    const snap = snapshotFromRaw(raw, spy);
    if (!snap) {
      if (!failed.includes(symbol)) failed.push(symbol);
      continue;
    }
    stocks.push(snap);
    singles.set(snap.symbol, { at: Date.now(), snap });
  }

  stocks.sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
  stocks.forEach((stock, index) => {
    stock.rank = index + 1;
  });

  if (stocks.length < 5) {
    return {
      ok: false,
      error: "拿到的行情太少，沒辦法做排序。請再掃描一次。",
      failed,
    };
  }

  const asOf = Math.max(...[...bySymbol.values()].map((chart) => chart.marketTime), 0) * 1000;
  const result: ScanOk = { ok: true, asOf, market, stocks, failed };
  cache = { at: Date.now(), extraKey, result, spy };
  return result;
}

function lookup(symbol: string): StockSnapshot | null {
  const single = singles.get(symbol);
  if (single && Date.now() - single.at < TTL_MS) return single.snap;
  return null;
}

async function loadOne(symbol: string): Promise<StockSnapshot | null> {
  const needSpy = cache?.spy == null;
  const [raw, spyRaw] = await Promise.all([
    fetchChart(symbol),
    needSpy ? fetchChart("SPY") : Promise.resolve(null),
  ]);
  if (!raw) return null;
  const closes = spyRaw?.bars.map((bar) => bar.c) ?? [];
  const spy: SpyRets = cache?.spy ?? {
    ret10: trailingReturn(closes, 10),
    ret20: trailingReturn(closes, 20),
    ret30: trailingReturn(closes, 30),
    ret63: trailingReturn(closes, 63),
  };
  return snapshotFromRaw(raw, spy);
}

function cleanText(value: string): string {
  return value.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
        return part.text;
      }
      return "";
    })
    .join("")
    .trim();
}

function allowNote(): boolean {
  const now = Date.now();
  while (noteCalls.length && now - (noteCalls[0] ?? 0) > HOUR_MS) noteCalls.shift();
  if (noteCalls.length >= MAX_NOTES_PER_HOUR) return false;
  noteCalls.push(now);
  return true;
}

async function writeWithGrok(snap: StockSnapshot): Promise<ExplainResult> {
  const key = `${snap.symbol}:${snap.score}:${Math.round(snap.price)}`;
  const cached = notes.get(key);
  if (cached && Date.now() - cached.at < NOTE_TTL_MS) {
    return { ok: true, text: cached.text, cached: true };
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "Grok 解讀目前沒開通。上方的自動技術摘要仍可閱讀。" };
  }
  if (!allowNote()) {
    return { ok: false, error: "這小時的 Grok 解讀次數已滿，請稍後再試。" };
  }

  const factors = snap.factors
    .map((factor) => `${factor.label} ${factor.score}：${factor.detail}`)
    .join("\n");
  const user = [
    `標的 ${snap.symbol} ${cleanText(snap.name)}（${snap.sector}）`,
    `現價 ${snap.price}，今日 ${snap.changePct}`,
    `分數 ${snap.score}，傾向 ${snap.bias}`,
    `近月 ${snap.ret21 ?? "n/a"}，三月 ${snap.ret63 ?? "n/a"}，RSI ${snap.rsi ?? "n/a"}`,
    `10/20/30 日 ${snap.horizons.map((row) => `${row.days}:${row.bias}/${row.base}`).join(" ")}`,
    `買入訊號 ${snap.buy}。${snap.buyNote}`,
    `20 日情境 低 ${snap.scenario.low}（${formatMoney(priceAt(snap.price, snap.scenario.low))}）基準 ${snap.scenario.base}（${formatMoney(priceAt(snap.price, snap.scenario.base))}）高 ${snap.scenario.high}（${formatMoney(priceAt(snap.price, snap.scenario.high))}）`,
    "因子：",
    factors,
    "自動摘要：",
    snap.summary,
  ].join("\n");

  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        model: "grok-4.5",
        temperature: 0.3,
        max_tokens: 400,
        reasoning_effort: "low",
        messages: [
          {
            role: "system",
            content:
              "你是謹慎的美股技術分析撰稿。只用使用者提供的數字，用繁體中文寫 130 到 180 字：一句話講未來約一個月的傾向、兩項最關鍵因子、一個會推翻看法的條件。不要下買進或賣出指令，不要發明目標價，不要使用項目符號。",
          },
          { role: "user", content: user },
        ],
      }),
    });
    if (!response.ok) {
      return { ok: false, error: `Grok 這次沒有寫成（${response.status}）。請稍後再試。` };
    }
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const text = messageText(body.choices?.[0]?.message?.content);
    if (!text) return { ok: false, error: "Grok 沒有寫出內容。請再試一次。" };
    notes.set(key, { at: Date.now(), text });
    return { ok: true, text, cached: false };
  } catch {
    return { ok: false, error: "Grok 暫時沒有回應。請再試一次。" };
  }
}

export async function explainSymbol(symbol: string): Promise<ExplainResult> {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return { ok: false, error: "代碼不正確。" };
  const snap = lookup(normalized) ?? (await loadOne(normalized));
  if (!snap) return { ok: false, error: "還沒有這檔的分析資料。" };
  singles.set(snap.symbol, { at: Date.now(), snap });
  return writeWithGrok(snap);
}
