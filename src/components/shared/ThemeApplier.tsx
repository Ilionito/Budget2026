"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { THEME_TOKENS } from "@/lib/theme";

/** Applique le thème du profil sur `document.documentElement` :
 *  pour chaque token défini, écrit la couleur sur ses variables CSS ;
 *  pour chaque token absent/vide, retire les surcharges (retour aux défauts
 *  gérés par globals.css / le mode clair). Ne rend rien. */
export function ThemeApplier() {
  const theme = useAppStore((s) => s.profile?.theme);

  useEffect(() => {
    const root = document.documentElement;
    for (const token of THEME_TOKENS) {
      const value = theme?.[token.key];
      for (const cssVar of token.vars) {
        if (value) {
          root.style.setProperty(cssVar, value);
        } else {
          root.style.removeProperty(cssVar);
        }
      }
    }
  }, [theme]);

  return null;
}
