"use client";

import { useEffect, useState } from "react";
import { Toaster } from "sonner";

/** Toaster sonner qui suit le thème de l'app (événement "app-themechange"). */
export function AppToaster() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    setTheme(
      document.documentElement.classList.contains("dark") ? "dark" : "light"
    );
    const onChange = (e: Event) =>
      setTheme((e as CustomEvent).detail === "light" ? "light" : "dark");
    window.addEventListener("app-themechange", onChange);
    return () => window.removeEventListener("app-themechange", onChange);
  }, []);

  return (
    <Toaster theme={theme} position="top-center" richColors closeButton />
  );
}
