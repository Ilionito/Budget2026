"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { startOfMonth } from "date-fns";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const MONTH_NAMES = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

/**
 * Onglets Janvier → Décembre + « Récap » (vue annuelle).
 * `active` = numéro du mois (1-12) sur la vue mensuelle, "recap" sur la vue annuelle.
 */
export function BudgetMonthNav({ active }: { active: number | "recap" }) {
  const router = useRouter();
  const { currentMonth, setCurrentMonth } = useAppStore();
  const year = currentMonth.getFullYear();
  const nowMonthStart = startOfMonth(new Date()).getTime();

  function isFuture(monthIndex: number) {
    return new Date(year, monthIndex, 1).getTime() > nowMonthStart;
  }

  function selectMonth(monthIndex: number) {
    if (isFuture(monthIndex)) return;
    setCurrentMonth(new Date(year, monthIndex, 1));
    if (active === "recap") router.push("/budget");
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-1">
      {MONTH_NAMES.map((name, index) => {
        const future = isFuture(index);
        const isActive = active === index + 1;
        return (
          <button
            key={name}
            type="button"
            disabled={future}
            onClick={() => selectMonth(index)}
            className={cn(
              "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-indigo-500/40",
              isActive
                ? "bg-zinc-800 text-white"
                : future
                  ? "cursor-not-allowed text-zinc-700"
                  : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
            )}
          >
            {name}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => router.push("/budget/annual")}
        className={cn(
          "ml-auto shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-indigo-500/40",
          active === "recap"
            ? "bg-indigo-500/15 text-indigo-300"
            : "text-indigo-400 hover:bg-zinc-900 hover:text-indigo-300"
        )}
      >
        Récap
      </button>
    </div>
  );
}
