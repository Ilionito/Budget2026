"use client";

import * as React from "react";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Receipt } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { EditTransactionDialog } from "@/components/shared/EditTransactionDialog";
import { TransactionRow } from "@/components/shared/TransactionRow";
import { formatDayLabel } from "@/lib/utils";
import type { Transaction } from "@/types";

export function RecentTransactions({
  transactions,
}: {
  transactions: Transaction[];
}) {
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const recent = transactions.slice(0, 8);

  const groups: { date: string; items: Transaction[] }[] = [];
  for (const tx of recent) {
    const group = groups.find((g) => g.date === tx.date);
    if (group) group.items.push(tx);
    else groups.push({ date: tx.date, items: [tx] });
  }

  function handleEdit(tx: Transaction) {
    setEditTx(tx);
    setEditOpen(true);
  }

  return (
    <>
      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>Transactions récentes</CardTitle>
          <Link
            href="/transactions"
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-400 transition-colors duration-150 hover:text-indigo-300"
          >
            Tout voir <ArrowRight className="size-3" />
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Receipt className="size-6 text-zinc-700" />
            <p className="text-sm text-zinc-600">Aucune transaction ce mois-ci</p>
          </div>
        ) : (
          <div className="mt-2">
            {groups.map((group) => (
              <div key={group.date}>
                <p className="px-2 pb-1 pt-3 text-xs font-medium text-zinc-500">
                  {formatDayLabel(group.date)}
                </p>
                {group.items.map((tx) => (
                  <TransactionRow
                    key={tx.id}
                    transaction={tx}
                    onEdit={() => handleEdit(tx)}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </Card>

      <EditTransactionDialog
        transaction={editTx}
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) setEditTx(null);
        }}
      />
    </>
  );
}
