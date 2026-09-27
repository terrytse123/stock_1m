import { PriceChart } from "@/components/price-chart";
import { Button } from "@/components/ui/button";
import { biasClass, biasLabel, formatCompact, formatMoney, formatPct, toneClass } from "@/lib/market/format";
import type { ExplainResult, StockSnapshot } from "@/lib/market/types";

type NoteState = {
  symbol: string;
  status: "idle" | "loading" | "ready" | "error";
  text: string | null;
  error: string | null;
};

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-sm bg-surface-2 px-3 py-2">
      <div className="text-xs text-subtle">{label}</div>
      <div className={`num mt-1 text-sm ${className ?? "text-fg"}`}>{value}</div>
    </div>
  );
}

function Range52({ low, high, price }: { low: number; high: number; price: number }) {
  if (!(high > low)) return null;
  const pos = Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100));
  return (
    <div>
      <div className="mb-2 flex justify-between text-xs text-subtle">
        <span className="num">52 週低 {formatMoney(low)}</span>
        <span className="num">52 週高 {formatMoney(high)}</span>
      </div>
      <div className="relative h-1.5 rounded-full bg-bg">
        <div
          className="absolute top-1/2 size-3 -translate-y-1/2 rounded-full bg-fg"
          style={{ left: `calc(${pos}% - 6px)` }}
        />
      </div>
    </div>
  );
}

export function StockDetail({
  stock,
  note,
  onExplain,
  anchor = false,
  chartId,
}: {
  stock: StockSnapshot;
  note: NoteState;
  onExplain: () => void;
  anchor?: boolean;
  chartId: string;
}) {
  const upWindow = stock.series.length > 1 ? stock.series[stock.series.length - 1]!.c >= stock.series[0]!.c : stock.changePct >= 0;
  const noteForStock = note.symbol === stock.symbol ? note : null;
  return (
    <article id={anchor ? "stock-detail" : undefined} className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-subtle">
            {stock.sector} · {stock.exchange || "美股"}
          </p>
          <h2 className="mt-1 truncate text-xl font-semibold">{stock.symbol}</h2>
          <p className="truncate text-sm text-muted">{stock.name}</p>
        </div>
        <div className="text-right">
          <div className="type-score text-4xl">{stock.score}</div>
          <div className={`text-sm font-medium ${biasClass(stock.bias)}`}>{biasLabel(stock.bias)}</div>
        </div>
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-3">
        <p className="num text-2xl font-medium">{formatMoney(stock.price)}</p>
        <p className={`num text-sm font-medium ${toneClass(stock.changePct)}`}>{formatPct(stock.changePct)}</p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-sm bg-surface-2 px-2 py-2">
          <div className="text-xs text-subtle">下緣</div>
          <div className={`num mt-1 text-sm ${toneClass(stock.scenario.low)}`}>{formatPct(stock.scenario.low)}</div>
        </div>
        <div className="rounded-sm bg-surface-2 px-2 py-2">
          <div className="text-xs text-subtle">基準</div>
          <div className={`num mt-1 text-sm ${toneClass(stock.scenario.base)}`}>{formatPct(stock.scenario.base)}</div>
        </div>
        <div className="rounded-sm bg-surface-2 px-2 py-2">
          <div className="text-xs text-subtle">上緣</div>
          <div className={`num mt-1 text-sm ${toneClass(stock.scenario.high)}`}>{formatPct(stock.scenario.high)}</div>
        </div>
      </div>
      <p className="mt-2 text-xs text-subtle">未來約一個月的情境區間，不是目標價。</p>

      <p className="mt-4 text-sm leading-relaxed text-fg">{stock.summary}</p>

      <div className="mt-4">
        <PriceChart chartId={chartId} series={stock.series} up={upWindow} />
      </div>

      {stock.low52 != null && stock.high52 != null ? (
        <div className="mt-4">
          <Range52 low={stock.low52} high={stock.high52} price={stock.price} />
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Stat label="近一個月" value={stock.ret21 == null ? "—" : formatPct(stock.ret21)} className={toneClass(stock.ret21 ?? 0)} />
        <Stat label="近三個月" value={stock.ret63 == null ? "—" : formatPct(stock.ret63)} className={toneClass(stock.ret63 ?? 0)} />
        <Stat label="RSI(14)" value={stock.rsi == null ? "—" : stock.rsi.toFixed(0)} />
        <Stat label="一個月波動" value={stock.vol21 == null ? "—" : formatPct(stock.vol21, 1)} />
        <Stat
          label="距 50 日均線"
          value={stock.sma50Dist == null ? "—" : formatPct(stock.sma50Dist)}
          className={toneClass(stock.sma50Dist ?? 0)}
        />
        <Stat
          label="距 200 日均線"
          value={stock.sma200Dist == null ? "—" : formatPct(stock.sma200Dist)}
          className={toneClass(stock.sma200Dist ?? 0)}
        />
      </div>
      <p className="mt-2 text-xs text-subtle">成交量 {stock.volume > 0 ? formatCompact(stock.volume) : "—"}</p>

      <ul className="mt-4 space-y-3">
        {stock.factors.map((factor) => (
          <li key={factor.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span>{factor.label}</span>
              <span className="num text-muted">{factor.score}</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-bg">
              <div className="h-full bg-fg" style={{ width: `${factor.score}%` }} />
            </div>
            <p className="mt-1 text-xs leading-relaxed text-subtle">{factor.detail}</p>
          </li>
        ))}
      </ul>

      <div className="mt-5 border-t border-line pt-4">
        <Button variant="primary" onClick={onExplain} disabled={noteForStock?.status === "loading"}>
          {noteForStock?.status === "loading" ? "正在寫…" : "請 Grok 寫研究筆記"}
        </Button>
        {noteForStock?.status === "ready" && noteForStock.text ? (
          <p className="mt-3 text-sm leading-relaxed text-fg">{noteForStock.text}</p>
        ) : null}
        {noteForStock?.status === "error" && noteForStock.error ? (
          <p className="mt-3 text-sm text-down">{noteForStock.error}</p>
        ) : null}
        <p className="mt-3 text-xs leading-relaxed text-subtle">
          筆記只根據上面的數字改寫，不會另外查新聞。點一次才會呼叫，同一檔短時間內會沿用上次結果。
        </p>
      </div>
    </article>
  );
}

export type { NoteState, ExplainResult };
