"use client";

import * as React from "react";
import { PieChart } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAppStore } from "@/lib/store";
import { formatCurrency, resolveColor } from "@/lib/utils";
import type { Transaction } from "@/types";

export function CategoryBreakdown({
  transactions,
  categoryIds,
}: {
  transactions: Transaction[];
  /** Si fourni, limite l'affichage aux catégories de cet ensemble. */
  categoryIds?: Set<string>;
}) {
  const { categories } = useAppStore();

  const total = transactions.reduce((sum, tx) => sum + Number(tx.amount), 0);

  // Toutes les catégories (du périmètre) sont affichées, même à 0 €.
  const shown = categoryIds
    ? categories.filter((c) => categoryIds.has(c.id))
    : categories;

  const rows = shown
    .map((category) => ({
      category,
      amount: transactions
        .filter((tx) => tx.category_id === category.id)
        .reduce((sum, tx) => sum + Number(tx.amount), 0),
    }))
    .sort(
      (a, b) =>
        b.amount - a.amount || a.category.label.localeCompare(b.category.label)
    );

  const uncategorized = transactions
    .filter((tx) => !tx.category_id)
    .reduce((sum, tx) => sum + Number(tx.amount), 0);

  return (
    <Card className="h-full">
      <CardTitle>Par catégorie</CardTitle>
      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <PieChart className="size-6 text-zinc-700" />
          <p className="text-sm text-zinc-600">Aucune catégorie</p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {rows.map(({ category, amount }) => {
            const pct = total > 0 ? (amount / total) * 100 : 0;
            const color = resolveColor(category.color);
            return (
              <div key={category.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2 text-zinc-300">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="truncate">{category.label}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-zinc-400">
                    {formatCurrency(amount)}{" "}
                    <span className="text-zinc-600">· {Math.round(pct)} %</span>
                  </span>
                </div>
                <Progress
                  value={pct}
                  className="h-1.5"
                  indicatorStyle={{ backgroundColor: color }}
                />
              </div>
            );
          })}
          {uncategorized > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 text-zinc-300">
                  <span className="size-2 shrink-0 rounded-full bg-zinc-600" />
                  Sans catégorie
                </span>
                <span className="shrink-0 tabular-nums text-zinc-400">
                  {formatCurrency(uncategorized)}{" "}
                  <span className="text-zinc-600">
                    · {Math.round((uncategorized / total) * 100)} %
                  </span>
                </span>
              </div>
              <Progress
                value={(uncategorized / total) * 100}
                className="h-1.5"
                indicatorClassName="bg-zinc-600"
              />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
