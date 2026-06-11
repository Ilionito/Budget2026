import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  endOfMonth,
  format,
  isToday,
  isYesterday,
  parseISO,
  startOfMonth,
} from "date-fns";
import { fr } from "date-fns/locale";
import {
  ENVELOPES,
  RECURRENCE_INTERVALS,
  type EnvelopeKey,
  type Frequency,
} from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

export function formatMonth(date: Date): string {
  const label = format(date, "MMMM yyyy", { locale: fr });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Bornes du mois au format yyyy-MM-dd, pour filtrer les requêtes Supabase. */
export function getMonthRange(date: Date): { start: string; end: string } {
  return {
    start: format(startOfMonth(date), "yyyy-MM-dd"),
    end: format(endOfMonth(date), "yyyy-MM-dd"),
  };
}

export function getInitials(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return initials || "?";
}

export function monthlyEquivalent(amount: number, frequency: Frequency): number {
  if (frequency === "yearly") return amount / 12;
  if (frequency === "weekly") return amount * 4.33;
  return amount;
}

export function formatDayLabel(dateStr: string): string {
  const date = parseISO(dateStr);
  if (isToday(date)) return "Aujourd'hui";
  if (isYesterday(date)) return "Hier";
  const label = format(date, "EEEE d MMMM", { locale: fr });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatShortDate(dateStr: string): string {
  return format(parseISO(dateStr), "d MMM yyyy", { locale: fr });
}

const TAILWIND_COLORS: Record<string, string> = {
  zinc: "#71717a",
  red: "#ef4444",
  orange: "#f97316",
  amber: "#f59e0b",
  yellow: "#eab308",
  lime: "#84cc16",
  green: "#22c55e",
  emerald: "#10b981",
  teal: "#14b8a6",
  cyan: "#06b6d4",
  sky: "#0ea5e9",
  blue: "#3b82f6",
  indigo: "#6366f1",
  violet: "#8b5cf6",
  purple: "#a855f7",
  fuchsia: "#d946ef",
  pink: "#ec4899",
  rose: "#f43f5e",
};

/** Normalise une couleur stockée en base (hex ou nom Tailwind) vers un hex 6 chiffres. */
export function resolveColor(color: string | null | undefined): string {
  if (!color) return "#6366f1";
  const c = color.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(c)) return c;
  if (/^#[0-9a-f]{3}$/.test(c)) {
    return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  }
  return TAILWIND_COLORS[c] ?? "#6366f1";
}

/** Minuscules + sans accents + sans espaces superflus, pour comparer des libellés. */
export function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Une ligne budgétaire s'applique-t-elle au mois donné, selon sa récurrence ? */
export function lineAppliesToMonth(
  recurrence: string,
  createdAt: string,
  month: number,
  year: number
): boolean {
  const created = new Date(createdAt);
  const createdMonth = created.getMonth() + 1;
  const createdYear = created.getFullYear();
  const monthsDiff = (year - createdYear) * 12 + (month - createdMonth);

  if (recurrence === "once") {
    return month === createdMonth && year === createdYear;
  }
  const interval = RECURRENCE_INTERVALS[recurrence] ?? 1;
  if (interval === 1) return true;
  return monthsDiff % interval === 0;
}

/** Rattache une catégorie à son enveloppe budgétaire via son libellé. */
export function envelopeForCategory(label: string | null | undefined): EnvelopeKey {
  if (!label) return "unexpected";
  const normalized = normalizeLabel(label);
  for (const envelope of ENVELOPES) {
    if (envelope.keywords.some((keyword) => normalized.includes(keyword))) {
      return envelope.key;
    }
  }
  return "leisure";
}
