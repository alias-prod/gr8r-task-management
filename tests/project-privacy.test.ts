import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../convex/_generated/api";
import { addOrganizationMember, authActor, configureAuthTestEnvironment, createOrganization, removeOrganizationMember, testDatabase } from "./helpers/auth-fixture";

beforeEach(configureAuthTestEnvironment);
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const paginationOpts = { cursor: null, numItems: 25 };
async function fixture() {
  const database = testDatabase();
  const owner = await authActor(database, "privacy-owner");
  const peer = await authActor(database, "privacy-peer");
  const admin = await authActor(database, "privacy-admin");
  const outsider = await authActor(database, "privacy-outsider");
  const org = await createOrganization(database, "privacy");
  await addOrganizationMember(database, org._id, owner.user._id, "owner");
  const peerMembership = await addOrganizationMember(database, org._id, peer.user._id, "member");
  await addOrganizationMember(database, org._id, admin.user._id, "admin");
  const workspaceId = await owner.actor.mutation(api.workspaces.create, { organizationId: org._id, name: "Privacy workspace", profileName: owner.user.name });
  await peer.actor.mutation(api.workspaces.syncMembership, { workspaceId });
  await admin.actor.mutation(api.workspaces.syncMembership, { workspaceId });
  const peerId = (await peer.actor.query(api.workspaces.current, { workspaceId }))!.member._id;
  const privateId = await owner.actor.mutation(api.projects.create, { workspaceId, name: "Private", key: "PRV" });
  const publicId = await owner.actor.mutation(api.projects.create, { workspaceId, name: "Shared", key: "PUB", private: false });
  const taskId = await owner.actor.mutation(api.tasks.create, { projectId: privateId, title: "Private task", status: "todo", priority: "none", assigneeId: null, labels: [] });
  return { database, owner, peer, admin, outsider, peerMembership, workspaceId, peerId, privateId, publicId, taskId };
}

