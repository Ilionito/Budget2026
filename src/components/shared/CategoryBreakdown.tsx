"use client";

import * as React from "react";
import { useState } from "react";
import { Pencil, PieChart, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CategoryDialog } from "@/components/shared/CategoryDialog";
import { useAppStore } from "@/lib/store";
import { formatCurrency, resolveColor } from "@/lib/utils";
import type { Category, Transaction } from "@/types";

export function CategoryBreakdown({
  transactions,
  categoryIds,
  plannedByCategory,
  manageable = false,
}: {
  transactions: Transaction[];
  /** Si fourni, limite l'affichage aux catégories de cet ensemble. */
  categoryIds?: Set<string>;
  /** Si fourni, affiche « dépensé / budget » par catégorie (id → budget prévu). */
  plannedByCategory?: Map<string, number>;
  /** Expose les actions de gestion des catégories (renommer, couleur, ajout). */
  manageable?: boolean;
}) {
  const { categories, setCategories } = useAppStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const total = transactions.reduce((sum, tx) => sum + Number(tx.amount), 0);

  const shown = categoryIds
    ? categories.filter((c) => categoryIds.has(c.id))
    : categories;

  // On masque les catégories sans dépense (dépensé = 0) : sur le dashboard, seule
  // une catégorie réellement dépensée ce mois-ci a sa place dans le détail.
  const rows = shown
    .map((category) => ({
      category,
      amount: transactions
        .filter((tx) => tx.category_id === category.id)
        .reduce((sum, tx) => sum + Number(tx.amount), 0),
    }))
    .filter((row) => Math.abs(row.amount) > 0.005)
    .sort(
      (a, b) =>
        b.amount - a.amount || a.category.label.localeCompare(b.category.label)
    );

  const uncategorized = transactions
    .filter((tx) => !tx.category_id)
    .reduce((sum, tx) => sum + Number(tx.amount), 0);

  const isEmpty = rows.length === 0 && uncategorized <= 0.005;

  function openCreate() {
    setEditingCategory(null);
    setDialogOpen(true);
  }

  function openEdit(category: Category) {
    setEditingCategory(category);
    setDialogOpen(true);
  }

  /** Répercute la création / modification dans le store : la nouvelle couleur
   *  ou le nouveau nom se propage aussitôt aux barres, au donut et à la légende. */
  function handleSaved(category: Category, isNew: boolean) {
    const next = isNew
      ? [...categories, category]
      : categories.map((c) => (c.id === category.id ? category : c));
    setCategories(next.sort((a, b) => a.label.localeCompare(b.label)));
  }

  return (
    <Card className="h-full">
      <div className="flex items-center justify-between gap-2">
        <CardTitle>Par catégorie</CardTitle>
        {manageable && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-zinc-400 hover:text-zinc-100"
            onClick={openCreate}
          >
            <Plus className="size-3.5" />
            Catégorie
          </Button>
        )}
      </div>
      {isEmpty ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <PieChart className="size-6 text-zinc-700" />
          <p className="text-sm text-zinc-600">Aucune dépense ce mois-ci</p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {rows.map(({ category, amount }) => {
            const pct = total > 0 ? (amount / total) * 100 : 0;
            const color = resolveColor(category.color);
            const planned = plannedByCategory?.get(category.id) ?? 0;
            const hasBudget = plannedByCategory != null && planned > 0;
            const within = amount <= planned;
            return (
              <div key={category.id} className="group space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2 text-zinc-300">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="truncate">{category.label}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {hasBudget ? (
                      <span className="tabular-nums">
                        <span
                          className={
                            within ? "text-emerald-500" : "text-rose-500"
                          }
                        >
                          {formatCurrency(amount)}
                        </span>
                        <span className="text-zinc-400">
                          {" "}
                          / {formatCurrency(planned)}
                        </span>
                      </span>
                    ) : (
                      <span className="tabular-nums text-zinc-400">
                        {formatCurrency(amount)}{" "}
                        <span className="text-zinc-600">
                          · {Math.round(pct)} %
                        </span>
                      </span>
                    )}
                    {manageable && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 text-zinc-600 opacity-0 transition-opacity hover:text-zinc-200 focus-visible:opacity-100 group-hover:opacity-100"
                        onClick={() => openEdit(category)}
                        aria-label={`Modifier la catégorie ${category.label}`}
                      >
                        <Pencil className="size-3" />
                      </Button>
                    )}
                  </span>
                </div>
                {hasBudget ? (
                  <Progress
                    value={Math.min(100, (amount / planned) * 100)}
                    className="h-1.5"
                    indicatorClassName={within ? "bg-emerald-500" : "bg-rose-500"}
                  />
                ) : (
                  <Progress
                    value={pct}
                    className="h-1.5"
                    indicatorStyle={{ backgroundColor: color }}
                  />
                )}
              </div>
            );
          })}
          {uncategorized > 0.005 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 text-zinc-300">
                  <span className="size-2 shrink-0 rounded-full bg-zinc-600" />
                  Sans catégorie
                </span>
                <span className="shrink-0 tabular-nums text-zinc-400">
                  {formatCurrency(uncategorized)}{" "}
                  <span className="text-zinc-600">
                    · {total > 0 ? Math.round((uncategorized / total) * 100) : 0} %
                  </span>
                </span>
              </div>
              <Progress
                value={total > 0 ? (uncategorized / total) * 100 : 0}
                className="h-1.5"
                indicatorClassName="bg-zinc-600"
              />
            </div>
          )}
        </div>
      )}
      {manageable && (
        <CategoryDialog
          open={dialogOpen}
          category={editingCategory}
          onOpenChange={setDialogOpen}
          onSaved={handleSaved}
        />
      )}
    </Card>
  );
}
