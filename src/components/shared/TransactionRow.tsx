"use client";

import * as React from "react";
import { Lock, Pencil, Repeat, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryIcon } from "@/components/shared/CategoryIcon";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { useAppStore } from "@/lib/store";
import { cn, formatCurrency } from "@/lib/utils";
import type { Transaction } from "@/types";

export function TransactionRow({
  transaction,
  onEdit,
  onDelete,
}: {
  transaction: Transaction;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const { profile, partner, categories } = useAppStore();
  const category =
    categories.find((c) => c.id === transaction.category_id) ?? null;
  const owner = transaction.user_id === profile?.id ? profile : partner;
  const amount = Number(transaction.amount);
  // Montant négatif = remboursement : affiché en crédit.
  const isRefund = amount < 0;

  const hasActions = onEdit || onDelete;

  return (
    <div className="group flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors duration-150 hover:bg-zinc-800/40">
      <CategoryIcon category={category} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium text-zinc-200">
            {transaction.label}
          </p>
          {transaction.is_private && (
            <Lock className="size-3 shrink-0 text-zinc-600" aria-label="Privé" />
          )}
          {transaction.is_recurring && (
            <Repeat
              className="size-3 shrink-0 text-zinc-600"
              aria-label="Récurrent"
            />
          )}
        </div>
        <p className="truncate text-xs text-zinc-600">
          {category?.label ?? "Sans catégorie"}
          {transaction.note ? ` · ${transaction.note}` : ""}
        </p>
      </div>
      <UserAvatar profile={owner} size="sm" />
      <p
        className={cn(
          "w-20 shrink-0 text-right text-sm font-semibold tabular-nums",
          isRefund ? "text-emerald-400" : "text-zinc-200"
        )}
      >
        {isRefund ? `+${formatCurrency(-amount)}` : formatCurrency(amount)}
      </p>
      {hasActions && (
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
          {onEdit && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-zinc-600 hover:text-indigo-400"
              onClick={onEdit}
              aria-label="Modifier la transaction"
            >
              <Pencil className="size-4" />
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-zinc-600 hover:text-rose-400"
              onClick={onDelete}
              aria-label="Supprimer la transaction"
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
