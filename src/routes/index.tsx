import { createFileRoute } from "@tanstack/react-router";
import { MarketDesk } from "@/components/market-desk";
import { scanMarket } from "@/lib/market/api";

export const Route = createFileRoute("/")({
  loader: () => scanMarket({ data: { refresh: false, extra: [] } }),
  component: Home,
});

function Home() {
  const initial = Route.useLoaderData();
  return <MarketDesk initial={initial} />;
}
