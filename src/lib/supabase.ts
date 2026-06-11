import { createClient } from "@supabase/supabase-js";

/** Seules ces adresses peuvent recevoir un lien magique. */
export const ALLOWED_EMAILS = [
  "hillion.joris00@gmail.com",
  "ophelie.bo73@gmail.com",
];

/** Prénom par défaut si le trigger de création de profil n'a pas tourné. */
export const DEFAULT_NAMES: Record<string, string> = {
  "hillion.joris00@gmail.com": "Joris",
  "ophelie.bo73@gmail.com": "Ophélie",
};

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
