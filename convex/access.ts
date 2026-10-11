import { ConvexError } from "convex/values";
import { entsTableFactory } from "convex-ents";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { authComponent, createAuthOptions, getOrganizationMembership, normalizeOrganizationRole } from "./auth";
import { entDefinitions } from "./schema";

type ReadContext = QueryCtx | MutationCtx;
export type WorkspaceRole = "owner" | "admin" | "member";

export async function requireIdentity(ctx: ReadContext) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Sign in to access your workspace.");
  // A retained Convex JWT alone must not outlive a revoked/expired DB session.
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user) throw new ConvexError("Sign in to access your workspace.");
  return { ...identity, userId: user._id, name: user.name, email: user.email };
}

export async function getWorkspaceAccess(ctx: ReadContext, id: Id<"workspaces">) {
  const identity = await requireIdentity(ctx);
  const workspace = await entsTableFactory(ctx as QueryCtx, entDefinitions)("workspaces").get(id).doc();
  if (!workspace) throw new ConvexError("Workspace not found or access denied.");
  let role: WorkspaceRole = "owner";
  if (workspace.organizationId) {
    const membership = await getOrganizationMembership(ctx, workspace.organizationId);
    if (!membership) throw new ConvexError("Workspace not found or access denied.");
    role = membership.role;
  } else if (workspace.ownerId !== identity.tokenIdentifier) {
    throw new ConvexError("Workspace not found or access denied.");
  }
  return { identity, workspace, role };
}

export async function requireWorkspace(ctx: ReadContext, id: Id<"workspaces">) {
  const access = await getWorkspaceAccess(ctx, id);
  const member = await ctx.db.query("members")
    .withIndex("by_workspace_and_user", q => q.eq("workspaceId", id).eq("userId", access.identity.tokenIdentifier)).unique();
  if (!member) throw new ConvexError("Open this workspace before changing its records.");
  return { ...access, member };
}

export function requireWorkspaceAdmin(role: WorkspaceRole) {
  if (role !== "owner" && role !== "admin") throw new ConvexError("An organization owner or admin is required.");
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
  const workspace=await ctx.db.get(workspaceId);
  if(workspace?.organizationId){
    const actual=member.authUserId?await authComponent.adapter(ctx)(createAuthOptions(ctx)).findOne<{role:string}>({model:"member",where:[{field:"organizationId",value:workspace.organizationId},{field:"userId",value:member.authUserId}]}):null;
    if(!actual||!normalizeOrganizationRole(actual.role))throw new ConvexError("Choose an active organization member.");
  }
}
