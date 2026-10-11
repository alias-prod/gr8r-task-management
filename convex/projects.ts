import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { canAccessProject, requireAssignee, requireProject, requireWorkspace } from "./access";
import { color, projectDoc, projectStatus } from "./model";
import { date, dateRange, pagination, text } from "./validation";

export const list = query({
  args: {
    workspaceId: v.id("workspaces"),
    archived: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(projectDoc),
  handler: async (ctx, args) => {
    const access = await requireWorkspace(ctx, args.workspaceId);
    const result = await ctx.db.query("projects")
      .withIndex("by_workspace_and_archived", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("archived", args.archived ?? false),
      )
      .order("desc")
      .paginate(pagination(args.paginationOpts));
    return { ...result, page: result.page.filter(project => canAccessProject(project, access.member._id)) };
  },
});

export const get = query({
  args: { projectId: v.id("projects") },
  returns: projectDoc,
  handler: async (ctx, args) => (await requireProject(ctx, args.projectId)).project,
});

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    private: v.optional(v.boolean()),
    memberIds: v.optional(v.array(v.id("members"))),
    name: v.string(),
    key: v.string(),
    description: v.optional(v.string()),
    color: v.optional(color),
    start: v.optional(v.union(v.string(), v.null())),
    due: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    const { member } = await requireWorkspace(ctx, args.workspaceId);
    const memberIds = [...new Set([member._id, ...(args.memberIds ?? [])])];
    if (memberIds.length > 100) throw new ConvexError("A project can have at most 100 members.");
    for (const memberId of memberIds) await requireAssignee(ctx, args.workspaceId, memberId);
    const key = args.key.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9]{1,7}$/.test(key)) {
      throw new ConvexError("Project key must be 2–8 letters or numbers, starting with a letter.");
    }
    const duplicate = await ctx.db.query("projects")
      .withIndex("by_workspace_and_key", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("key", key),
      )
      .unique();
    if (duplicate) throw new ConvexError("That project key is already in use.");
    const now = Date.now();
    const start = date(args.start);
    const due = date(args.due);
    dateRange(start, due);
    const projectId = await ctx.db.insert("projects", {
      workspaceId: args.workspaceId,
      private: args.private ?? true,
      memberIds,
      name: text(args.name, "Project name", 120),
      key,
      description: text(args.description ?? "", "Description", 5000, true),
      color: args.color ?? "indigo",
      status: "planning",
      leadId: member._id,
      start,
      due,
      favorite: false,
      archived: false,
      taskSequence: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("activity", {
      workspaceId: args.workspaceId,
      actorId: member._id,
      projectId,
      taskId: null,
      verb: "created project",
      extra: "",
      createdAt: now,
    });
    return projectId;
  },
});

export const setStatus = mutation({
  args: { projectId: v.id("projects"), status: projectStatus },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireProject(ctx, args.projectId);
    await ctx.db.patch(args.projectId, { status: args.status, updatedAt: Date.now() });
    return null;
  },
});

export const setFavorite = mutation({
  args: { projectId: v.id("projects"), favorite: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireProject(ctx, args.projectId);
    await ctx.db.patch(args.projectId, { favorite: args.favorite });
    return null;
  },
});

export const setArchived = mutation({
  args: { projectId: v.id("projects"), archived: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { project, member } = await requireProject(ctx, args.projectId);
    if (project.archived === args.archived) return null;
    const now = Date.now();
    await ctx.db.patch(project._id, { archived: args.archived, updatedAt: now });
    await ctx.db.insert("activity", {
      workspaceId: project.workspaceId,
      actorId: member._id,
      projectId: project._id,
      taskId: null,
      verb: args.archived ? "archived project" : "restored project",
      extra: "",
      createdAt: now,
    });
    return null;
  },
});

// Project grants are managed by their lead, not inherited from workspace admin status.
export const setAccess = mutation({
  args: { projectId: v.id("projects"), private: v.boolean(), memberIds: v.array(v.id("members")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { project, member } = await requireProject(ctx, args.projectId);
    if (project.leadId !== member._id) throw new ConvexError("Only the project lead can change project access.");
    const memberIds = [...new Set([project.leadId, ...args.memberIds])];
    if (memberIds.length > 100) throw new ConvexError("A project can have at most 100 members.");
    for (const memberId of memberIds) await requireAssignee(ctx, project.workspaceId, memberId);
    await ctx.db.patch(project._id, { private: args.private, memberIds, updatedAt: Date.now() });
    return null;
  },
});
