export type Frequency = "monthly" | "yearly" | "weekly";
export type EnvelopeKey = "fixed" | "leisure" | "savings" | "unexpected";

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  avatar_color: string;
}

export interface Category {
  id: string;
  label: string;
  icon: string | null;
  color: string | null;
  is_default: boolean;
}

export interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  label: string;
  category_id: string | null;
  date: string;
  is_private: boolean;
  is_recurring: boolean;
  subscription_id: string | null;
  note: string | null;
}

export interface Subscription {
  id: string;
  user_id: string;
  label: string;
  amount: number;
  frequency: Frequency;
  category_id: string | null;
  next_date: string | null;
  is_active: boolean;
  is_private: boolean;
  is_shared: boolean;
  /** Date jusqu'à laquelle les échéances futures ont déjà été générées
   *  dans le compte (ledger). Null = jamais généré. */
  materialized_until: string | null;
}

export interface MonthlyIncome {
  id: string;
  user_id: string;
  month: number;
  year: number;
  gross_amount: number;
  net_transferred: number;
  note: string | null;
}

export interface Budget {
  id: string;
  month: number;
  year: number;
  envelope: EnvelopeKey;
  amount_target: number;
}

export type Recurrence =
  | "monthly"
  | "bimonthly"
  | "quarterly"
  | "every_4"
  | "every_5"
  | "biannual"
  | "every_7"
  | "every_8"
  | "every_9"
  | "every_10"
  | "every_11"
  | "annual"
  | "once";

export interface BudgetLine {
  id: string;
  label: string;
  category_id: string;
  amount_target: number;
  recurrence: Recurrence;
  created_by: string;
  created_at: string;
  category?: Category;
}

/** Ligne du budget personnel : une catégorie suivie par une personne. */
export interface PersonalBudgetLine {
  id: string;
  user_id: string;
  category_id: string;
  amount_target: number;
  created_at: string;
}

export interface BudgetLineOverride {
  id: string;
  budget_line_id: string;
  month: number;
  year: number;
  amount_target: number;
}

/** Ordre d'affichage : tous les 1 → 12 mois, puis « une seule fois ». */
export const RECURRENCE_LABELS: Record<string, string> = {
  monthly: "Tous les mois",
  bimonthly: "Tous les 2 mois",
  quarterly: "Tous les 3 mois",
  every_4: "Tous les 4 mois",
  every_5: "Tous les 5 mois",
  biannual: "Tous les 6 mois",
  every_7: "Tous les 7 mois",
  every_8: "Tous les 8 mois",
  every_9: "Tous les 9 mois",
  every_10: "Tous les 10 mois",
  every_11: "Tous les 11 mois",
  annual: "Tous les 12 mois",
  once: "Une seule fois",
};

/** Intervalle en mois de chaque récurrence (hors « once »). */
export const RECURRENCE_INTERVALS: Record<string, number> = {
  monthly: 1,
  bimonthly: 2,
  quarterly: 3,
  every_4: 4,
  every_5: 5,
  biannual: 6,
  every_7: 7,
  every_8: 8,
  every_9: 9,
  every_10: 10,
  every_11: 11,
  annual: 12,
};

export interface EnvelopeMeta {
  key: EnvelopeKey;
  label: string;
  description: string;
  keywords: string[];
}

/** Les mots-clés servent à rattacher une catégorie à son enveloppe (matching insensible aux accents). */
export const ENVELOPES: EnvelopeMeta[] = [
  {
    key: "fixed",
    label: "Charges fixes",
    description: "Logement, banque, abonnements",
    keywords: [
      "logement",
      "loyer",
      "maison",
      "banque",
      "credit",
      "abonnement",
      "assurance",
      "energie",
      "electricite",
      "gaz",
      "eau",
      "internet",
      "telephone",
      "courses",
      "alimentation",
      "transport",
      "essence",
      "carburant",
      "voiture",
    ],
  },
  {
    key: "leisure",
    label: "Loisirs & plaisirs",
    description: "Restaurants, sorties, shopping, beauté, cadeaux",
    keywords: [
      "restaurant",
      "sortie",
      "shopping",
      "vetement",
      "beaute",
      "coiffeur",
      "cadeau",
      "loisir",
      "voyage",
      "vacances",
      "culture",
      "cinema",
      "musique",
      "sport",
      "jeux",
      "bar",
      "cafe",
    ],
  },
  {
    key: "savings",
    label: "Épargne",
    description: "Épargne et investissements",
    keywords: ["epargne", "investissement", "livret", "bourse", "crypto"],
  },
  {
    key: "unexpected",
    label: "Imprévus",
    description: "Santé, chien, imprévus",
    keywords: [
      "sante",
      "medecin",
      "pharmacie",
      "mutuelle",
      "chien",
      "animal",
      "animaux",
      "veterinaire",
      "imprevu",
      "reparation",
      "urgence",
    ],
  },
];

export const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "monthly", label: "Mensuel" },
  { value: "yearly", label: "Annuel" },
  { value: "weekly", label: "Hebdomadaire" },
];

export const FREQUENCY_SUFFIX: Record<Frequency, string> = {
  monthly: "/mois",
  yearly: "/an",
  weekly: "/sem.",
};

export interface LedgerEntry {
  id: string;
  user_id: string;
  date: string;
  label: string;
  amount: number;
  type: "income" | "expense";
  note: string | null;
  is_checked: boolean;
  /** Catégorie budget facultative ; null = dépense purement perso. */
  category_id: string | null;
  /** Transaction liée dans le budget commun quand l'écriture y est intégrée. */
  transaction_id: string | null;
  /** Abonnement qui a généré cette écriture (null = saisie manuelle). */
  subscription_id: string | null;
  created_at: string;
}

export const AVATAR_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#f59e0b",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
];
