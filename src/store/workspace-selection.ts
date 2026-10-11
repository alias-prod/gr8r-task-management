"use client";
import { createContext, useContext } from "react";
import type { Doc } from "../../convex/_generated/dataModel";
export type WorkspaceSelection = {workspaceId:string;organizationId:string|null;role:"owner"|"admin"|"member";workspaces:Doc<"workspaces">[];selectWorkspace:(id:string)=>void};
export const WorkspaceSelectionContext=createContext<WorkspaceSelection|null>(null);
export function useWorkspaceSelection(){const value=useContext(WorkspaceSelectionContext);if(!value)throw new Error("Workspace selection is unavailable.");return value;}
