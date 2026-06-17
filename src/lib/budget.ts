import { supabase } from "@/lib/supabase";
import { normalizeLabel } from "@/lib/utils";

/**
 * Quand une dépense est ajoutée par `userId` dans une catégorie qui
 * n'appartient PAS au budget commun (aucune ligne owner_id null dans cette
 * catégorie), on crée — si besoin — une ligne de budget PERSO (owner_id =
 * userId) pour qu'elle apparaisse automatiquement dans le budget personnel.
 *
 * Ne fait rien si : pas de catégorie/libellé, catégorie commune, ou ligne perso
 * déjà existante (même catégorie + libellé). Les erreurs sont silencieuses
 * (best-effort, ne doit jamais bloquer l'ajout de la dépense).
 */
export async function ensurePersonalBudgetLine(
  userId: string,
  categoryId: string,
  label: string
): Promise<boolean> {
  if (!userId || !categoryId || !label.trim()) return false;
  try {
    // Catégorie du budget commun ? → on ne touche pas au perso.
    const { data: commonLines } = await supabase
      .from("budget_lines")
      .select("id")
      .is("owner_id", null)
      .eq("category_id", categoryId)
      .limit(1);
    if (commonLines && commonLines.length > 0) return false;

    // Une ligne perso identique existe déjà ?
    const { data: mine } = await supabase
      .from("budget_lines")
      .select("label")
      .eq("owner_id", userId)
      .eq("category_id", categoryId);
    const exists = (mine ?? []).some(
      (l) => normalizeLabel((l as { label: string }).label) === normalizeLabel(label)
    );
    if (exists) return false;

    const { error } = await supabase.from("budget_lines").insert({
      owner_id: userId,
      category_id: categoryId,
      label: label.trim(),
      amount_target: 0,
      recurrence: "monthly",
      created_by: userId,
    });
    return !error;
  } catch {
    return false;
  }
}
