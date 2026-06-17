/** Personnalisation des couleurs par profil (« thème »).
 *
 *  Un thème est un ensemble de couleurs hex facultatives stockées sur le profil.
 *  Chaque token surcharge une ou plusieurs variables CSS `--color-*` (que
 *  Tailwind v4 utilise à la compilation), ou la variable custom `--chart` lue
 *  par les graphiques. Un token absent ne surcharge rien : globals.css / le mode
 *  clair gardent la main. */

export interface ThemeTokenMeta {
  /** Clé stockée dans `profile.theme`. */
  key: string;
  /** Libellé affiché dans les réglages. */
  label: string;
  /** Variables CSS surchargées par ce token (toutes à la même couleur). */
  vars: string[];
}

export const THEME_TOKENS: ThemeTokenMeta[] = [
  {
    key: "accent",
    label: "Accent",
    vars: [
      "--color-indigo-300",
      "--color-indigo-400",
      "--color-indigo-500",
      "--color-indigo-600",
    ],
  },
  {
    key: "positive",
    label: "Positif",
    vars: ["--color-emerald-300", "--color-emerald-400", "--color-emerald-500"],
  },
  {
    key: "negative",
    label: "Négatif",
    vars: ["--color-rose-300", "--color-rose-400", "--color-rose-500"],
  },
  {
    key: "warning",
    label: "Ambre",
    vars: ["--color-amber-300", "--color-amber-400", "--color-amber-500"],
  },
  {
    key: "secondary",
    label: "Violet",
    vars: ["--color-purple-400", "--color-purple-500"],
  },
  {
    key: "chart",
    label: "Graphe",
    vars: ["--chart"],
  },
  {
    key: "title",
    label: "Titres",
    vars: ["--color-white"],
  },
];

/** Couleurs par défaut (token non défini). Utilisées pour pré-remplir l'UI
 *  des réglages — un token laissé à sa valeur par défaut peut tout de même
 *  être enregistré, mais ne change rien à l'apparence. */
export const DEFAULT_THEME: Record<string, string> = {
  accent: "#6366f1",
  positive: "#10b981",
  negative: "#f43f5e",
  warning: "#f59e0b",
  secondary: "#a855f7",
  chart: "#6366f1",
  title: "#ffffff",
};
