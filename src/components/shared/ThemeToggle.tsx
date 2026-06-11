"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Bascule clair/sombre : classe .dark sur <html>, persistée en localStorage.
 *  Émet "app-themechange" pour les composants qui en dépendent (Toaster). */
export function ThemeToggle({ className }: { className?: string }) {
  const [isDark, setIsDark] = useState(true);

  // L'état réel n'est connu qu'au montage (script d'init dans le layout).
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // localStorage indisponible (navigation privée…) : non bloquant.
    }
    window.dispatchEvent(
      new CustomEvent("app-themechange", { detail: next ? "dark" : "light" })
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      onClick={toggle}
      aria-label={isDark ? "Passer en mode clair" : "Passer en mode sombre"}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
