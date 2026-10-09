import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type ReadContext = QueryCtx | MutationCtx;

export async function requireIdentity(ctx: ReadContext) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("Sign in to access your workspace.");
  }
  return identity;
}

export async function requireWorkspace(ctx: ReadContext, id: Id<"workspaces">) {
  const identity = await requireIdentity(ctx);
  const workspace = await ctx.db.get(id);
  if (!workspace || workspace.ownerId !== identity.tokenIdentifier) {
    throw new ConvexError("Workspace not found or access denied.");
  }
  const member = await ctx.db.query("members")
    .withIndex("by_workspace_and_user", (q) =>
      q.eq("workspaceId", id).eq("userId", identity.tokenIdentifier),
    )
    .unique();
  if (!member) {
    throw new ConvexError("Workspace not found or access denied.");
  }
  return { identity, workspace, member };
}

export async function requireProject(ctx: ReadContext, id: Id<"projects">) {
  await requireIdentity(ctx);
  const project = await ctx.db.get(id);
  if (!project) throw new ConvexError("Project not found or access denied.");
  const access = await requireWorkspace(ctx, project.workspaceId);
  return { ...access, project };
}

export async function requireTask(ctx: ReadContext, id: Id<"tasks">) {
  await requireIdentity(ctx);
  const task = await ctx.db.get(id);
  if (!task) throw new ConvexError("Task not found or access denied.");
  const access = await requireProject(ctx, task.projectId);
  if (task.workspaceId !== access.workspace._id) {
    throw new ConvexError("Task not found or access denied.");
  }
  return { ...access, task };
}

export async function requireAssignee(
  ctx: ReadContext,
  workspaceId: Id<"workspaces">,
  memberId: Id<"members"> | null,
) {
  if (memberId === null) return;
  const member = await ctx.db.get(memberId);
  if (!member || member.workspaceId !== workspaceId) {
    throw new ConvexError("Choose an assignee from this workspace.");
  }
}
