"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BudgetMonthNav } from "@/components/shared/BudgetMonthNav";
import { PageHeader } from "@/components/shared/PageHeader";
import { supabase, ALLOWED_EMAILS } from "@/lib/supabase";
import { useAppStore } from "@/lib/store";
import {
  cn,
  formatCurrency,
  lineAppliesToMonth,
  normalizeLabel,
  resolveColor,
} from "@/lib/utils";
import type {
  BudgetLine,
  BudgetLineOverride,
  Profile,
  Transaction,
} from "@/types";

const MONTH_LABELS = [
  "Jan",
  "Fév",
  "Mar",
  "Avr",
  "Mai",
  "Jun",
  "Jul",
  "Aoû",
  "Sep",
  "Oct",
  "Nov",
  "Déc",
];

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

function fmtCompact(amount: number): string {
  return `${Math.round(amount).toLocaleString("fr-FR")} €`;
}

function cellTone(real: number, planned: number) {
  if (real > planned) {
    return { bg: "bg-rose-500/10", planned: "text-rose-400", real: "text-rose-400" };
  }
  if (real > 0) {
    return {
      bg: "bg-emerald-500/10",
      planned: "text-emerald-400",
      real: "text-emerald-400",
    };
  }
  return { bg: "", planned: "text-zinc-300", real: "text-zinc-600" };
}

