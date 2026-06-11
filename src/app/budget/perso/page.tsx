"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BudgetMonthNav } from "@/components/shared/BudgetMonthNav";
import { BudgetViewSwitcher } from "@/components/shared/BudgetViewSwitcher";
import { CategoryIcon } from "@/components/shared/CategoryIcon";
import { PageHeader } from "@/components/shared/PageHeader";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/lib/store";
import {
  cn,
  formatCurrency,
  formatMonth,
  getMonthRange,
  normalizeLabel,
} from "@/lib/utils";
import type { Category, PersonalBudgetLine, Transaction } from "@/types";

const NEW_CATEGORY = "__new__";

function formatAmountValue(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function parseAmount(value: string): number | null {
  const parsed = Number.parseFloat(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100) / 100;
}

/** Input montant « tableur » : transparent au repos, fond + ring au focus,
 *  commit au blur — copie du budget commun pour une cohérence visuelle totale. */
function InlineAmountInput({
  value,
  onCommit,
  ariaLabel,
  widthClass = "w-24",
}: {
  value: number;
  onCommit: (next: number) => void | Promise<void>;
  ariaLabel: string;
  widthClass?: string;
}) {
  const [draft, setDraft] = useState(() => formatAmountValue(value));
  const [focused, setFocused] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    setDraft(formatAmountValue(value));
  }, [value]);

  function handleBlur() {
    setFocused(false);
    if (cancelledRef.current) {
      cancelledRef.current = false;
      setDraft(formatAmountValue(value));
      return;
    }
    const parsed = parseAmount(draft);
    if (parsed === null) {
      setDraft(formatAmountValue(value));
      return;
    }
    if (Math.abs(parsed - value) < 0.005) {
      setDraft(formatAmountValue(value));
      return;
    }
    onCommit(parsed);
  }

  return (
    <input
      type="number"
      inputMode="decimal"
      step="0.01"
      min="0"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => {
        setFocused(true);
        e.target.select();
      }}
      onBlur={handleBlur}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          cancelledRef.current = true;
          e.currentTarget.blur();
        }
      }}
      aria-label={ariaLabel}
      className={cn(
        "rounded-lg border-0 bg-transparent px-2 py-1 text-right text-sm tabular-nums outline-none transition-colors duration-150 focus:bg-zinc-800/50 focus:ring-2 focus:ring-indigo-500/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        value === 0 && !focused ? "text-zinc-600" : "text-zinc-200",
        widthClass
      )}
    />
  );
}

