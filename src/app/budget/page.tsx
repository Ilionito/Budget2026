"use client";

import { AppShell } from "@/components/layout/AppShell";
import { BudgetContent } from "./BudgetContent";

export default function BudgetPage() {
  return (
    <AppShell fullWidth>
      <BudgetContent ownerEmail={null} />
    </AppShell>
  );
}
