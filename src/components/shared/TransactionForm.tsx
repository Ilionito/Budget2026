"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { addMonths, format } from "date-fns";
import { Check, Loader2, Lock, Plus, RotateCcw, Save, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
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
import { Switch } from "@/components/ui/switch";
import { supabase, ALLOWED_EMAILS } from "@/lib/supabase";
import { useAppStore } from "@/lib/store";
import { cn, normalizeLabel, resolveColor } from "@/lib/utils";
import { ensurePersonalBudgetLine } from "@/lib/budget";
import type { BudgetLine, Category, Profile, Transaction } from "@/types";

const NEW_LABEL_VALUE = "__new__";
const NEW_CATEGORY_VALUE = "__new_category__";

interface TransactionFormProps {
  /** Si fournie → mode édition, sinon mode création. */
  transaction?: Transaction;
  onSuccess: () => void;
}

export function TransactionForm({ transaction, onSuccess }: TransactionFormProps) {
  const { profile, partner, categories, setCategories, bumpDataVersion } =
    useAppStore();
  const isEdit = !!transaction;

  /** Titulaire de la dépense : soi-même par défaut, l'autre si sélectionné. */
  const [forUserId, setForUserId] = useState(
    transaction?.user_id ?? profile?.id ?? ""
  );
  const [categoryId, setCategoryId] = useState(transaction?.category_id ?? "");
  const [catMode, setCatMode] = useState<"select" | "create">("select");
  const [newCatName, setNewCatName] = useState("");
  const [label, setLabel] = useState(transaction?.label ?? "");
  const [labelMode, setLabelMode] = useState<"select" | "custom">("select");
  // Le montant saisi est toujours positif ; le signe vient du toggle Remboursement.
  const [amount, setAmount] = useState(
    transaction ? String(Math.abs(Number(transaction.amount))) : ""
  );
  const [isRefund, setIsRefund] = useState(
    transaction ? Number(transaction.amount) < 0 : false
  );
  const [date, setDate] = useState(
    transaction?.date ?? format(new Date(), "yyyy-MM-dd")
  );
  const [note, setNote] = useState(transaction?.note ?? "");
  const [isPrivate, setIsPrivate] = useState(transaction?.is_private ?? false);
  const [linkedEntryId, setLinkedEntryId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [budgetLinesLoaded, setBudgetLinesLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("budget_lines")
      .select("*")
      .then(({ data }) => {
        if (!cancelled) {
          setBudgetLines((data as BudgetLine[] | null) ?? []);
          setBudgetLinesLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // En mode édition, retrouver l'écriture liée dans le registre perso.
  useEffect(() => {
    if (!isEdit || !transaction) return;
    let cancelled = false;
    supabase
      .from("ledger_entries")
      .select("id")
      .eq("transaction_id", transaction.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setLinkedEntryId((data as { id: string }).id);
      });
    return () => {
      cancelled = true;
    };
  }, [isEdit, transaction]);

  // En mode édition, déterminer le mode libellé une fois les lignes chargées.
  useEffect(() => {
    if (!isEdit || !budgetLinesLoaded || !transaction) return;
    const options = budgetLines
      .filter((l) => l.category_id === transaction.category_id)
      .map((l) => normalizeLabel(l.label));
    const exists = options.some((o) => o === normalizeLabel(transaction.label));
    setLabelMode(exists ? "select" : "custom");
  }, [isEdit, budgetLinesLoaded, budgetLines, transaction]);

  // Catégories dédupliquées : budget en premier, puis catégories par défaut.
  const categoryOptions = useMemo(() => {
    const budgetCategoryIds = new Set(budgetLines.map((l) => l.category_id));
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
  }, [categories, budgetLines]);

  // Libellés de la catégorie choisie, dédupliqués.
  const labelOptions = useMemo(() => {
    if (!categoryId) return [];
    const seen = new Map<string, string>();
    for (const line of budgetLines) {
      if (line.category_id !== categoryId) continue;
      const key = normalizeLabel(line.label);
      if (!seen.has(key)) seen.set(key, line.label);
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [budgetLines, categoryId]);

  const categoryChosen = categoryId !== "";
  const effectiveMode = labelOptions.length === 0 ? "custom" : labelMode;

  const isNewLabel =
    categoryChosen &&
    label.trim() !== "" &&
    !labelOptions.some((o) => normalizeLabel(o) === normalizeLabel(label));

  const parsedAmount = Number.parseFloat(amount.replace(",", "."));
  const canSubmit =
    forUserId !== "" &&
    categoryChosen &&
    label.trim() !== "" &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0 &&
    date !== "";

  // Joris puis Ophélie (ordre stable quel que soit le compte connecté).
  const people = useMemo(() => {
    const all = [profile, partner].filter((p): p is Profile => !!p);
    const joris = all.find((p) => p.email === ALLOWED_EMAILS[0]);
    const ophelie = all.find((p) => p.email === ALLOWED_EMAILS[1]);
    const rest = all.filter((p) => p !== joris && p !== ophelie);
    return [joris, ophelie, ...rest].filter((p): p is Profile => !!p);
  }, [profile, partner]);

  const isForMe = forUserId === profile?.id;
  const selectedPerson = people.find((p) => p.id === forUserId) ?? null;
  // Toggle privé : seulement pour une dépense à son propre nom.
  const showPrivateToggle = isForMe;

  // Catégorie « Abonnement(s) » : la dépense alimente la page Abonnements.
  const chosenCategory = categories.find((c) => c.id === categoryId) ?? null;
  const isSubscriptionCategory =
    !!chosenCategory &&
    normalizeLabel(chosenCategory.label).includes("abonnement");

  function handleCategoryChange(value: string) {
    if (value === NEW_CATEGORY_VALUE) {
      setCatMode("create");
      setNewCatName("");
      return;
    }
    setCategoryId(value);
    setLabel("");
    setLabelMode("select");
  }

  /** Crée la catégorie saisie (ou réutilise un doublon) et la sélectionne. */
  async function confirmNewCategory() {
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
    setCategoryId(id);
    setLabel("");
    setLabelMode("select");
    setCatMode("select");
    setNewCatName("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !canSubmit) return;
    setSaving(true);

    const trimmedLabel = label.trim();
    // Remboursement = montant négatif : crédite le libellé du budget partout.
    const signedAmount =
      (isRefund ? -1 : 1) * (Math.round(parsedAmount * 100) / 100);
    const basePayload = {
      label: trimmedLabel,
      amount: signedAmount,
      category_id: categoryId,
      date,
      note: note.trim() || null,
      // Titulaire choisi via « Pour qui ? » ; une dépense au nom de l'autre
      // n'est jamais privée (elle serait invisible pour son créateur).
      user_id: forUserId,
      is_private: isForMe ? isPrivate : false,
    };

    let dbError: { message: string } | null = null;
    let txId: string | null = null;

    if (isEdit && transaction) {
      const { error } = await supabase
        .from("transactions")
        .update(basePayload)
        .eq("id", transaction.id);
      dbError = error;
      txId = transaction.id;
    } else {
      const { data: created, error } = await supabase
        .from("transactions")
        .insert({
          ...basePayload,
          is_recurring: false,
        })
        .select("id")
        .single();
      dbError = error;
      txId = created ? (created as { id: string }).id : null;
    }

    if (dbError) {
      setSaving(false);
      toast.error(
        isEdit
          ? "Impossible de modifier la transaction"
          : "Impossible d'ajouter la dépense"
      );
      return;
    }

    // Synchronisation automatique avec le registre personnel du titulaire :
    // un remboursement devient une Entrée, une dépense une Sortie. RLS ne
    // permet d'écrire que dans son propre registre — une dépense créée au nom
    // de l'autre n'y génère donc pas d'écriture.
    if (txId) {
      const ledgerPayload = {
        date,
        label: trimmedLabel,
        amount: Math.abs(signedAmount),
        type: isRefund ? "income" : "expense",
        note: note.trim() || null,
        category_id: categoryId,
      };
      const ownerChanged =
        isEdit && !!transaction && transaction.user_id !== forUserId;
      let ledgerError: { message: string } | null = null;
      if (linkedEntryId && ownerChanged) {
        // L'écriture liée appartient à l'ancien titulaire : on la retire
        // (no-op RLS si c'est le registre du partenaire).
        await supabase
          .from("ledger_entries")
          .delete()
          .eq("id", linkedEntryId);
        if (isForMe) {
          const { error } = await supabase.from("ledger_entries").insert({
            ...ledgerPayload,
            user_id: profile.id,
            is_checked: false,
            transaction_id: txId,
          });
          ledgerError = error;
        }
      } else if (linkedEntryId) {
        // RLS : la mise à jour ne touche que les écritures que l'on a le droit
        // de modifier (no-op silencieux sur le registre du partenaire).
        const { error } = await supabase
          .from("ledger_entries")
          .update(ledgerPayload)
          .eq("id", linkedEntryId);
        ledgerError = error;
      } else if (isForMe) {
        const { error } = await supabase.from("ledger_entries").insert({
          ...ledgerPayload,
          user_id: profile.id,
          is_checked: false,
          transaction_id: txId,
        });
        ledgerError = error;
      }
      if (ledgerError) {
        toast.error("La synchronisation avec le compte perso a échoué");
      }
    }

    // Catégorie Abonnements : crée l'abonnement (ou relie à l'existant — même
    // libellé) pour qu'il soit géré dans la page Abonnements (fréquence, durée…).
    if (
      isSubscriptionCategory &&
      !isRefund &&
      txId &&
      isForMe &&
      !transaction?.subscription_id
    ) {
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("id, label")
        .eq("user_id", profile.id);
      const existing = (
        (subs as { id: string; label: string }[] | null) ?? []
      ).find((s) => normalizeLabel(s.label) === normalizeLabel(trimmedLabel));
      let subId = existing?.id ?? null;
      if (!subId) {
        const { data: createdSub, error: subError } = await supabase
          .from("subscriptions")
          .insert({
            user_id: profile.id,
            label: trimmedLabel,
            amount: Math.abs(signedAmount),
            frequency: "monthly",
            category_id: categoryId,
            next_date: format(
              addMonths(new Date(date + "T12:00:00"), 1),
              "yyyy-MM-dd"
            ),
            is_active: true,
            is_private: isPrivate,
          })
          .select("id")
          .single();
        if (subError || !createdSub) {
          toast.error("L'abonnement n'a pas pu être créé");
        } else {
          subId = (createdSub as { id: string }).id;
          toast.success(
            "Abonnement créé — règle sa fréquence dans la page Abonnements"
          );
        }
      }
      if (subId) {
        await supabase
          .from("transactions")
          .update({ subscription_id: subId, is_recurring: true })
          .eq("id", txId);
      }
    }

    // Dépense (pas un remboursement, pas un abonnement) dans une catégorie qui
    // n'est PAS du budget commun → on crée une ligne de budget PERSO pour le
    // titulaire, afin qu'elle apparaisse automatiquement dans son budget perso.
    // (Le budget commun, lui, ne se remplit que depuis la page Budget.)
    if (!isRefund && !isSubscriptionCategory && txId && categoryId) {
      await ensurePersonalBudgetLine(forUserId, categoryId, trimmedLabel);
    }

    setSaving(false);
    toast.success(isEdit ? "Transaction modifiée" : "Dépense ajoutée");
    bumpDataVersion();
    onSuccess();
  }

  const dependentFieldClass = (extra?: string) =>
    cn(
      "grid gap-1.5 transition-opacity duration-150",
      !categoryChosen && "pointer-events-none opacity-40",
      extra
    );

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4"
    >
      {/* 0. Pour qui ? */}
      {people.length > 1 && (
        <div className="grid gap-1.5">
          <Label>Pour qui ?</Label>
          <div className="grid grid-cols-2 gap-2">
            {people.map((person) => {
              const selected = forUserId === person.id;
              const color = resolveColor(person.avatar_color);
              return (
                <button
                  type="button"
                  key={person.id}
                  onClick={() => setForUserId(person.id)}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-indigo-500/40",
                    !selected &&
                      "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                  )}
                  style={
                    selected
                      ? {
                          borderColor: color,
                          backgroundColor: `${color}1f`,
                          color,
                        }
                      : undefined
                  }
                  aria-pressed={selected}
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  {person.display_name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 1. Catégorie */}
      <div className="grid gap-1.5">
        <Label>Catégorie</Label>
        {catMode === "create" ? (
          <div className="flex gap-2">
            <Input
              autoFocus
              placeholder="Nom de la nouvelle catégorie"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmNewCategory();
                }
                if (e.key === "Escape") setCatMode("select");
              }}
            />
            <Button
              type="button"
              size="icon"
              className="size-10 shrink-0"
              onClick={confirmNewCategory}
              disabled={!newCatName.trim()}
              aria-label="Créer la catégorie"
            >
              <Check />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-10 shrink-0"
              onClick={() => setCatMode("select")}
              aria-label="Annuler"
            >
              <X />
            </Button>
          </div>
        ) : (
          <Select value={categoryId} onValueChange={handleCategoryChange}>
            <SelectTrigger>
              <SelectValue placeholder="Choisir une catégorie" />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.budget.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Catégories du budget</SelectLabel>
                  {categoryOptions.budget.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              {categoryOptions.others.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Autres catégories</SelectLabel>
                  {categoryOptions.others.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              <SelectSeparator />
              <SelectItem
                value={NEW_CATEGORY_VALUE}
                className="text-indigo-300 focus:text-indigo-200"
              >
                + Nouvelle catégorie
              </SelectItem>
            </SelectContent>
          </Select>
        )}
        {isSubscriptionCategory && !isRefund && !transaction?.subscription_id && (
          <p className="text-xs text-zinc-600">
            Sera aussi suivie dans la page Abonnements (fréquence et durée
            réglables là-bas).
          </p>
        )}
      </div>

      {/* 2. Libellé */}
      <div className={dependentFieldClass()}>
        <Label htmlFor="tf-label">Libellé</Label>
        {effectiveMode === "select" ? (
          <Select
            value={label}
            onValueChange={(value) => {
              if (value === NEW_LABEL_VALUE) {
                setLabelMode("custom");
                setLabel("");
              } else {
                setLabel(value);
              }
            }}
            disabled={!categoryChosen}
          >
            <SelectTrigger id="tf-label">
              <SelectValue placeholder="Choisir un libellé" />
            </SelectTrigger>
            <SelectContent>
              {labelOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
              <SelectSeparator />
              <SelectItem
                value={NEW_LABEL_VALUE}
                className="text-indigo-300 focus:text-indigo-200"
              >
                + Nouveau libellé
              </SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <div className="flex gap-2">
            <Input
              id="tf-label"
              placeholder="Nouveau libellé"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={!categoryChosen}
              autoFocus={labelOptions.length > 0}
            />
            {labelOptions.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-10 shrink-0"
                onClick={() => {
                  setLabelMode("select");
                  setLabel(transaction?.label ?? "");
                }}
                aria-label="Revenir aux libellés existants"
              >
                <Undo2 />
              </Button>
            )}
          </div>
        )}
        {effectiveMode === "custom" && isNewLabel && (
          <p className="text-xs text-zinc-600">
            Nouveau libellé — il ne sera pas ajouté au budget commun. Les
            lignes du budget se gèrent depuis la page Budget.
          </p>
        )}
      </div>

      {/* 3. Montant */}
      <div className={dependentFieldClass()}>
        <Label htmlFor="tf-amount">Montant</Label>
        <div className="relative">
          <Input
            id="tf-amount"
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={!categoryChosen}
            className="h-14 pr-10 text-center text-2xl font-semibold tabular-nums"
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-lg text-zinc-500">
            €
          </span>
        </div>
      </div>

      {/* 4. Remboursement */}
      <div
        className={cn(
          "flex items-center justify-between rounded-xl border border-zinc-800 px-3 py-2.5 transition-opacity duration-150",
          !categoryChosen && "pointer-events-none opacity-40",
          isRefund && "border-emerald-500/30 bg-emerald-500/[0.04]"
        )}
      >
        <div className="flex items-center gap-2.5">
          <RotateCcw
            className={cn(
              "size-4",
              isRefund ? "text-emerald-400" : "text-zinc-500"
            )}
          />
          <div>
            <p className="text-sm text-zinc-200">Remboursement</p>
            <p className="text-xs text-zinc-600">
              Cette transaction ajoute de l&apos;argent (avoir, remboursement…)
            </p>
          </div>
        </div>
        <Switch
          checked={isRefund}
          onCheckedChange={setIsRefund}
          disabled={!categoryChosen}
        />
      </div>

      {/* 5. Date */}
      <div className={dependentFieldClass()}>
        <Label htmlFor="tf-date">Date</Label>
        <DatePicker
          id="tf-date"
          value={date}
          onChange={setDate}
          disabled={!categoryChosen}
        />
      </div>

      {/* 6. Note */}
      <div className={dependentFieldClass()}>
        <Label htmlFor="tf-note">Note</Label>
        <Input
          id="tf-note"
          placeholder="Facultatif"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={!categoryChosen}
        />
      </div>

      {/* 7. Dépense privée (uniquement pour ses propres transactions) */}
      {showPrivateToggle && (
        <div
          className={cn(
            "flex items-center justify-between rounded-xl border border-zinc-800 px-3 py-2.5 transition-opacity duration-150",
            !categoryChosen && "pointer-events-none opacity-40"
          )}
        >
          <div className="flex items-center gap-2.5">
            <Lock className="size-4 text-zinc-500" />
            <div>
              <p className="text-sm text-zinc-200">Dépense privée</p>
              <p className="text-xs text-zinc-600">Visible uniquement par toi</p>
            </div>
          </div>
          <Switch
            checked={isPrivate}
            onCheckedChange={setIsPrivate}
            disabled={!categoryChosen}
          />
        </div>
      )}

      {/* 8. Valider */}
      <div className="grid gap-2">
        <Button
          type="submit"
          disabled={saving || !canSubmit}
          className="w-full"
        >
          {saving ? (
            <Loader2 className="animate-spin" />
          ) : isEdit ? (
            <Save />
          ) : (
            <Plus />
          )}
          {isEdit
            ? "Enregistrer les modifications"
            : isRefund
              ? "Ajouter le remboursement"
              : "Ajouter la dépense"}
        </Button>
        {isForMe ? (
          <p className="text-center text-xs text-zinc-600">
            {linkedEntryId
              ? "Synchronisée avec ton compte perso."
              : "Sera aussi inscrite dans ton compte perso."}
          </p>
        ) : selectedPerson ? (
          <p className="text-center text-xs text-zinc-600">
            Sera créée au nom de {selectedPerson.display_name} (sans écriture
            dans son compte perso).
          </p>
        ) : null}
      </div>
    </form>
  );
}
