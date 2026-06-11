import { addDays, addMonths, addWeeks, addYears, format, parseISO } from "date-fns";
import { supabase } from "@/lib/supabase";
import type { Frequency, Subscription } from "@/types";

/** Combien de mois à l'avance on matérialise les échéances dans le compte. */
const HORIZON_MONTHS = 12;

function step(date: Date, frequency: Frequency): Date {
  if (frequency === "yearly") return addYears(date, 1);
  if (frequency === "weekly") return addWeeks(date, 1);
  return addMonths(date, 1);
}

/**
 * Échéances d'un abonnement dans l'intervalle [fromStr, horizonStr] (bornes
 * incluses), ancrées sur `nextDate` puis répétées selon la fréquence.
 * Toutes les dates sont au format "yyyy-MM-dd".
 */
export function subscriptionOccurrences(
  nextDate: string,
  frequency: Frequency,
  fromStr: string,
  horizonStr: string
): string[] {
  const from = parseISO(fromStr);
  const horizon = parseISO(horizonStr);
  const out: string[] = [];
  let d = parseISO(nextDate);
  // Garde-fou : évite toute boucle infinie sur une date/fréquence aberrante.
  let guard = 0;
  while (d < from && guard < 1000) {
    d = step(d, frequency);
    guard++;
  }
  while (d <= horizon && guard < 1000) {
    out.push(format(d, "yyyy-MM-dd"));
    d = step(d, frequency);
    guard++;
  }
  return out;
}

/**
 * Génère, pour les abonnements actifs de l'utilisateur, les écritures futures
 * manquantes dans le compte (ledger_entries), jusqu'à l'horizon.
 *
 * Idempotent : on ne (re)génère que les dates postérieures à
 * `materialized_until`, donc relancer la fonction ne crée pas de doublon, et
 * une échéance supprimée à la main ne réapparaît pas.
 *
 * Retourne true si au moins une écriture a été créée.
 */
export async function materializeSubscriptions(userId: string): Promise<boolean> {
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  const horizonStr = format(addMonths(today, HORIZON_MONTHS), "yyyy-MM-dd");

  const { data } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true);
  const subs = (data as Subscription[] | null) ?? [];

  const rows: Record<string, unknown>[] = [];
  const touched: string[] = [];

  for (const s of subs) {
    if (!s.next_date) continue;
    // On part après ce qui est déjà matérialisé, et jamais avant aujourd'hui
    // (le passé reste de la saisie manuelle).
    let fromStr = todayStr;
    if (s.materialized_until && s.materialized_until >= todayStr) {
      fromStr = format(addDays(parseISO(s.materialized_until), 1), "yyyy-MM-dd");
    }
    if (fromStr > horizonStr) continue; // déjà à jour jusqu'à l'horizon

    const dates = subscriptionOccurrences(
      s.next_date,
      s.frequency,
      fromStr,
      horizonStr
    );
    for (const date of dates) {
      rows.push({
        user_id: userId,
        date,
        label: s.label,
        amount: s.amount,
        type: "expense",
        note: null,
        is_checked: false,
        category_id: s.category_id,
        transaction_id: null,
        subscription_id: s.id,
      });
    }
    touched.push(s.id);
  }

  if (rows.length > 0) {
    const { error } = await supabase.from("ledger_entries").insert(rows);
    if (error) return false;
  }
  // Avance le curseur, même pour les abonnements sans nouvelle échéance ce
  // tour-ci : évite de les re-scanner à chaque ouverture du compte.
  if (touched.length > 0) {
    await supabase
      .from("subscriptions")
      .update({ materialized_until: horizonStr })
      .in("id", touched);
  }
  return rows.length > 0;
}
