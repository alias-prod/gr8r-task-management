import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, components } from "../convex/_generated/api";
import { addOrganizationMember, authActor, changeOrganizationRole, configureAuthTestEnvironment, createOrganization, expireSession, removeOrganizationMember, revokeSession, sessionForAuthUser, testDatabase } from "./helpers/auth-fixture";

beforeEach(configureAuthTestEnvironment);
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const paginationOpts = { cursor: null, numItems: 25 };
async function fixture() {
  const database = testDatabase();
  const owner = await authActor(database, "org-owner");
  const admin = await authActor(database, "org-admin");
  const member = await authActor(database, "org-member");
  const outsider = await authActor(database, "org-outsider");
  const organization = await createOrganization(database, "alpha");
  const otherOrganization = await createOrganization(database, "beta");
  const ownerMembership = await addOrganizationMember(database, organization._id, owner.user._id, "owner");
  const adminMembership = await addOrganizationMember(database, organization._id, admin.user._id, "admin");
  const memberMembership = await addOrganizationMember(database, organization._id, member.user._id, "member");
  await addOrganizationMember(database, otherOrganization._id, outsider.user._id, "owner");
  const workspaceId = await owner.actor.mutation(api.workspaces.create, { organizationId: organization._id, name: "Alpha shared", profileName: owner.user.name });
  const projectId = await owner.actor.mutation(api.projects.create, { workspaceId, name: "Organization project", key: "ORG" });
  const taskId = await owner.actor.mutation(api.tasks.create, { projectId, title: "Shared task", status: "todo", priority: "medium", assigneeId: null, labels: [] });
  return { database, owner, admin, member, outsider, organization, otherOrganization, workspaceId, projectId, taskId, ownerMembership, adminMembership, memberMembership };
}

