/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../convex/_generated/api";
import { authActor, configureAuthTestEnvironment, testDatabase } from "./helpers/auth-fixture";

beforeEach(configureAuthTestEnvironment);
afterEach(() => vi.unstubAllEnvs());
const page = { cursor: null, numItems: 25 };

async function fixture() {
  const database = testDatabase();
  const { actor: owner } = await authActor(database, "owner-a");
  const { actor: outsider } = await authActor(database, "owner-b");
  const workspaceId = await owner.mutation(api.workspaces.create, {
    name: "Private workspace", profileName: "Owner A",
  });
  const current = await owner.query(api.workspaces.current, {});
  if (!current) throw new Error("Workspace fixture was not created.");
  const projectId = await owner.mutation(api.projects.create, {
    workspaceId, name: "Release project", key: "REL",
  });
  const taskId = await owner.mutation(api.tasks.create, {
    projectId, title: "Review release", status: "todo", priority: "high",
    assigneeId: current.member._id, labels: ["qa"],
  });
  return { database, owner, outsider, workspaceId, projectId, taskId, memberId: current.member._id };
}

describe("private workspace authorization", () => {
  it("rejects anonymous reads and writes", async () => {
    const { database, taskId, projectId, workspaceId } = await fixture();
    await expect(database.query(api.workspaces.current, {})).rejects.toThrow("Sign in");
    await expect(database.mutation(api.workspaces.create, {
      name: "Anonymous", profileName: "Anonymous",
    })).rejects.toThrow("Sign in");
    await expect(database.query(api.projects.get, { projectId })).rejects.toThrow("Sign in");
    await expect(database.query(api.tasks.get, { taskId })).rejects.toThrow("Sign in");
    await expect(database.query(api.comments.list, { taskId, paginationOpts: page })).rejects.toThrow("Sign in");
    await expect(database.query(api.activity.list, { workspaceId, paginationOpts: page })).rejects.toThrow("Sign in");
    await expect(database.mutation(api.tasks.setStatus, { taskId, status: "done" })).rejects.toThrow("Sign in");
    await expect(database.query(api.preferences.get, {})).rejects.toThrow("Sign in");
  });

  it("creates a workspace and its owner once, without sample projects", async () => {
    const database = testDatabase();
    const { actor: owner } = await authActor(database, "new-owner");
    const first = await owner.mutation(api.workspaces.create, { name: "My workspace", profileName: "Owner" });
    const second = await owner.mutation(api.workspaces.create, { name: "Different name", profileName: "Different owner" });
    expect(second).toBe(first);
    const current = await owner.query(api.workspaces.current, {});
    expect(current?.workspace.name).toBe("My workspace");
    expect(current?.member.role).toBe("Owner");
    const projects = await owner.query(api.projects.list, { workspaceId: first, paginationOpts: page });
    expect(projects.page).toEqual([]);
    const members = await database.run((ctx) => ctx.db.query("members").take(2));
    expect(members).toHaveLength(1);
  });

  it("refuses cross-workspace reads, even when identifiers are known", async () => {
    const { outsider, workspaceId, projectId, taskId } = await fixture();
    expect(await outsider.query(api.workspaces.current, {})).toBeNull();
    await expect(outsider.query(api.projects.list, { workspaceId, paginationOpts: page })).rejects.toThrow("access denied");
    await expect(outsider.query(api.projects.get, { projectId })).rejects.toThrow("access denied");
    await expect(outsider.query(api.tasks.list, { workspaceId, paginationOpts: page })).rejects.toThrow("access denied");
    await expect(outsider.query(api.tasks.get, { taskId })).rejects.toThrow("access denied");
    await expect(outsider.query(api.comments.list, { taskId, paginationOpts: page })).rejects.toThrow("access denied");
    await expect(outsider.query(api.activity.list, { workspaceId, paginationOpts: page })).rejects.toThrow("access denied");
  });

  it("refuses cross-workspace writes and parent attachment", async () => {
    const { outsider, workspaceId, projectId, taskId } = await fixture();
    await expect(outsider.mutation(api.workspaces.update, {
      workspaceId, name: "Changed", color: "blue",
    })).rejects.toThrow("access denied");
    await expect(outsider.mutation(api.projects.create, {
      workspaceId, name: "Injected project", key: "BAD",
    })).rejects.toThrow("access denied");
    await expect(outsider.mutation(api.projects.setArchived, { projectId, archived: true })).rejects.toThrow("access denied");
    await expect(outsider.mutation(api.projects.setFavorite, { projectId, favorite: true })).rejects.toThrow("access denied");
    await expect(outsider.mutation(api.tasks.create, {
      projectId, title: "Injected task", status: "todo", priority: "none", assigneeId: null, labels: [],
    })).rejects.toThrow("access denied");
    await expect(outsider.mutation(api.tasks.setStatus, { taskId, status: "done" })).rejects.toThrow("access denied");
    await expect(outsider.mutation(api.tasks.setFavorite, { taskId, favorite: true })).rejects.toThrow("access denied");
    await expect(outsider.mutation(api.tasks.addSubtask, { taskId, title: "Injected subtask" })).rejects.toThrow("access denied");
    await expect(outsider.mutation(api.comments.create, { taskId, text: "Injected comment" })).rejects.toThrow("access denied");
  });

  it("rejects an assignee from a different workspace", async () => {
    const { outsider, owner, projectId } = await fixture();
    await outsider.mutation(api.workspaces.create, { name: "Other workspace", profileName: "Owner B" });
    const other = await outsider.query(api.workspaces.current, {});
    if (!other) throw new Error("Other workspace was not created.");
    await expect(owner.mutation(api.tasks.create, {
      projectId, title: "Cross-assigned", status: "todo", priority: "none",
      assigneeId: other.member._id, labels: [],
    })).rejects.toThrow("assignee from this workspace");
  });

  it("keeps preference reads and upserts scoped to the authenticated identity", async () => {
    const { owner, outsider } = await fixture();
    const preferences = { theme: "dark" as const, accent: "blue" as const, sidebar: "compact" as const, density: "comfortable" as const };
    await owner.mutation(api.preferences.set, preferences);
    expect(await outsider.query(api.preferences.get, {})).toBeNull();
    await outsider.mutation(api.preferences.set, { ...preferences, theme: "light" });
    expect((await owner.query(api.preferences.get, {}))?.theme).toBe("dark");
    await owner.mutation(api.preferences.set, { ...preferences, density: "compact" });
    expect((await owner.query(api.preferences.get, {}))?.density).toBe("compact");
  });
});