function AnnualBudgetContent() {
  const { profile, partner, categories, currentMonth, dataVersion, ready } =
    useAppStore();
  const year = currentMonth.getFullYear();
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [overrides, setOverrides] = useState<BudgetLineOverride[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [linesRes, overridesRes, txRes] = await Promise.all([
      supabase
        .from("budget_lines")
        .select("*, category:categories(*)")
        .order("created_at"),
      supabase.from("budget_line_overrides").select("*").eq("year", year),
      supabase
        .from("transactions")
        .select("*")
        .gte("date", `${year}-01-01`)
        .lte("date", `${year}-12-31`),
    ]);
    setLines((linesRes.data as BudgetLine[] | null) ?? []);
    setOverrides((overridesRes.data as BudgetLineOverride[] | null) ?? []);
    setTransactions((txRes.data as Transaction[] | null) ?? []);
    setLoading(false);
  }, [year]);

  useEffect(() => {
    if (!ready || !profile) return;
    setLoading(true);
    load();
  }, [ready, profile, dataVersion, load]);

  const people = useMemo(() => {
    const all = [profile, partner].filter((p): p is Profile => p !== null);
    const ophelie = all.find((p) => p.email === ALLOWED_EMAILS[1]);
    const joris = all.find((p) => p.email === ALLOWED_EMAILS[0]);
    const rest = all.filter((p) => p !== ophelie && p !== joris);
    return [ophelie, joris, ...rest].filter((p): p is Profile => !!p);
  }, [profile, partner]);

  const groups = useMemo(() => {
    const map = new Map<string, BudgetLine[]>();
    for (const line of lines) {
      const group = map.get(line.category_id);
      if (group) group.push(line);
      else map.set(line.category_id, [line]);
    }
    return [...map.entries()]
      .map(([categoryId, groupLines]) => ({
        categoryId,
        category:
          categories.find((c) => c.id === categoryId) ??
          groupLines[0]?.category ??
          null,
        lines: groupLines,
      }))
      .sort((a, b) =>
        (a.category?.label ?? "").localeCompare(b.category?.label ?? "")
      );
  }, [lines, categories]);

  // Réels par (catégorie, libellé) et par mois — cohérent avec la saisie de la vue mensuelle.
  const realByLineMonth = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const tx of transactions) {
      if (!tx.category_id) continue;
      const key = `${tx.category_id}|${normalizeLabel(tx.label)}`;
      let months = map.get(key);
      if (!months) {
        months = new Array<number>(12).fill(0);
        map.set(key, months);
      }
      const monthIndex = Number(tx.date.slice(5, 7)) - 1;
      if (monthIndex >= 0 && monthIndex < 12) {
        months[monthIndex] += Number(tx.amount);
      }
    }
    return map;
  }, [transactions]);

  const realFor = useCallback(
    (line: BudgetLine, month: number) =>
      realByLineMonth.get(
        `${line.category_id}|${normalizeLabel(line.label)}`
      )?.[month - 1] ?? 0,
    [realByLineMonth]
  );
  const plannedFor = useCallback(
    (line: BudgetLine, month: number) =>
      Number(
        overrides.find(
          (o) => o.budget_line_id === line.id && o.month === month
        )?.amount_target ?? line.amount_target
      ),
    [overrides]
  );
  const appliesTo = useCallback(
    (line: BudgetLine, month: number) =>
      lineAppliesToMonth(line.recurrence, line.created_at, month, year),
    [year]
  );

  const monthlyPlannedTotals = MONTHS.map((month) =>
    lines
      .filter((line) => appliesTo(line, month))
      .reduce((sum, line) => sum + plannedFor(line, month), 0)
  );
  const monthlyRealTotals = MONTHS.map((month) =>
    lines.reduce((sum, line) => sum + realFor(line, month), 0)
  );
  const annualPlanned = monthlyPlannedTotals.reduce((a, b) => a + b, 0);
  const personYearTotals = people.map((person) =>
    transactions
      .filter((tx) => tx.user_id === person.id)
      .reduce((sum, tx) => sum + Number(tx.amount), 0)
  );
  const allRealYear = transactions.reduce(
    (sum, tx) => sum + Number(tx.amount),
    0
  );
  const annualGap = annualPlanned - allRealYear;

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title={`Budget annuel ${year}`} />
        <Skeleton className="h-12 rounded-xl" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Budget annuel ${year}`}
        subtitle="Prévu et réel, mois par mois"
      />

      <BudgetMonthNav active="recap" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Total prévu annuel
          </p>
          <p className="mt-2 text-xl font-semibold tabular-nums text-white">
            {formatCurrency(annualPlanned)}
          </p>
        </Card>
        {people.map((person, index) => (
          <Card key={person.id} className="p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: resolveColor(person.avatar_color) }}
              />
              Total {person.display_name} annuel
            </p>
            <p
              className="mt-2 text-xl font-semibold tabular-nums"
              style={{ color: resolveColor(person.avatar_color) }}
            >
              {formatCurrency(personYearTotals[index])}
            </p>
          </Card>
        ))}
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Écart annuel
          </p>
          <p
            className={cn(
              "mt-2 text-xl font-semibold tabular-nums",
              annualGap >= 0 ? "text-emerald-400" : "text-rose-400"
            )}
          >
            {formatCurrency(annualGap)}
          </p>
        </Card>
      </div>

      {lines.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-14 text-center">
          <CalendarRange className="size-7 text-zinc-700" />
          <div>
            <p className="text-sm font-medium text-zinc-400">
              Aucune ligne budgétaire
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              Crée des lignes depuis la vue mensuelle pour remplir ce tableau.
            </p>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1280px] text-sm">
              <thead className="bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Catégorie</th>
                  <th className="px-4 py-3 text-left font-medium">Libellé</th>
                  {MONTH_LABELS.map((label) => (
                    <th key={label} className="px-2 py-3 text-right font-medium">
                      {label}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right font-medium">
                    Total prévu
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    Total réel
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40">
                {groups.map((group) => {
                  const groupMonthlyPlanned = MONTHS.map((month) =>
                    group.lines
                      .filter((line) => appliesTo(line, month))
                      .reduce((sum, line) => sum + plannedFor(line, month), 0)
                  );
                  const groupMonthlyReal = MONTHS.map((month) =>
                    group.lines.reduce(
                      (sum, line) => sum + realFor(line, month),
                      0
                    )
                  );
                  const groupPlannedTotal = groupMonthlyPlanned.reduce(
                    (a, b) => a + b,
                    0
                  );
                  const groupRealTotal = groupMonthlyReal.reduce(
                    (a, b) => a + b,
                    0
                  );
                  return (
                    <Fragment key={group.categoryId}>
                      {group.lines.map((line) => {
                        const linePlannedTotal = MONTHS.filter((month) =>
                          appliesTo(line, month)
                        ).reduce(
                          (sum, month) => sum + plannedFor(line, month),
                          0
                        );
                        const lineRealTotal = MONTHS.reduce(
                          (sum, month) => sum + realFor(line, month),
                          0
                        );
                        return (
                          <tr
                            key={line.id}
                            className="transition-colors duration-150 hover:bg-zinc-800/20"
                          >
                            <td className="whitespace-nowrap px-4 py-2 text-zinc-500">
                              {group.category?.label ?? "Sans catégorie"}
                            </td>
                            <td className="whitespace-nowrap px-4 py-2 font-medium text-zinc-200">
                              {line.label}
                            </td>
                            {MONTHS.map((month) => {
                              if (!appliesTo(line, month)) {
                                return (
                                  <td
                                    key={month}
                                    className="px-2 py-2 text-center text-zinc-700"
                                  >
                                    —
                                  </td>
                                );
                              }
                              const planned = plannedFor(line, month);
                              const real = realFor(line, month);
                              const tone = cellTone(real, planned);
                              return (
                                <td
                                  key={month}
                                  className={cn(
                                    "px-2 py-2 text-right align-top",
                                    tone.bg
                                  )}
                                >
                                  <p
                                    className={cn(
                                      "whitespace-nowrap text-xs font-semibold tabular-nums",
                                      tone.planned
                                    )}
                                  >
                                    {fmtCompact(planned)}
                                  </p>
                                  <p
                                    className={cn(
                                      "whitespace-nowrap text-xs tabular-nums",
                                      tone.real
                                    )}
                                  >
                                    {fmtCompact(real)}
                                  </p>
                                </td>
                              );
                            })}
                            <td className="px-4 py-2 text-right text-xs font-semibold tabular-nums text-zinc-200">
                              {fmtCompact(linePlannedTotal)}
                            </td>
                            <td className="px-4 py-2 text-right text-xs font-semibold tabular-nums text-zinc-400">
                              {fmtCompact(lineRealTotal)}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-zinc-800/30">
                        <td
                          colSpan={2}
                          className="px-4 py-2 text-xs font-medium text-zinc-500"
                        >
                          Sous-total {group.category?.label ?? "Sans catégorie"}
                        </td>
                        {MONTHS.map((month, index) => (
                          <td
                            key={month}
                            className="px-2 py-2 text-right align-top"
                          >
                            <p className="whitespace-nowrap text-xs font-semibold tabular-nums text-zinc-300">
                              {fmtCompact(groupMonthlyPlanned[index])}
                            </p>
                            <p className="whitespace-nowrap text-xs tabular-nums text-zinc-600">
                              {fmtCompact(groupMonthlyReal[index])}
                            </p>
                          </td>
                        ))}
                        <td className="px-4 py-2 text-right text-xs font-semibold tabular-nums text-zinc-300">
                          {fmtCompact(groupPlannedTotal)}
                        </td>
                        <td className="px-4 py-2 text-right text-xs font-semibold tabular-nums text-zinc-500">
                          {fmtCompact(groupRealTotal)}
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-zinc-800/50 font-bold">
                  <td colSpan={2} className="px-4 py-3 text-zinc-100">
                    Total
                  </td>
                  {MONTHS.map((month, index) => (
                    <td key={month} className="px-2 py-3 text-right align-top">
                      <p className="whitespace-nowrap text-xs tabular-nums text-zinc-100">
                        {fmtCompact(monthlyPlannedTotals[index])}
                      </p>
                      <p className="whitespace-nowrap text-xs font-medium tabular-nums text-zinc-500">
                        {fmtCompact(monthlyRealTotals[index])}
                      </p>
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right text-xs tabular-nums text-zinc-100">
                    {fmtCompact(annualPlanned)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs tabular-nums text-zinc-300">
                    {fmtCompact(
                      monthlyRealTotals.reduce((a, b) => a + b, 0)
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

export default function AnnualBudgetPage() {
  return <AnnualBudgetContent />;
}