function PersonalBudgetContent() {
  const {
    profile,
    categories,
    setCategories,
    currentMonth,
    dataVersion,
    ready,
  } = useAppStore();

  const [lines, setLines] = useState<PersonalBudgetLine[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Ligne fantôme d'ajout
  const [addCategoryId, setAddCategoryId] = useState("");
  const [addTarget, setAddTarget] = useState("");
  const [adding, setAdding] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [creatingCat, setCreatingCat] = useState(false);

  const month = currentMonth.getMonth() + 1;
  const monthLabel = formatMonth(currentMonth);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { start, end } = getMonthRange(currentMonth);
    const [linesRes, txRes] = await Promise.all([
      supabase
        .from("personal_budget_lines")
        .select("*")
        .eq("user_id", profile.id),
      supabase
        .from("transactions")
        .select("*")
        .eq("user_id", profile.id)
        .gte("date", start)
        .lte("date", end),
    ]);
    setLines((linesRes.data as PersonalBudgetLine[] | null) ?? []);
    setTransactions((txRes.data as Transaction[] | null) ?? []);
    setLoading(false);
  }, [profile, currentMonth]);

  useEffect(() => {
    if (!ready || !profile) return;
    load();
  }, [ready, profile, dataVersion, load]);

  // ── Computed ──────────────────────────────────────────────────────────────

  const categoriesById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );

  const spentByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const tx of transactions) {
      if (!tx.category_id) continue;
      map.set(
        tx.category_id,
        (map.get(tx.category_id) ?? 0) + Number(tx.amount)
      );
    }
    return map;
  }, [transactions]);

  const sortedLines = useMemo(
    () =>
      [...lines].sort((a, b) =>
        (categoriesById.get(a.category_id)?.label ?? "").localeCompare(
          categoriesById.get(b.category_id)?.label ?? ""
        )
      ),
    [lines, categoriesById]
  );

  const trackedCategoryIds = useMemo(
    () => new Set(lines.map((l) => l.category_id)),
    [lines]
  );

  /** Dépenses du mois dans des catégories non suivies par le budget perso. */
  const untracked = useMemo(
    () =>
      [...spentByCategory.entries()]
        .filter(
          ([catId, amount]) => !trackedCategoryIds.has(catId) && amount !== 0
        )
        .map(([catId, amount]) => ({
          category: categoriesById.get(catId) ?? null,
          categoryId: catId,
          amount,
        }))
        .filter((u) => u.category)
        .sort((a, b) => b.amount - a.amount),
    [spentByCategory, trackedCategoryIds, categoriesById]
  );

  const totalPlanned = lines.reduce((s, l) => s + Number(l.amount_target), 0);
  const totalSpent = lines.reduce(
    (s, l) => s + (spentByCategory.get(l.category_id) ?? 0),
    0
  );
  const globalGap = totalPlanned - totalSpent;
  const untrackedTotal = untracked.reduce((s, u) => s + u.amount, 0);

  const availableCategories = useMemo(
    () =>
      categories
        .filter((c) => !trackedCategoryIds.has(c.id))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [categories, trackedCategoryIds]
  );

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleAddLine(categoryId: string, target: number) {
    if (!profile) return;
    setAdding(true);
    const { error } = await supabase.from("personal_budget_lines").insert({
      user_id: profile.id,
      category_id: categoryId,
      amount_target: target,
    });
    setAdding(false);
    if (error) {
      toast.error("Impossible d'ajouter cette ligne");
      return;
    }
    setAddCategoryId("");
    setAddTarget("");
    toast.success("Ligne ajoutée au budget perso");
    load();
  }

  async function handleCreateCategory() {
    const name = newCatName.trim();
    if (!name) return;
    const existing = categories.find(
      (c) => normalizeLabel(c.label) === normalizeLabel(name)
    );
    let id = existing?.id ?? null;
    if (!id) {
      // icon est NOT NULL en base : repli neutre "tag" / gris.
      const { data, error } = await supabase
        .from("categories")
        .insert({ label: name, icon: "tag", color: "zinc" })
        .select("*")
        .single();
      if (error || !data) {
        toast.error("Impossible de créer la catégorie");
        return;
      }
      const cat = data as Category;
      id = cat.id;
      setCategories(
        [...categories, cat].sort((a, b) => a.label.localeCompare(b.label))
      );
    }
    setAddCategoryId(id);
    setCreatingCat(false);
    setNewCatName("");
  }

  async function commitTarget(line: PersonalBudgetLine, value: number) {
    const label = categoriesById.get(line.category_id)?.label ?? "catégorie";
    const { error } = await supabase
      .from("personal_budget_lines")
      .update({ amount_target: value })
      .eq("id", line.id);
    if (error) {
      toast.error("Impossible d'enregistrer le prévu");
      load();
      return;
    }
    toast.success(`Prévu « ${label} » mis à jour`);
    load();
  }

  async function handleDeleteLine(line: PersonalBudgetLine) {
    const { error } = await supabase
      .from("personal_budget_lines")
      .delete()
      .eq("id", line.id);
    if (error) {
      toast.error("Impossible de supprimer cette ligne");
      return;
    }
    toast.success("Ligne supprimée");
    load();
  }

  /** « Suivre » une catégorie repérée dans les dépenses hors budget. */
  async function handleTrack(categoryId: string) {
    await handleAddLine(categoryId, 0);
  }

  const addTargetParsed = parseAmount(addTarget);
  const canAdd = addCategoryId !== "" && addTargetParsed !== null && !adding;

  // ── Render helpers ────────────────────────────────────────────────────────

  function renderGap(gap: number, strong = false) {
    return (
      <span
        className={cn(
          "tabular-nums",
          strong ? "font-semibold" : "font-medium",
          gap > 0
            ? "text-emerald-400"
            : gap < 0
              ? "text-rose-400"
              : "text-zinc-600"
        )}
      >
        {gap !== 0 ? `${gap > 0 ? "+" : "−"}${formatCurrency(Math.abs(gap))}` : "—"}
      </span>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!ready || loading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Budget perso" subtitle={monthLabel} />
        <Skeleton className="h-12 rounded-xl" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Budget perso"
        subtitle={`${monthLabel} — uniquement tes dépenses`}
        action={<BudgetViewSwitcher active="perso" />}
      />

      <BudgetMonthNav active={month} />

      {/* Cards — même style que le budget commun */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Budget prévu
          </p>
          <p className="mt-2 text-xl font-semibold tabular-nums text-white">
            {formatCurrency(totalPlanned)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Dépensé (suivi)
          </p>
          <p className="mt-2 text-xl font-semibold tabular-nums text-indigo-400">
            {formatCurrency(totalSpent)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Écart
          </p>
          <p
            className={cn(
              "mt-2 text-xl font-semibold tabular-nums",
              globalGap >= 0 ? "text-emerald-400" : "text-rose-400"
            )}
          >
            {globalGap >= 0 ? "+" : "−"}
            {formatCurrency(Math.abs(globalGap))}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Hors budget perso
          </p>
          <p className="mt-2 text-xl font-semibold tabular-nums text-amber-400">
            {formatCurrency(untrackedTotal)}
          </p>
        </Card>
      </div>

      {/* Tableau des catégories suivies — même grammaire que le budget commun */}
      <Card className="overflow-hidden p-0">
        <div className="flex items-center gap-2.5 bg-indigo-500/[0.06] px-4 py-3">
          <p className="text-sm font-semibold text-zinc-100">Mes catégories</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Catégorie</th>
                <th className="w-[130px] px-3 py-2 text-right font-medium">
                  Prévu
                </th>
                <th className="w-[130px] px-3 py-2 text-right font-medium">
                  Dépensé
                </th>
                <th className="w-[130px] px-3 py-2 text-right font-medium">
                  Écart
                </th>
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40">
              {sortedLines.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center">
                    <p className="text-sm font-medium text-zinc-400">
                      Aucune catégorie suivie
                    </p>
                    <p className="mt-1 text-xs text-zinc-600">
                      Ajoute ta première ligne ci-dessous — elle
                      n&apos;apparaîtra pas dans le budget commun.
                    </p>
                  </td>
                </tr>
              )}
              {sortedLines.map((line) => {
                const category = categoriesById.get(line.category_id) ?? null;
                const real = spentByCategory.get(line.category_id) ?? 0;
                const target = Number(line.amount_target);
                const gap = target - real;
                return (
                  <tr
                    key={line.id}
                    className="group transition-colors duration-150 hover:bg-zinc-800/20"
                  >
                    <td className="px-4 py-1.5">
                      <div className="flex items-center gap-2.5">
                        <CategoryIcon category={category} size="sm" />
                        <span className="text-zinc-200">
                          {category?.label ?? "Catégorie supprimée"}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <InlineAmountInput
                        value={target}
                        onCommit={(value) => commitTarget(line, value)}
                        ariaLabel={`Prévu ${category?.label ?? ""}`}
                      />
                    </td>
                    <td
                      className={cn(
                        "px-3 py-1.5 text-right tabular-nums",
                        real > target && target > 0
                          ? "font-medium text-rose-400"
                          : "text-zinc-200"
                      )}
                    >
                      {formatCurrency(real)}
                    </td>
                    <td className="px-3 py-1.5 text-right">{renderGap(gap)}</td>
                    <td className="px-2 py-1.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-zinc-600 opacity-0 transition-opacity hover:text-rose-400 focus-visible:opacity-100 group-hover:opacity-100"
                        onClick={() => handleDeleteLine(line)}
                        aria-label={`Retirer ${category?.label ?? "la ligne"} du budget perso`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}

              {/* Ligne fantôme d'ajout */}
              <tr className="border-t-2 border-indigo-500/20 bg-indigo-500/[0.04]">
                <td className="px-4 py-2">
                  {creatingCat ? (
                    <div className="flex max-w-[280px] items-center gap-1">
                      <Input
                        autoFocus
                        placeholder="Nouvelle catégorie"
                        value={newCatName}
                        onChange={(e) => setNewCatName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleCreateCategory();
                          if (e.key === "Escape") setCreatingCat(false);
                        }}
                        className="h-8 text-xs"
                      />
                      <Button
                        size="icon"
                        className="size-7 shrink-0"
                        onClick={handleCreateCategory}
                        disabled={!newCatName.trim()}
                        aria-label="Créer la catégorie"
                      >
                        <Check className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0 text-zinc-500"
                        onClick={() => setCreatingCat(false)}
                        aria-label="Annuler"
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <Select
                      value={addCategoryId}
                      onValueChange={(v) => {
                        if (v === NEW_CATEGORY) {
                          setCreatingCat(true);
                          setNewCatName("");
                          return;
                        }
                        setAddCategoryId(v);
                      }}
                    >
                      <SelectTrigger className="h-8 w-full max-w-[280px] text-xs">
                        <SelectValue placeholder="Choisir une catégorie à suivre" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableCategories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.label}
                          </SelectItem>
                        ))}
                        <SelectSeparator />
                        <SelectItem
                          value={NEW_CATEGORY}
                          className="text-indigo-300 focus:text-indigo-200"
                        >
                          + Nouvelle catégorie
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <Input
                    inputMode="decimal"
                    placeholder="0,00"
                    value={addTarget}
                    onChange={(e) => setAddTarget(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && canAdd)
                        handleAddLine(addCategoryId, addTargetParsed!);
                    }}
                    className="h-8 w-24 text-right text-xs tabular-nums"
                    aria-label="Objectif mensuel"
                  />
                </td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
                <td className="px-2 py-2">
                  <Button
                    size="icon"
                    className="size-7"
                    onClick={() => handleAddLine(addCategoryId, addTargetParsed!)}
                    disabled={!canAdd}
                    aria-label="Ajouter la ligne"
                  >
                    {adding ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Plus className="size-3.5" />
                    )}
                  </Button>
                </td>
              </tr>
            </tbody>
            {sortedLines.length > 0 && (
              <tfoot className="border-t border-zinc-800/60 bg-zinc-900/60">
                <tr>
                  <td className="px-4 py-2 text-sm font-semibold text-zinc-300">
                    Total
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums text-zinc-200">
                    {formatCurrency(totalPlanned)}
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums text-indigo-400">
                    {formatCurrency(totalSpent)}
                  </td>
                  <td className="px-3 py-2 text-right text-sm">
                    {renderGap(globalGap, true)}
                  </td>
                  <td className="px-2 py-2" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* Dépenses non suivies — même grammaire de tableau */}
      {untracked.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="flex items-center gap-2.5 bg-amber-500/[0.06] px-4 py-3">
            <p className="text-sm font-semibold text-zinc-100">
              Dépenses non suivies ce mois
            </p>
            <p className="ml-auto text-xs text-zinc-500">
              Catégories absentes de ton budget perso
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Catégorie</th>
                  <th className="w-[130px] px-3 py-2 text-right font-medium">
                    Dépensé
                  </th>
                  <th className="w-[110px] px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40">
                {untracked.map(({ category, categoryId, amount }) => (
                  <tr
                    key={categoryId}
                    className="transition-colors duration-150 hover:bg-zinc-800/20"
                  >
                    <td className="px-4 py-1.5">
                      <div className="flex items-center gap-2.5">
                        <CategoryIcon category={category} size="sm" />
                        <span className="text-zinc-200">{category!.label}</span>
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-zinc-200">
                      {formatCurrency(amount)}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTrack(categoryId)}
                      >
                        Suivre
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

export default function PersonalBudgetPage() {
  return (
    <AppShell wide>
      <PersonalBudgetContent />
    </AppShell>
  );
}
