"use client";

import { use } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { ALLOWED_EMAILS } from "@/lib/supabase";
import { BudgetContent } from "../BudgetContent";

const SLUG_TO_EMAIL: Record<string, string> = {
  joris: ALLOWED_EMAILS[0],
  ophelie: ALLOWED_EMAILS[1],
};

export default function PersonalBudgetPage({
  params,
}: {
  params: Promise<{ person: string }>;
}) {
  const { person } = use(params);
  const email = SLUG_TO_EMAIL[person] ?? null;

  if (!email) {
    return (
      <AppShell fullWidth>
        <div className="py-20 text-center">
          <p className="text-zinc-500">
            Budget introuvable pour «&nbsp;{person}&nbsp;».
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell fullWidth>
      <BudgetContent ownerEmail={email} />
    </AppShell>
  );
}
