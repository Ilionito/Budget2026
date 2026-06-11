"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { startOfMonth } from "date-fns";
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  NotebookText,
  PiggyBank,
  Plus,
  Repeat,
  Settings,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AddTransactionSheet } from "@/components/shared/AddTransactionSheet";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { supabase, DEFAULT_NAMES } from "@/lib/supabase";
import { useAppStore } from "@/lib/store";
import { cn, formatMonth } from "@/lib/utils";
import type { Category, Profile } from "@/types";

interface NavItem {
  /** Id stable pour persister l'ordre choisi par chacun. */
  id: string;
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Menu par défaut, personnalisé pour la personne connectée. */
function buildNavItems(profile: Profile | null): NavItem[] {
  const firstName = profile?.display_name?.split(" ")[0] ?? "perso";
  return [
    { id: "budget-commun", href: "/budget", label: "Budget commun", icon: PiggyBank },
    { id: "budget-perso", href: "/budget/perso", label: `Budget ${firstName}`, icon: Wallet },
    { id: "dashboard", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "transactions", href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
    { id: "subscriptions", href: "/subscriptions", label: "Abonnements", icon: Repeat },
    { id: "ledger-joris", href: "/ledger/joris", label: "Compte Joris", icon: NotebookText },
    { id: "ledger-ophelie", href: "/ledger/ophelie", label: "Compte Ophélie", icon: NotebookText },
    { id: "settings", href: "/settings", label: "Réglages", icon: Settings },
  ];
}

function navOrderKey(profileId: string): string {
  return `nav-order:${profileId}`;
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-400">
        <Home className="size-4" />
      </div>
      {!compact && (
        <span className="text-sm font-semibold text-white">Budget 2026</span>
      )}
    </div>
  );
}

function MonthSwitcher({ className }: { className?: string }) {
  const { currentMonth, goToPreviousMonth, goToNextMonth } = useAppStore();
  const isCurrentMonth =
    startOfMonth(new Date()).getTime() === currentMonth.getTime();

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-1 rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-1",
        className
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        onClick={goToPreviousMonth}
        aria-label="Mois précédent"
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span className="select-none truncate text-xs font-medium text-zinc-300">
        {formatMonth(currentMonth)}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        onClick={goToNextMonth}
        disabled={isCurrentMonth}
        aria-label="Mois suivant"
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}

function NavLinks({
  items,
  onReorder,
  draggable = false,
  onNavigate,
}: {
  items: NavItem[];
  /** Déplace fromId juste avant/à la place de toId (réorganisation live). */
  onReorder?: (fromId: string, toId: string) => void;
  draggable?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const [dragId, setDragId] = useState<string | null>(null);

  // Actif = l'entrée dont le href est le plus long préfixe du chemin courant
  // (sinon « Budget commun » s'allume aussi sur /budget/perso).
  const activeHref = items.reduce<string | null>((best, item) => {
    const matches =
      pathname === item.href || pathname.startsWith(item.href + "/");
    if (!matches) return best;
    return item.href.length > (best?.length ?? 0) ? item.href : best;
  }, null);

  return (
    <nav className="flex flex-col gap-1">
      {items.map(({ id, href, label, icon: Icon }) => {
        const active = href === activeHref;
        return (
          <Link
            key={id}
            href={href}
            onClick={onNavigate}
            draggable={draggable}
            onDragStart={draggable ? () => setDragId(id) : undefined}
            onDragOver={
              draggable
                ? (e) => {
                    e.preventDefault();
                    if (dragId && dragId !== id) onReorder?.(dragId, id);
                  }
                : undefined
            }
            onDragEnd={draggable ? () => setDragId(null) : undefined}
            title={draggable ? "Glisser pour réorganiser" : undefined}
            className={cn(
              "group/nav flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150",
              active
                ? "bg-indigo-500/10 text-indigo-300"
                : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200",
              dragId === id && "opacity-40"
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="flex-1 truncate">{label}</span>
            {draggable && (
              <GripVertical className="size-3.5 shrink-0 cursor-grab text-zinc-700 opacity-0 transition-opacity group-hover/nav:opacity-100" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({
  children,
  fullWidth = false,
  wide = false,
}: {
  children: React.ReactNode;
  /** Sans limite de largeur — pour les pages à grands tableaux (budget). */
  fullWidth?: boolean;
  /** Largeur élargie (max-w-7xl) — pour les pages denses multi-colonnes. */
  wide?: boolean;
}) {
  const router = useRouter();
  const { profile, ready, setProfile, setPartner, setCategories, setReady, reset } =
    useAppStore();
  // Pas de loader si le store est déjà hydraté (navigation entre pages) :
  // le bootstrap re-synchronise alors silencieusement en arrière-plan.
  const [checking, setChecking] = useState(() => !useAppStore.getState().ready);
  const [menuOpen, setMenuOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  /** Ordre du menu choisi par la personne (ids), null = ordre par défaut. */
  const [navOrder, setNavOrder] = useState<string[] | null>(null);

  const navItems = useMemo(() => buildNavItems(profile), [profile]);

  // Charge l'ordre sauvegardé (par personne, par appareil).
  useEffect(() => {
    if (!profile) return;
    try {
      const raw = localStorage.getItem(navOrderKey(profile.id));
      setNavOrder(raw ? (JSON.parse(raw) as string[]) : null);
    } catch {
      setNavOrder(null);
    }
  }, [profile]);

  const orderedNav = useMemo(() => {
    if (!navOrder) return navItems;
    const rank = new Map(navOrder.map((id, index) => [id, index]));
    // Les entrées inconnues de l'ordre sauvegardé (futurs ajouts) vont en fin,
    // dans leur ordre par défaut (sort stable).
    return [...navItems].sort(
      (a, b) =>
        (rank.get(a.id) ?? navOrder.length) -
        (rank.get(b.id) ?? navOrder.length)
    );
  }, [navItems, navOrder]);

  function handleNavReorder(fromId: string, toId: string) {
    const ids = orderedNav.map((item) => item.id);
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(toId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setNavOrder(ids);
    if (profile) {
      try {
        localStorage.setItem(navOrderKey(profile.id), JSON.stringify(ids));
      } catch {
        // localStorage indisponible : l'ordre vaut pour la session seulement.
      }
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/auth");
        return;
      }
      const userId = session.user.id;
      const email = session.user.email?.toLowerCase() ?? "";
      const fallbackName = DEFAULT_NAMES[email] ?? email.split("@")[0];

      // Upsert défensif au cas où le trigger Supabase n'aurait pas tourné.
      // ignoreDuplicates : un profil existant n'est jamais écrasé.
      const { error: upsertError } = await supabase.from("profiles").upsert(
        {
          id: userId,
          email,
          display_name: fallbackName,
          avatar_color: "#6366f1",
        },
        { onConflict: "id", ignoreDuplicates: true }
      );
      if (upsertError) {
        toast.error(`Création du profil impossible : ${upsertError.message}`);
      }

      // Profil + partenaire + catégories re-synchronisés à CHAQUE montage :
      // un store hydraté pendant une panne (ex. permissions) se répare ainsi
      // tout seul à la navigation suivante, sans recharger la page.
      const [meRes, partnerRes, catsRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
        supabase.from("profiles").select("*").neq("id", userId).limit(1),
        supabase.from("categories").select("*").order("label"),
      ]);

      if (cancelled) return;
      const me = (meRes.data as Profile | null) ?? null;
      // Dernier filet : un profil local dérivé de la session, pour que
      // ready garantisse toujours un profil non nul (pas de skeleton infini).
      setProfile(
        me ?? {
          id: userId,
          email,
          display_name: fallbackName,
          avatar_color: "#6366f1",
        }
      );
      setPartner(((partnerRes.data as Profile[] | null) ?? [])[0] ?? null);
      setCategories((catsRes.data as Category[] | null) ?? []);
      setReady(true);
      setChecking(false);
    }

    bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        useAppStore.getState().reset();
        router.replace("/auth");
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [router, setProfile, setPartner, setCategories, setReady]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    reset();
    router.replace("/auth");
  }

  if (checking || !ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="flex animate-pulse flex-col items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-400">
            <Home className="size-5" />
          </div>
          <p className="text-sm text-zinc-600">Budget 2026</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[260px] flex-col border-r border-zinc-800/60 bg-zinc-950 md:flex">
        <div className="px-5 pb-4 pt-6">
          <Logo />
        </div>
        <div className="px-4 pb-3">
          <MonthSwitcher />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <NavLinks items={orderedNav} draggable onReorder={handleNavReorder} />
        </div>
        <div className="flex items-center gap-2 border-t border-zinc-800/60 p-4">
          <UserAvatar profile={profile} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-200">
              {profile?.display_name}
            </p>
            <p className="truncate text-xs text-zinc-600">{profile?.email}</p>
          </div>
          <ThemeToggle className="size-8 text-zinc-500" />
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-zinc-500 hover:text-rose-400"
            onClick={handleSignOut}
            aria-label="Se déconnecter"
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </aside>

      {/* Header mobile */}
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-zinc-800/60 bg-zinc-950/90 px-4 py-3 backdrop-blur md:hidden">
        <Logo compact />
        <MonthSwitcher className="min-w-0 flex-1" />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMenuOpen(true)}
          aria-label="Ouvrir le menu"
        >
          <Menu className="size-5" />
        </Button>
      </header>

      {/* Menu mobile */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="bg-zinc-950 p-5">
          <SheetHeader>
            <SheetTitle>
              <Logo />
            </SheetTitle>
            <SheetDescription className="sr-only">
              Navigation principale
            </SheetDescription>
          </SheetHeader>
          <NavLinks items={orderedNav} onNavigate={() => setMenuOpen(false)} />
          <div className="mt-auto flex items-center gap-2 border-t border-zinc-800/60 pt-4">
            <UserAvatar profile={profile} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-200">
                {profile?.display_name}
              </p>
              <p className="truncate text-xs text-zinc-600">{profile?.email}</p>
            </div>
            <ThemeToggle className="size-8 text-zinc-500" />
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-zinc-500 hover:text-rose-400"
              onClick={handleSignOut}
              aria-label="Se déconnecter"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Contenu */}
      <main className="md:pl-[260px]">
        <div
          className={cn(
            "mx-auto w-full p-4 pb-28 md:p-6",
            fullWidth ? "max-w-none" : wide ? "max-w-7xl" : "max-w-5xl"
          )}
        >
          {children}
        </div>
      </main>

      {/* FAB ajout de dépense */}
      <button
        onClick={() => setAddOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex size-14 items-center justify-center rounded-full bg-indigo-500 text-[#fff] shadow-lg shadow-indigo-500/25 outline-none transition-transform duration-150 hover:scale-105 hover:bg-indigo-400 focus-visible:ring-2 focus-visible:ring-indigo-400"
        aria-label="Ajouter une dépense"
      >
        <Plus className="size-6" />
      </button>
      <AddTransactionSheet open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
