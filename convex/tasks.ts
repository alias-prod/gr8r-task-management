import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAssignee, requireProject, requireTask, requireWorkspace } from "./access";
import { label, taskDoc, taskPriority, taskStatus } from "./model";
import { date, dateRange, pagination, text } from "./validation";

export const list = query({
  args: {
    workspaceId: v.id("workspaces"),
    projectId: v.optional(v.id("projects")),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(taskDoc),
  handler: async (ctx, args) => {
    await requireWorkspace(ctx, args.workspaceId);
    if (args.projectId) {
      const { project } = await requireProject(ctx, args.projectId);
      if (project.workspaceId !== args.workspaceId) {
        throw new ConvexError("Project not found or access denied.");
      }
      return await ctx.db.query("tasks")
        .withIndex("by_project_and_archived", (q) =>
          q.eq("projectId", project._id).eq("archived", false),
        )
        .order("desc")
        .paginate(pagination(args.paginationOpts));
    }
    return await ctx.db.query("tasks")
      .withIndex("by_workspace_and_archived", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("archived", false),
      )
      .order("desc")
      .paginate(pagination(args.paginationOpts));
  },
});

export const get = query({
  args: { taskId: v.id("tasks") },
  returns: taskDoc,
  handler: async (ctx, args) => (await requireTask(ctx, args.taskId)).task,
});

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    description: v.optional(v.string()),
    status: taskStatus,
    priority: taskPriority,
    assigneeId: v.union(v.id("members"), v.null()),
    start: v.optional(v.union(v.string(), v.null())),
    due: v.optional(v.union(v.string(), v.null())),
    labels: v.array(label),
  },
  returns: v.id("tasks"),
  handler: async (ctx, args) => {
    const { project, member } = await requireProject(ctx, args.projectId);
    if (project.archived) throw new ConvexError("Restore this project before adding tasks.");
    await requireAssignee(ctx, project.workspaceId, args.assigneeId);
    if (args.labels.length > 8) throw new ConvexError("Choose at most eight labels.");
    const start = date(args.start);
    const due = date(args.due);
    dateRange(start, due);
    const now = Date.now();
    const sequence = project.taskSequence + 1;
    const taskId = await ctx.db.insert("tasks", {
      workspaceId: project.workspaceId,
      projectId: project._id,
      key: `${project.key}-${sequence}`,
      title: text(args.title, "Task title", 200),
      description: text(args.description ?? "", "Description", 10000, true),
      status: args.status,
      priority: args.priority,
      assigneeId: args.assigneeId,
      start,
      due,
      labels: [...new Set(args.labels)],
      subtasks: [],
      favorite: false,
      archived: false,
      createdAt: now,
      updatedAt: now,
      completedAt: args.status === "done" ? now : null,
    });
    await ctx.db.patch(project._id, { taskSequence: sequence, updatedAt: now });
    await ctx.db.insert("activity", {
      workspaceId: project.workspaceId,
      actorId: member._id,
      projectId: project._id,
      taskId,
      verb: "created task",
      extra: "",
      createdAt: now,
    });
    return taskId;
  },
});

export const setStatus = mutation({
  args: { taskId: v.id("tasks"), status: taskStatus },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { task, member } = await requireTask(ctx, args.taskId);
    if (task.status === args.status) return null;
    const now = Date.now();
    await ctx.db.patch(task._id, {
      status: args.status,
      completedAt: args.status === "done" ? now : null,
      updatedAt: now,
    });
    await ctx.db.insert("activity", {
      workspaceId: task.workspaceId,
      actorId: member._id,
      projectId: task.projectId,
      taskId: task._id,
      verb: "changed status",
      extra: args.status,
      createdAt: now,
    });
    return null;
  },
});

export const setFavorite = mutation({
  args: { taskId: v.id("tasks"), favorite: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireTask(ctx, args.taskId);
    await ctx.db.patch(args.taskId, { favorite: args.favorite });
    return null;
  },
});

export const setSubtaskDone = mutation({
  args: { taskId: v.id("tasks"), subtaskId: v.string(), done: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { task } = await requireTask(ctx, args.taskId);
    if (!task.subtasks.some((subtask) => subtask.id === args.subtaskId)) {
      throw new ConvexError("Subtask not found.");
    }
    await ctx.db.patch(task._id, {
      subtasks: task.subtasks.map((subtask) =>
        subtask.id === args.subtaskId ? { ...subtask, done: args.done } : subtask,
      ),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const addSubtask = mutation({
  args: { taskId: v.id("tasks"), title: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const { task } = await requireTask(ctx, args.taskId);
    if (task.subtasks.length >= 50) throw new ConvexError("A task can have at most 50 subtasks.");
    const id = `${task._id}-${task.subtasks.length + 1}`;
    await ctx.db.patch(task._id, {
      subtasks: [...task.subtasks, {
        id,
        title: text(args.title, "Subtask title", 200),
        done: false,
      }],
      updatedAt: Date.now(),
    });
    return id;
  },
});
