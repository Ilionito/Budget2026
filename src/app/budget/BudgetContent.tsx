"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { endOfMonth, format } from "date-fns";
import { fr } from "date-fns/locale";
import { Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BudgetMonthNav } from "@/components/shared/BudgetMonthNav";
import { CategoryIcon } from "@/components/shared/CategoryIcon";
import { PageHeader } from "@/components/shared/PageHeader";
import { supabase, ALLOWED_EMAILS } from "@/lib/supabase";
import { useAppStore } from "@/lib/store";
import {
  cn,
  formatCurrency,
  formatMonth,
  getMonthRange,
  lineAppliesToMonth,
  normalizeLabel,
  resolveColor,
} from "@/lib/utils";
import {
  AVATAR_COLORS,
  RECURRENCE_LABELS,
  type BudgetLine,
  type BudgetLineOverride,
  type Category,
  type Profile,
  type Recurrence,
  type Transaction,
} from "@/types";

const SAISIE_NOTE = "saisie budget";

const SEED_LINES: { category: string; label: string; amount: number }[] = [
  { category: "Courses", label: "Drive Leclerc", amount: 400 },
  { category: "Courses", label: "Grand frais", amount: 150 },
  { category: "Courses", label: "En plus", amount: 50 },
  { category: "Chien", label: "Croquettes", amount: 0 },
  { category: "Chien", label: "Balade co", amount: 25 },
  { category: "Chien", label: "Lassie", amount: 44.57 },
  { category: "Chien", label: "Maxizoo : friandises jouets", amount: 40 },
  { category: "Chien", label: "Nexgaurd anti-puces", amount: 60 },
  { category: "Chien", label: "Vermifuge", amount: 0 },
  { category: "Chien", label: "Nexguard anti-puces", amount: 60 },
  { category: "Loisirs", label: "Restaurants", amount: 60 },
  { category: "Loisirs", label: "Cinéma", amount: 0 },
  { category: "Loisirs", label: "Autres activités", amount: 0 },
  { category: "Loisirs", label: "Cinéma sorties", amount: 80 },
  { category: "Imprévus", label: "Vétérinaire en plus", amount: 0 },
  { category: "Imprévus", label: "Pour appartement", amount: 0 },
  { category: "Imprévus", label: "Autre imprévu", amount: 0 },
];

