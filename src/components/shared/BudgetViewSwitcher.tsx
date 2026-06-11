import Link from "next/link";
import { cn } from "@/lib/utils";

/** Bascule entre le budget commun du couple et le budget personnel. */
export function BudgetViewSwitcher({ active }: { active: "common" | "perso" }) {
  const base =
    "rounded-lg px-3 py-1.5 text-xs font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-indigo-500/40";
  return (
    <div className="flex items-center gap-1 rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-1">
      <Link
        href="/budget"
        className={cn(
          base,
          active === "common"
            ? "bg-indigo-500/15 text-indigo-300"
            : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
        )}
      >
        Commun
      </Link>
      <Link
        href="/budget/perso"
        className={cn(
          base,
          active === "perso"
            ? "bg-indigo-500/15 text-indigo-300"
            : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
        )}
      >
        Perso
      </Link>
    </div>
  );
}
