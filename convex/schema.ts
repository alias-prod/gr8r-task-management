import { v } from "convex/values";
import { defineEnt, defineEntSchema, getEntDefinitions } from "convex-ents";
import {
  activityFields,
  commentFields,
  memberFields,
  preferenceFields,
  projectFields,
  taskFields,
  workspaceFields,
} from "./model";

const schema = defineEntSchema({
  workspaces: defineEnt(workspaceFields)
    .index("by_owner", ["ownerId"])
    .index("by_owner_and_org", ["ownerId", "organizationId"])
    .index("by_organization", ["organizationId"])
    .edges("projects", { ref: "workspaceId" })
    .edges("members", { ref: "workspaceId" }),
  members: defineEnt(memberFields)
    .edge("workspace", { field: "workspaceId" })
    .index("by_workspace_and_user", ["workspaceId", "userId"]),
  projects: defineEnt(projectFields)
    .edge("workspace", { field: "workspaceId" })
    .index("by_workspace_and_archived", ["workspaceId", "archived"])
    .index("by_workspace_and_key", ["workspaceId", "key"])
    .index("by_lead", ["leadId"]),
  tasks: defineEnt(taskFields)
    .index("by_workspace_and_archived", ["workspaceId", "archived"])
    .index("by_project_and_archived", ["projectId", "archived"])
    .index("by_workspace_and_status", ["workspaceId", "status", "archived"])
    .index("by_assignee", ["assigneeId"]),
  comments: defineEnt(commentFields)
    .index("by_task", ["taskId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_author", ["authorId"]),
  activity: defineEnt(activityFields)
    .index("by_workspace", ["workspaceId"])
    .index("by_project", ["projectId"])
    .index("by_task", ["taskId"])
    .index("by_actor", ["actorId"]),
  voiceReservations: defineEnt({ userId: v.string(), workspaceId: v.id("workspaces"), windowStart: v.number(), lastRequestedAt: v.number(), count: v.number() })
    .index("by_scope", ["userId", "workspaceId"])
    .index("by_user_requested_at", ["userId", "lastRequestedAt"]),
  preferences: defineEnt(preferenceFields)
    .index("by_owner", ["ownerId"]),
});

export default schema;
export const entDefinitions = getEntDefinitions(schema);
