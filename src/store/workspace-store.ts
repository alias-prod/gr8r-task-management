"use client";

import { createContext, useContext } from "react";
import type { Prefs, PriorityId, StatusId, WorkspaceData } from "@/types/workspace";

export const DEFAULT_PREFS: Prefs = {
  theme: "system", accent: "indigo", side: "comfortable", density: "comfortable", name: "", title: "",
};

export type WorkspaceState = {
  data: WorkspaceData;
  prefs: Prefs;
  pending: boolean;
  error: string;
  setPrefs: (partial: Partial<Prefs>) => Promise<boolean>;
  setTaskStatus: (taskId: string, status: StatusId) => Promise<boolean>;
  toggleTaskFav: (taskId: string) => Promise<boolean>;
  toggleSubtask: (taskId: string, subtaskId: string) => Promise<boolean>;
  addSubtask: (taskId: string, title: string) => Promise<boolean>;
  addComment: (taskId: string, text: string) => Promise<boolean>;
  addTask: (input: { title: string; projectId: string; assignee: string; priority: PriorityId; due: string | null }) => Promise<string | undefined>;
  addProject: (input: { name: string; key: string; description: string }) => Promise<string | undefined>;
  toggleProjectFav: (projectId: string) => Promise<boolean>;
  markNotification: (id: string, read: boolean) => void;
  markAllRead: () => void;
  saveWorkspace: (name: string) => Promise<boolean>;
  saveProfile: (name: string, title: string) => Promise<boolean>;
};

export const WorkspaceContext = createContext<WorkspaceState | null>(null);

export function useWorkspaceStore<T>(selector: (state: WorkspaceState) => T): T {
  const state = useContext(WorkspaceContext);
  if (!state) throw new Error("Workspace provider is required.");
  return selector(state);
}

export function useWorkspaceData() {
  return useWorkspaceStore((state) => state.data);
}

export function usePrefs() {
  return useWorkspaceStore((state) => state.prefs);
}
