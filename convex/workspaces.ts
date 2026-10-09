import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireIdentity, requireWorkspace } from "./access";
import { color, memberDoc, workspaceDoc } from "./model";
import { text } from "./validation";

export const current = query({
  args: {},
  returns: v.union(v.object({ workspace: workspaceDoc, member: memberDoc }), v.null()),
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const workspace = await ctx.db.query("workspaces")
      .withIndex("by_owner", (q) => q.eq("ownerId", identity.tokenIdentifier))
      .unique();
    if (!workspace) return null;
    const { member } = await requireWorkspace(ctx, workspace._id);
    return { workspace, member };
  },
});

export const create = mutation({
  args: { name: v.string(), profileName: v.string() },
  returns: v.id("workspaces"),
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const name = text(args.name, "Workspace name", 100);
    const profileName = text(args.profileName, "Your name", 100);
    const existing = await ctx.db.query("workspaces")
      .withIndex("by_owner", (q) => q.eq("ownerId", identity.tokenIdentifier))
      .unique();
    if (existing) return existing._id;
    const now = Date.now();
    const workspaceId = await ctx.db.insert("workspaces", {
      ownerId: identity.tokenIdentifier,
      name,
      color: "indigo",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("members", {
      workspaceId,
      userId: identity.tokenIdentifier,
      name: profileName,
      email: identity.email ?? "",
      title: "",
      timeZone: "UTC",
      role: "Owner",
      createdAt: now,
    });
    return workspaceId;
  },
});

export const update = mutation({
  args: { workspaceId: v.id("workspaces"), name: v.string(), color },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireWorkspace(ctx, args.workspaceId);
    await ctx.db.patch(args.workspaceId, {
      name: text(args.name, "Workspace name", 100),
      color: args.color,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const updateProfile = mutation({
  args: { workspaceId: v.id("workspaces"), name: v.string(), title: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { member } = await requireWorkspace(ctx, args.workspaceId);
    await ctx.db.patch(member._id, {
      name: text(args.name, "Your name", 100),
      title: text(args.title, "Job title", 120, true),
    });
    return null;
  },
});
