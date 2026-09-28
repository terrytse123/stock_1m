import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Star } from "lucide-react";
import { Sparkline } from "@/components/sparkline";
import { StockDetail, type NoteState } from "@/components/stock-detail";
import { SwingBoard } from "@/components/swing-board";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { explainStock, scanMarket } from "@/lib/market/api";
import { biasClass, biasLabel, formatMoney, formatPct, formatWhen, priceAt, toneClass } from "@/lib/market/format";
import { useBook } from "@/lib/market/store";
import { buildSwingPlans } from "@/lib/market/swing";
import type { ScanResult, StockSnapshot } from "@/lib/market/types";
import { BENCHMARKS, normalizeSymbol, TAPE_LABEL, UNIVERSE } from "@/lib/market/universe";

type SortKey = "score" | "day" | "month" | "symbol";

const fieldClass =
  "h-11 min-w-0 rounded-sm border border-line bg-bg px-3 text-sm text-fg placeholder:text-subtle";

function regimeLine(score: number | undefined): string {
  if (score == null) return "大盤分數暫時沒有。";
  if (score >= 62) return "標普技術面偏多，個股分數整體會被抬高，仍要看個股自己的位置。";
  if (score <= 45) return "標普技術面偏弱。高分股只是相對較穩或轉強，不是保證上漲。";
  return "標普技術面中性，排序主要反映個股彼此的差異。";
}

