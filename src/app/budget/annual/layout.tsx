import { AppShell } from "@/components/layout/AppShell";

export default function AnnualBudgetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell fullWidth>{children}</AppShell>;
}
