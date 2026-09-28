import { biasLabel, formatMoney, formatPct, priceAt } from "./format";
import type { Bias, BuySignal, Factor, HorizonView, StockSnapshot } from "./types";

export type Bar = { t: number; c: number; v: number };

export type AnalyzeInput = {
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  price: number;
  prevClose: number;
  high52: number | null;
  low52: number | null;
  bars: Bar[];
  spyRet10: number | null;
  spyRet20: number | null;
  spyRet30: number | null;
  spyRet63: number | null;
};

const UP_SCORE = 66;
const DOWN_SCORE = 48;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function roundTo(n: number, digits: number): number {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  return average(values.slice(-period));
}

export function trailingReturn(values: number[], days: number): number | null {
  if (values.length <= days) return null;
  const then = values[values.length - 1 - days] ?? 0;
  const now = values[values.length - 1] ?? 0;
  if (!(then > 0) || !(now > 0)) return null;
  return now / then - 1;
}

function rsi(values: number[], period = 14): number | null {
  if (values.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = (values[i] ?? 0) - (values[i - 1] ?? 0);
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < values.length; i++) {
    const diff = (values[i] ?? 0) - (values[i - 1] ?? 0);
    const up = diff > 0 ? diff : 0;
    const down = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + up) / period;
    avgLoss = (avgLoss * (period - 1) + down) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function dailySigma(values: number[]): number | null {
  if (values.length < 22) return null;
  const rets: number[] = [];
  const start = Math.max(1, values.length - 63);
  for (let i = start; i < values.length; i++) {
    const prev = values[i - 1] ?? 0;
    const cur = values[i] ?? 0;
    if (prev > 0 && cur > 0) rets.push(cur / prev - 1);
  }
  if (rets.length < 20) return null;
  const mean = average(rets);
  const variance = rets.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance);
}

function sweetReturn(value: number, peak: number, width: number): number {
  const delta = value - peak;
  const sigma = delta < 0 ? width * 0.65 : width * 1.2;
  const bell = Math.exp(-(delta * delta) / (2 * sigma * sigma));
  return clamp(6 + bell * 94, 0, 100);
}

function biasOf(score: number): Bias {
  if (score >= UP_SCORE) return "up";
  if (score <= DOWN_SCORE) return "down";
  return "flat";
}

function trendFactor(price: number, sma50: number | null, sma200: number | null): Factor {
  let score = 48;
  const bits: string[] = [];
  if (sma50 != null && sma50 > 0) {
    const dist = price / sma50 - 1;
    score += (clamp(dist, -0.12, 0.12) / 0.12) * 24;
    bits.push(`較 50 日均線 ${formatPct(dist)}`);
  }
  if (sma200 != null && sma200 > 0) {
    const dist = price / sma200 - 1;
    score += (clamp(dist, -0.2, 0.2) / 0.2) * 16;
    bits.push(`較 200 日均線 ${formatPct(dist)}`);
  }
  if (sma50 != null && sma200 != null) {
    if (price > sma50 && sma50 > sma200) {
      score += 12;
      bits.push("多頭排列");
    } else if (price < sma50 && sma50 < sma200) {
      score -= 12;
      bits.push("空頭排列");
    }
  }
  return {
    key: "trend",
    label: "趨勢結構",
    score: Math.round(clamp(score, 0, 100)),
    detail: bits.length ? `${bits.join("，")}。` : "均線樣本不足。",
  };
}

function momentumFactor(ret: number, label: string, key: string, peak: number, width: number, days: number): Factor {
  return {
    key,
    label,
    score: Math.round(sweetReturn(ret, peak, width)),
    detail: `近 ${days} 個交易日 ${formatPct(ret)}。正報酬適中得分較高，暴漲或大跌都會扣分。`,
  };
}

