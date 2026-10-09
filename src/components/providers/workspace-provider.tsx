"use client";

import { useState, type ReactNode } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { authClient } from "@/lib/auth-client";
import { workspaceData } from "@/lib/convex-workspace";
import { DEFAULT_PREFS, WorkspaceContext, type WorkspaceState } from "@/store/workspace-store";

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const current = useQuery(api.workspaces.current, {});
  if (current === undefined) return <main className="page" role="status">Loading your workspace…</main>;
  if (!current) return <CreateWorkspace />;
  return <WorkspaceSession key={current.workspace._id} current={current}>{children}</WorkspaceSession>;
}

function CreateWorkspace() {
  const { data: session } = authClient.useSession();
  const create = useMutation(api.workspaces.create);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return <main className="auth"><div className="auth-c"><div className="auth-card">
    <h1>Your own workspace</h1><p className="sub">Start with an empty, private workspace. Only your account can access it.</p>
    <form className="col" style={{ gap: 16 }} onSubmit={async (event) => {
      event.preventDefault();
      if (pending) return;
      setPending(true);
      setError("");
      try { await create({ name, profileName: session?.user.name || "Workspace owner" }); }
      catch { setError("Could not create your workspace. Please try again."); }
      finally { setPending(false); }
    }}>
      <div className="field"><label className="label" htmlFor="workspace-name">Workspace name</label><input id="workspace-name" className="input input-lg" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} /></div>
      {error ? <p role="alert" className="err">{error}</p> : null}
      <button type="submit" className="btn btn-primary btn-lg" disabled={pending}>{pending ? "Creating…" : "Create workspace"}</button>
    </form>
  </div></div></main>;
}

function WorkspaceSession({ current, children }: { current: NonNullable<FunctionReturnType<typeof api.workspaces.current>>; children: ReactNode }) {
  const workspaceId = current.workspace._id;
  const projects = usePaginatedQuery(api.projects.list, { workspaceId }, { initialNumItems: 100 });
  const archived = usePaginatedQuery(api.projects.list, { workspaceId, archived: true }, { initialNumItems: 100 });
  const tasks = usePaginatedQuery(api.tasks.list, { workspaceId }, { initialNumItems: 100 });
  const activity = usePaginatedQuery(api.activity.list, { workspaceId }, { initialNumItems: 50 });
  const preferences = useQuery(api.preferences.get, {});
  const setPreferences = useMutation(api.preferences.set);
  const setStatus = useMutation(api.tasks.setStatus);
  const taskFavorite = useMutation(api.tasks.setFavorite);
  const subtaskDone = useMutation(api.tasks.setSubtaskDone);
  const createSubtask = useMutation(api.tasks.addSubtask);
  const createComment = useMutation(api.comments.create);
  const createTask = useMutation(api.tasks.create);
  const createProject = useMutation(api.projects.create);
  const projectFavorite = useMutation(api.projects.setFavorite);
  const updateWorkspace = useMutation(api.workspaces.update);
  const updateProfile = useMutation(api.workspaces.updateProfile);
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState("");
  const collections = [projects, archived, tasks, activity];
  if (preferences === undefined || collections.some((collection) => collection.status === "LoadingFirstPage")) return <main className="page" role="status">Loading your projects…</main>;
  const data = workspaceData(current.workspace, current.member, [...projects.results, ...archived.results], tasks.results, activity.results);
  const prefs = {
    ...DEFAULT_PREFS,
    ...(preferences ? { theme: preferences.theme, accent: preferences.accent, side: preferences.sidebar, density: preferences.density } : {}),
    name: current.member.name, title: current.member.title,
  };
  async function run<T>(operation: () => Promise<T>): Promise<T | undefined> {
    setPendingCount((count) => count + 1);
    setError("");
    try { return await operation(); }
    catch (cause) { setError(cause instanceof ConvexError && typeof cause.data === "string" ? cause.data : "Your change could not be saved. Please try again."); }
    finally { setPendingCount((count) => count - 1); }
  }
  const state: WorkspaceState = {
    data, prefs, error, pending: pendingCount > 0,
    setPrefs: async (partial) => {
      const next = { ...prefs, ...partial };
      return await run(() => setPreferences({ theme: next.theme, accent: next.accent as Doc<"preferences">["accent"], sidebar: next.side, density: next.density })) !== undefined;
    },
    setTaskStatus: async (id, status) => await run(() => setStatus({ taskId: id as Id<"tasks">, status })) !== undefined,
    toggleTaskFav: async (id) => await run(() => taskFavorite({ taskId: id as Id<"tasks">, favorite: !data.tasks.find((task) => task.id === id)?.fav })) !== undefined,
    toggleSubtask: async (id, subtaskId) => await run(() => subtaskDone({ taskId: id as Id<"tasks">, subtaskId, done: !data.tasks.find((task) => task.id === id)?.subtasks.find((subtask) => subtask.id === subtaskId)?.done })) !== undefined,
    addSubtask: async (id, title) => await run(() => createSubtask({ taskId: id as Id<"tasks">, title })) !== undefined,
    addComment: async (id, text) => await run(() => createComment({ taskId: id as Id<"tasks">, text })) !== undefined,
    addTask: (input) => run(() => createTask({ projectId: input.projectId as Id<"projects">, title: input.title, status: "todo", priority: input.priority, assigneeId: input.assignee ? input.assignee as Id<"members"> : null, due: input.due, labels: [] })),
    addProject: (input) => run(() => createProject({ workspaceId, ...input })),
    toggleProjectFav: async (id) => await run(() => projectFavorite({ projectId: id as Id<"projects">, favorite: !data.projects.find((project) => project.id === id)?.fav })) !== undefined,
    markNotification: () => {},
    markAllRead: () => {},
    saveWorkspace: async (name) => await run(() => updateWorkspace({ workspaceId, name, color: current.workspace.color })) !== undefined,
    saveProfile: async (name, title) => await run(() => updateProfile({ workspaceId, name, title })) !== undefined,
  };
  return <WorkspaceContext.Provider value={state}>
    {error ? <div className="persistence-notice" role="alert">{error}<button className="btn btn-secondary" onClick={() => setError("")}>Dismiss</button></div> : null}
    {!error && collections.some((collection) => collection.status !== "Exhausted") ? <div className="persistence-notice" role="status">Showing loaded records. Load more to include earlier records in your views and totals.<button className="btn btn-secondary" disabled={collections.some((collection) => collection.status === "LoadingMore")} onClick={() => collections.forEach((collection) => { if (collection.status === "CanLoadMore") collection.loadMore(100); })}>Load more records</button></div> : null}
    {children}
  </WorkspaceContext.Provider>;
}
