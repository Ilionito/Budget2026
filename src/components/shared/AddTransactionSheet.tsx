"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TransactionForm } from "@/components/shared/TransactionForm";

export function AddTransactionSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="px-4 sm:px-6">
        <div className="mx-auto w-full max-w-lg pb-2">
          <SheetHeader className="mb-4">
            <SheetTitle>Nouvelle dépense</SheetTitle>
            <SheetDescription>
              Choisis d&rsquo;abord la catégorie, le reste suit.
            </SheetDescription>
          </SheetHeader>
          {open && (
            <TransactionForm onSuccess={() => onOpenChange(false)} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