function rsiFactor(value: number): Factor {
  let score = 50;
  let note = "落在中性區。";
  if (value >= 48 && value <= 65) {
    score = 90 - Math.abs(value - 56) * 1.1;
    note = "落在趨勢延續較舒服的區間。";
  } else if (value >= 40 && value < 48) {
    score = 68;
    note = "略偏冷，還不算超賣。";
  } else if (value >= 30 && value < 40) {
    score = 60;
    note = "偏冷，反彈與續弱都有可能。";
  } else if (value > 65 && value <= 75) {
    score = 72 - (value - 65) * 1.6;
    note = "開始偏熱。";
  } else if (value > 75) {
    score = clamp(52 - (value - 75) * 2.4, 8, 52);
    note = "過熱，短線回吐風險較高。";
  } else {
    score = clamp(28 + value * 0.5, 8, 40);
    note = "明顯超賣。";
  }
  return {
    key: "rsi",
    label: "RSI 位置",
    score: Math.round(clamp(score, 0, 100)),
    detail: `RSI(14) ${value.toFixed(0)}，${note}`,
  };
}

function relativeFactor(ret63: number, spyRet63: number): Factor {
  const excess = ret63 - spyRet63;
  const score = clamp(50 + (excess / 0.12) * 35, 0, 100);
  return {
    key: "rs",
    label: "相對標普",
    score: Math.round(score),
    detail: `三個月報酬較標普 500 ${formatPct(excess)}。`,
  };
}

function volumeFactor(volumes: number[], ret21: number | null): Factor | null {
  if (volumes.length < 60) return null;
  const recent = average(volumes.slice(-20));
  const base = average(volumes.slice(-60));
  if (!(recent > 0) || !(base > 0)) return null;
  const ratio = recent / base;
  const rising = (ret21 ?? 0) > 0;
  let score = 52;
  if (rising && ratio >= 1.05) score = clamp(60 + (ratio - 1) * 80, 60, 94);
  else if (rising && ratio < 0.85) score = 40;
  else if (!rising && ratio >= 1.2) score = 36;
  const pace = rising ? "價格近月上漲" : "價格近月沒有上漲";
  return {
    key: "volume",
    label: "量能配合",
    score: Math.round(score),
    detail: `20 日均量是 60 日的 ${ratio.toFixed(2)} 倍，${pace}。`,
  };
}

function locationScore(dist50: number | null, days: 10 | 20 | 30): number {
  if (dist50 == null) return 50;
  if (days === 10) return sweetReturn(dist50, 0.015, 0.04);
  if (days === 20) return sweetReturn(dist50, 0.03, 0.06);
  return clamp(52 + dist50 * 160, 12, 92);
}

function rsiForHorizon(value: number, days: 10 | 20 | 30): number {
  if (days !== 10) return rsiFactor(value).score;
  if (value >= 45 && value <= 60) return clamp(90 - Math.abs(value - 52), 70, 94);
  if (value > 68) return clamp(36 - (value - 68) * 2.2, 8, 36);
  if (value > 60) return clamp(68 - (value - 60) * 2, 40, 68);
  if (value < 35) return 40;
  return 58;
}

function horizonView(
  days: 10 | 20 | 30,
  closes: number[],
  price: number,
  sma50: number | null,
  rsiValue: number | null,
  sigma: number | null,
  spyRet: number | null,
): HorizonView {
  const ret = trailingReturn(closes, days);
  const dist50 = sma50 != null && sma50 > 0 ? price / sma50 - 1 : null;
  const parts: { score: number; weight: number }[] = [];
  if (ret != null) {
    const peak = days === 10 ? 0.025 : days === 20 ? 0.05 : 0.075;
    const width = days === 10 ? 0.045 : days === 20 ? 0.07 : 0.1;
    parts.push({ score: sweetReturn(ret, peak, width), weight: days === 10 ? 0.34 : days === 20 ? 0.3 : 0.24 });
  }
  parts.push({
    score: locationScore(dist50, days),
    weight: days === 10 ? 0.22 : days === 20 ? 0.26 : 0.34,
  });
  if (rsiValue != null) {
    parts.push({ score: rsiForHorizon(rsiValue, days), weight: days === 10 ? 0.28 : days === 20 ? 0.18 : 0.12 });
  }
  if (ret != null && spyRet != null) {
    parts.push({ score: relativeFactor(ret, spyRet).score, weight: days === 30 ? 0.28 : 0.16 });
  }
  const weightSum = parts.reduce((sum, part) => sum + part.weight, 0);
  const score = Math.round(parts.reduce((sum, part) => sum + part.score * part.weight, 0) / weightSum);
  const bias = biasOf(score);
  const band = (sigma ?? 0.012) * Math.sqrt(days);
  const shrink = days === 10 ? 0.45 : days === 20 ? 0.32 : 0.26;
  const base = ret == null ? 0 : clamp(ret * shrink, -band, band * 0.9);
  return {
    days,
    bias,
    low: roundTo(base - band, 4),
    base: roundTo(base, 4),
    high: roundTo(base + band * 0.85, 4),
  };
}

