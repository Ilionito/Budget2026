import { create } from "zustand";
import { addMonths, isAfter, startOfMonth, subMonths } from "date-fns";
import type { Category, Profile } from "@/types";

interface AppState {
  profile: Profile | null;
  partner: Profile | null;
  categories: Category[];
  currentMonth: Date;
  /** Profils + catégories chargés : l'app peut s'afficher. */
  ready: boolean;
  /** Incrémenté après chaque écriture pour déclencher les rechargements. */
  dataVersion: number;
  setProfile: (profile: Profile | null) => void;
  setPartner: (partner: Profile | null) => void;
  setCategories: (categories: Category[]) => void;
  setReady: (ready: boolean) => void;
  setCurrentMonth: (date: Date) => void;
  goToPreviousMonth: () => void;
  goToNextMonth: () => void;
  bumpDataVersion: () => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  profile: null,
  partner: null,
  categories: [],
  currentMonth: startOfMonth(new Date()),
  ready: false,
  dataVersion: 0,
  setProfile: (profile) => set({ profile }),
  setPartner: (partner) => set({ partner }),
  setCategories: (categories) => set({ categories }),
  setReady: (ready) => set({ ready }),
  setCurrentMonth: (date) => set({ currentMonth: startOfMonth(date) }),
  goToPreviousMonth: () =>
    set((state) => ({ currentMonth: subMonths(state.currentMonth, 1) })),
  goToNextMonth: () =>
    set((state) => {
      const next = addMonths(state.currentMonth, 1);
      if (isAfter(next, startOfMonth(new Date()))) return state;
      return { currentMonth: next };
    }),
  bumpDataVersion: () =>
    set((state) => ({ dataVersion: state.dataVersion + 1 })),
  reset: () =>
    set({
      profile: null,
      partner: null,
      categories: [],
      currentMonth: startOfMonth(new Date()),
      ready: false,
      dataVersion: 0,
    }),
}));
