import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/market/format";
import { useBook, type SwingMark } from "@/lib/market/store";
import { deadlineLabel, type SwingPlan, type SwingStatus } from "@/lib/market/swing";

const STATUSES: { id: SwingStatus; label: string }[] = [
  { id: "watch", label: "觀望" },
  { id: "order", label: "已掛單" },
  { id: "hold", label: "持有" },
  { id: "done", label: "已出場" },
];

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-subtle">{label}</span>
      <span className="num text-right">{value}</span>
    </div>
  );
}

function PlanCard({
  plan,
  mark,
  hydrated,
  onOpen,
  onStatus,
  onNote,
}: {
  plan: SwingPlan;
  mark: SwingMark;
  hydrated: boolean;
  onOpen: () => void;
  onStatus: (status: SwingStatus) => void;
  onNote: (note: string) => void;
}) {
  return (
    <article className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onOpen} className="min-w-0 text-left">
          <span className="block text-xs text-subtle">{plan.sector}</span>
          <span className="mt-1 block text-lg font-semibold">{plan.symbol}</span>
          <span className="block truncate text-xs text-muted">{plan.name}</span>
        </button>
        <div className="text-right">
          <div className="num text-sm">{formatMoney(plan.price)}</div>
          <div className="mt-1 text-xs text-subtle">分數 {plan.score}</div>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted">{plan.reason}</p>
      <div className="mt-3 space-y-2">
        <Row label={plan.wait ? "等回落再買" : "限價買入"} value={`${formatMoney(plan.entryLow)} – ${formatMoney(plan.entryHigh)}`} />
        <Row label="停損" value={`收盤跌破 ${formatMoney(plan.stop)}`} />
        <Row label="賣出" value={`${formatMoney(plan.target1)} 減半，${formatMoney(plan.target2)} 清倉`} />
        <Row label="最遲" value={deadlineLabel(plan.deadline)} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {STATUSES.map((status) => (
          <Button
            key={status.id}
            variant={hydrated && mark.status === status.id ? "primary" : "quiet"}
            onClick={() => onStatus(status.id)}
            disabled={!hydrated}
          >
            {status.label}
          </Button>
        ))}
      </div>
      <label className="mt-3 block text-xs text-subtle">
        我的情況
        <input
          value={hydrated ? mark.note : ""}
          onChange={(event) => onNote(event.target.value)}
          disabled={!hydrated}
          placeholder="例如：220 已買，到價先賣一半"
          className="mt-1 h-11 w-full rounded-sm border border-line bg-bg px-3 text-sm text-fg placeholder:text-subtle"
        />
      </label>
    </article>
  );
}

export function SwingBoard({
  plans,
  pending,
  hydrated,
  onRefresh,
  onOpen,
}: {
  plans: SwingPlan[];
  pending: boolean;
  hydrated: boolean;
  onRefresh: () => void;
  onOpen: (symbol: string) => void;
}) {
  const marks = useBook((state) => state.plans);
  const setPlan = useBook((state) => state.setPlan);
  const exitBy = plans[0] ? deadlineLabel(plans[0].deadline) : null;

  return (
    <section className="mt-8" aria-label="一個月短炒">
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-sm font-medium">一個月短炒</h2>
        <Button variant="quiet" onClick={onRefresh} disabled={pending}>
          {pending ? "更新中" : "更新情況"}
        </Button>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        只做約一個月，最多三檔。看升、但還沒追太高的才入選，板塊盡量錯開。
        {exitBy ? ` 這次最遲 ${exitBy}出場。` : ""}
        按更新會用最新行情重算價位；你記的狀態留在這台裝置。
      </p>
      {plans.length === 0 ? (
        <p className={cn("mt-4 rounded-xl border border-line bg-surface px-4 py-6 text-sm text-muted")}>
          這次沒有適合短炒的看升標的。可先更新情況，或等回檔再看。
        </p>
      ) : (
        <div className="mt-4 grid gap-3">
          {plans.map((plan) => (
            <PlanCard
              key={plan.symbol}
              plan={plan}
              mark={marks[plan.symbol] ?? { status: "watch", note: "" }}
              hydrated={hydrated}
              onOpen={() => onOpen(plan.symbol)}
              onStatus={(status) => setPlan(plan.symbol, { status })}
              onNote={(note) => setPlan(plan.symbol, { note })}
            />
          ))}
        </div>
      )}
    </section>
  );
}
