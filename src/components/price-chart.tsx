import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point = { t: number; c: number };

function formatTick(value: number): string {
  return new Intl.DateTimeFormat("zh-Hant-TW", {
    timeZone: "America/New_York",
    month: "numeric",
    day: "numeric",
  }).format(new Date(value));
}

export function PriceChart({ chartId, series, up }: { chartId: string; series: Point[]; up: boolean }) {
  const data = series.map((point) => ({ date: point.t * 1000, c: point.c }));
  const stroke = up ? "var(--color-up)" : "var(--color-down)";
  const gradientId = `px-${chartId}`;
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return <div className="h-52 w-full" aria-hidden="true" />;
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--color-line)" />
          <XAxis
            dataKey="date"
            tickFormatter={formatTick}
            tick={{ fill: "var(--color-subtle)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis
            domain={["auto", "auto"]}
            tick={{ fill: "var(--color-subtle)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={48}
            tickFormatter={(value: number) => (value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(0))}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-line)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--color-muted)" }}
            itemStyle={{ color: "var(--color-fg)" }}
            labelFormatter={(value) => formatTick(Number(value))}
            formatter={(value) => [
              Number(value).toLocaleString("en-US", { style: "currency", currency: "USD" }),
              "收盤",
            ]}
          />
          <Area
            type="monotone"
            dataKey="c"
            stroke={stroke}
            strokeWidth={1.75}
            fill={`url(#${gradientId})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
