"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDaysInMonth, isSameMonth, parseISO } from "date-fns";
import { Repeat, TrendingDown, Wallet } from "lucide-react";
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
import { IncomeWidget } from "@/components/shared/IncomeWidget";
import { PageHeader } from "@/components/shared/PageHeader";
import { RecentTransactions } from "@/components/shared/RecentTransactions";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/lib/store";
import {
  formatCurrency,
  formatMonth,
  getMonthRange,
  lineAppliesToMonth,
  monthlyEquivalent,
  resolveColor,
} from "@/lib/utils";
import type {
  BudgetLine,
  BudgetLineOverride,
  LedgerEntry,
  MonthlyIncome,
  Subscription,
  Transaction,
} from "@/types";
import { KpiCard } from "@/components/shared/KpiCard";

function DashboardContent() {
  const { profile, categories, currentMonth, dataVersion, ready, bumpDataVersion } =
    useAppStore();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [income, setIncome] = useState<MonthlyIncome | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  // Lignes du budget (commun + perso de l'utilisateur) + ajustements du mois,
  // pour calculer le budget prévu et distinguer une dépense partagée d'une
  // dépense purement perso (du partenaire) à exclure du dashboard.
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [overrides, setOverrides] = useState<BudgetLineOverride[]>([]);
  // Écritures du Compte (registre) de l'utilisateur : pour le « Solde restant »
  // = solde courant du compte = somme des opérations jusqu'à aujourd'hui.
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const loadIdRef = useRef(0);

  const load = useCallback(
    async (silent = false) => {
      if (!ready || !profile) return;
      const id = ++loadIdRef.current;
      if (!silent) setLoading(true);
      const userId = profile.id;
      const { start, end } = getMonthRange(currentMonth);
      const m = currentMonth.getMonth() + 1;
      const y = currentMonth.getFullYear();
      const [txRes, incomeRes, subsRes, linesRes, overridesRes, ledgerRes] =
        await Promise.all([
          supabase
            .from("transactions")
            .select("*")
            .gte("date", start)
            .lte("date", end)
            .order("date", { ascending: false }),
          supabase
            .from("monthly_income")
            .select("*")
            .eq("user_id", userId)
            .eq("month", m)
            .eq("year", y)
            .maybeSingle(),
          supabase.from("subscriptions").select("*").eq("is_active", true),
          supabase
            .from("budget_lines")
            .select("*")
            .or(`owner_id.is.null,owner_id.eq.${userId}`),
          supabase
            .from("budget_line_overrides")
            .select("*")
            .eq("month", m)
            .eq("year", y),
          supabase.from("ledger_entries").select("*").eq("user_id", userId),
        ]);
      // Ignore le résultat si une requête plus récente a été lancée entre-temps.
      if (id !== loadIdRef.current) return;
      setTransactions((txRes.data as Transaction[] | null) ?? []);
      setIncome((incomeRes.data as MonthlyIncome | null) ?? null);
      setSubscriptions((subsRes.data as Subscription[] | null) ?? []);
      setLines((linesRes.data as BudgetLine[] | null) ?? []);
      setOverrides((overridesRes.data as BudgetLineOverride[] | null) ?? []);
      setLedgerEntries((ledgerRes.data as LedgerEntry[] | null) ?? []);
      setLoading(false);
    },
    [ready, profile, currentMonth]
  );

  useEffect(() => {
    load();
  }, [load, dataVersion]);

  // Resync au retour sur l'onglet / la fenêtre (silencieux, pas de skeleton) :
  // une suppression faite ailleurs (autre onglet) se reflète automatiquement.
  useEffect(() => {
    if (!ready || !profile) return;
    const onFocus = () => load(true);
    const onVisible = () => {
      if (document.visibilityState === "visible") load(true);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ready, profile, load]);

  const me = profile?.id;
  const month = currentMonth.getMonth() + 1;
  const year = currentMonth.getFullYear();

  // Budget prévu par catégorie (commun + perso) : pour chaque ligne,
  // l'ajustement du mois s'il existe, sinon le montant prévu les mois où la
  // récurrence s'applique, cumulé par category_id.
  const plannedByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of lines) {
      // Sur le dashboard perso, on ne suit que MON budget perso.
      if (line.owner_id !== me) continue;
      const override = overrides.find((o) => o.budget_line_id === line.id);
      const amount = override
        ? Number(override.amount_target)
        : lineAppliesToMonth(
            line.recurrence,
            line.start_date ?? line.created_at,
            month,
            year
          )
        ? Number(line.amount_target)
        : 0;
      map.set(line.category_id, (map.get(line.category_id) ?? 0) + amount);
    }
    return map;
  }, [lines, overrides, month, year, me]);

  const totalPlanned = useMemo(
    () => Array.from(plannedByCategory.values()).reduce((s, v) => s + v, 0),
    [plannedByCategory]
  );

  // Vue personnelle : budget commun (partagé, peu importe qui paie) + MES
  // dépenses. On exclut les dépenses purement perso du partenaire.
  // Vue personnelle : UNIQUEMENT mes dépenses (ma part du commun + mon perso).
  // On n'inclut jamais les dépenses du partenaire.
  const relevant = useMemo(
    () => transactions.filter((tx) => tx.user_id === me),
    [transactions, me]
  );

  // Suivi du budget perso : mes dépenses dans MES catégories perso (celles qui
  // ont une ligne de budget perso) comparées à mon budget perso.
  const personalCatIds = useMemo(
    () => new Set(lines.filter((l) => l.owner_id === me).map((l) => l.category_id)),
    [lines, me]
  );
  const personalSpent = relevant
    .filter((tx) => tx.category_id && personalCatIds.has(tx.category_id))
    .reduce((sum, tx) => sum + Number(tx.amount), 0);
  const withinBudget = personalSpent <= totalPlanned;

  const mySpend = transactions
    .filter((tx) => tx.user_id === me)
    .reduce((sum, tx) => sum + Number(tx.amount), 0);
  const myCount = transactions.filter((tx) => tx.user_id === me).length;
  // Solde restant = solde courant du Compte (registre) : somme des opérations
  // jusqu'à aujourd'hui (on exclut les opés « à venir »). Même valeur que le
  // « Solde actuel » de l'écran Compte. Non éditable.
  const hasLedger = ledgerEntries.length > 0;
  const soldeActuel = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return ledgerEntries
      .filter((e) => e.date <= today)
      .reduce(
        (s, e) => s + (e.type === "income" ? Number(e.amount) : -Number(e.amount)),
        0
      );
  }, [ledgerEntries]);
  // Vue personnelle : MES abonnements (chacun saisit sa propre part d'un
  // abonnement commun, donc ma part = ma propre entrée).
  const mySubs = subscriptions.filter((sub) => sub.user_id === me);
  const subsMonthly = mySubs.reduce(
    (sum, sub) => sum + monthlyEquivalent(Number(sub.amount), sub.frequency),
    0
  );

  const chartData = useMemo(() => {
    const isThisMonth = isSameMonth(currentMonth, new Date());
    const lastDay = isThisMonth
      ? new Date().getDate()
      : getDaysInMonth(currentMonth);
    const byDay = new Array<number>(getDaysInMonth(currentMonth)).fill(0);
    for (const tx of relevant) {
      const day = parseISO(tx.date).getDate();
      byDay[day - 1] += Number(tx.amount);
    }
    let cumulative = 0;
    return byDay.slice(0, lastDay).map((value, index) => {
      cumulative += value;
      return { day: index + 1, total: Math.round(cumulative * 100) / 100 };
    });
  }, [relevant, currentMonth]);

  const pieData = useMemo(() => {
    const rows = categories
      .map((category) => ({
        name: category.label,
        value: relevant
          .filter((tx) => tx.category_id === category.id)
          .reduce((sum, tx) => sum + Number(tx.amount), 0),
        color: resolveColor(category.color),
      }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value);
    const top = rows.slice(0, 5);
    const rest = rows.slice(5).reduce((sum, row) => sum + row.value, 0);
    const uncategorized = relevant
      .filter((tx) => !tx.category_id)
      .reduce((sum, tx) => sum + Number(tx.amount), 0);
    if (rest + uncategorized > 0) {
      top.push({ name: "Autres", value: rest + uncategorized, color: "#52525b" });
    }
    return top;
  }, [relevant, categories]);

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Dashboard" subtitle={formatMonth(currentMonth)} />
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
        title="Dashboard"
        subtitle={`Vue d’ensemble · ${formatMonth(currentMonth)}`}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 lg:gap-4">
        <KpiCard
          label="Dépensé / budget"
          value={
            totalPlanned > 0 ? (
              <>
                {formatCurrency(personalSpent)}
                <span className="text-zinc-300">
                  {" "}
                  / {formatCurrency(totalPlanned)}
                </span>
              </>
            ) : (
              formatCurrency(personalSpent)
            )
          }
          sub={
            totalPlanned === 0
              ? "Aucun budget défini"
              : withinBudget
              ? `${formatCurrency(totalPlanned - personalSpent)} restants`
              : `${formatCurrency(personalSpent - totalPlanned)} de dépassement`
          }
          icon={TrendingDown}
          tone={
            totalPlanned === 0 ? "indigo" : withinBudget ? "emerald" : "rose"
          }
        />
        <KpiCard
          label="Solde restant"
          value={hasLedger ? formatCurrency(soldeActuel) : "—"}
          sub={hasLedger ? "Sur ton compte aujourd'hui" : "Aucune opération au Compte"}
          icon={Wallet}
          tone={
            !hasLedger ? "indigo" : soldeActuel >= 0 ? "emerald" : "rose"
          }
        />
        <KpiCard
          label="Mes dépenses"
          value={formatCurrency(mySpend)}
          sub={`${myCount} transaction${myCount > 1 ? "s" : ""}`}
          icon={TrendingDown}
          tone="indigo"
        />
        <KpiCard
          label="Abonnements / mois"
          value={formatCurrency(subsMonthly)}
          sub={`${mySubs.length} actif${mySubs.length > 1 ? "s" : ""}`}
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
                    <stop offset="0%" stopColor="var(--chart)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--chart)" stopOpacity={0} />
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
                  stroke="var(--chart)"
                  strokeWidth={2}
                  fill="url(#spendGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <CategoryBreakdown transactions={relevant} plannedByCategory={plannedByCategory} manageable />
        </div>

        {/* Rail droit : revenus, répartition, dernières transactions */}
        <div className="space-y-4">
        <IncomeWidget income={income} onChanged={bumpDataVersion} />
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
                      paddingAngle={0}
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
        <RecentTransactions transactions={relevant} />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AppShell fullWidth>
      <DashboardContent />
    </AppShell>
  );
}
