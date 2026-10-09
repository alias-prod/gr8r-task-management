import { defineSchema, defineTable } from "convex/server";
import {
  activityFields,
  commentFields,
  memberFields,
  preferenceFields,
  projectFields,
  taskFields,
  workspaceFields,
} from "./model";

export default defineSchema({
  workspaces: defineTable(workspaceFields)
    .index("by_owner", ["ownerId"]),
  members: defineTable(memberFields)
    .index("by_workspace_and_user", ["workspaceId", "userId"]),
  projects: defineTable(projectFields)
    .index("by_workspace_and_archived", ["workspaceId", "archived"])
    .index("by_workspace_and_key", ["workspaceId", "key"])
    .index("by_lead", ["leadId"]),
  tasks: defineTable(taskFields)
    .index("by_workspace_and_archived", ["workspaceId", "archived"])
    .index("by_project_and_archived", ["projectId", "archived"])
    .index("by_workspace_and_status", ["workspaceId", "status", "archived"])
    .index("by_assignee", ["assigneeId"]),
  comments: defineTable(commentFields)
    .index("by_task", ["taskId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_author", ["authorId"]),
  activity: defineTable(activityFields)
    .index("by_workspace", ["workspaceId"])
    .index("by_project", ["projectId"])
    .index("by_task", ["taskId"])
    .index("by_actor", ["actorId"]),
  preferences: defineTable(preferenceFields)
    .index("by_owner", ["ownerId"]),
});