function formatAmountValue(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function parseAmount(value: string): number | null {
  const parsed = Number.parseFloat(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100) / 100;
}

/** Input montant « tableur » : transparent au repos, fond + ring au focus, commit au blur. */
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

function EditLineDialog({
  line,
  onClose,
  onSaved,
}: {
  line: BudgetLine | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { categories } = useAppStore();
  const [label, setLabel] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [recurrence, setRecurrence] = useState<Recurrence>("monthly");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (line) {
      setLabel(line.label);
      setCategoryId(line.category_id);
      setAmount(formatAmountValue(Number(line.amount_target)));
      setRecurrence(line.recurrence);
    }
  }, [line]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!line) return;
    const parsed = parseAmount(amount);
    if (!label.trim()) {
      toast.error("Indique un libellé");
      return;
    }
    if (!categoryId) {
      toast.error("Choisis une catégorie");
      return;
    }
    if (parsed === null) {
      toast.error("Montant invalide");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("budget_lines")
      .update({
        label: label.trim(),
        category_id: categoryId,
        amount_target: parsed,
        recurrence,
      })
      .eq("id", line.id);
    setSaving(false);
    if (error) {
      toast.error("Impossible de modifier la ligne");
      return;
    }
    toast.success("Ligne modifiée");
    onClose();
    onSaved();
  }

  return (
    <Dialog open={line !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Modifier la ligne</DialogTitle>
            <DialogDescription>
              Libellé, catégorie, montant prévu et récurrence.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5">
            <Label htmlFor="edit-label">Libellé</Label>
            <Input
              id="edit-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Catégorie</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir une catégorie" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor: resolveColor(category.color),
                        }}
                      />
                      {category.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="edit-amount">Montant prévu</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                  €
                </span>
                <Input
                  id="edit-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-8 tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  required
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Récurrence</Label>
              <Select
                value={recurrence}
                onValueChange={(value) => setRecurrence(value as Recurrence)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(RECURRENCE_LABELS).map(([value, text]) => (
                    <SelectItem key={value} value={value}>
                      {text}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button type="submit" disabled={saving} className="w-full">
            {saving ? <Loader2 className="animate-spin" /> : null}
            Enregistrer
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CategoryDialog({
  open,
  category,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  /** null = création, sinon édition de cette catégorie. */
  category: Category | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (category: Category, isNew: boolean) => void;
}) {
  const { categories } = useAppStore();
  const [emoji, setEmoji] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState(AVATAR_COLORS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const icon = category?.icon?.trim() ?? "";
      setEmoji([...icon].length > 0 && [...icon].length <= 3 ? icon : "");
      setName(category?.label ?? "");
      setColor(resolveColor(category?.color ?? AVATAR_COLORS[0]));
    }
  }, [open, category]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Indique un nom de catégorie");
      return;
    }
    // Le contrôle de doublon ne s'applique que si le nom change réellement :
    // modifier seulement la couleur ou l'emoji doit toujours passer.
    const renamed =
      !category || normalizeLabel(name) !== normalizeLabel(category.label);
    if (
      renamed &&
      categories.some(
        (c) =>
          c.id !== category?.id &&
          normalizeLabel(c.label) === normalizeLabel(name)
      )
    ) {
      toast.error("Cette catégorie existe déjà");
      return;
    }
    setSaving(true);
    // En édition, un champ emoji vide conserve l'icône existante.
    // La colonne icon est NOT NULL en base : repli sur "tag".
    const payload = {
      label: name.trim(),
      icon: emoji.trim() || category?.icon || "tag",
      color,
    };
    const { data, error } = category
      ? await supabase
          .from("categories")
          .update(payload)
          .eq("id", category.id)
          .select()
          .single()
      : await supabase
          .from("categories")
          .insert({ ...payload, is_default: false })
          .select()
          .single();
    setSaving(false);
    if (error || !data) {
      // PGRST116 = zéro ligne touchée : symptôme typique d'une policy RLS manquante.
      const detail =
        error?.code === "PGRST116"
          ? "aucune ligne modifiée (policy RLS UPDATE manquante sur categories ?)"
          : error?.message;
      toast.error(
        `${
          category
            ? "Impossible de modifier la catégorie"
            : "Impossible de créer la catégorie"
        }${detail ? ` : ${detail}` : ""}`
      );
      return;
    }
    toast.success(category ? "Catégorie modifiée" : "Catégorie créée");
    onOpenChange(false);
    onSaved(data as Category, !category);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {category ? "Modifier la catégorie" : "Nouvelle catégorie"}
            </DialogTitle>
            <DialogDescription>
              Un emoji, un nom et une couleur.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-[80px_1fr] gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="cat-emoji">Emoji</Label>
              <Input
                id="cat-emoji"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                placeholder="🛒"
                maxLength={4}
                className="text-center"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cat-name">Nom</Label>
              <Input
                id="cat-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Courses, Chien…"
                required
                autoFocus
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Couleur</Label>
            <div className="flex flex-wrap gap-2">
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "size-8 rounded-full outline-none transition-transform duration-150 hover:scale-110 focus-visible:ring-2 focus-visible:ring-white/60",
                    color === c &&
                      "ring-2 ring-white ring-offset-2 ring-offset-zinc-900"
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={`Couleur ${c}`}
                />
              ))}
            </div>
          </div>

          <Button type="submit" disabled={saving} className="w-full">
            {saving ? (
              <Loader2 className="animate-spin" />
            ) : category ? null : (
              <Plus />
            )}
            {category ? "Enregistrer" : "Créer la catégorie"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BudgetContent({
  ownerEmail = null,
}: {
  ownerEmail?: string | null;
}) {
  const { profile, partner, categories, currentMonth, dataVersion, ready, setCategories } =
    useAppStore();
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [overrides, setOverrides] = useState<BudgetLineOverride[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingLine, setEditingLine] = useState<BudgetLine | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(
    null
  );
  const [extraCategoryIds, setExtraCategoryIds] = useState<string[]>([]);
  const [ghost, setGhost] = useState<{
    categoryId: string;
    label: string;
    amount: string;
  } | null>(null);
  const ghostBusyRef = useRef(false);
  const seedAttemptedRef = useRef(false);

  // Budget personnel : ciblé sur un profil (résolu par email, comme le registre).
  // Budget commun : ownerEmail null → comportement historique inchangé.
  const isPersonal = ownerEmail != null;
  const owner = useMemo(
    () =>
      ownerEmail
        ? ([profile, partner].find((p) => p?.email === ownerEmail) ?? null)
        : null,
    [profile, partner, ownerEmail]
  );

  const month = currentMonth.getMonth() + 1;
  const year = currentMonth.getFullYear();
  const monthLabel = formatMonth(currentMonth);
  const monthName = format(currentMonth, "MMMM", { locale: fr });

  const load = useCallback(async () => {
    const { start, end } = getMonthRange(currentMonth);
    // budget_lines : commun → owner_id null ; perso → owner_id du profil ciblé.
    let linesQuery = supabase
      .from("budget_lines")
      .select("*, category:categories(*)")
      .order("created_at");
    linesQuery =
      isPersonal && owner
        ? linesQuery.eq("owner_id", owner.id)
        : linesQuery.is("owner_id", null);
    const [linesRes, overridesRes, txRes] = await Promise.all([
      linesQuery,
      supabase
        .from("budget_line_overrides")
        .select("*")
        .eq("month", month)
        .eq("year", year),
      supabase
        .from("transactions")
        .select("*")
        .gte("date", start)
        .lte("date", end),
    ]);
    setLines((linesRes.data as BudgetLine[] | null) ?? []);
    setOverrides((overridesRes.data as BudgetLineOverride[] | null) ?? []);
    setTransactions((txRes.data as Transaction[] | null) ?? []);
    setLoading(false);
  }, [currentMonth, month, year, isPersonal, owner]);

  useEffect(() => {
    if (!ready || !profile) return;
    // Budget perso : on attend la résolution du profil ciblé.
    if (isPersonal && !owner) return;
    setLoading(true);
    load();
  }, [ready, profile, dataVersion, load, isPersonal, owner]);

  // Seed initial : si la table budget_lines est vide, créer les lignes par défaut.
  // Réservé au budget commun ; les budgets personnels démarrent vides.
  useEffect(() => {
    if (isPersonal) return;
    if (!ready || loading || seedAttemptedRef.current) return;
    if (lines.length > 0) {
      seedAttemptedRef.current = true;
      return;
    }
    if (!profile || categories.length === 0) return;
    seedAttemptedRef.current = true;

    const rows = SEED_LINES.map((seed) => {
      const category = categories.find(
        (c) => normalizeLabel(c.label) === normalizeLabel(seed.category)
      );
      if (!category) return null;
      return {
        label: seed.label,
        category_id: category.id,
        amount_target: seed.amount,
        recurrence: "monthly" as const,
        created_by: profile.id,
        owner_id: null,
      };
    }).filter((row): row is NonNullable<typeof row> => row !== null);

    if (rows.length === 0) return;
    supabase
      .from("budget_lines")
      .insert(rows)
      .then(({ error }) => {
        if (error) {
          toast.error("Impossible de créer les lignes initiales");
          return;
        }
        toast.success("Lignes budgétaires initiales créées");
        load();
      });
  }, [ready, loading, lines, profile, categories, load, isPersonal]);

  // Budget perso : une seule colonne (le profil ciblé).
  // Budget commun : Ophélie d'abord, Joris ensuite (ordre du screenshot), identifiés par email.
  const people = useMemo(() => {
    if (isPersonal) return owner ? [owner] : [];
    const all = [profile, partner].filter((p): p is Profile => p !== null);
    const ophelie = all.find((p) => p.email === ALLOWED_EMAILS[1]);
    const joris = all.find((p) => p.email === ALLOWED_EMAILS[0]);
    const rest = all.filter((p) => p !== ophelie && p !== joris);
    return [ophelie, joris, ...rest].filter((p): p is Profile => !!p);
  }, [profile, partner, isPersonal, owner]);

  const visibleLines = useMemo(
    () =>
      lines.filter((line) =>
        lineAppliesToMonth(line.recurrence, line.created_at, month, year)
      ),
    [lines, month, year]
  );

  const groups = useMemo(() => {
    const map = new Map<string, BudgetLine[]>();
    for (const line of visibleLines) {
      const group = map.get(line.category_id);
      if (group) group.push(line);
      else map.set(line.category_id, [line]);
    }
    for (const id of extraCategoryIds) {
      if (!map.has(id)) map.set(id, []);
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
  }, [visibleLines, extraCategoryIds, categories]);

  const plannedFor = useCallback(
    (line: BudgetLine) =>
      Number(
        overrides.find((o) => o.budget_line_id === line.id)?.amount_target ??
          line.amount_target
      ),
    [overrides]
  );

  /**
   * Réel d'une cellule : transactions du mois de cette personne, même catégorie
   * ET même libellé (comparaison insensible à la casse et aux accents).
   */
  const realCell = useCallback(
    (line: BudgetLine, personId: string) =>
      transactions
        .filter(
          (tx) =>
            tx.user_id === personId &&
            tx.category_id === line.category_id &&
            normalizeLabel(tx.label) === normalizeLabel(line.label)
        )
        .reduce((sum, tx) => sum + Number(tx.amount), 0),
    [transactions]
  );

  const personMonthTotal = useCallback(
    (personId: string) =>
      transactions
        .filter((tx) => tx.user_id === personId)
        .reduce((sum, tx) => sum + Number(tx.amount), 0),
    [transactions]
  );

  const totalPlanned = visibleLines.reduce(
    (sum, line) => sum + plannedFor(line),
    0
  );
  const gridPersonTotals = people.map((person) =>
    visibleLines.reduce((sum, line) => sum + realCell(line, person.id), 0)
  );
  const gridRealTotal = gridPersonTotals.reduce((a, b) => a + b, 0);
  // Budget perso : seuls les réels du profil ciblé comptent dans l'écart global.
  const allRealTotal = isPersonal
    ? gridRealTotal
    : transactions.reduce((sum, tx) => sum + Number(tx.amount), 0);
  const globalGap = totalPlanned - allRealTotal;

  async function commitPlanned(line: BudgetLine, value: number) {
    const override = overrides.find((o) => o.budget_line_id === line.id);
    const { error } = override
      ? await supabase
          .from("budget_line_overrides")
          .update({ amount_target: value })
          .eq("id", override.id)
      : await supabase.from("budget_line_overrides").insert({
          budget_line_id: line.id,
          month,
          year,
          amount_target: value,
        });
    if (error) {
      toast.error("Impossible d'enregistrer le prévu");
      load();
      return;
    }
    toast.success(`Prévu « ${line.label} » mis à jour`);
    load();
  }

  async function commitReal(line: BudgetLine, person: Profile, value: number) {
    const existing = transactions.find(
      (tx) =>
        tx.user_id === person.id &&
        tx.category_id === line.category_id &&
        tx.note === SAISIE_NOTE &&
        normalizeLabel(tx.label) === normalizeLabel(line.label)
    );
    const { error } = existing
      ? await supabase
          .from("transactions")
          .update({ amount: value })
          .eq("id", existing.id)
      : await supabase.from("transactions").insert({
          user_id: person.id,
          category_id: line.category_id,
          label: line.label,
          amount: value,
          date: format(endOfMonth(currentMonth), "yyyy-MM-dd"),
          is_private: false,
          is_recurring: false,
          note: SAISIE_NOTE,
        });
    if (error) {
      toast.error(
        `Impossible d'enregistrer pour ${person.display_name} : ${error.message}`
      );
      load();
      return;
    }
    toast.success(`Réel « ${line.label} » (${person.display_name}) mis à jour`);
    load();
  }

  async function deleteLine(line: BudgetLine) {
    if (!window.confirm(`Supprimer la ligne « ${line.label} » ?`)) return;
    const { error } = await supabase
      .from("budget_lines")
      .delete()
      .eq("id", line.id);
    if (error) {
      toast.error("Impossible de supprimer la ligne");
      return;
    }
    toast.success("Ligne supprimée");
    load();
  }

  async function commitGhost() {
    if (ghostBusyRef.current || !ghost || !profile) return;
    if (isPersonal && !owner) return;
    const label = ghost.label.trim();
    if (!label) {
      setGhost(null);
      return;
    }
    const amount = ghost.amount.trim() === "" ? 0 : parseAmount(ghost.amount);
    if (amount === null) {
      toast.error("Montant invalide");
      return;
    }
    ghostBusyRef.current = true;
    const { error } = await supabase.from("budget_lines").insert({
      label,
      category_id: ghost.categoryId,
      amount_target: amount,
      recurrence: "monthly",
      created_by: profile.id,
      owner_id: isPersonal && owner ? owner.id : null,
    });
    ghostBusyRef.current = false;
    if (error) {
      toast.error("Impossible d'ajouter la ligne");
      return;
    }
    toast.success("Ligne ajoutée");
    setGhost(null);
    load();
  }

  /** Retire une catégorie du budget : supprime toutes ses lignes et
   *  leurs overrides. La catégorie et les transactions sont conservées. */
  async function handleRemoveGroup(categoryId: string, label: string) {
    const lineIds = lines
      .filter((l) => l.category_id === categoryId)
      .map((l) => l.id);
    const count = lineIds.length;
    const ok = window.confirm(
      `Retirer « ${label} » du budget ?\n\n` +
        `${count} ligne${count > 1 ? "s" : ""} et leurs objectifs seront supprimés. ` +
        `La catégorie et les transactions existantes sont conservées.`
    );
    if (!ok) return;
    if (lineIds.length > 0) {
      await supabase
        .from("budget_line_overrides")
        .delete()
        .in("budget_line_id", lineIds);
      const { error } = await supabase
        .from("budget_lines")
        .delete()
        .in("id", lineIds);
      if (error) {
        toast.error("Impossible de retirer cette catégorie du budget");
        return;
      }
    }
    setExtraCategoryIds((ids) => ids.filter((id) => id !== categoryId));
    toast.success(`« ${label} » retirée du budget`);
    load();
  }

  function handleCategorySaved(category: Category, isNew: boolean) {
    if (isNew) {
      setCategories(
        [...categories, category].sort((a, b) =>
          a.label.localeCompare(b.label)
        )
      );
      setExtraCategoryIds((ids) => [...ids, category.id]);
      setGhost({ categoryId: category.id, label: "", amount: "" });
      return;
    }
    setCategories(
      categories
        .map((c) => (c.id === category.id ? category : c))
        .sort((a, b) => a.label.localeCompare(b.label))
    );
    load();
  }

  const title =
    isPersonal && owner
      ? `Budget ${owner.display_name.split(" ")[0]}`
      : "Budget commun";

  // Budget perso non encore résolu : skeleton (profil en cours de chargement).
  if (loading || (isPersonal && !owner)) {
    return (
      <div className="space-y-6">
        <PageHeader title={title} subtitle={monthLabel} />
        <Skeleton className="h-12 rounded-xl" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={monthLabel} />

      <BudgetMonthNav active={month} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Budget prévu
          </p>
          <p className="mt-2 text-xl font-semibold tabular-nums text-white">
            {formatCurrency(totalPlanned)}
          </p>
        </Card>
        {people.map((person) => (
          <Card key={person.id} className="p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: resolveColor(person.avatar_color) }}
              />
              {person.display_name}
            </p>
            <p
              className="mt-2 text-xl font-semibold tabular-nums"
              style={{ color: resolveColor(person.avatar_color) }}
            >
              {formatCurrency(personMonthTotal(person.id))}
            </p>
          </Card>
        ))}
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
            {formatCurrency(globalGap)}
          </p>
        </Card>
      </div>

      {groups.length === 0 && (
        <Card className="flex flex-col items-center gap-3 py-14 text-center">
          <p className="text-sm font-medium text-zinc-400">
            Aucune ligne budgétaire pour {monthLabel.toLowerCase()}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setEditingCategory(null);
              setCategoryDialogOpen(true);
            }}
          >
            <Plus />
            Nouvelle catégorie
          </Button>
        </Card>
      )}

      {/* Deux catégories côte à côte sur très grand écran, sinon une colonne. */}
      <div className="grid grid-cols-1 items-start gap-4 2xl:grid-cols-2">
      {groups.map((group) => {
        const color = resolveColor(group.category?.color);
        const groupPlanned = group.lines.reduce(
          (sum, line) => sum + plannedFor(line),
          0
        );
        const groupPersonTotals = people.map((person) =>
          group.lines.reduce((sum, line) => sum + realCell(line, person.id), 0)
        );
        const groupTotal = groupPersonTotals.reduce((a, b) => a + b, 0);
        const groupGap = groupPlanned - groupTotal;
        return (
          <Card key={group.categoryId} className="overflow-hidden p-0">
            <div
              className="flex items-center gap-2.5 px-4 py-3"
              style={{ backgroundColor: `${color}15` }}
            >
              <CategoryIcon category={group.category} size="sm" />
              <p className="text-sm font-semibold text-zinc-100">
                {group.category?.label ?? "Sans catégorie"}
              </p>
              {group.category && (
                <div className="ml-auto flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-zinc-500 hover:text-zinc-200"
                    onClick={() => {
                      setEditingCategory(group.category);
                      setCategoryDialogOpen(true);
                    }}
                    aria-label={`Renommer la catégorie ${group.category.label}`}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-zinc-500 hover:text-rose-400"
                    onClick={() =>
                      handleRemoveGroup(group.categoryId, group.category!.label)
                    }
                    aria-label={`Retirer ${group.category.label} du budget`}
                    title="Retirer du budget"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Dépense</th>
                    <th className="px-3 py-2 text-right font-medium">Prévu</th>
                    {people.map((person) => (
                      <th
                        key={person.id}
                        className="px-3 py-2 text-right font-medium"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="size-2 rounded-full"
                            style={{
                              backgroundColor: resolveColor(
                                person.avatar_color
                              ),
                            }}
                          />
                          {person.display_name}
                        </span>
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right font-medium">Total</th>
                    <th className="px-3 py-2 text-right font-medium">Écart</th>
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40">
                  {group.lines.map((line) => {
                    const planned = plannedFor(line);
                    const cells = people.map((person) =>
                      realCell(line, person.id)
                    );
                    const total = cells.reduce((a, b) => a + b, 0);
                    const gap = planned - total;
                    return (
                      <tr
                        key={line.id}
                        className="group transition-colors duration-150 hover:bg-zinc-800/20"
                      >
                        <td className="px-4 py-1.5 text-zinc-200">
                          {line.label}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <InlineAmountInput
                            value={planned}
                            onCommit={(value) => commitPlanned(line, value)}
                            ariaLabel={`Prévu ${line.label}`}
                          />
                        </td>
                        {people.map((person, index) => (
                          <td
                            key={person.id}
                            className="px-3 py-1.5 text-right"
                            style={{
                              backgroundColor: `${resolveColor(person.avatar_color)}12`,
                            }}
                          >
                            <InlineAmountInput
                              value={cells[index]}
                              onCommit={(value) =>
                                commitReal(line, person, value)
                              }
                              ariaLabel={`${person.display_name} ${line.label}`}
                              widthClass="w-20"
                            />
                          </td>
                        ))}
                        <td className="px-3 py-1.5 text-right tabular-nums text-zinc-300">
                          {formatCurrency(total)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {Math.abs(gap) < 0.005 ? (
                            <span className="text-zinc-600">—</span>
                          ) : (
                            <span
                              className={
                                gap < 0 ? "text-rose-400" : "text-emerald-400"
                              }
                            >
                              {formatCurrency(gap)}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 text-zinc-600 opacity-100 transition-opacity duration-150 hover:text-zinc-200 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 md:data-[state=open]:opacity-100"
                                aria-label={`Actions ${line.label}`}
                              >
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-40 p-1">
                              <PopoverClose asChild>
                                <button
                                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-200 outline-none transition-colors duration-150 hover:bg-zinc-800 focus-visible:bg-zinc-800"
                                  onClick={() => setEditingLine(line)}
                                >
                                  Modifier
                                </button>
                              </PopoverClose>
                              <PopoverClose asChild>
                                <button
                                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-rose-400 outline-none transition-colors duration-150 hover:bg-rose-500/10 focus-visible:bg-rose-500/10"
                                  onClick={() => deleteLine(line)}
                                >
                                  Supprimer
                                </button>
                              </PopoverClose>
                            </PopoverContent>
                          </Popover>
                        </td>
                      </tr>
                    );
                  })}
                  {ghost?.categoryId === group.categoryId && (
                    <tr
                      className="bg-zinc-800/20"
                      onBlur={(e) => {
                        if (
                          !e.currentTarget.contains(e.relatedTarget as Node)
                        ) {
                          commitGhost();
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitGhost();
                        }
                        if (e.key === "Escape") setGhost(null);
                      }}
                    >
                      <td className="px-4 py-1.5">
                        <input
                          value={ghost.label}
                          onChange={(e) =>
                            setGhost({ ...ghost, label: e.target.value })
                          }
                          placeholder="Libellé de la dépense"
                          autoFocus
                          aria-label="Libellé de la nouvelle ligne"
                          className="w-full rounded-lg border-0 bg-zinc-800/50 px-2 py-1 text-sm text-zinc-100 outline-none ring-2 ring-indigo-500/40 placeholder:text-zinc-600"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          value={ghost.amount}
                          onChange={(e) =>
                            setGhost({ ...ghost, amount: e.target.value })
                          }
                          placeholder="0"
                          aria-label="Montant prévu de la nouvelle ligne"
                          className="w-24 rounded-lg border-0 bg-zinc-800/50 px-2 py-1 text-right text-sm tabular-nums text-zinc-100 outline-none ring-2 ring-indigo-500/40 placeholder:text-zinc-600 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                      </td>
                      <td colSpan={people.length + 3} className="px-3 py-1.5">
                        <span className="text-xs text-zinc-600">
                          Entrée pour valider · Échap pour annuler
                        </span>
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-zinc-800/30">
                    <td className="px-4 py-2 text-xs font-medium text-zinc-500">
                      Sous-total
                    </td>
                    <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums text-zinc-300">
                      {formatCurrency(groupPlanned)}
                    </td>
                    {groupPersonTotals.map((value, index) => (
                      <td
                        key={people[index].id}
                        className="px-3 py-2 text-right text-xs font-semibold tabular-nums text-zinc-400"
                      >
                        {formatCurrency(value)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums text-zinc-300">
                      {formatCurrency(groupTotal)}
                    </td>
                    <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums">
                      {Math.abs(groupGap) < 0.005 ? (
                        <span className="text-zinc-600">—</span>
                      ) : (
                        <span
                          className={
                            groupGap < 0 ? "text-rose-400" : "text-emerald-400"
                          }
                        >
                          {formatCurrency(groupGap)}
                        </span>
                      )}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            <button
              type="button"
              onClick={() =>
                setGhost({
                  categoryId: group.categoryId,
                  label: "",
                  amount: "",
                })
              }
              className="flex w-full items-center gap-1.5 px-4 py-2.5 text-left text-xs font-medium text-zinc-500 outline-none transition-colors duration-150 hover:bg-zinc-800/30 hover:text-zinc-300 focus-visible:bg-zinc-800/30"
            >
              <Plus className="size-3.5" />
              Ajouter une ligne
            </button>
          </Card>
        );
      })}
      </div>

      <div className="flex justify-start">
        <Button variant="outline" onClick={() => {
              setEditingCategory(null);
              setCategoryDialogOpen(true);
            }}>
          <Plus />
          Nouvelle catégorie
        </Button>
      </div>

      <div className="sticky bottom-0 z-30 -mx-4 border-t border-zinc-800/60 bg-zinc-950/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
          <p className="text-sm font-bold uppercase text-white">
            Total {monthName}
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <p className="text-sm tabular-nums text-zinc-300">
              <span className="mr-1.5 text-xs uppercase tracking-wider text-zinc-600">
                Prévu
              </span>
              {formatCurrency(totalPlanned)}
            </p>
            {people.map((person, index) => (
              <p key={person.id} className="text-sm tabular-nums text-zinc-300">
                <span
                  className="mr-1.5 text-xs uppercase tracking-wider"
                  style={{ color: resolveColor(person.avatar_color) }}
                >
                  {person.display_name}
                </span>
                {formatCurrency(gridPersonTotals[index])}
              </p>
            ))}
            <p className="text-sm font-semibold tabular-nums text-white">
              <span className="mr-1.5 text-xs uppercase tracking-wider text-zinc-600">
                Total réel
              </span>
              {formatCurrency(gridRealTotal)}
            </p>
          </div>
        </div>
      </div>

      <EditLineDialog
        line={editingLine}
        onClose={() => setEditingLine(null)}
        onSaved={load}
      />
      <CategoryDialog
        open={categoryDialogOpen}
        category={editingCategory}
        onOpenChange={setCategoryDialogOpen}
        onSaved={handleCategorySaved}
      />
    </div>
  );
}
