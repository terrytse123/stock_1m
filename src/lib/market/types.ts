export type Bias = "up" | "flat" | "down";

export type BuySignal = "buy" | "wait" | "avoid";

export type HorizonView = {
  days: 10 | 20 | 30;
  bias: Bias;
  low: number;
  base: number;
  high: number;
};

export type Factor = {
  key: string;
  label: string;
  score: number;
  detail: string;
};

export type Scenario = {
  low: number;
  base: number;
  high: number;
};

export type StockSnapshot = {
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  price: number;
  changePct: number;
  volume: number;
  score: number;
  rank: number;
  bias: Bias;
  ret21: number | null;
  ret63: number | null;
  rsi: number | null;
  sma50Dist: number | null;
  sma200Dist: number | null;
  vol21: number | null;
  high52: number | null;
  low52: number | null;
  scenario: Scenario;
  horizons: HorizonView[];
  buy: BuySignal;
  buyNote: string;
  factors: Factor[];
  summary: string;
  series: { t: number; c: number }[];
};

export type MarketPulse = {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  ret21: number | null;
  score: number;
  bias: Bias;
};

export type ScanOk = {
  ok: true;
  asOf: number;
  market: MarketPulse[];
  stocks: StockSnapshot[];
  failed: string[];
};

export type ScanResult = ScanOk | { ok: false; error: string; failed: string[] };

export type ExplainResult =
  | { ok: true; text: string; cached: boolean }
  | { ok: false; error: string };

export type ScanInput = {
  refresh: boolean;
  extra: string[];
};
