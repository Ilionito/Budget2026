"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Check, Eye, Loader2, Pencil, Plus, Repeat, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { supabase, ALLOWED_EMAILS } from "@/lib/supabase";
import { materializeSubscriptions } from "@/lib/subscriptions";
import { ensurePersonalBudgetLine } from "@/lib/budget";
import { realBalanceAfterAdd } from "@/lib/realBalance";
import { useAppStore } from "@/lib/store";
import { cn, normalizeLabel } from "@/lib/utils";
import type { Category, LedgerEntry } from "@/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHS_SHORT = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Jun",
  "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc",
];
const MONTHS_FULL = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

const SLUG_TO_EMAIL: Record<string, string> = {
  joris: ALLOWED_EMAILS[0],
  ophelie: ALLOWED_EMAILS[1],
};

/** Valeurs sentinelles du select catégorie (Radix interdit value=""). */
const NONE_CATEGORY = "__none__";
const NEW_CATEGORY = "__new__";

// ─── Types ────────────────────────────────────────────────────────────────────

type EntryWithBalance = LedgerEntry & { balance: number };

interface RowValues {
  date: string;
  label: string;
  incomeAmt: string;
  expenseAmt: string;
  note: string;
  /** "" = perso (hors budget) ; sinon id de catégorie → intégrée au budget. */
  categoryId: string;
}

interface SummaryCard {
  label: string;
  value: number;
  prefix: string;
  sub: string;
  color: string;
  /** Carte « Solde pointé » : ouvre le dialog d'ajustement. */
  editable?: boolean;
}

interface MonthSummary {
  monthIndex: number;
  income: number;
  expense: number;
  variation: number;
  balanceAtEnd: number;
  hasAnyEntries: boolean;
  isFutureMonth: boolean;
  isCurrentMonth: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtAmt(n: number): string {
  return (
    Math.abs(n).toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " €"
  );
}

function mStart(y: number, m: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

function mEnd(y: number, m: number): string {
  return m === 11 ? `${y + 1}-01-01` : `${y}-${String(m + 2).padStart(2, "0")}-01`;
}

function parseRow(row: RowValues): { amount: number; type: "income" | "expense" } | null {
  const inc = parseFloat(row.incomeAmt.replace(",", "."));
  const exp = parseFloat(row.expenseAmt.replace(",", "."));
  if (Number.isFinite(inc) && inc > 0) return { amount: inc, type: "income" };
  if (Number.isFinite(exp) && exp > 0) return { amount: exp, type: "expense" };
  return null;
}

function canSubmitRow(row: RowValues): boolean {
  return row.label.trim() !== "" && row.date !== "" && parseRow(row) !== null;
}

function entryToRow(entry: LedgerEntry): RowValues {
  return {
    date: entry.date,
    label: entry.label,
    incomeAmt: entry.type === "income" ? String(Number(entry.amount)) : "",
    expenseAmt: entry.type === "expense" ? String(Number(entry.amount)) : "",
    note: entry.note ?? "",
    categoryId: entry.category_id ?? "",
  };
}

function emptyRow(date: string): RowValues {
  return { date, label: "", incomeAmt: "", expenseAmt: "", note: "", categoryId: "" };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LedgerPage({
  params,
}: {
  params: Promise<{ person: string }>;
}) {
  const { person } = use(params);
  const {
    profile,
    partner,
    ready,
    currentMonth,
    setCurrentMonth,
    categories,
    setCategories,
    dataVersion,
    bumpDataVersion,
    setProfile,
    setPartner,
  } = useAppStore();
  const today = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

  // ── Month navigation ───────────────────────────────────────────────────────
  const year = currentMonth.getFullYear();
  const activeMonth = currentMonth.getMonth(); // 0-11
  const [isAnnualView, setIsAnnualView] = useState(false);

  // ── Table state ────────────────────────────────────────────────────────────
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<RowValues>(emptyRow(""));
  const [addRow, setAddRow] = useState<RowValues>(() => emptyRow(today));
  const [saving, setSaving] = useState(false);
  /** Saisie inline d'une nouvelle catégorie (ligne d'ajout ou d'édition). */
  const [catDraft, setCatDraft] = useState<{
    context: "add" | "edit";
    name: string;
  } | null>(null);
  const [budgetCategoryIds, setBudgetCategoryIds] = useState<Set<string>>(
    new Set()
  );
  /** Dialog « Définir le solde pointé ». */
  const [checkedDialogOpen, setCheckedDialogOpen] = useState(false);
  const [checkedTarget, setCheckedTarget] = useState("");
  /** Dialog « Définir le solde réel ». */
  const [realDialogOpen, setRealDialogOpen] = useState(false);
  const [realTarget, setRealTarget] = useState("");
  const [savingReal, setSavingReal] = useState(false);

  const targetEmail = SLUG_TO_EMAIL[person] ?? null;
  const targetProfile = useMemo(
    () =>
      targetEmail
        ? ([profile, partner].find((p) => p?.email === targetEmail) ?? null)
        : null,
    [profile, partner, targetEmail]
  );
  const isOwner = !!targetProfile && targetProfile.id === profile?.id;

  // Profil pour lequel les abonnements ont déjà été matérialisés ce montage,
  // pour ne lancer la génération qu'une fois (et seulement sur son propre compte).
  const materializedFor = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!targetProfile) return;
    setLoading(true);
    // Génère les échéances futures manquantes des abonnements actifs avant
    // d'afficher le mois : elles apparaissent comme des écritures « À venir ».
    if (isOwner && materializedFor.current !== targetProfile.id) {
      materializedFor.current = targetProfile.id;
      await materializeSubscriptions(targetProfile.id);
    }
    const { data } = await supabase
      .from("ledger_entries")
      .select("*")
      .eq("user_id", targetProfile.id)
      .order("date", { ascending: true })
      .order("created_at", { ascending: true });
    setEntries((data as LedgerEntry[] | null) ?? []);
    setLoading(false);
  }, [targetProfile, isOwner]);

  // dataVersion : recharge quand une transaction est ajoutée ailleurs (FAB…).
  useEffect(() => {
    if (!ready || !profile) return;
    load();
  }, [ready, profile, targetProfile, load, dataVersion]);

