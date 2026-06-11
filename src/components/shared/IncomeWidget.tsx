"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { Check, Loader2, Pencil, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/lib/store";
import { formatCurrency } from "@/lib/utils";
import type { MonthlyIncome } from "@/types";

/** Note qui identifie l'écriture « entrée » du Compte générée depuis les
 *  revenus du mois (pour la retrouver / mettre à jour sans doublon). */
const REVENU_NOTE = "revenu mensuel";

function parseAmount(value: string): number | null {
  const parsed = Number.parseFloat(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100) / 100;
}

export function IncomeWidget({
  income,
  onChanged,
}: {
  income: MonthlyIncome | null;
  onChanged: () => void;
}) {
  const { profile, currentMonth } = useAppStore();
  const [editing, setEditing] = useState(false);
  const [gross, setGross] = useState("");
  const [net, setNet] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEditing(false);
  }, [income, currentMonth]);

  function openEdit() {
    setGross(income ? String(income.gross_amount) : "");
    setNet(income ? String(income.net_transferred) : "");
    setNote(income?.note ?? "");
    setEditing(true);
  }

  async function handleSave() {
    if (!profile) return;
    const grossAmount = parseAmount(gross);
    const netAmount = parseAmount(net);
    if (grossAmount === null || netAmount === null) {
      toast.error("Montants invalides");
      return;
    }
    setSaving(true);
    const payload = {
      gross_amount: grossAmount,
      net_transferred: netAmount,
      note: note.trim() || null,
    };
    const { error } = income
      ? await supabase.from("monthly_income").update(payload).eq("id", income.id)
      : await supabase.from("monthly_income").insert({
          ...payload,
          user_id: profile.id,
          month: currentMonth.getMonth() + 1,
          year: currentMonth.getFullYear(),
        });
    if (error) {
      setSaving(false);
      toast.error("Impossible d'enregistrer les revenus");
      return;
    }

    // Synchronise le « viré sur le compte » comme une ENTRÉE dans le Compte
    // (ledger). Une seule écriture par mois, repérée par sa note + sa date.
    const y = currentMonth.getFullYear();
    const m = currentMonth.getMonth() + 1;
    const entryDate = `${y}-${String(m).padStart(2, "0")}-01`;
    const { data: existing } = await supabase
      .from("ledger_entries")
      .select("id")
      .eq("user_id", profile.id)
      .eq("note", REVENU_NOTE)
      .eq("date", entryDate)
      .maybeSingle();
    const existingId = (existing as { id: string } | null)?.id ?? null;
    if (netAmount > 0) {
      const label = note.trim() || "Revenu";
      if (existingId) {
        await supabase
          .from("ledger_entries")
          .update({ amount: netAmount, label })
          .eq("id", existingId);
      } else {
        await supabase.from("ledger_entries").insert({
          user_id: profile.id,
          date: entryDate,
          label,
          amount: netAmount,
          type: "income",
          note: REVENU_NOTE,
          is_checked: false,
          category_id: null,
          transaction_id: null,
        });
      }
    } else if (existingId) {
      // Revenu remis à 0 → on retire l'entrée correspondante.
      await supabase.from("ledger_entries").delete().eq("id", existingId);
    }

    setSaving(false);
    toast.success("Revenus enregistrés");
    setEditing(false);
    onChanged();
  }

  const retained = income
    ? Number(income.gross_amount) - Number(income.net_transferred)
    : 0;

  return (
    <Card className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <CardTitle>Revenus du mois</CardTitle>
        {!editing && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-zinc-500"
            onClick={openEdit}
            aria-label="Modifier les revenus"
          >
            <Pencil className="size-4" />
          </Button>
        )}
      </div>

      {editing ? (
        <div className="mt-4 flex flex-1 flex-col gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="income-gross">Chiffre d&rsquo;affaires (brut)</Label>
            <Input
              id="income-gross"
              inputMode="decimal"
              placeholder="0,00"
              value={gross}
              onChange={(e) => setGross(e.target.value)}
              className="tabular-nums"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="income-net">Viré sur le compte (net)</Label>
            <Input
              id="income-net"
              inputMode="decimal"
              placeholder="0,00"
              value={net}
              onChange={(e) => setNet(e.target.value)}
              className="tabular-nums"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="income-note">Note</Label>
            <Input
              id="income-note"
              placeholder="Facultatif"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="mt-auto flex gap-2 pt-1">
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Check />
              )}
              Enregistrer
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-10"
              onClick={() => setEditing(false)}
              aria-label="Annuler"
            >
              <X />
            </Button>
          </div>
        </div>
      ) : income ? (
        <div className="mt-4 space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-zinc-500">Chiffre d&rsquo;affaires</span>
            <span className="text-lg font-semibold tabular-nums text-white">
              {formatCurrency(Number(income.gross_amount))}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-zinc-500">Viré sur le compte</span>
            <span className="text-lg font-semibold tabular-nums text-emerald-500">
              {formatCurrency(Number(income.net_transferred))}
            </span>
          </div>
          <div className="flex items-baseline justify-between border-t border-zinc-800/60 pt-3">
            <span className="text-sm text-zinc-500">Conservé</span>
            <span className="text-sm font-medium tabular-nums text-zinc-400">
              {formatCurrency(retained)}
            </span>
          </div>
          {income.note && (
            <p className="text-xs italic text-zinc-600">{income.note}</p>
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
          <Wallet className="size-6 text-zinc-700" />
          <p className="text-sm text-zinc-600">Aucun revenu renseigné ce mois-ci</p>
          <Button variant="secondary" size="sm" onClick={openEdit}>
            Renseigner mes revenus
          </Button>
        </div>
      )}
    </Card>
  );
}