function buyCall(input: {
  horizons: HorizonView[];
  rsi: number | null;
  sma50Dist: number | null;
  ret10: number | null;
}): { buy: BuySignal; buyNote: string } {
  const h10 = input.horizons.find((row) => row.days === 10);
  const h20 = input.horizons.find((row) => row.days === 20);
  const h30 = input.horizons.find((row) => row.days === 30);
  const dist = input.sma50Dist ?? 0;
  const heat = input.rsi ?? 50;
  const extended = dist > 0.045 || heat > 65 || (input.ret10 ?? 0) > 0.06;
  const nearMa = dist >= -0.015 && dist <= 0.04;
  const rsiOk = heat >= 42 && heat <= 64;
  if (h20?.bias === "up" && h10?.bias !== "down" && nearMa && rsiOk && !extended) {
    return {
      buy: "buy",
      buyNote: "10 日沒有轉弱，20 日看升，價位還在 50 日均線附近。可以掛限價，不必追。",
    };
  }
  if ((h20?.bias === "up" || h30?.bias === "up") && (extended || h10?.bias === "down")) {
    return {
      buy: "wait",
      buyNote: "20 或 30 日仍偏多，但 10 日已偏熱或轉弱。等回落，不要追現價。",
    };
  }
  if (h10?.bias === "down" && h20?.bias === "down") {
    return { buy: "avoid", buyNote: "10 日和 20 日都偏弱。這輪不列為買入。" };
  }
  if (dist < -0.02) {
    return { buy: "avoid", buyNote: "跌破 50 日均線。這輪不列為買入。" };
  }
  return { buy: "wait", buyNote: "多空不夠集中。先觀望，等 10 日和 20 日同向。" };
}

function writeSummary(input: {
  symbol: string;
  bias: Bias;
  trend: string;
  ret21: number | null;
  rsi: number | null;
  excess: number | null;
  scenarioText: string;
}): string {
  const stance =
    input.bias === "up"
      ? `${input.symbol} 被列為看升，模型較傾向約一個月後收盤高於現價。`
      : input.bias === "down"
        ? `${input.symbol} 被列為承壓，模型較不傾向約一個月後收高。`
        : `${input.symbol} 維持中性，多空因子不夠集中。`;
  const momentum = input.ret21 == null ? "" : `近一個月 ${formatPct(input.ret21)}。`;
  const heat =
    input.rsi == null
      ? ""
      : input.rsi > 75
        ? `RSI ${input.rsi.toFixed(0)} 偏熱。`
        : input.rsi < 35
          ? `RSI ${input.rsi.toFixed(0)} 偏冷。`
          : `RSI ${input.rsi.toFixed(0)}。`;
  const relative =
    input.excess == null
      ? ""
      : input.excess > 0.03
        ? "過去三個月相對標普偏強。"
        : input.excess < -0.03
          ? "過去三個月相對標普偏弱。"
          : "過去三個月大致跟上標普。";
  return `${stance}${input.trend}${momentum}${heat}${relative}${input.scenarioText}這是技術摘要，不是投資建議。`;
}

