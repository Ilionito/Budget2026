export type RealBalanceOp = {
  date: string; // "yyyy-MM-dd"
  type: "income" | "expense";
  amount: number;
};

/**
 * Nouveau solde réel après AJOUT d'une opération sur le Compte, ou `null` si la
 * valeur ne change pas.
 *
 * - une **sortie** le baisse, une **entrée** le monte ;
 * - on n'agit que pour une opération réellement débitée (`date ≤ aujourd'hui`)
 *   et non déjà comprise dans le solde réel (`date ≥ date d'ancrage`) ;
 * - on **avance** la date d'ancrage à celle de l'opération, pour que le REPORT
 *   reste inchangé (l'opération entre alors dans Σ(≤ date), ce qui annule son
 *   effet sur le report) ;
 * - une date d'ancrage absente (cas ancien) ne bloque pas l'ajustement.
 *
 * Fonction pure : appelée uniquement à l'ajout (jamais à la suppression /
 * édition) après l'insertion réussie de l'opération.
 */
export function realBalanceAfterAdd(
  currentAmount: number | null | undefined,
  currentDate: string | null | undefined,
  op: RealBalanceOp,
  today: string
): { amount: number; date: string } | null {
  if (currentAmount == null) return null; // pas de solde réel → rien
  if (op.date > today) return null; // à venir, pas encore débitée → rien
  if (currentDate && op.date < currentDate) return null; // déjà comprise → rien
  const delta = op.type === "income" ? op.amount : -op.amount;
  return {
    amount: Math.round((Number(currentAmount) + delta) * 100) / 100,
    date: op.date,
  };
}