describe("authoritative organization workspace access", () => {
  it("allows organization owners and admins to create shared workspaces", async () => {
    const { owner, admin, organization, workspaceId } = await fixture();
    const adminWorkspace = await admin.actor.mutation(api.workspaces.create, { organizationId: organization._id, name: "Admin shared", profileName: admin.user.name });
    expect((await owner.actor.query(api.workspaces.getAccess, { workspaceId: adminWorkspace })).role).toBe("owner");
    expect((await admin.actor.query(api.workspaces.getAccess, { workspaceId })).role).toBe("admin");
    expect((await admin.actor.query(api.workspaces.list, { organizationId: organization._id })).map((row) => row._id)).toEqual(expect.arrayContaining([workspaceId, adminWorkspace]));
    await admin.actor.mutation(api.workspaces.syncMembership, { workspaceId });
    await admin.actor.mutation(api.workspaces.update, { workspaceId, name: "Renamed by admin", color: "blue" });
    expect((await owner.actor.query(api.workspaces.current, { workspaceId }))?.workspace.name).toBe("Renamed by admin");
  });
  it("allows members to read and write tasks after materializing their workspace membership", async () => {
    const { member, workspaceId, projectId, taskId } = await fixture();
    expect((await member.actor.query(api.workspaces.getAccess, { workspaceId })).role).toBe("member");
    await expect(member.actor.query(api.projects.get, { projectId })).rejects.toThrow("Open this workspace");
    await member.actor.mutation(api.workspaces.syncMembership, { workspaceId });
    expect((await member.actor.query(api.workspaces.current, { workspaceId }))?.member.role).toBe("Member");
    expect((await member.actor.query(api.projects.get, { projectId })).workspaceId).toBe(workspaceId);
    await member.actor.mutation(api.tasks.setStatus, { taskId, status: "progress" });
    await member.actor.mutation(api.tasks.create, { projectId, title: "Member-created task", status: "todo", priority: "none", assigneeId: null, labels: [] });
    expect((await member.actor.query(api.tasks.get, { taskId })).status).toBe("progress");
  });
  it("does not let an ordinary member create or rename organization workspaces", async () => {
    const { member, organization, workspaceId } = await fixture();
    await member.actor.mutation(api.workspaces.syncMembership, { workspaceId });
    await expect(member.actor.mutation(api.workspaces.create, { organizationId: organization._id, name: "Denied", profileName: member.user.name })).rejects.toThrow("owner or admin");
    await expect(member.actor.mutation(api.workspaces.update, { workspaceId, name: "Denied rename", color: "teal" })).rejects.toThrow("owner or admin");
  });
  it("rejects an outsider who owns another organization, even with known IDs", async () => {
    const { outsider, organization, workspaceId, projectId, taskId } = await fixture();
    await expect(outsider.actor.query(api.workspaces.list, { organizationId: organization._id })).rejects.toThrow("access denied");
    await expect(outsider.actor.query(api.workspaces.getAccess, { workspaceId })).rejects.toThrow("access denied");
    await expect(outsider.actor.mutation(api.workspaces.syncMembership, { workspaceId })).rejects.toThrow("access denied");
    await expect(outsider.actor.query(api.projects.get, { projectId })).rejects.toThrow("access denied");
    await expect(outsider.actor.query(api.tasks.list, { workspaceId, paginationOpts })).rejects.toThrow("access denied");
    await expect(outsider.actor.mutation(api.tasks.setStatus, { taskId, status: "done" })).rejects.toThrow("access denied");
    await expect(outsider.actor.mutation(api.workspaces.create, { organizationId: organization._id, name: "Wrong tenant", profileName: "Outsider" })).rejects.toThrow("access denied");
  });
  it("immediately denies a removed member despite a persisted workspace-member mirror", async () => {
    const { database, owner, member, memberMembership, workspaceId, projectId, taskId } = await fixture();
    await member.actor.mutation(api.workspaces.syncMembership, { workspaceId });
    await removeOrganizationMember(database, memberMembership._id);
    const mirror = await database.run((ctx) => ctx.db.query("members").withIndex("by_workspace_and_user", (q) => q.eq("workspaceId", workspaceId).eq("userId", `https://auth.example.test|${member.user._id}`)).unique());
    expect(mirror).not.toBeNull();
    expect((await owner.actor.query(api.workspaces.members,{workspaceId})).some(person=>person.authUserId===member.user._id)).toBe(false);
    await expect(owner.actor.mutation(api.tasks.create,{projectId,title:"Inactive assignee",status:"todo",priority:"none",assigneeId:mirror!._id,labels:[]})).rejects.toThrow("active organization member");
    await expect(member.actor.query(api.workspaces.getAccess, { workspaceId })).rejects.toThrow("access denied");
    await expect(member.actor.query(api.tasks.get, { taskId })).rejects.toThrow("access denied");
    await expect(member.actor.mutation(api.tasks.setStatus, { taskId, status: "done" })).rejects.toThrow("access denied");
    await expect(member.actor.mutation(api.workspaces.reserveVoiceSession, { workspaceId })).rejects.toThrow("access denied");
  });
  it("honors a role downgrade without trusting the stale Admin mirror", async () => {
    const { database, admin, adminMembership, organization, workspaceId, taskId } = await fixture();
    await admin.actor.mutation(api.workspaces.syncMembership, { workspaceId });
    await changeOrganizationRole(database, adminMembership._id, "member");
    const mirror = await database.run((ctx) => ctx.db.query("members").withIndex("by_workspace_and_user", (q) => q.eq("workspaceId", workspaceId).eq("userId", `https://auth.example.test|${admin.user._id}`)).unique());
    expect(mirror?.role).toBe("Admin");
    expect((await admin.actor.query(api.workspaces.members,{workspaceId})).find(person=>person.authUserId===admin.user._id)?.role).toBe("Member");
    expect((await admin.actor.query(api.workspaces.getAccess, { workspaceId })).role).toBe("member");
    await expect(admin.actor.mutation(api.workspaces.update, { workspaceId, name: "No longer admin", color: "rose" })).rejects.toThrow("owner or admin");
    await expect(admin.actor.mutation(api.workspaces.create, { organizationId: organization._id, name: "No longer admin", profileName: "Admin" })).rejects.toThrow("owner or admin");
    await admin.actor.mutation(api.tasks.setStatus, { taskId, status: "review" });
    expect((await admin.actor.query(api.tasks.get, { taskId })).status).toBe("review");
    await admin.actor.mutation(api.workspaces.syncMembership, { workspaceId });
    expect((await admin.actor.query(api.workspaces.current, { workspaceId }))?.member.role).toBe("Member");
  });
  it.each(["expire", "revoke"])("rejects retained identities after the DB session is %sd", async (mode) => {
    const { database, owner, workspaceId, projectId, taskId } = await fixture();
    const privateId = await owner.actor.mutation(api.workspaces.create, { name: "Session-protected private", profileName: owner.user.name });
    if (mode === "expire") await expireSession(database, owner.session._id); else await revokeSession(database, owner.session._id);
    await expect(owner.actor.query(api.workspaces.getAccess, { workspaceId })).rejects.toThrow("Sign in");
    await expect(owner.actor.query(api.workspaces.getAccess, { workspaceId: privateId })).rejects.toThrow("Sign in");
    await expect(owner.actor.query(api.workspaces.list, {})).rejects.toThrow("Sign in");
    await expect(owner.actor.query(api.projects.get, { projectId })).rejects.toThrow("Sign in");
    await expect(owner.actor.mutation(api.tasks.setStatus, { taskId, status: "done" })).rejects.toThrow("Sign in");
    await expect(owner.actor.mutation(api.workspaces.reserveVoiceSession, { workspaceId })).rejects.toThrow("Sign in");
  });
  it("rejects access when the organization is deleted but its member row remains", async () => {
    const { database, member, organization, workspaceId } = await fixture();
    await member.actor.mutation(api.workspaces.syncMembership, { workspaceId });
    await database.run((ctx) => ctx.runMutation(components.betterAuth.adapter.deleteOne, { input: { model: "organization", where: [{ field: "_id", value: organization._id }] } }));
    await expect(member.actor.query(api.workspaces.getAccess, { workspaceId })).rejects.toThrow("access denied");
  });
  it("retains private-workspace isolation and keeps private lists free of organization spaces", async () => {
    const { owner, admin, member, workspaceId } = await fixture();
    const privateId = await owner.actor.mutation(api.workspaces.create, { name: "Legacy private", profileName: owner.user.name });
    expect((await owner.actor.query(api.workspaces.list, {})).map((row) => row._id)).toEqual([privateId]);
    expect((await owner.actor.query(api.workspaces.current, {}))?.workspace._id).toBe(privateId);
    expect((await owner.actor.query(api.workspaces.getAccess, { workspaceId })).organizationId).not.toBeNull();
    await expect(admin.actor.query(api.workspaces.getAccess, { workspaceId: privateId })).rejects.toThrow("access denied");
    await expect(member.actor.query(api.workspaces.current, { workspaceId: privateId })).rejects.toThrow("access denied");
  });
});

