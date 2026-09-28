import { formatDay } from "./format";
import type { StockSnapshot } from "./types";

export type SwingStatus = "watch" | "order" | "hold" | "done";

export type SwingPlan = {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  score: number;
  rsi: number | null;
  wait: boolean;
  entryLow: number;
  entryHigh: number;
  stop: number;
  target1: number;
  target2: number;
  deadline: number;
  reason: string;
};

const MONTH_MS = 28 * 24 * 60 * 60 * 1000;

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function eligible(stock: StockSnapshot): boolean {
  if (stock.bias !== "up") return false;
  if (stock.rsi == null || stock.sma50Dist == null || stock.ret21 == null || stock.vol21 == null) return false;
  if (stock.rsi > 74 || stock.ret21 > 0.25 || stock.vol21 > 0.25) return false;
  if (stock.sma50Dist < -0.03) return false;
  return true;
}

function swingFit(stock: StockSnapshot): number {
  const rsi = stock.rsi ?? 50;
  const dist = stock.sma50Dist ?? 0;
  const ret = stock.ret21 ?? 0;
  let score = stock.score - Math.abs(rsi - 53) * 0.45;
  if (dist > 0.04) score -= (dist - 0.04) * 120;
  if (dist < 0) score -= 8;
  if (ret > 0.06) score -= (ret - 0.06) * 80;
  return score;
}

function toPlan(stock: StockSnapshot, asOf: number): SwingPlan {
  const dist = stock.sma50Dist ?? 0;
  const ma = stock.price / (1 + dist);
  const wait = dist > 0.045 || (stock.rsi ?? 0) > 62 || (stock.ret21 ?? 0) > 0.07;
  let entryLow = wait ? Math.max(ma * 1.005, stock.price * 0.94) : Math.min(stock.price * 0.995, ma * 0.998);
  let entryHigh = wait ? Math.min(stock.price * 0.985, ma * 1.03) : Math.max(stock.price * 1.005, ma * 1.012);
  if (entryLow > entryHigh) {
    const swap = entryLow;
    entryLow = entryHigh;
    entryHigh = swap;
  }
  entryLow = money(entryLow);
  entryHigh = money(Math.max(entryHigh, entryLow + 0.01));

  const widest = money(entryLow * 0.92);
  const tightest = money(entryLow * 0.975);
  let stop = money(Math.min(ma * 0.98, entryLow * 0.972));
  stop = Math.max(widest, Math.min(stop, tightest));
  if (stop >= entryLow) stop = money(entryLow * 0.97);

  const upper = money(stock.price * (1 + Math.max(stock.scenario.high, 0.05)));
  let target1 = money((Math.max(entryHigh, stock.price) + upper) / 2);
  if (target1 <= entryHigh) target1 = money(entryHigh * 1.04);
  let target2 = upper;
  if (target2 <= target1) target2 = money(target1 * 1.03);

  const rsi = stock.rsi == null ? "—" : stock.rsi.toFixed(0);
  const reason = wait
    ? `近月已走一段，RSI ${rsi}。只等回落，不追現價。`
    : `還貼著 50 日均線，RSI ${rsi}。用限價，不必追高。`;

  return {
    symbol: stock.symbol,
    name: stock.name,
    sector: stock.sector,
    price: stock.price,
    score: stock.score,
    rsi: stock.rsi,
    wait,
    entryLow,
    entryHigh,
    stop,
    target1,
    target2,
    deadline: asOf + MONTH_MS,
    reason,
  };
}

export function buildSwingPlans(stocks: StockSnapshot[], asOf: number): SwingPlan[] {
  const ranked = stocks
    .filter(eligible)
    .map((stock) => ({ stock, fit: swingFit(stock) }))
    .sort((a, b) => b.fit - a.fit || b.stock.score - a.stock.score);

  const picked: StockSnapshot[] = [];
  const sectors = new Set<string>();
  for (const row of ranked) {
    if (picked.length >= 3) break;
    if (sectors.has(row.stock.sector)) continue;
    picked.push(row.stock);
    sectors.add(row.stock.sector);
  }
  for (const row of ranked) {
    if (picked.length >= 3) break;
    if (picked.some((item) => item.symbol === row.stock.symbol)) continue;
    picked.push(row.stock);
  }
  return picked.map((stock) => toPlan(stock, asOf));
}

export function deadlineLabel(ms: number): string {
  return `${formatDay(ms)} 美東前`;
}