describe("server project privacy", () => {
  it("persists private defaults and allows only its lead without grants", async () => {
    const f = await fixture();
    const project = await f.owner.actor.query(api.projects.get, { projectId: f.privateId });
    expect(project.private).toBe(true);
    expect(project.memberIds).toContain(project.leadId);
    for (const actor of [f.peer.actor, f.admin.actor, f.outsider.actor]) await expect(actor.query(api.projects.get, { projectId: f.privateId })).rejects.toThrow("access denied");
  });
  it("denies known-ID private tasks, mutations and comments", async () => {
    const f = await fixture();
    await expect(f.peer.actor.query(api.tasks.get, { taskId: f.taskId })).rejects.toThrow("access denied");
    await expect(f.peer.actor.mutation(api.tasks.setStatus, { taskId: f.taskId, status: "done" })).rejects.toThrow("access denied");
    await expect(f.peer.actor.query(api.comments.list, { taskId: f.taskId, paginationOpts })).rejects.toThrow("access denied");
    await expect(f.peer.actor.mutation(api.comments.create, { taskId: f.taskId, text: "Denied" })).rejects.toThrow("access denied");
    await expect(f.peer.actor.query(api.tasks.list, { workspaceId: f.workspaceId, projectId: f.privateId, paginationOpts })).rejects.toThrow("access denied");
  });
  it("filters projects, workspace tasks and activity before returning data", async () => {
    const f = await fixture();
    const publicTask = await f.owner.actor.mutation(api.tasks.create, { projectId: f.publicId, title: "Shared task", status: "todo", priority: "none", assigneeId: null, labels: [] });
    expect((await f.peer.actor.query(api.projects.list, { workspaceId: f.workspaceId, paginationOpts })).page.map(p => p._id)).toEqual([f.publicId]);
    expect((await f.peer.actor.query(api.tasks.list, { workspaceId: f.workspaceId, paginationOpts })).page.map(t => t._id)).toEqual([publicTask]);
    expect((await f.peer.actor.query(api.activity.list, { workspaceId: f.workspaceId, paginationOpts })).page.every(a => a.projectId === f.publicId)).toBe(true);
  });
  it("allows shared-project collaboration without private-project grants", async () => {
    const f = await fixture();
    await f.peer.actor.mutation(api.projects.setStatus, { projectId: f.publicId, status: "active" });
    const task = await f.peer.actor.mutation(api.tasks.create, { projectId: f.publicId, title: "Collaborate", status: "todo", priority: "none", assigneeId: f.peerId, labels: [] });
    expect((await f.owner.actor.query(api.tasks.get, { taskId: task })).title).toBe("Collaborate");
    await expect(f.peer.actor.mutation(api.projects.setAccess, { projectId: f.publicId, private: false, memberIds: [f.peerId] })).rejects.toThrow("Only the project lead");
  });
  it("grants and revokes private project access immediately", async () => {
    const f = await fixture();
    await f.owner.actor.mutation(api.projects.setAccess, { projectId: f.privateId, private: true, memberIds: [f.peerId] });
    expect((await f.peer.actor.query(api.tasks.get, { taskId: f.taskId }))._id).toBe(f.taskId);
    await expect(f.peer.actor.mutation(api.projects.setAccess, { projectId: f.privateId, private: false, memberIds: [] })).rejects.toThrow("Only the project lead");
    await f.owner.actor.mutation(api.projects.setAccess, { projectId: f.privateId, private: true, memberIds: [] });
    await expect(f.peer.actor.query(api.tasks.get, { taskId: f.taskId })).rejects.toThrow("access denied");
    expect((await f.peer.actor.query(api.tasks.list, { workspaceId: f.workspaceId, paginationOpts })).page).toEqual([]);
  });
  it("rejects foreign-workspace and inactive project member grants", async () => {
    const f = await fixture();
    const other = await f.outsider.actor.mutation(api.workspaces.create, { name: "Other private", profileName: f.outsider.user.name });
    const foreign = (await f.outsider.actor.query(api.workspaces.current, { workspaceId: other }))!.member._id;
    await expect(f.owner.actor.mutation(api.projects.setAccess, { projectId: f.privateId, private: true, memberIds: [foreign] })).rejects.toThrow("this workspace");
    await removeOrganizationMember(f.database, f.peerMembership._id);
    await expect(f.owner.actor.mutation(api.projects.setAccess, { projectId: f.privateId, private: true, memberIds: [f.peerId] })).rejects.toThrow("active organization member");
  });
  it("does not let a removed organization member use persisted project grants", async () => {
    const f = await fixture();
    await f.owner.actor.mutation(api.projects.setAccess, { projectId: f.privateId, private: true, memberIds: [f.peerId] });
    await removeOrganizationMember(f.database, f.peerMembership._id);
    await expect(f.peer.actor.query(api.projects.get, { projectId: f.privateId })).rejects.toThrow("access denied");
  });
  it("does not assign private tasks to members without project access", async () => {
    const f = await fixture();
    const input = { projectId: f.privateId, title: "Assignment", status: "todo" as const, priority: "none" as const, assigneeId: f.peerId, labels: [] };
    await expect(f.owner.actor.mutation(api.tasks.create, input)).rejects.toThrow("project member");
    await f.owner.actor.mutation(api.projects.setAccess, { projectId: f.privateId, private: true, memberIds: [f.peerId] });
    await expect(f.owner.actor.mutation(api.tasks.create, input)).resolves.toBeDefined();
  });
  it("treats legacy projects with no privacy fields as private", async () => {
    const f = await fixture();
    await f.database.run(ctx => ctx.db.patch(f.privateId, { private: undefined, memberIds: undefined }));
    await expect(f.peer.actor.query(api.projects.get, { projectId: f.privateId })).rejects.toThrow("access denied");
    expect((await f.owner.actor.query(api.projects.get, { projectId: f.privateId }))._id).toBe(f.privateId);
  });
  it("keeps pagination cursors usable when a page contains only hidden records", async () => {
    const f = await fixture();
    await f.owner.actor.mutation(api.projects.create, { workspaceId: f.workspaceId, name: "Newest hidden", key: "HID" });
    const first = await f.peer.actor.query(api.projects.list, { workspaceId: f.workspaceId, paginationOpts: { cursor: null, numItems: 1 } });
    expect(first.page).toEqual([]);
    expect(first.isDone).toBe(false);
    const second = await f.peer.actor.query(api.projects.list, { workspaceId: f.workspaceId, paginationOpts: { cursor: first.continueCursor, numItems: 1 } });
    expect(second.page.map(p => p._id)).toEqual([f.publicId]);
  });
});
