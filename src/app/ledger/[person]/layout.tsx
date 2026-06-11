import { AppShell } from "@/components/layout/AppShell";

export default function LedgerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell fullWidth>{children}</AppShell>;
}