export function MarketDesk({ initial }: { initial: ScanResult }) {
  const [result, setResult] = useState(initial);
  const [pending, setPending] = useState(false);
  const [banner, setBanner] = useState<string | null>(initial.ok ? null : initial.error);
  const [selected, setSelected] = useState<string | null>(initial.ok ? (initial.stocks[0]?.symbol ?? null) : null);
  const [query, setQuery] = useState("");
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const [sector, setSector] = useState("all");
  const [sort, setSort] = useState<SortKey>("score");
  const [onlyUp, setOnlyUp] = useState(false);
  const [onlyWatch, setOnlyWatch] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [note, setNote] = useState<NoteState>({ symbol: "", status: "idle", text: null, error: null });
  const watched = useBook((state) => state.watched);
  const toggle = useBook((state) => state.toggle);
  const track = useBook((state) => state.track);

  useEffect(() => {
    let live = true;
    void (async () => {
      await useBook.persist.rehydrate();
      if (!live) return;
      setHydrated(true);
      const extra = useBook.getState().extras;
      if (extra.length) await reload(false, extra);
    })();
    return () => {
      live = false;
    };
    // Hydrate the local book once, then pull any saved custom tickers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!result.ok) return;
    if (!selected || !result.stocks.some((stock) => stock.symbol === selected)) {
      setSelected(result.stocks[0]?.symbol ?? null);
    }
  }, [result, selected]);

  async function reload(refresh: boolean, extra: string[]) {
    setPending(true);
    try {
      const next = await scanMarket({ data: { refresh, extra } });
      setResult(next);
      setBanner(next.ok ? null : next.error);
      return next;
    } catch (error) {
      const message = error instanceof Error ? error.message : "掃描失敗";
      setBanner(message);
      return null;
    } finally {
      setPending(false);
    }
  }

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    const symbol = normalizeSymbol(query);
    if (!symbol) {
      setSearchMsg("請輸入美股代碼，例如 NVDA。");
      return;
    }
    setQuery(symbol);
    setSearchMsg(null);
    if (result.ok && result.stocks.some((stock) => stock.symbol === symbol)) {
      choose(symbol);
      return;
    }
    const extra = [...new Set([...useBook.getState().extras, symbol])];
    const next = await reload(false, extra);
    if (next?.ok && next.stocks.some((stock) => stock.symbol === symbol)) {
      track(symbol);
      choose(symbol);
      return;
    }
    setSearchMsg(`找不到 ${symbol}，或這次沒有拿到行情。`);
  }

  function choose(symbol: string) {
    setSelected(symbol);
    if (typeof window === "undefined" || window.innerWidth >= 1024) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("stock-detail")?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "start",
    });
  }

  async function onExplain() {
    if (!selected) return;
    setNote({ symbol: selected, status: "loading", text: null, error: null });
    try {
      const response = await explainStock({ data: { symbol: selected } });
      if (!response.ok) {
        setNote({ symbol: selected, status: "error", text: null, error: response.error });
        return;
      }
      setNote({ symbol: selected, status: "ready", text: response.text, error: null });
    } catch {
      setNote({ symbol: selected, status: "error", text: null, error: "研究筆記沒有寫成。請再試一次。" });
    }
  }

  const sectors = useMemo(() => [...new Set(UNIVERSE.map((row) => row.sector))], []);
  const stocks = result.ok ? result.stocks : [];
  const upCount = stocks.filter((stock) => stock.bias === "up").length;
  const spy = result.ok ? result.market.find((item) => item.symbol === "SPY") : undefined;
  const top = stocks.slice(0, 3);
  const active = stocks.find((stock) => stock.symbol === selected) ?? null;
  const swingPlans = useMemo(
    () => (result.ok ? buildSwingPlans(result.stocks, result.asOf) : []),
    [result],
  );

  const rows = useMemo(() => {
    let next = stocks;
    if (sector !== "all") next = next.filter((stock) => stock.sector === sector);
    if (onlyUp) next = next.filter((stock) => stock.bias === "up");
    if (onlyWatch) next = next.filter((stock) => watched.includes(stock.symbol));
    const copy = [...next];
    copy.sort((a, b) => {
      if (sort === "symbol") return a.symbol.localeCompare(b.symbol);
      if (sort === "day") return b.changePct - a.changePct;
      if (sort === "month") return (b.ret21 ?? -999) - (a.ret21 ?? -999);
      return a.rank - b.rank;
    });
    return copy;
  }, [onlyUp, onlyWatch, sector, sort, stocks, watched]);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-col gap-5 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <p className="text-xs font-medium tracking-wide text-subtle">美股雷達</p>
          <h1 className="type-display mt-1">月升</h1>
          <p className="mt-3 text-sm text-muted">
            追蹤一籃流動美股，用趨勢、動能、相對強弱與量能自動分析，再依未來約一個月收高的傾向排序。
          </p>
        </div>
        <div className="w-full sm:max-w-sm">
          <form className="flex gap-2" onSubmit={onSearch}>
            <label className="sr-only" htmlFor="symbol-search">
              股票代碼
            </label>
            <input
              id="symbol-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="輸入代碼，例如 AVGO"
              className={cn(fieldClass, "flex-1 uppercase")}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
            <Button type="submit" variant="primary" disabled={pending}>
              查看
            </Button>
          </form>
          {searchMsg ? <p className="mt-2 text-xs text-down">{searchMsg}</p> : null}
        </div>
      </header>

      {banner ? (
        <p className="mt-4 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-down" role="status">
          {banner}
        </p>
      ) : null}

      <div className="mt-6 lg:grid lg:grid-cols-3 lg:gap-6">
        <div className="min-w-0 lg:col-span-2">
          <section aria-label="大盤">
            <div className="mb-3 flex items-end justify-between gap-3">
              <h2 className="text-sm font-medium">大盤</h2>
              <p className="text-xs text-subtle">
                {result.ok && result.asOf ? `報價 ${formatWhen(result.asOf)} 美東` : "尚無報價時間"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {BENCHMARKS.map((symbol) => {
                const item = result.ok ? result.market.find((row) => row.symbol === symbol) : undefined;
                return (
                  <div key={symbol} className="rounded-lg border border-line bg-surface px-3 py-3">
                    <div className="text-xs text-subtle">{TAPE_LABEL[symbol] ?? symbol}</div>
                    <div className="mt-2 flex items-baseline justify-between gap-2">
                      <span className="num text-sm">{item ? formatMoney(item.price) : "—"}</span>
                      <span className={cn("num text-xs font-medium", item ? toneClass(item.changePct) : "text-subtle")}>
                        {item ? formatPct(item.changePct) : ""}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-subtle">
                      近月 {item?.ret21 == null ? "—" : formatPct(item.ret21)}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-subtle">{regimeLine(spy?.score)}</p>
          </section>

          <SwingBoard
            plans={swingPlans}
            pending={pending}
            hydrated={hydrated}
            onRefresh={() => void reload(true, useBook.getState().extras)}
            onOpen={choose}
          />

          <section className="mt-8" aria-label="下月預測">
            <div className="flex items-end justify-between gap-3">
              <h2 className="text-sm font-medium">下月預測</h2>
              <p className="text-xs text-subtle">
                {stocks.length ? `${stocks.length} 檔中 ${upCount} 檔看升` : "尚無排序"}
              </p>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              分數越高，越傾向未來約 21 個交易日收盤高於今日。情境用收縮後的近期漂移，加減大約一個月的波動。
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {top.map((stock) => (
                <button
                  key={stock.symbol}
                  type="button"
                  onClick={() => choose(stock.symbol)}
                  className={cn(
                    "rounded-xl border bg-surface p-4 text-left transition-colors duration-150",
                    selected === stock.symbol ? "border-fg" : "border-line hover:border-muted",
                  )}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-xs text-subtle">
                        {String(stock.rank).padStart(2, "0")} · {stock.sector}
                      </span>
                      <span className="mt-2 block text-lg font-semibold">{stock.symbol}</span>
                      <span className="block truncate text-xs text-muted">{stock.name}</span>
                    </span>
                    <span className="text-right">
                      <span className="type-score block text-3xl">{stock.score}</span>
                      <span className={cn("block text-xs font-medium", biasClass(stock.bias))}>{biasLabel(stock.bias)}</span>
                    </span>
                  </span>
                  <span className="mt-4 flex items-baseline justify-between text-xs">
                    <span className="text-subtle">{stock.bias === "up" ? "預計價位" : "情境基準"}</span>
                    <span className={cn("num font-medium", stock.bias === "up" ? "text-up" : toneClass(stock.scenario.base))}>
                      {formatMoney(priceAt(stock.price, stock.scenario.base))}
                    </span>
                  </span>
                  <span className="mt-1 flex items-baseline justify-between text-xs text-subtle">
                    <span>區間</span>
                    <span className="num">
                      {formatMoney(priceAt(stock.price, stock.scenario.low))} –{" "}
                      {formatMoney(priceAt(stock.price, stock.scenario.high))}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <div className="mt-6 lg:hidden">
            {active ? (
              <StockDetail stock={active} note={note} onExplain={() => void onExplain()} anchor chartId="mobile" />
            ) : null}
          </div>

          <section className="mt-8" aria-label="個股名單">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-medium">個股名單</h2>
              <div className="flex flex-wrap gap-2">
                <Button variant="quiet" onClick={() => void reload(true, useBook.getState().extras)} disabled={pending}>
                  {pending ? "掃描中" : "重新掃描"}
                </Button>
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <select
                aria-label="板塊"
                value={sector}
                onChange={(event) => setSector(event.target.value)}
                className={cn(fieldClass, "sm:w-36")}
              >
                <option value="all">全部板塊</option>
                {sectors.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <select
                aria-label="排序"
                value={sort}
                onChange={(event) => setSort(event.target.value as SortKey)}
                className={cn(fieldClass, "sm:w-36")}
              >
                <option value="score">上行分數</option>
                <option value="day">今日漲跌</option>
                <option value="month">近月漲跌</option>
                <option value="symbol">代碼</option>
              </select>
              <Button variant={onlyUp ? "primary" : "quiet"} onClick={() => setOnlyUp((value) => !value)}>
                只看升
              </Button>
              <Button
                variant={onlyWatch ? "primary" : "quiet"}
                onClick={() => setOnlyWatch((value) => !value)}
                disabled={!hydrated}
              >
                追蹤{hydrated ? ` ${watched.length}` : ""}
              </Button>
            </div>

            <div className={cn("mt-4 overflow-hidden rounded-xl border border-line bg-surface", pending && "opacity-70")}>
              {rows.length === 0 ? (
                <p className="px-4 py-8 text-sm text-muted">
                  {onlyWatch ? "還沒有追蹤。在名單上點星號即可釘選，這台裝置會記住。" : "這個篩選下面沒有標的。"}
                </p>
              ) : (
                <ul>
                  {rows.map((stock) => (
                    <StockRow
                      key={stock.symbol}
                      stock={stock}
                      active={stock.symbol === selected}
                      watched={watched.includes(stock.symbol)}
                      onSelect={() => choose(stock.symbol)}
                      onToggle={() => toggle(stock.symbol)}
                    />
                  ))}
                </ul>
              )}
            </div>
            {result.ok && result.failed.length > 0 ? (
              <p className="mt-3 text-xs text-subtle">這次沒拿到：{result.failed.join("、")}</p>
            ) : null}
          </section>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">
            {active ? (
              <StockDetail stock={active} note={note} onExplain={() => void onExplain()} chartId="desk" />
            ) : (
              <p className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">選一檔股票看分析。</p>
            )}
          </div>
        </aside>
      </div>

      <footer className="mt-10 border-t border-line pt-6 text-xs leading-relaxed text-subtle">
        <details>
          <summary className="cursor-pointer text-sm text-muted">這個分數怎麼來的</summary>
          <p className="mt-3 max-w-3xl">
            用大約一年的日線計算六個因子：均線趨勢、一個月動能、三個月動能、RSI、相對標普 500、成交量是否配合。
            權重大致是 28%、22%、16%、12%、14%、8%，缺資料的因子會拿掉並把其餘權重重新分配。動能偏好溫和上漲，暴漲會因均值回歸風險被扣分。
            看升、中性、承壓是分數區間，不是回測過的勝率。
          </p>
        </details>
        <p className="mt-4 max-w-3xl">
          行情為公開報價，可能延遲，也可能與你的券商不同。月升不做投資建議。看升標的的預計價位，是把約一個月的情境報酬換成美元，不是保證到達的目標。過往價格不能保證下個月上漲。
        </p>
      </footer>
    </main>
  );
}

function StockRow({
  stock,
  active,
  watched,
  onSelect,
  onToggle,
}: {
  stock: StockSnapshot;
  active: boolean;
  watched: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  const points = stock.series.slice(-32).map((point) => point.c);
  const up = points.length > 1 ? points[points.length - 1]! >= points[0]! : stock.changePct >= 0;
  return (
    <li className={cn("flex items-stretch border-b border-line last:border-b-0", active && "bg-surface-2")}>
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left">
        <span className="num w-6 shrink-0 text-xs text-subtle">{stock.rank}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="font-medium">{stock.symbol}</span>
            <span className="num text-sm">{formatMoney(stock.price)}</span>
          </span>
          <span className="mt-0.5 flex items-baseline justify-between gap-3 text-xs text-muted">
            <span className="truncate">
              {stock.sector} · {stock.name}
            </span>
            <span className={cn("num shrink-0 font-medium", toneClass(stock.changePct))}>{formatPct(stock.changePct)}</span>
          </span>
        </span>
        <span className="hidden sm:block">
          <Sparkline points={points} up={up} />
        </span>
        <span className="w-20 shrink-0 text-right">
          <span className="type-score block text-xl">{stock.score}</span>
          <span className={cn("text-xs", biasClass(stock.bias))}>{biasLabel(stock.bias)}</span>
          {stock.bias === "up" ? (
            <span className="num mt-0.5 block text-xs text-up">{formatMoney(priceAt(stock.price, stock.scenario.base))}</span>
          ) : null}
        </span>
      </button>
      <button
        type="button"
        aria-pressed={watched}
        aria-label={watched ? `取消追蹤 ${stock.symbol}` : `追蹤 ${stock.symbol}`}
        onClick={onToggle}
        className="grid w-11 shrink-0 place-items-center text-subtle hover:text-fg"
      >
        <Star className="size-4" fill={watched ? "currentColor" : "none"} />
      </button>
    </li>
  );
}
