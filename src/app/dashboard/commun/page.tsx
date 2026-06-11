"use client";

import { useEffect, useMemo, useState } from "react";
import { getDaysInMonth, isSameMonth, parseISO } from "date-fns";
import { Repeat, TrendingDown, Users } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryBreakdown } from "@/components/shared/CategoryBreakdown";
import { PageHeader } from "@/components/shared/PageHeader";
import { RecentTransactions } from "@/components/shared/RecentTransactions";
import { supabase, ALLOWED_EMAILS } from "@/lib/supabase";
import { useAppStore } from "@/lib/store";
import {
  formatCurrency,
  formatMonth,
  getMonthRange,
  monthlyEquivalent,
  normalizeLabel,
  resolveColor,
} from "@/lib/utils";
import type { Profile, Subscription, Transaction } from "@/types";
import { KpiCard } from "@/components/shared/KpiCard";

function DashboardCommunContent() {
  const { profile, partner, categories, currentMonth, dataVersion, ready } =
    useAppStore();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  // Catégories du budget commun : lignes de budget sans propriétaire.
  const [commonCategoryIds, setCommonCategoryIds] = useState<Set<string>>(
    new Set()
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // AppShell garantit un profil non nul quand ready est vrai ;
    // double garde explicite pour ne jamais requêter avec un user nul.
    if (!ready || !profile) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      const { start, end } = getMonthRange(currentMonth);
      const [txRes, subsRes, commonLinesRes] = await Promise.all([
        supabase
          .from("transactions")
          .select("*")
          .gte("date", start)
          .lte("date", end)
          .order("date", { ascending: false }),
        supabase.from("subscriptions").select("*").eq("is_active", true),
        supabase.from("budget_lines").select("category_id").is("owner_id", null),
      ]);
      if (cancelled) return;
      setTransactions((txRes.data as Transaction[] | null) ?? []);
      setSubscriptions((subsRes.data as Subscription[] | null) ?? []);
      setCommonCategoryIds(
        new Set(
          ((commonLinesRes.data as { category_id: string }[] | null) ?? [])
            .map((l) => l.category_id)
            .filter(Boolean)
        )
      );
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [ready, profile, currentMonth, dataVersion]);

  // Seul jeu de transactions de la page : les dépenses sur le budget commun,
  // peu importe qui paie.
  const commonTx = useMemo(
    () =>
      transactions.filter(
        (tx) => tx.category_id && commonCategoryIds.has(tx.category_id)
      ),
    [transactions, commonCategoryIds]
  );

  const totalSpend = commonTx.reduce((sum, tx) => sum + Number(tx.amount), 0);

  // Ordre figé : Ophélie puis Joris, comme sur le budget commun.
  const people = useMemo(() => {
    const all = [profile, partner].filter((p): p is Profile => p !== null);
    const ophelie = all.find((p) => p.email === ALLOWED_EMAILS[1]);
    const joris = all.find((p) => p.email === ALLOWED_EMAILS[0]);
    const rest = all.filter((p) => p !== ophelie && p !== joris);
    return [ophelie, joris, ...rest].filter((p): p is Profile => !!p);
  }, [profile, partner]);

  const personSpend = (personId: string) =>
    commonTx
      .filter((tx) => tx.user_id === personId)
      .reduce((sum, tx) => sum + Number(tx.amount), 0);

  // Vue commune : abonnements partagés. Chacun saisit sa part (moitié) comme
  // une entrée ; on additionne donc les parts (sans doubler). Le compteur
  // dédoublonne par libellé (les 2 parts de « Lassie » = 1 abonnement commun).
  const sharedSubs = subscriptions.filter((sub) => sub.is_shared);
  const subsMonthly = sharedSubs.reduce(
    (sum, sub) => sum + monthlyEquivalent(Number(sub.amount), sub.frequency),
    0
  );
  const sharedCount = new Set(sharedSubs.map((s) => normalizeLabel(s.label)))
    .size;

  const chartData = useMemo(() => {
    const isThisMonth = isSameMonth(currentMonth, new Date());
    const lastDay = isThisMonth
      ? new Date().getDate()
      : getDaysInMonth(currentMonth);
    const byDay = new Array<number>(getDaysInMonth(currentMonth)).fill(0);
    for (const tx of commonTx) {
      const day = parseISO(tx.date).getDate();
      byDay[day - 1] += Number(tx.amount);
    }
    let cumulative = 0;
    return byDay.slice(0, lastDay).map((value, index) => {
      cumulative += value;
      return { day: index + 1, total: Math.round(cumulative * 100) / 100 };
    });
  }, [commonTx, currentMonth]);

  const pieData = useMemo(() => {
    const rows = categories
      .map((category) => ({
        name: category.label,
        value: commonTx
          .filter((tx) => tx.category_id === category.id)
          .reduce((sum, tx) => sum + Number(tx.amount), 0),
        color: resolveColor(category.color),
      }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value);
    const top = rows.slice(0, 5);
    const rest = rows.slice(5).reduce((sum, row) => sum + row.value, 0);
    const uncategorized = commonTx
      .filter((tx) => !tx.category_id)
      .reduce((sum, tx) => sum + Number(tx.amount), 0);
    if (rest + uncategorized > 0) {
      top.push({ name: "Autres", value: rest + uncategorized, color: "#52525b" });
    }
    return top;
  }, [commonTx, categories]);

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Dashboard commun"
          subtitle={`Budget commun · ${formatMonth(currentMonth)}`}
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl lg:col-span-2" />
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dashboard commun"
        subtitle={`Budget commun · ${formatMonth(currentMonth)}`}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <KpiCard
          label="Dépensé ce mois"
          value={formatCurrency(totalSpend)}
          sub={`${commonTx.length} transaction${commonTx.length > 1 ? "s" : ""}`}
          icon={TrendingDown}
          tone="indigo"
        />
        {people.map((person, index) => (
          <KpiCard
            key={person.id}
            label={person.display_name}
            value={formatCurrency(personSpend(person.id))}
            sub="sur le budget commun"
            icon={index === 0 ? TrendingDown : Users}
            tone={index === 0 ? "indigo" : "purple"}
          />
        ))}
        <KpiCard
          label="Abonnements / mois"
          value={formatCurrency(subsMonthly)}
          sub={`${sharedCount} commun${sharedCount > 1 ? "s" : ""}`}
          icon={Repeat}
          tone="amber"
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-3">
        {/* Colonne principale : graphique + détail par catégorie */}
        <div className="space-y-4 xl:col-span-2">
        <Card>
          <CardTitle>Dépenses cumulées</CardTitle>
          <div className="mt-3 h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#27272a"
                  vertical={false}
                />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#52525b", fontSize: 11 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#52525b", fontSize: 11 }}
                  width={56}
                  tickFormatter={(value: number) => `${value} €`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#18181b",
                    border: "1px solid #27272a",
                    borderRadius: 12,
                    fontSize: 12,
                    color: "#e4e4e7",
                  }}
                  labelFormatter={(day) => `Jour ${day}`}
                  formatter={(value) => [
                    formatCurrency(Number(value)),
                    "Cumulé",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fill="url(#spendGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <CategoryBreakdown transactions={commonTx} />
        </div>

        {/* Rail droit : répartition, dernières transactions */}
        <div className="space-y-4">
        <Card>
          <CardTitle>Répartition</CardTitle>
          {pieData.length === 0 ? (
            <div className="flex h-56 items-center justify-center">
              <p className="text-sm text-zinc-600">Aucune dépense ce mois-ci</p>
            </div>
          ) : (
            <>
              <div className="mt-2 h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={72}
                      paddingAngle={3}
                      strokeWidth={0}
                    >
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#18181b",
                        border: "1px solid #27272a",
                        borderRadius: 12,
                        fontSize: 12,
                        color: "#e4e4e7",
                      }}
                      formatter={(value) => formatCurrency(Number(value))}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 space-y-1.5">
                {pieData.map((entry) => (
                  <div
                    key={entry.name}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-zinc-400">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: entry.color }}
                      />
                      <span className="truncate">{entry.name}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-zinc-500">
                      {formatCurrency(entry.value)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
        <RecentTransactions transactions={commonTx} />
        </div>
      </div>
    </div>
  );
}

export default function DashboardCommunPage() {
  return (
    <AppShell fullWidth>
      <DashboardCommunContent />
    </AppShell>
  );
}