describe("workspace behavior", () => {
  it("assigns unique task keys in the project transaction", async () => {
    const { owner, projectId, taskId } = await fixture();
    const second = await owner.mutation(api.tasks.create, {
      projectId, title: "Ship release", status: "todo", priority: "medium", assigneeId: null, labels: [],
    });
    expect((await owner.query(api.tasks.get, { taskId })).key).toBe("REL-1");
    expect((await owner.query(api.tasks.get, { taskId: second })).key).toBe("REL-2");
  });

  it("does not reuse a project key within the workspace", async () => {
    const { owner, workspaceId } = await fixture();
    await expect(owner.mutation(api.projects.create, {
      workspaceId, name: "Duplicate key", key: "rel",
    })).rejects.toThrow("already in use");
  });

  it("records status changes once and clears completion when reopened", async () => {
    const { owner, taskId, workspaceId } = await fixture();
    await owner.mutation(api.tasks.setStatus, { taskId, status: "done" });
    const completed = await owner.query(api.tasks.get, { taskId });
    expect(completed.completedAt).toEqual(expect.any(Number));
    const firstActivity = await owner.query(api.activity.list, { workspaceId, paginationOpts: page });
    await owner.mutation(api.tasks.setStatus, { taskId, status: "done" });
    const nextActivity = await owner.query(api.activity.list, { workspaceId, paginationOpts: page });
    expect(nextActivity.page).toHaveLength(firstActivity.page.length);
    expect((await owner.query(api.tasks.get, { taskId })).completedAt).toBe(completed.completedAt);
    await owner.mutation(api.tasks.setStatus, { taskId, status: "progress" });
    expect((await owner.query(api.tasks.get, { taskId })).completedAt).toBeNull();
  });

  it("stores the comment author from the session and rejects empty comments", async () => {
    const { owner, taskId, memberId } = await fixture();
    await owner.mutation(api.comments.create, { taskId, text: "  Ready for review.  " });
    const comments = await owner.query(api.comments.list, { taskId, paginationOpts: page });
    expect(comments.page[0]).toMatchObject({ authorId: memberId, text: "Ready for review." });
    await expect(owner.mutation(api.comments.create, { taskId, text: "   " })).rejects.toThrow("Comment must contain");
    await expect(owner.mutation(api.comments.create, { taskId, text: "x".repeat(5001) })).rejects.toThrow("Comment must contain");
  });

  it("supports creating and completing a subtask", async () => {
    const { owner, taskId } = await fixture();
    const subtaskId = await owner.mutation(api.tasks.addSubtask, { taskId, title: "Check keyboard navigation" });
    await owner.mutation(api.tasks.setSubtaskDone, { taskId, subtaskId, done: true });
    const task = await owner.query(api.tasks.get, { taskId });
    expect(task.subtasks).toEqual([{ id: subtaskId, title: "Check keyboard navigation", done: true }]);
    await expect(owner.mutation(api.tasks.setSubtaskDone, { taskId, subtaskId: "missing", done: true })).rejects.toThrow("Subtask not found");
  });

  it("prevents new tasks in an archived project and supports restoring it", async () => {
    const { owner, projectId, workspaceId } = await fixture();
    await owner.mutation(api.projects.setArchived, { projectId, archived: true });
    expect((await owner.query(api.projects.list, { workspaceId, paginationOpts: page })).page).toEqual([]);
    await expect(owner.mutation(api.tasks.create, {
      projectId, title: "Archived task", status: "todo", priority: "none", assigneeId: null, labels: [],
    })).rejects.toThrow("Restore this project");
    await owner.mutation(api.projects.setArchived, { projectId, archived: false });
    expect((await owner.query(api.projects.list, { workspaceId, paginationOpts: page })).page).toHaveLength(1);
  });

  it("validates text length, actual calendar dates, and date ordering", async () => {
    const { owner, projectId } = await fixture();
    const task = { projectId, title: "Dates", status: "todo" as const, priority: "none" as const, assigneeId: null, labels: [] };
    await expect(owner.mutation(api.tasks.create, { ...task, title: " " })).rejects.toThrow("Task title must contain");
    await expect(owner.mutation(api.tasks.create, { ...task, due: "2026-02-30" })).rejects.toThrow("valid calendar date");
    await expect(owner.mutation(api.tasks.create, { ...task, start: "2026-10-10", due: "2026-10-09" })).rejects.toThrow("due date cannot");
  });

  it("rejects invalid page sizes", async () => {
    const { owner, workspaceId } = await fixture();
    await expect(owner.query(api.tasks.list, {
      workspaceId, paginationOpts: { cursor: null, numItems: 0 },
    })).rejects.toThrow("positive integer");
  });
});
