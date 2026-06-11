"use client";

import { useEffect, useMemo, useState } from "react";
import { Receipt } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EditTransactionDialog } from "@/components/shared/EditTransactionDialog";
import { PageHeader } from "@/components/shared/PageHeader";
import { TransactionRow } from "@/components/shared/TransactionRow";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/lib/store";
import {
  formatCurrency,
  formatDayLabel,
  formatMonth,
  getMonthRange,
} from "@/lib/utils";
import type { Transaction } from "@/types";

type WhoFilter = "all" | "me" | "partner";

function TransactionsContent() {
  const {
    profile,
    partner,
    categories,
    currentMonth,
    dataVersion,
    ready,
    bumpDataVersion,
  } = useAppStore();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [who, setWho] = useState<WhoFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    if (!ready || !profile) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      const { start, end } = getMonthRange(currentMonth);
      const { data } = await supabase
        .from("transactions")
        .select("*")
        .gte("date", start)
        .lte("date", end)
        .order("date", { ascending: false });
      if (cancelled) return;
      setTransactions((data as Transaction[] | null) ?? []);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [ready, profile, currentMonth, dataVersion]);

  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      if (who === "me" && tx.user_id !== profile?.id) return false;
      if (who === "partner" && tx.user_id === profile?.id) return false;
      if (categoryFilter !== "all" && tx.category_id !== categoryFilter)
        return false;
      return true;
    });
  }, [transactions, who, categoryFilter, profile]);

  const groups = useMemo(() => {
    const result: { date: string; items: Transaction[]; total: number }[] = [];
    for (const tx of filtered) {
      const group = result.find((g) => g.date === tx.date);
      if (group) {
        group.items.push(tx);
        group.total += Number(tx.amount);
      } else {
        result.push({ date: tx.date, items: [tx], total: Number(tx.amount) });
      }
    }
    return result;
  }, [filtered]);

  const total = filtered.reduce((sum, tx) => sum + Number(tx.amount), 0);

  function handleEdit(tx: Transaction) {
    setEditTx(tx);
    setEditOpen(true);
  }

  async function handleDelete(tx: Transaction) {
    // L'écriture liée du registre perso part avec la transaction
    // (RLS : no-op silencieux si elle appartient au partenaire).
    await supabase.from("ledger_entries").delete().eq("transaction_id", tx.id);
    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", tx.id);
    if (error) {
      toast.error("Impossible de supprimer cette transaction");
      return;
    }
    toast.success("Transaction supprimée");
    bumpDataVersion();
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Transactions"
        subtitle={`${filtered.length} transaction${filtered.length > 1 ? "s" : ""} · ${formatCurrency(total)} en ${formatMonth(currentMonth).toLowerCase()}`}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={who} onValueChange={(value) => setWho(value as WhoFilter)}>
          <TabsList>
            <TabsTrigger value="all">Tous</TabsTrigger>
            <TabsTrigger value="me">Moi</TabsTrigger>
            <TabsTrigger value="partner">
              {partner?.display_name ?? "Partenaire"}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Catégorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les catégories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-14 text-center">
          <Receipt className="size-7 text-zinc-700" />
          <div>
            <p className="text-sm font-medium text-zinc-400">
              Aucune transaction
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              Ajoute ta première dépense avec le bouton +
            </p>
          </div>
        </Card>
      ) : (
        <div className="mx-auto max-w-2xl space-y-3">
          {groups.map((group) => (
            <Card key={group.date} className="p-3">
              <div className="flex items-center justify-between px-2 pb-2 pt-1">
                <p className="text-xs font-medium text-zinc-500">
                  {formatDayLabel(group.date)}
                </p>
                <p className="text-xs font-semibold tabular-nums text-zinc-400">
                  {formatCurrency(group.total)}
                </p>
              </div>
              {group.items.map((tx) => (
                <TransactionRow
                  key={tx.id}
                  transaction={tx}
                  onEdit={() => handleEdit(tx)}
                  onDelete={
                    tx.user_id === profile?.id
                      ? () => handleDelete(tx)
                      : undefined
                  }
                />
              ))}
            </Card>
          ))}
        </div>
      )}

      <EditTransactionDialog
        transaction={editTx}
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) setEditTx(null);
        }}
      />
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <AppShell fullWidth>
      <TransactionsContent />
    </AppShell>
  );
}
