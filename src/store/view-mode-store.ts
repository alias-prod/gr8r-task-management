"use client";

import { create } from "zustand";
import type { ViewMode } from "@/types/workspace";

type ViewModeState = {
  mode: ViewMode;
  setMode: (mode: ViewMode) => void;
  hydrate: () => void;
};

export const useViewModeStore = create<ViewModeState>((set) => ({
  mode: "company",
  setMode: (mode) => set({ mode }),
  hydrate: () => {},
}));