export function analyzeStock(input: AnalyzeInput): StockSnapshot | null {
  const closes = input.bars.map((bar) => bar.c).filter((price) => price > 0);
  if (closes.length < 40 || !(input.price > 0)) return null;

  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const ret10 = trailingReturn(closes, 10);
  const ret21 = trailingReturn(closes, 21);
  const ret63 = trailingReturn(closes, 63);
  const rsiValue = rsi(closes);
  const sigma = dailySigma(closes);
  const vol21 = sigma == null ? null : sigma * Math.sqrt(21);

  const weighted: { factor: Factor; weight: number }[] = [
    { factor: trendFactor(input.price, sma50, sma200), weight: 0.28 },
  ];
  if (ret21 != null) {
    weighted.push({
      factor: momentumFactor(ret21, "一個月動能", "m1", 0.055, 0.08, 21),
      weight: 0.22,
    });
  }
  if (ret63 != null) {
    weighted.push({
      factor: momentumFactor(ret63, "三個月動能", "m3", 0.12, 0.14, 63),
      weight: 0.16,
    });
  }
  if (rsiValue != null) weighted.push({ factor: rsiFactor(rsiValue), weight: 0.12 });
  if (ret63 != null && input.spyRet63 != null) {
    weighted.push({ factor: relativeFactor(ret63, input.spyRet63), weight: 0.14 });
  }
  const volume = volumeFactor(
    input.bars.map((bar) => bar.v),
    ret21,
  );
  if (volume) weighted.push({ factor: volume, weight: 0.08 });

  const weightSum = weighted.reduce((sum, row) => sum + row.weight, 0);
  const score = Math.round(
    weighted.reduce((sum, row) => sum + row.factor.score * row.weight, 0) / weightSum,
  );
  const bias = biasOf(score);
  const horizons: HorizonView[] = [
    horizonView(10, closes, input.price, sma50, rsiValue, sigma, input.spyRet10),
    horizonView(20, closes, input.price, sma50, rsiValue, sigma, input.spyRet20),
    horizonView(30, closes, input.price, sma50, rsiValue, sigma, input.spyRet30),
  ];
  const mid = horizons[1] ?? horizons[0];
  const scenario = mid
    ? { low: mid.low, base: mid.base, high: mid.high }
    : { low: 0, base: 0, high: 0 };
  const sma50Dist = sma50 != null && sma50 > 0 ? roundTo(input.price / sma50 - 1, 6) : null;
  const call = buyCall({ horizons, rsi: rsiValue, sma50Dist, ret10 });

  const prev = input.prevClose > 0 ? input.prevClose : (closes[closes.length - 2] ?? input.price);
  const changePct = prev > 0 ? input.price / prev - 1 : 0;
  const lastVolume = [...input.bars].reverse().find((bar) => bar.v > 0)?.v ?? 0;
  const excess = ret63 != null && input.spyRet63 != null ? ret63 - input.spyRet63 : null;
  const trend = weighted[0]?.factor.detail ?? "";

  return {
    symbol: input.symbol,
    name: input.name,
    exchange: input.exchange,
    sector: input.sector,
    price: roundTo(input.price, 4),
    changePct: roundTo(changePct, 6),
    volume: Math.round(lastVolume),
    score: clamp(score, 0, 100),
    rank: 0,
    bias,
    ret21: ret21 == null ? null : roundTo(ret21, 6),
    ret63: ret63 == null ? null : roundTo(ret63, 6),
    rsi: rsiValue == null ? null : roundTo(rsiValue, 1),
    sma50Dist,
    sma200Dist: sma200 != null && sma200 > 0 ? roundTo(input.price / sma200 - 1, 6) : null,
    vol21: vol21 == null ? null : roundTo(vol21, 6),
    high52: input.high52,
    low52: input.low52,
    scenario,
    horizons,
    buy: call.buy,
    buyNote: call.buyNote,
    factors: weighted.map((row) => row.factor),
    summary: writeSummary({
      symbol: input.symbol,
      bias,
      trend,
      ret21,
      rsi: rsiValue,
      excess,
      scenarioText: `10 日${biasLabel(horizons[0]?.bias ?? "flat")}、20 日${biasLabel(horizons[1]?.bias ?? "flat")}、30 日${biasLabel(horizons[2]?.bias ?? "flat")}。20 日基準 ${formatPct(scenario.base)}，約 ${formatMoney(priceAt(input.price, scenario.base))}。訊號：${call.buyNote}`,
    }),
    series: input.bars.slice(-120).map((bar) => ({ t: bar.t, c: roundTo(bar.c, 4) })),
  };
}
