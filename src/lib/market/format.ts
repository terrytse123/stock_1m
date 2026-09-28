import type { Bias } from "./types";

export function formatPct(n: number, digits = 1): string {
  const value = n * 100;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

function plain(value: string): string {
  return value.replace(/[\u00a0\u202f\u2009]/g, " ");
}

export function formatMoney(n: number): string {
  return plain(
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n),
  );
}

export function formatCompact(n: number): string {
  return plain(
    new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n),
  ).replace(" ", "");
}

export function formatWhen(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${Number(pick("month"))}/${Number(pick("day"))} ${pick("hour")}:${pick("minute")}`;
}

export function formatDay(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date(ms));
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${Number(pick("month"))}/${Number(pick("day"))}`;
}

export function priceAt(price: number, ret: number): number {
  return Math.round(price * (1 + ret) * 100) / 100;
}

export function toneClass(n: number): string {
  if (n > 0.0005) return "text-up";
  if (n < -0.0005) return "text-down";
  return "text-muted";
}

export function biasLabel(bias: Bias): string {
  if (bias === "up") return "看升";
  if (bias === "down") return "承壓";
  return "中性";
}

export function biasClass(bias: Bias): string {
  if (bias === "up") return "text-up";
  if (bias === "down") return "text-down";
  return "text-muted";
}
