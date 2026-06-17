import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

export const TONES = {
  emerald: { text: "text-emerald-500", bg: "bg-emerald-500/10" },
  rose: { text: "text-rose-500", bg: "bg-rose-500/10" },
  indigo: { text: "text-indigo-400", bg: "bg-indigo-500/10" },
  purple: { text: "text-purple-400", bg: "bg-purple-500/10" },
  amber: { text: "text-amber-400", bg: "bg-amber-400/10" },
} as const;

export function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub: string;
  icon: LucideIcon;
  tone: keyof typeof TONES;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-zinc-500">{label}</p>
        <div
          className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${TONES[tone].bg} ${TONES[tone].text}`}
        >
          <Icon className="size-3.5" />
        </div>
      </div>
      <p className={`mt-2 text-xl font-semibold tabular-nums ${TONES[tone].text}`}>
        {value}
      </p>
      <p className="mt-0.5 truncate text-xs text-zinc-600">{sub}</p>
    </Card>
  );
}