describe("persisted LiveKit voice admission limits without provider calls", () => {
  it("persists the 30-second cooldown across fresh sessions for the same user", async () => {
    const { database, owner, workspaceId } = await fixture();
    await owner.actor.mutation(api.workspaces.reserveVoiceSession, { workspaceId });
    const freshSession = await sessionForAuthUser(database, owner.user, "refreshed-owner");
    await expect(freshSession.actor.mutation(api.workspaces.reserveVoiceSession, { workspaceId })).rejects.toThrow("Wait 30 seconds");
    const rows = await database.run((ctx) => ctx.db.query("voiceReservations").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: owner.user._id, workspaceId, count: 1 });
  });
  it("allows a new admission at exactly 30 seconds, not one millisecond earlier", async () => {
    const { owner, workspaceId } = await fixture();
    const base = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(base);
    await owner.actor.mutation(api.workspaces.reserveVoiceSession, { workspaceId });
    clock.mockReturnValue(base + 29_999);
    await expect(owner.actor.mutation(api.workspaces.reserveVoiceSession, { workspaceId })).rejects.toThrow("Wait 30 seconds");
    clock.mockReturnValue(base + 30_000);
    await expect(owner.actor.mutation(api.workspaces.reserveVoiceSession, { workspaceId })).resolves.toBeNull();
  });
  it("admits no more than six requests per hour and resets after the hour", async () => {
    const { database, owner, workspaceId } = await fixture();
    for (let index = 0; index < 6; index++) {
      if (index > 0) await database.run(async (ctx) => { const row = await ctx.db.query("voiceReservations").unique(); if (!row) throw new Error("Missing reservation"); await ctx.db.patch(row._id, { lastRequestedAt: Date.now() - 30_001 }); });
      await owner.actor.mutation(api.workspaces.reserveVoiceSession, { workspaceId });
    }
    await database.run(async (ctx) => { const row = await ctx.db.query("voiceReservations").unique(); if (!row) throw new Error("Missing reservation"); await ctx.db.patch(row._id, { lastRequestedAt: Date.now() - 30_001 }); });
    await expect(owner.actor.mutation(api.workspaces.reserveVoiceSession, { workspaceId })).rejects.toThrow("next hour");
    expect((await database.run((ctx) => ctx.db.query("voiceReservations").unique()))?.count).toBe(6);
    await database.run(async (ctx) => { const row = await ctx.db.query("voiceReservations").unique(); if (!row) throw new Error("Missing reservation"); await ctx.db.patch(row._id, { windowStart: Date.now() - 3_600_001, lastRequestedAt: Date.now() - 30_001 }); });
    await owner.actor.mutation(api.workspaces.reserveVoiceSession, { workspaceId });
    expect((await database.run((ctx) => ctx.db.query("voiceReservations").unique()))?.count).toBe(1);
  });
  it("scopes persisted limits by authenticated user and workspace", async () => {
    const { database, owner, member, workspaceId, organization } = await fixture();
    await owner.actor.mutation(api.workspaces.reserveVoiceSession, { workspaceId });
    await member.actor.mutation(api.workspaces.reserveVoiceSession, { workspaceId });
    const secondWorkspace = await owner.actor.mutation(api.workspaces.create, { organizationId: organization._id, name: "Second shared", profileName: owner.user.name });
    await owner.actor.mutation(api.workspaces.reserveVoiceSession, { workspaceId: secondWorkspace });
    expect(await database.run((ctx) => ctx.db.query("voiceReservations").collect())).toHaveLength(3);
  });
  it("prevents bypassing the aggregate voice budget by switching workspaces", async () => {
    const {database,owner,member,workspaceId,organization}=await fixture();
    for(let index=0;index<6;index++){
      if(index>0)await database.run(async ctx=>{const row=await ctx.db.query("voiceReservations").unique();if(!row)throw new Error("Missing reservation");await ctx.db.patch(row._id,{lastRequestedAt:Date.now()-30_001});});
      await owner.actor.mutation(api.workspaces.reserveVoiceSession,{workspaceId});
    }
    const second=await owner.actor.mutation(api.workspaces.create,{organizationId:organization._id,name:"Budget scope",profileName:owner.user.name});
    await expect(owner.actor.mutation(api.workspaces.reserveVoiceSession,{workspaceId:second})).rejects.toThrow("next hour");
    await expect(member.actor.mutation(api.workspaces.reserveVoiceSession,{workspaceId})).resolves.toBeNull();
  });
});
