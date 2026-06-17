"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { format, isSameMonth } from "date-fns";
import { Check, Loader2, Pencil, Plus, Trash2, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/lib/store";
import { formatCurrency, formatShortDate } from "@/lib/utils";
import type { MonthlyIncome } from "@/types";

/** Note qui marque, dans le Compte (ledger), une écriture d'entrée issue d'un
 *  revenu du mois. Chaque revenu a sa propre écriture, liée par monthly_income_id. */
const REVENU_NOTE = "revenu mensuel";

function parseAmount(value: string): number | null {
  const parsed = Number.parseFloat(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100) / 100;
}

export function IncomeWidget({
  incomes,
  onChanged,
}: {
  incomes: MonthlyIncome[];
  onChanged: () => void;
}) {
  const { profile, currentMonth } = useAppStore();
  // null = aucune édition ; "new" = ajout ; sinon = id de la ligne en édition.
  const [editing, setEditing] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // On quitte toute édition quand le mois ou la liste change.
  useEffect(() => {
    setEditing(null);
  }, [currentMonth, incomes]);

  const total = incomes.reduce((s, i) => s + Number(i.net_transferred), 0);

  /** Date par défaut d'un nouveau revenu : aujourd'hui si on est sur le mois
   *  courant, sinon le 1er du mois affiché. */
  function defaultDate() {
    return isSameMonth(currentMonth, new Date())
      ? format(new Date(), "yyyy-MM-dd")
      : format(currentMonth, "yyyy-MM-01");
  }

  function openAdd() {
    setLabel("");
    setAmount("");
    setDate(defaultDate());
    setEditing("new");
  }

  function openEdit(income: MonthlyIncome) {
    setLabel(income.note ?? "");
    setAmount(String(income.net_transferred));
    setDate(income.date ?? defaultDate());
    setEditing(income.id);
  }

  /** Crée / met à jour / supprime l'écriture du Compte liée à ce revenu. */
  async function syncLedger(
    incomeId: string,
    entryDate: string,
    netAmount: number,
    entryLabel: string
  ) {
    if (!profile) return;
    const { data: existing } = await supabase
      .from("ledger_entries")
      .select("id")
      .eq("monthly_income_id", incomeId)
      .maybeSingle();
    const existingId = (existing as { id: string } | null)?.id ?? null;

    if (netAmount > 0) {
      if (existingId) {
        await supabase
          .from("ledger_entries")
          .update({ date: entryDate, amount: netAmount, label: entryLabel })
          .eq("id", existingId);
      } else {
        await supabase.from("ledger_entries").insert({
          user_id: profile.id,
          date: entryDate,
          label: entryLabel,
          amount: netAmount,
          type: "income",
          note: REVENU_NOTE,
          is_checked: false,
          category_id: null,
          transaction_id: null,
          monthly_income_id: incomeId,
        });
      }
    } else if (existingId) {
      await supabase.from("ledger_entries").delete().eq("id", existingId);
    }
  }

  async function handleSave() {
    if (!profile) return;
    const netAmount = parseAmount(amount);
    if (netAmount === null) {
      toast.error("Montant invalide");
      return;
    }
    if (!date) {
      toast.error("Choisis une date");
      return;
    }
    setSaving(true);
    const month = Number(date.slice(5, 7));
    const year = Number(date.slice(0, 4));
    // Le brut n'est plus distingué : on stocke le montant dans les deux colonnes.
    const payload = {
      gross_amount: netAmount,
      net_transferred: netAmount,
      note: label.trim() || null,
      date,
      month,
      year,
    };

    let incomeId = editing && editing !== "new" ? editing : null;
    if (incomeId) {
      const { error } = await supabase
        .from("monthly_income")
        .update(payload)
        .eq("id", incomeId);
      if (error) {
        setSaving(false);
        toast.error("Impossible d'enregistrer le revenu");
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("monthly_income")
        .insert({ ...payload, user_id: profile.id })
        .select("id")
        .single();
      if (error || !data) {
        setSaving(false);
        toast.error("Impossible d'enregistrer le revenu");
        return;
      }
      incomeId = (data as { id: string }).id;
    }

    await syncLedger(incomeId, date, netAmount, label.trim() || "Revenu");
    setSaving(false);
    toast.success("Revenu enregistré");
    setEditing(null);
    onChanged();
  }

  async function handleDelete(income: MonthlyIncome) {
    setDeletingId(income.id);
    // L'écriture liée du Compte est supprimée en cascade (ON DELETE CASCADE).
    const { error } = await supabase
      .from("monthly_income")
      .delete()
      .eq("id", income.id);
    if (error) {
      setDeletingId(null);
      toast.error("Suppression impossible");
      return;
    }
    setDeletingId(null);
    toast.success("Revenu supprimé");
    onChanged();
  }

  const form = (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-800/60 p-3">
      <div className="grid gap-1.5">
        <Label htmlFor="income-label">Libellé</Label>
        <Input
          id="income-label"
          placeholder="Salaire, remboursement…"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="income-amount">Montant viré</Label>
        <Input
          id="income-amount"
          inputMode="decimal"
          placeholder="0,00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="tabular-nums"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="income-date">Date</Label>
        <DatePicker id="income-date" value={date} onChange={setDate} />
      </div>
      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving} className="flex-1">
          {saving ? <Loader2 className="animate-spin" /> : <Check />}
          Enregistrer
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-10"
          onClick={() => setEditing(null)}
          aria-label="Annuler"
        >
          <X />
        </Button>
      </div>
    </div>
  );

  return (
    <Card className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <CardTitle>Revenus du mois</CardTitle>
        {editing === null && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-zinc-500"
            onClick={openAdd}
            aria-label="Ajouter un revenu"
          >
            <Plus className="size-4" />
          </Button>
        )}
      </div>

      {incomes.length > 0 && (
        <div className="mt-4 flex items-baseline justify-between border-b border-zinc-800/60 pb-3">
          <span className="text-sm text-zinc-500">Total viré</span>
          <span className="text-lg font-semibold tabular-nums text-emerald-500">
            {formatCurrency(total)}
          </span>
        </div>
      )}

      {incomes.length > 0 ? (
        <div className="mt-3 flex flex-1 flex-col gap-2">
          {incomes.map((income) =>
            editing === income.id ? (
              <div key={income.id}>{form}</div>
            ) : (
              <div
                key={income.id}
                className="group flex items-center justify-between gap-2 rounded-lg px-1 py-1.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-zinc-300">
                    {income.note || "Revenu"}
                  </p>
                  {income.date && (
                    <p className="text-xs text-zinc-600">
                      {formatShortDate(income.date)}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="tabular-nums text-sm font-medium text-white">
                    {formatCurrency(Number(income.net_transferred))}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-zinc-500 opacity-0 transition group-hover:opacity-100"
                    onClick={() => openEdit(income)}
                    aria-label="Modifier ce revenu"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-zinc-500 opacity-0 transition hover:text-rose-500 group-hover:opacity-100"
                    onClick={() => handleDelete(income)}
                    disabled={deletingId === income.id}
                    aria-label="Supprimer ce revenu"
                  >
                    {deletingId === income.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            )
          )}
          {editing === "new" && <div className="mt-1">{form}</div>}
        </div>
      ) : editing === "new" ? (
        <div className="mt-4">{form}</div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
          <Wallet className="size-6 text-zinc-700" />
          <p className="text-sm text-zinc-600">Aucun revenu renseigné ce mois-ci</p>
          <Button variant="secondary" size="sm" onClick={openAdd}>
            Ajouter un revenu
          </Button>
        </div>
      )}
    </Card>
  );
}