  // Catégories utilisées par le budget : affichées en premier dans le select.
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("budget_lines")
      .select("category_id")
      .then(({ data }) => {
        if (cancelled) return;
        setBudgetCategoryIds(
          new Set(
            ((data as { category_id: string }[] | null) ?? []).map(
              (l) => l.category_id
            )
          )
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Reset add row date and cancel edit when the displayed month changes
  useEffect(() => {
    const ms = mStart(year, activeMonth);
    const me = mEnd(year, activeMonth);
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const defaultDate = todayStr >= ms && todayStr < me ? todayStr : ms;
    setAddRow(emptyRow(defaultDate));
    setEditingId(null);
    setEditValues(emptyRow(""));
    setCatDraft(null);
  }, [year, activeMonth]);

  // ── Monthly computations ───────────────────────────────────────────────────

  const monthStartStr = useMemo(() => mStart(year, activeMonth), [year, activeMonth]);
  const monthEndStr = useMemo(() => mEnd(year, activeMonth), [year, activeMonth]);

  // ── Solde réel daté = point d'ancrage du solde ─────────────────────────────
  // Quand un solde réel daté existe (carte « Solde réel »), le solde calculé est
  // recalé pour retomber EXACTEMENT sur cette valeur à sa date, au lieu de
  // chaîner une clôture calculée qui dérive de mois en mois. On applique un
  // décalage constant K = soldeRéel − (cumul BRUT jusqu'à la date d'ancrage),
  // à partir du mois qui contient l'ancre (et les mois suivants). Le cumul
  // compte toutes les opérations dont la date ≤ ancre (pointées ou non).
  const anchorDate = targetProfile?.real_balance_at ?? null;
  const anchorAmount =
    targetProfile?.real_balance != null
      ? Number(targetProfile.real_balance)
      : null;
  const hasAnchor = anchorDate != null && anchorAmount != null;

  const anchorOffset = useMemo(() => {
    if (!hasAnchor || anchorDate == null || anchorAmount == null) return 0;
    const soldeAtAnchor = entries
      .filter((e) => e.date <= anchorDate)
      .reduce(
        (s, e) =>
          s + (e.type === "income" ? Number(e.amount) : -Number(e.amount)),
        0
      );
    return anchorAmount - soldeAtAnchor;
  }, [hasAnchor, anchorDate, anchorAmount, entries]);

  /** Décalage d'ancrage pour un solde arrêté à `cutoffExclusive` (1er jour du
   *  mois suivant) : actif dès que l'ancre est antérieure à cette borne, donc à
   *  partir du mois qui contient l'ancre. Avant l'ancre → 0 (comportement
   *  inchangé). */
  const anchorAdjustment = useCallback(
    (cutoffExclusive: string) =>
      hasAnchor && anchorDate != null && anchorDate < cutoffExclusive
        ? anchorOffset
        : 0,
    [hasAnchor, anchorDate, anchorOffset]
  );

  const carryForward = useMemo(
    () =>
      entries
        .filter((e) => e.date < monthStartStr)
        .reduce(
          (s, e) =>
            s + (e.type === "income" ? Number(e.amount) : -Number(e.amount)),
          0
        ) + anchorAdjustment(monthEndStr),
    [entries, monthStartStr, monthEndStr, anchorAdjustment]
  );

  const hasPreviousEntries = useMemo(
    () => entries.some((e) => e.date < monthStartStr),
    [entries, monthStartStr]
  );

  const monthEntries = useMemo(
    () => entries.filter((e) => e.date >= monthStartStr && e.date < monthEndStr),
    [entries, monthStartStr, monthEndStr]
  );

  const monthEntriesWithBalance = useMemo<EntryWithBalance[]>(() => {
    let balance = carryForward;
    return monthEntries.map((e) => {
      balance += e.type === "income" ? Number(e.amount) : -Number(e.amount);
      return { ...e, balance };
    });
  }, [monthEntries, carryForward]);

  const monthPastEntries = useMemo(
    () => monthEntriesWithBalance.filter((e) => e.date <= today),
    [monthEntriesWithBalance, today]
  );
  const monthFutureEntries = useMemo(
    () => monthEntriesWithBalance.filter((e) => e.date > today),
    [monthEntriesWithBalance, today]
  );

  const monthIncome = useMemo(
    () =>
      monthEntries
        .filter((e) => e.type === "income")
        .reduce((s, e) => s + Number(e.amount), 0),
    [monthEntries]
  );
  const monthExpense = useMemo(
    () =>
      monthEntries
        .filter((e) => e.type === "expense")
        .reduce((s, e) => s + Number(e.amount), 0),
    [monthEntries]
  );
  const monthEndBalance = carryForward + monthIncome - monthExpense;

  // ── Annual computations ────────────────────────────────────────────────────

  const annualData = useMemo<MonthSummary[]>(
    () =>
      Array.from({ length: 12 }, (_, m) => {
        const ms = mStart(year, m);
        const me = mEnd(year, m);
        const mEntries = entries.filter((e) => e.date >= ms && e.date < me);
        const income = mEntries
          .filter((e) => e.type === "income")
          .reduce((s, e) => s + Number(e.amount), 0);
        const expense = mEntries
          .filter((e) => e.type === "expense")
          .reduce((s, e) => s + Number(e.amount), 0);
        const balanceAtEnd =
          entries
            .filter((e) => e.date < me)
            .reduce(
              (s, e) =>
                s +
                (e.type === "income" ? Number(e.amount) : -Number(e.amount)),
              0
            ) + anchorAdjustment(me);
        return {
          monthIndex: m,
          income,
          expense,
          variation: income - expense,
          balanceAtEnd,
          hasAnyEntries: mEntries.length > 0,
          isFutureMonth: ms > today,
          isCurrentMonth: ms <= today && today < me,
        };
      }),
    [entries, year, today, anchorAdjustment]
  );

  const yearIncome = useMemo(
    () => annualData.reduce((s, d) => s + d.income, 0),
    [annualData]
  );
  const yearExpense = useMemo(
    () => annualData.reduce((s, d) => s + d.expense, 0),
    [annualData]
  );
  const yearVariation = yearIncome - yearExpense;

  const currentBalance = useMemo(
    () =>
      entries
        .filter((e) => e.date <= today)
        .reduce(
          (s, e) => s + (e.type === "income" ? Number(e.amount) : -Number(e.amount)),
          0
        ) +
      anchorAdjustment(
        mEnd(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1)
      ),
    [entries, today, anchorAdjustment]
  );

  const chartData = useMemo(
    () =>
      annualData.map((d, i) => ({
        month: MONTHS_SHORT[i],
        solde: Math.round(d.balanceAtEnd * 100) / 100,
      })),
    [annualData]
  );

  // ── Global computations ────────────────────────────────────────────────────

  const checkedBalance = useMemo(
    () =>
      entries
        .filter((e) => e.is_checked && e.date <= today)
        .reduce(
          (s, e) => s + (e.type === "income" ? Number(e.amount) : -Number(e.amount)),
          0
        ),
    [entries, today]
  );

  // ── Catégories ─────────────────────────────────────────────────────────────

  const categoriesById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );

  // Dédupliquées : catégories du budget en premier, comme TransactionForm.
  const categoryOptions = useMemo(() => {
    const score = (c: Category) =>
      (budgetCategoryIds.has(c.id) ? 0 : 2) + (c.is_default ? 0 : 1);
    const ranked = [...categories].sort(
      (a, b) => score(a) - score(b) || a.label.localeCompare(b.label)
    );
    const seen = new Map<string, Category>();
    for (const c of ranked) {
      const key = normalizeLabel(c.label);
      if (!seen.has(key)) seen.set(key, c);
    }
    const unique = [...seen.values()];
    return {
      budget: unique
        .filter((c) => budgetCategoryIds.has(c.id))
        .sort((a, b) => a.label.localeCompare(b.label)),
      others: unique
        .filter((c) => !budgetCategoryIds.has(c.id))
        .sort((a, b) => a.label.localeCompare(b.label)),
    };
  }, [categories, budgetCategoryIds]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleTabClick(monthIndex: number) {
    setIsAnnualView(false);
    setCurrentMonth(new Date(year, monthIndex, 1));
  }

  function startEdit(entry: LedgerEntry) {
    setEditingId(entry.id);
    setEditValues(entryToRow(entry));
    setCatDraft(null);
  }

  /** Crée la catégorie saisie inline (ou réutilise un doublon) et la sélectionne. */
  async function confirmCatDraft(context: "add" | "edit") {
    if (!catDraft) return;
    const name = catDraft.name.trim();
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
    const chosenId = id;
    if (context === "add") {
      setAddRow((r) => ({ ...r, categoryId: chosenId }));
    } else {
      setEditValues((r) => ({ ...r, categoryId: chosenId }));
    }
    setCatDraft(null);
  }

  async function handleSave(id: string) {
    const parsed = parseRow(editValues);
    if (!editValues.label.trim() || !parsed || !editValues.date) return;
    const entry = entries.find((e) => e.id === id);
    const amount = Math.round(parsed.amount * 100) / 100;
    const label = editValues.label.trim();
    const note = editValues.note.trim() || null;
    const categoryId = editValues.categoryId;
    const wantsBudget = categoryId !== "";
    // Une Entrée liée au budget est un remboursement : montant négatif.
    const txAmount = parsed.type === "income" ? -amount : amount;
    let txId = entry?.transaction_id ?? null;
    let budgetTouched = false;

    if (txId && wantsBudget) {
      const { error } = await supabase
        .from("transactions")
        .update({
          date: editValues.date,
          label,
          amount: txAmount,
          category_id: categoryId,
          note,
        })
        .eq("id", txId);
      if (error) {
        toast.error("Impossible de mettre à jour la dépense liée du budget");
        return;
      }
      budgetTouched = true;
    } else if (txId && !wantsBudget) {
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", txId);
      if (error) {
        toast.error("Impossible de retirer la dépense du budget");
        return;
      }
      txId = null;
      budgetTouched = true;
    } else if (!txId && wantsBudget && targetProfile) {
      const { data: tx, error } = await supabase
        .from("transactions")
        .insert({
          user_id: targetProfile.id,
          date: editValues.date,
          label,
          amount: txAmount,
          category_id: categoryId,
          note,
          is_private: false,
          is_recurring: false,
        })
        .select("id")
        .single();
      if (error || !tx) {
        toast.error("Impossible de créer la dépense dans le budget");
        return;
      }
      txId = (tx as { id: string }).id;
      budgetTouched = true;
    }

    const { error } = await supabase
      .from("ledger_entries")
      .update({
        date: editValues.date,
        label,
        amount,
        type: parsed.type,
        note,
        category_id: categoryId || null,
        transaction_id: txId,
      })
      .eq("id", id);
    if (error) {
      toast.error("Impossible de modifier cette entrée");
      return;
    }
    setEditingId(null);
    toast.success("Entrée modifiée");
    if (budgetTouched) bumpDataVersion();
    load();
  }

  async function handleDelete(id: string) {
    const entry = entries.find((e) => e.id === id);
    if (entry?.transaction_id) {
      const { error: txError } = await supabase
        .from("transactions")
        .delete()
        .eq("id", entry.transaction_id);
      if (txError) {
        toast.error("Impossible de supprimer la dépense liée du budget");
        return;
      }
    }
    const { error } = await supabase
      .from("ledger_entries")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Impossible de supprimer cette entrée");
      return;
    }
    toast.success("Entrée supprimée");
    if (entry?.transaction_id) bumpDataVersion();
    load();
  }

  async function handleAdd() {
    if (!targetProfile || !canSubmitRow(addRow)) return;
    const parsed = parseRow(addRow)!;
    const amount = Math.round(parsed.amount * 100) / 100;
    const label = addRow.label.trim();
    const note = addRow.note.trim() || null;
    const wantsBudget = addRow.categoryId !== "";
    // Une Entrée liée au budget est un remboursement : montant négatif.
    const txAmount = parsed.type === "income" ? -amount : amount;
    setSaving(true);

    let txId: string | null = null;
    if (wantsBudget) {
      const { data: tx, error: txError } = await supabase
        .from("transactions")
        .insert({
          user_id: targetProfile.id,
          date: addRow.date,
          label,
          amount: txAmount,
          category_id: addRow.categoryId,
          note,
          is_private: false,
          is_recurring: false,
        })
        .select("id")
        .single();
      if (txError || !tx) {
        setSaving(false);
        toast.error("Impossible de créer la dépense dans le budget");
        return;
      }
      txId = (tx as { id: string }).id;
    }

    const { error } = await supabase.from("ledger_entries").insert({
      user_id: targetProfile.id,
      date: addRow.date,
      label,
      amount,
      type: parsed.type,
      note,
      is_checked: false,
      category_id: wantsBudget ? addRow.categoryId : null,
      transaction_id: txId,
    });
    if (error) {
      setSaving(false);
      toast.error("Impossible d'ajouter cette entrée");
      return;
    }
    // Dépense dans une catégorie non-commune → ligne de budget perso auto.
    if (wantsBudget && parsed.type === "expense") {
      await ensurePersonalBudgetLine(targetProfile.id, addRow.categoryId, label);
    }
    // Le solde réel baisse (sortie) / monte (entrée) automatiquement à l'ajout.
    await applyAddToRealBalance(addRow.date, parsed.type, amount);
    setSaving(false);
    if (wantsBudget) bumpDataVersion();
    const ms = mStart(year, activeMonth);
    const me = mEnd(year, activeMonth);
    const todayStr = format(new Date(), "yyyy-MM-dd");
    setAddRow(emptyRow(todayStr >= ms && todayStr < me ? todayStr : ms));
    load();
  }

  /** À l'AJOUT d'une opération, fait varier le solde réel automatiquement :
   *  une sortie le baisse, une entrée le monte. Uniquement pour une opération
   *  datée dans la fenêtre [date du solde réel ; aujourd'hui] : une opération
   *  antérieure au solde réel est déjà comprise dedans (double comptage évité),
   *  une opération « à venir » n'est pas encore débitée. On AVANCE la date
   *  d'ancrage à celle de l'opération pour que le REPORT reste inchangé :
   *  l'opération entre alors dans Σ(≤ date), ce qui annule son effet sur le
   *  report. Comme on ne traite QUE l'opération qu'on vient de créer, le garde
   *  « créée après la dernière saisie du solde réel » est automatiquement
   *  satisfait. Volontairement PAS appelée à la suppression / l'édition. */
  async function applyAddToRealBalance(
    date: string,
    type: "income" | "expense",
    amount: number
  ) {
    if (!targetProfile) return;
    const next = realBalanceAfterAdd(
      targetProfile.real_balance,
      targetProfile.real_balance_at,
      { date, type, amount },
      today
    );
    if (!next) return; // hors fenêtre (déjà comprise / à venir) → rien
    const { error } = await supabase
      .from("profiles")
      .update({ real_balance: next.amount, real_balance_at: next.date })
      .eq("id", targetProfile.id);
    if (error) {
      toast.error("Solde réel non mis à jour automatiquement");
      return;
    }
    const updated = {
      ...targetProfile,
      real_balance: next.amount,
      real_balance_at: next.date,
    };
    if (profile && targetProfile.id === profile.id) setProfile(updated);
    else if (partner && targetProfile.id === partner.id) setPartner(updated);
  }

  /** Crée une écriture d'ajustement pointée pour amener le solde pointé
   *  à la valeur saisie (rapprochement avec le relevé bancaire). */
  async function handleSetCheckedBalance() {
    if (!targetProfile) return;
    const target = Number.parseFloat(checkedTarget.replace(",", "."));
    if (!Number.isFinite(target)) return;
    const diff = Math.round((target - checkedBalance) * 100) / 100;
    if (diff === 0) {
      toast.success("Le solde pointé est déjà à ce montant");
      setCheckedDialogOpen(false);
      return;
    }
    // Date dans le mois affiché, jamais dans le futur (sinon l'écriture
    // ne compterait pas dans le solde pointé).
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const ms = mStart(year, activeMonth);
    const me = mEnd(year, activeMonth);
    let date: string;
    if (todayStr >= ms && todayStr < me) {
      date = todayStr; // mois courant
    } else if (me <= todayStr) {
      date = format(new Date(year, activeMonth + 1, 0), "yyyy-MM-dd"); // mois passé : dernier jour
    } else {
      date = todayStr; // mois futur : aujourd'hui
    }
    const { error } = await supabase.from("ledger_entries").insert({
      user_id: targetProfile.id,
      date,
      label: "Ajustement de solde",
      amount: Math.abs(diff),
      type: diff > 0 ? "income" : "expense",
      note: `Solde pointé défini à ${target.toLocaleString("fr-FR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} €`,
      is_checked: true,
      category_id: null,
      transaction_id: null,
    });
    if (error) {
      toast.error("Impossible de créer l'écriture d'ajustement");
      return;
    }
    toast.success("Solde pointé mis à jour");
    setCheckedDialogOpen(false);
    load();
  }

  /** Enregistre le solde réel du compte (saisie manuelle) sur le profil.
   *  Source unique partagée avec la carte « Solde restant » du Dashboard. */
  async function handleSetRealBalance() {
    if (!targetProfile) return;
    const target = Number.parseFloat(realTarget.replace(",", "."));
    if (!Number.isFinite(target)) {
      toast.error("Montant invalide");
      return;
    }
    const value = Math.round(target * 100) / 100;
    const at = format(new Date(), "yyyy-MM-dd");
    setSavingReal(true);
    const { error } = await supabase
      .from("profiles")
      .update({ real_balance: value, real_balance_at: at })
      .eq("id", targetProfile.id);
    setSavingReal(false);
    if (error) {
      toast.error(`Impossible d'enregistrer le solde réel : ${error.message}`);
      return;
    }
    // Répercute aussitôt dans le store → Dashboard « Solde restant » + cette carte.
    const updated = {
      ...targetProfile,
      real_balance: value,
      real_balance_at: at,
    };
    if (profile && targetProfile.id === profile.id) setProfile(updated);
    else if (partner && targetProfile.id === partner.id) setPartner(updated);
    setRealDialogOpen(false);
    toast.success("Solde réel mis à jour");
  }

  async function handleToggleChecked(id: string, current: boolean) {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, is_checked: !current } : e))
    );
    const { error } = await supabase
      .from("ledger_entries")
      .update({ is_checked: !current })
      .eq("id", id);
    if (error) {
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, is_checked: current } : e))
      );
      toast.error("Impossible de mettre à jour le pointage");
    }
  }

  // ── Render helpers (plain functions — called during render, no hooks) ──────

  function renderBalance(balance: number) {
    return (
      <span
        className={cn(
          "font-semibold tabular-nums",
          balance < 0 ? "text-rose-400" : "text-zinc-100"
        )}
      >
        {balance < 0 ? "−" : ""}
        {fmtAmt(balance)}
      </span>
    );
  }

  function renderCheckbox(entry: LedgerEntry) {
    return (
      <button
        type="button"
        onClick={() => isOwner && handleToggleChecked(entry.id, entry.is_checked)}
        disabled={!isOwner}
        className={cn(
          "inline-flex size-[18px] items-center justify-center rounded border transition-all duration-100",
          entry.is_checked
            ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-400"
            : "border-zinc-700 bg-transparent text-transparent",
          isOwner && !entry.is_checked && "hover:border-zinc-500 hover:text-zinc-500",
          !isOwner && "cursor-default"
        )}
        aria-label={entry.is_checked ? "Décocher" : "Pointer"}
      >
        <Check className="size-3 stroke-[2.5]" />
      </button>
    );
  }

  /** Select de catégorie compact pour les lignes d'ajout/édition.
   *  Sortie + catégorie → dépense du budget ; Entrée + catégorie → remboursement. */
  function renderCategorySelect(context: "add" | "edit") {
    const row = context === "add" ? addRow : editValues;
    const setRow = context === "add" ? setAddRow : setEditValues;

    if (catDraft?.context === context) {
      return (
        <div className="flex items-center gap-1">
          <Input
            autoFocus
            placeholder="Nouvelle catégorie"
            value={catDraft.name}
            onChange={(e) => setCatDraft({ context, name: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmCatDraft(context);
              if (e.key === "Escape") setCatDraft(null);
            }}
            className="h-8 min-w-[110px] text-xs"
          />
          <Button
            size="icon"
            className="size-7 shrink-0"
            onClick={() => confirmCatDraft(context)}
            disabled={!catDraft.name.trim()}
            aria-label="Créer la catégorie"
          >
            <Check className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-zinc-500"
            onClick={() => setCatDraft(null)}
            aria-label="Annuler"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      );
    }

    return (
      <Select
        value={row.categoryId || NONE_CATEGORY}
        onValueChange={(v) => {
          if (v === NEW_CATEGORY) {
            setCatDraft({ context, name: "" });
            return;
          }
          setRow((r) => ({ ...r, categoryId: v === NONE_CATEGORY ? "" : v }));
        }}
      >
        <SelectTrigger
          className="h-8 w-full min-w-[130px] text-xs"
          aria-label="Catégorie"
        >
          <SelectValue placeholder="Perso" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_CATEGORY}>Perso (hors budget)</SelectItem>
          {categoryOptions.budget.length > 0 && (
            <SelectGroup>
              <SelectLabel>Catégories du budget</SelectLabel>
              {categoryOptions.budget.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          {categoryOptions.others.length > 0 && (
            <SelectGroup>
              <SelectLabel>Autres catégories</SelectLabel>
              {categoryOptions.others.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          <SelectSeparator />
          <SelectItem
            value={NEW_CATEGORY}
            className="text-indigo-300 focus:text-indigo-200"
          >
            + Nouvelle catégorie
          </SelectItem>
        </SelectContent>
      </Select>
    );
  }

  function renderDataRow(entry: EntryWithBalance, isFuture: boolean) {
    const category = entry.category_id
      ? categoriesById.get(entry.category_id)
      : undefined;
    return (
      <tr
        key={entry.id}
        className={cn(
          "group transition-colors hover:bg-zinc-800/20",
          isFuture && "opacity-60"
        )}
      >
        <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-zinc-400">
          {format(new Date(entry.date + "T12:00:00"), "dd/MM/yy")}
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            {!entry.is_checked && !isFuture && (
              <span
                className="size-1.5 shrink-0 rounded-full bg-amber-400"
                title="Non pointée"
              />
            )}
            <span className="text-sm font-medium text-zinc-200">{entry.label}</span>
            {entry.subscription_id && (
              <span
                className="inline-flex items-center gap-0.5 rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-300"
                title="Généré depuis un abonnement"
              >
                <Repeat className="size-2.5" />
                Abonnement
              </span>
            )}
            {isFuture && (
              <span className="inline-flex items-center rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                À venir
              </span>
            )}
          </div>
          {entry.note && (
            <p className="mt-0.5 text-xs text-zinc-600">{entry.note}</p>
          )}
        </td>
        <td className="px-3 py-2">
          {category ? (
            <span
              title={
                entry.transaction_id
                  ? "Intégrée au budget commun"
                  : "Catégorie hors budget"
              }
              className="inline-flex items-center rounded-full bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-300"
            >
              {category.label}
            </span>
          ) : (
            <span className="text-xs text-zinc-700">—</span>
          )}
        </td>
        <td className="px-3 py-2 text-right text-sm tabular-nums">
          {entry.type === "income" ? (
            <span className="font-medium text-emerald-400">
              +{fmtAmt(Number(entry.amount))}
            </span>
          ) : (
            <span className="text-zinc-700">—</span>
          )}
        </td>
        <td className="px-3 py-2 text-right text-sm tabular-nums">
          {entry.type === "expense" ? (
            <span className="font-medium text-rose-400">
              {fmtAmt(Number(entry.amount))}
            </span>
          ) : (
            <span className="text-zinc-700">—</span>
          )}
        </td>
        <td className="px-3 py-2 text-center">{renderCheckbox(entry)}</td>
        <td className="px-3 py-2 text-right">{renderBalance(entry.balance)}</td>
        <td className="px-3 py-2" />
        <td className="px-3 py-2">
          {isOwner && (
            <div className="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-zinc-600 hover:text-indigo-400"
                onClick={() => startEdit(entry)}
                aria-label="Modifier"
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-zinc-600 hover:text-rose-400"
                onClick={() => handleDelete(entry.id)}
                aria-label="Supprimer"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          )}
        </td>
      </tr>
    );
  }

  function renderEditRow(entry: EntryWithBalance) {
    const parsed = parseRow(editValues);
    const canSave =
      editValues.label.trim() !== "" && !!parsed && editValues.date !== "";
    const onKey = (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleSave(entry.id);
      if (e.key === "Escape") setEditingId(null);
    };
    return (
      <tr key={entry.id} className="bg-indigo-500/5">
        <td className="px-2 py-1.5">
          <DatePicker
            value={editValues.date}
            onChange={(v) => setEditValues((r) => ({ ...r, date: v }))}
            displayFormat="dd/MM/yy"
            className="h-8 min-w-[90px] text-xs"
          />
        </td>
        <td className="px-2 py-1.5">
          <Input
            value={editValues.label}
            onChange={(e) =>
              setEditValues((r) => ({ ...r, label: e.target.value }))
            }
            onKeyDown={onKey}
            className="h-8 text-xs"
            autoFocus
          />
        </td>
        <td className="px-2 py-1.5">{renderCategorySelect("edit")}</td>
        <td className="px-2 py-1.5">
          <Input
            inputMode="decimal"
            placeholder="0,00"
            value={editValues.incomeAmt}
            onChange={(e) =>
              setEditValues((r) => ({
                ...r,
                incomeAmt: e.target.value,
                expenseAmt: e.target.value ? "" : r.expenseAmt,
              }))
            }
            onKeyDown={onKey}
            className="h-8 text-right text-xs tabular-nums"
          />
        </td>
        <td className="px-2 py-1.5">
          <Input
            inputMode="decimal"
            placeholder="0,00"
            value={editValues.expenseAmt}
            onChange={(e) =>
              setEditValues((r) => ({
                ...r,
                expenseAmt: e.target.value,
                incomeAmt: e.target.value ? "" : r.incomeAmt,
              }))
            }
            onKeyDown={onKey}
            className="h-8 text-right text-xs tabular-nums"
          />
        </td>
        <td className="px-2 py-1.5 text-center">{renderCheckbox(entry)}</td>
        <td className="px-2 py-1.5 text-right text-xs">
          {renderBalance(entry.balance)}
        </td>
        <td className="px-2 py-1.5">
          <Input
            placeholder="Note"
            value={editValues.note}
            onChange={(e) =>
              setEditValues((r) => ({ ...r, note: e.target.value }))
            }
            onKeyDown={onKey}
            className="h-8 text-xs"
          />
        </td>
        <td className="px-2 py-1.5">
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-zinc-500 hover:text-zinc-100"
              onClick={() => setEditingId(null)}
              aria-label="Annuler"
            >
              <X className="size-3.5" />
            </Button>
            <Button
              size="icon"
              className="size-7"
              onClick={() => handleSave(entry.id)}
              disabled={!canSave}
              aria-label="Enregistrer"
            >
              <Check className="size-3.5" />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  function renderAddRow() {
    const canAdd = canSubmitRow(addRow);
    const onKey = (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleAdd();
    };
    return (
      <tr className="border-t-2 border-indigo-500/20 bg-indigo-500/[0.04]">
        <td className="px-2 py-2">
          <DatePicker
            value={addRow.date}
            onChange={(v) => setAddRow((r) => ({ ...r, date: v }))}
            displayFormat="dd/MM/yy"
            className="h-8 min-w-[90px] text-xs"
          />
        </td>
        <td className="px-2 py-2">
          <Input
            placeholder="Libellé"
            value={addRow.label}
            onChange={(e) =>
              setAddRow((r) => ({ ...r, label: e.target.value }))
            }
            onKeyDown={onKey}
            className="h-8 text-xs"
          />
        </td>
        <td className="px-2 py-2">{renderCategorySelect("add")}</td>
        <td className="px-2 py-2">
          <Input
            inputMode="decimal"
            placeholder="0,00"
            value={addRow.incomeAmt}
            onChange={(e) =>
              setAddRow((r) => ({
                ...r,
                incomeAmt: e.target.value,
                expenseAmt: e.target.value ? "" : r.expenseAmt,
              }))
            }
            onKeyDown={onKey}
            className="h-8 text-right text-xs tabular-nums text-emerald-400 placeholder:text-zinc-700"
          />
        </td>
        <td className="px-2 py-2">
          <Input
            inputMode="decimal"
            placeholder="0,00"
            value={addRow.expenseAmt}
            onChange={(e) =>
              setAddRow((r) => ({
                ...r,
                expenseAmt: e.target.value,
                incomeAmt: e.target.value ? "" : r.incomeAmt,
              }))
            }
            onKeyDown={onKey}
            className="h-8 text-right text-xs tabular-nums text-rose-400 placeholder:text-zinc-700"
          />
        </td>
        <td className="px-2 py-2 text-center">
          <div className="inline-flex size-[18px] items-center justify-center rounded border border-zinc-800 opacity-30" />
        </td>
        <td className="px-2 py-2 text-center text-xs text-zinc-700">—</td>
        <td className="px-2 py-2">
          <Input
            placeholder="Note (facultatif)"
            value={addRow.note}
            onChange={(e) =>
              setAddRow((r) => ({ ...r, note: e.target.value }))
            }
            onKeyDown={onKey}
            className="h-8 text-xs"
          />
        </td>
        <td className="px-2 py-2">
          <Button
            size="icon"
            className="size-7"
            onClick={handleAdd}
            disabled={saving || !canAdd}
            aria-label="Ajouter"
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
          </Button>
        </td>
      </tr>
    );
  }

  // ── Guards ────────────────────────────────────────────────────────────────

  if (!ready) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-56 rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (!targetEmail || !SLUG_TO_EMAIL[person]) {
    return (
      <div className="py-20 text-center">
        <p className="text-zinc-500">
          Registre introuvable pour «&nbsp;{person}&nbsp;».
        </p>
      </div>
    );
  }

  if (!targetProfile) {
    return (
      <div className="py-20 text-center">
        <p className="text-zinc-500">
          Le profil de ce compte n&apos;est pas encore créé. L&apos;utilisateur
          doit se connecter une première fois.
        </p>
      </div>
    );
  }

  // ── Summary cards data ─────────────────────────────────────────────────────

  const incomeCount = monthEntries.filter((e) => e.type === "income").length;
  const expenseCount = monthEntries.filter((e) => e.type === "expense").length;

  const monthlySummaryCards: SummaryCard[] = [
    {
      label: "Report",
      value: carryForward,
      prefix: carryForward < 0 ? "−" : "",
      sub: `Solde au 1er ${MONTHS_FULL[activeMonth].toLowerCase()}`,
      color:
        carryForward < 0
          ? "text-rose-400"
          : carryForward > 0
            ? "text-zinc-100"
            : "text-zinc-400",
    },
    {
      label: "Entrées du mois",
      value: monthIncome,
      prefix: monthIncome > 0 ? "+" : "",
      sub: `${incomeCount} opération${incomeCount !== 1 ? "s" : ""}`,
      color: monthIncome > 0 ? "text-emerald-400" : "text-zinc-400",
    },
    {
      label: "Sorties du mois",
      value: monthExpense,
      prefix: "",
      sub: `${expenseCount} opération${expenseCount !== 1 ? "s" : ""}`,
      color: monthExpense > 0 ? "text-rose-400" : "text-zinc-400",
    },
    {
      label: "Solde fin de mois",
      value: monthEndBalance,
      prefix: monthEndBalance < 0 ? "−" : "",
      sub: "Report + entrées − sorties",
      color:
        monthEndBalance < 0
          ? "text-rose-400"
          : monthEndBalance > 0
            ? "text-indigo-300"
            : "text-zinc-400",
    },
  ];

  const annualSummaryCards: SummaryCard[] = [
    {
      label: "Total entrées",
      value: yearIncome,
      prefix: yearIncome > 0 ? "+" : "",
      sub: `Année ${year}`,
      color: yearIncome > 0 ? "text-emerald-400" : "text-zinc-400",
    },
    {
      label: "Total sorties",
      value: yearExpense,
      prefix: "",
      sub: `Année ${year}`,
      color: yearExpense > 0 ? "text-rose-400" : "text-zinc-400",
    },
    {
      label: "Variation annuelle",
      value: yearVariation,
      prefix: yearVariation > 0 ? "+" : yearVariation < 0 ? "−" : "",
      sub: "Entrées − sorties",
      color:
        yearVariation > 0
          ? "text-emerald-400"
          : yearVariation < 0
            ? "text-rose-400"
            : "text-zinc-400",
    },
    {
      label: "Solde actuel",
      value: currentBalance,
      prefix: currentBalance < 0 ? "−" : "",
      sub: "Jusqu'à aujourd'hui",
      color:
        currentBalance < 0
          ? "text-rose-400"
          : currentBalance > 0
            ? "text-emerald-400"
            : "text-zinc-400",
    },
  ];

  const summaryCards = isAnnualView ? annualSummaryCards : monthlySummaryCards;
  const gridCols = "grid-cols-2 gap-3 lg:grid-cols-4";

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <UserAvatar profile={targetProfile} size="lg" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Compte de {targetProfile.display_name}
          </h1>
          <p className="text-sm text-zinc-500">
            {isAnnualView
              ? `Vue annuelle — ${year}`
              : `${MONTHS_FULL[activeMonth]} ${year}`}
          </p>
        </div>
      </div>

      {/* Solde réel — saisie manuelle, source unique partagée avec le
          « Solde restant » du Dashboard. */}
      <Card className="flex items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Solde réel
          </p>
          <p
            className={cn(
              "mt-1 text-2xl font-bold tabular-nums",
              targetProfile.real_balance == null
                ? "text-zinc-400"
                : Number(targetProfile.real_balance) < 0
                  ? "text-rose-400"
                  : "text-emerald-400"
            )}
          >
            {targetProfile.real_balance != null
              ? `${Number(targetProfile.real_balance) < 0 ? "−" : ""}${fmtAmt(
                  Number(targetProfile.real_balance)
                )}`
              : "—"}
          </p>
          <p className="mt-0.5 text-xs text-zinc-600">
            {targetProfile.real_balance_at
              ? `au ${format(
                  new Date(targetProfile.real_balance_at + "T12:00:00"),
                  "dd/MM/yyyy"
                )}`
              : isOwner
                ? "À renseigner — clique sur le crayon"
                : "Non renseigné"}
          </p>
        </div>
        {isOwner && (
          <Button
            variant="ghost"
            size="icon"
            className="size-9 shrink-0 text-zinc-500 hover:text-indigo-400"
            onClick={() => {
              setRealTarget(
                targetProfile.real_balance != null
                  ? Number(targetProfile.real_balance)
                      .toFixed(2)
                      .replace(".", ",")
                  : ""
              );
              setRealDialogOpen(true);
            }}
            aria-label="Définir le solde réel"
          >
            <Pencil className="size-4" />
          </Button>
        )}
      </Card>

      {/* Month navigation tabs */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-1">
        {MONTHS_SHORT.map((m, i) => (
          <button
            key={i}
            onClick={() => handleTabClick(i)}
            className={cn(
              "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              !isAnnualView && activeMonth === i
                ? "bg-indigo-500/20 text-indigo-300"
                : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            )}
          >
            {m}
          </button>
        ))}
        <div className="mx-1 h-4 w-px shrink-0 bg-zinc-800" />
        <button
          onClick={() => setIsAnnualView(true)}
          className={cn(
            "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            isAnnualView
              ? "bg-indigo-500/20 text-indigo-300"
              : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          )}
        >
          Année
        </button>
      </div>

      {/* Summary cards */}
      <div className={cn("grid", gridCols)}>
        {summaryCards.map(({ label, value, sub, prefix, color, editable }) => (
          <Card key={label} className="relative p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              {label}
            </p>
            <p className={cn("mt-2 text-xl font-semibold tabular-nums", color)}>
              {prefix}
              {fmtAmt(value)}
            </p>
            <p className="mt-0.5 text-xs text-zinc-600">{sub}</p>
            {editable && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-2 size-7 text-zinc-600 hover:text-indigo-400"
                onClick={() => {
                  setCheckedTarget(
                    checkedBalance.toFixed(2).replace(".", ",")
                  );
                  setCheckedDialogOpen(true);
                }}
                aria-label="Définir le solde pointé"
              >
                <Pencil className="size-3.5" />
              </Button>
            )}
          </Card>
        ))}
      </div>

      {/* Read-only banner */}
      {!isOwner && (
        <div className="flex items-center gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
          <Eye className="size-4 shrink-0 text-zinc-600" />
          <p className="text-sm text-zinc-400">
            Lecture seule —{" "}
            <span className="font-medium text-zinc-300">
              {targetProfile.display_name}
            </span>{" "}
            est le seul·e à pouvoir modifier ce registre.
          </p>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : isAnnualView ? (
        /* ── Annual view ──────────────────────────────────────────────────── */
        <div className="space-y-4">
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-zinc-800/60 bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                    <th className="px-4 py-3 text-left font-medium">Mois</th>
                    <th className="w-[130px] px-4 py-3 text-right font-medium">
                      Entrées
                    </th>
                    <th className="w-[130px] px-4 py-3 text-right font-medium">
                      Sorties
                    </th>
                    <th className="w-[130px] px-4 py-3 text-right font-medium">
                      Variation
                    </th>
                    <th className="w-[150px] px-4 py-3 text-right font-medium">
                      Solde fin de mois
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/30">
                  {annualData.map((d) => (
                    <tr
                      key={d.monthIndex}
                      onClick={() => handleTabClick(d.monthIndex)}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-zinc-800/30",
                        d.isCurrentMonth && "bg-zinc-800/40",
                        d.isFutureMonth && !d.hasAnyEntries && "opacity-40"
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "font-medium",
                              d.isCurrentMonth
                                ? "text-indigo-300"
                                : "text-zinc-200"
                            )}
                          >
                            {MONTHS_FULL[d.monthIndex]}
                          </span>
                          {d.isFutureMonth && d.hasAnyEntries && (
                            <span className="inline-flex items-center rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                              Projeté
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {d.income > 0 ? (
                          <span className="font-medium text-emerald-400">
                            +{fmtAmt(d.income)}
                          </span>
                        ) : (
                          <span className="text-zinc-700">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {d.expense > 0 ? (
                          <span className="font-medium text-rose-400">
                            {fmtAmt(d.expense)}
                          </span>
                        ) : (
                          <span className="text-zinc-700">—</span>
                        )}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 text-right tabular-nums font-medium",
                          d.variation > 0
                            ? "text-emerald-400"
                            : d.variation < 0
                              ? "text-rose-400"
                              : "text-zinc-600"
                        )}
                      >
                        {d.variation !== 0
                          ? `${d.variation > 0 ? "+" : "−"}${fmtAmt(d.variation)}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {renderBalance(d.balanceAtEnd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Recharts AreaChart */}
          <Card className="p-5">
            <p className="mb-4 text-xs font-medium uppercase tracking-wider text-zinc-500">
              Évolution du solde — {year}
            </p>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart
                data={chartData}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="soldeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#27272a"
                  vertical={false}
                />
                <XAxis
                  dataKey="month"
                  tick={{ fill: "#71717a", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v: number) => {
                    const abs = Math.abs(v);
                    const sign = v < 0 ? "-" : "";
                    return abs >= 1000
                      ? `${sign}${(abs / 1000).toFixed(0)}k`
                      : `${sign}${abs.toFixed(0)}`;
                  }}
                  tick={{ fill: "#71717a", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <Tooltip
                  formatter={(value) => {
                    const num = value as number;
                    return [
                      `${num < 0 ? "−" : ""}${fmtAmt(num)}`,
                      "Solde",
                    ];
                  }}
                  contentStyle={{
                    backgroundColor: "#18181b",
                    border: "1px solid #27272a",
                    borderRadius: "8px",
                    color: "#e4e4e7",
                    fontSize: "12px",
                  }}
                  cursor={{ stroke: "#3f3f46" }}
                />
                <ReferenceLine
                  y={0}
                  stroke="#f43f5e"
                  strokeDasharray="3 3"
                  strokeOpacity={0.5}
                />
                <Area
                  type="monotone"
                  dataKey="solde"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fill="url(#soldeGrad)"
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: "#6366f1",
                    stroke: "#18181b",
                    strokeWidth: 2,
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </div>
      ) : (
        /* ── Monthly view ─────────────────────────────────────────────────── */
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] text-sm">
              <thead>
                <tr className="border-b border-zinc-800/60 bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                  <th className="w-[96px] px-3 py-3 text-left font-medium">
                    Date
                  </th>
                  <th className="px-3 py-3 text-left font-medium">Libellé</th>
                  <th className="w-[150px] px-3 py-3 text-left font-medium">
                    Catégorie
                  </th>
                  <th className="w-[110px] px-3 py-3 text-right font-medium">
                    Entrée (€)
                  </th>
                  <th className="w-[110px] px-3 py-3 text-right font-medium">
                    Sortie (€)
                  </th>
                  <th className="w-[48px] px-3 py-3 text-center font-medium">
                    ✓
                  </th>
                  <th className="w-[110px] px-3 py-3 text-right font-medium">
                    Solde
                  </th>
                  <th className="px-3 py-3 text-left font-medium">Note</th>
                  <th className="w-[76px] px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/30">
                {/* Carry-forward row */}
                {(hasPreviousEntries || Math.abs(carryForward) > 0.005) && (
                  <tr className="bg-zinc-800/20">
                    <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-zinc-600">
                      01/
                      {String(activeMonth + 1).padStart(2, "0")}/
                      {String(year).slice(-2)}
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-xs italic text-zinc-500">
                        Report du mois précédent
                      </span>
                    </td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2 text-right">
                      {renderBalance(carryForward)}
                    </td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2" />
                  </tr>
                )}

                {/* Past entries */}
                {monthPastEntries.map((entry) =>
                  editingId === entry.id
                    ? renderEditRow(entry)
                    : renderDataRow(entry, false)
                )}

                {/* Today separator (current month only) */}
                {monthPastEntries.length > 0 && monthFutureEntries.length > 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-1">
                      <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-zinc-800" />
                        <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                          Aujourd&apos;hui
                        </span>
                        <div className="h-px flex-1 bg-zinc-800" />
                      </div>
                    </td>
                  </tr>
                )}

                {/* Future entries */}
                {monthFutureEntries.map((entry) =>
                  editingId === entry.id
                    ? renderEditRow(entry)
                    : renderDataRow(entry, true)
                )}

                {/* Empty state — read-only */}
                {monthEntries.length === 0 && !isOwner && (
                  <tr>
                    <td colSpan={9} className="py-12 text-center">
                      <p className="text-sm font-medium text-zinc-400">
                        Aucune entrée ce mois
                      </p>
                      <p className="mt-1 text-xs text-zinc-600">
                        Aucune opération pour{" "}
                        {MONTHS_FULL[activeMonth].toLowerCase()} {year}.
                      </p>
                    </td>
                  </tr>
                )}

                {/* Add row — owner only */}
                {isOwner && renderAddRow()}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Dialog « Définir le solde pointé » */}
      <Dialog open={checkedDialogOpen} onOpenChange={setCheckedDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Définir le solde pointé</DialogTitle>
            <DialogDescription>
              Indique le solde réel de ton compte (relevé bancaire). Une
              écriture d&apos;ajustement pointée sera créée pour la différence.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="checked-target">Solde pointé souhaité (€)</Label>
            <Input
              id="checked-target"
              inputMode="decimal"
              placeholder="0,00"
              value={checkedTarget}
              onChange={(e) => setCheckedTarget(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSetCheckedBalance();
              }}
              className="h-12 text-center text-xl font-semibold tabular-nums"
              autoFocus
            />
            {(() => {
              const parsedTarget = Number.parseFloat(
                checkedTarget.replace(",", ".")
              );
              if (!Number.isFinite(parsedTarget)) return null;
              const diff =
                Math.round((parsedTarget - checkedBalance) * 100) / 100;
              return (
                <p className="text-xs text-zinc-600">
                  Solde pointé actuel : {checkedBalance < 0 ? "−" : ""}
                  {fmtAmt(checkedBalance)}
                  {diff !== 0 ? (
                    <>
                      {" "}
                      → ajustement de{" "}
                      <span
                        className={
                          diff > 0 ? "text-emerald-400" : "text-rose-400"
                        }
                      >
                        {diff > 0 ? "+" : "−"}
                        {fmtAmt(diff)}
                      </span>
                    </>
                  ) : (
                    " — déjà à ce montant."
                  )}
                </p>
              );
            })()}
          </div>
          <Button
            onClick={handleSetCheckedBalance}
            disabled={
              !Number.isFinite(
                Number.parseFloat(checkedTarget.replace(",", "."))
              )
            }
            className="w-full"
          >
            <Check />
            Valider
          </Button>
        </DialogContent>
      </Dialog>

      {/* Dialog « Définir le solde réel » */}
      <Dialog open={realDialogOpen} onOpenChange={setRealDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Définir le solde réel</DialogTitle>
            <DialogDescription>
              Le vrai solde de ce compte (relevé bancaire). Cette valeur
              s&apos;affiche telle quelle ici et dans «&nbsp;Solde restant&nbsp;»
              du Dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="real-target">Solde réel (€)</Label>
            <Input
              id="real-target"
              inputMode="decimal"
              placeholder="0,00"
              value={realTarget}
              onChange={(e) => setRealTarget(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSetRealBalance();
              }}
              className="h-12 text-center text-xl font-semibold tabular-nums"
              autoFocus
            />
            <p className="text-xs text-zinc-600">
              Daté d&apos;aujourd&apos;hui. Modifiable à tout moment.
            </p>
          </div>
          <Button
            onClick={handleSetRealBalance}
            disabled={
              savingReal ||
              !Number.isFinite(Number.parseFloat(realTarget.replace(",", ".")))
            }
            className="w-full"
          >
            {savingReal ? <Loader2 className="animate-spin" /> : <Check />}
            Valider
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
