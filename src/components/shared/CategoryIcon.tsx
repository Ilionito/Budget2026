import * as React from "react";
import {
  Baby,
  Banknote,
  BookOpen,
  Briefcase,
  Bus,
  Car,
  Cat,
  Clapperboard,
  Coffee,
  CreditCard,
  Dog,
  Dumbbell,
  Film,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  Heart,
  HeartPulse,
  Home,
  Landmark,
  Music,
  PawPrint,
  Phone,
  PiggyBank,
  Pill,
  Plane,
  Receipt,
  Scissors,
  Shirt,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Stethoscope,
  Tag,
  Train,
  Tv,
  Umbrella,
  Utensils,
  UtensilsCrossed,
  Wallet,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn, resolveColor } from "@/lib/utils";
import type { Category } from "@/types";

const ICONS: Record<string, LucideIcon> = {
  home: Home,
  house: Home,
  maison: Home,
  logement: Home,
  utensils: Utensils,
  "utensils-crossed": UtensilsCrossed,
  restaurant: UtensilsCrossed,
  "shopping-cart": ShoppingCart,
  courses: ShoppingCart,
  "shopping-bag": ShoppingBag,
  shopping: ShoppingBag,
  car: Car,
  voiture: Car,
  bus: Bus,
  transport: Bus,
  train: Train,
  plane: Plane,
  avion: Plane,
  fuel: Fuel,
  essence: Fuel,
  heart: Heart,
  "heart-pulse": HeartPulse,
  sante: HeartPulse,
  health: HeartPulse,
  stethoscope: Stethoscope,
  pill: Pill,
  dog: Dog,
  chien: Dog,
  cat: Cat,
  "paw-print": PawPrint,
  paw: PawPrint,
  gamepad: Gamepad2,
  "gamepad-2": Gamepad2,
  jeux: Gamepad2,
  gift: Gift,
  cadeau: Gift,
  sparkles: Sparkles,
  beaute: Sparkles,
  "piggy-bank": PiggyBank,
  epargne: PiggyBank,
  wallet: Wallet,
  banknote: Banknote,
  landmark: Landmark,
  banque: Landmark,
  "credit-card": CreditCard,
  zap: Zap,
  energie: Zap,
  wifi: Wifi,
  internet: Wifi,
  phone: Phone,
  smartphone: Smartphone,
  telephone: Smartphone,
  music: Music,
  film: Film,
  clapperboard: Clapperboard,
  tv: Tv,
  abonnement: Tv,
  dumbbell: Dumbbell,
  sport: Dumbbell,
  "graduation-cap": GraduationCap,
  "book-open": BookOpen,
  briefcase: Briefcase,
  shirt: Shirt,
  vetements: Shirt,
  scissors: Scissors,
  coffee: Coffee,
  cafe: Coffee,
  baby: Baby,
  wrench: Wrench,
  umbrella: Umbrella,
  "shield-check": ShieldCheck,
  assurance: ShieldCheck,
  receipt: Receipt,
  tag: Tag,
};

const SIZES = {
  sm: { box: "size-8 rounded-lg", icon: "size-3.5" },
  md: { box: "size-10 rounded-xl", icon: "size-4" },
} as const;

export function CategoryIcon({
  category,
  size = "md",
  className,
}: {
  category: Category | null | undefined;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const color = resolveColor(category?.color);
  const rawIcon = (category?.icon ?? "").trim();
  const Icon = ICONS[rawIcon.toLowerCase()];
  // Une icône inconnue de 1 à 3 « caractères » est traitée comme un emoji.
  const isEmoji = !Icon && rawIcon.length > 0 && [...rawIcon].length <= 3;
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center",
        SIZES[size].box,
        className
      )}
      style={{ backgroundColor: `${color}24`, color }}
      title={category?.label}
    >
      {Icon ? (
        <Icon className={SIZES[size].icon} />
      ) : isEmoji ? (
        <span
          className={cn(
            "leading-none",
            size === "sm" ? "text-sm" : "text-base"
          )}
        >
          {rawIcon}
        </span>
      ) : (
        <Tag className={SIZES[size].icon} />
      )}
    </div>
  );
}
