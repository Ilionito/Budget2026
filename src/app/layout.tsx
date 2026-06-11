import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AppToaster } from "@/components/shared/AppToaster";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Budget 2026",
  description: "Suivi budgétaire de Joris & Ophélie",
};

/** Appliqué avant le rendu pour éviter un flash de thème au chargement. */
const THEME_INIT = `try{if(localStorage.getItem("theme")==="light")document.documentElement.classList.remove("dark")}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} ${inter.className} bg-zinc-950 text-zinc-200 antialiased`}>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
