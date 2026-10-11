import { v } from "convex/values";

export const taskStatus = v.union(
  v.literal("backlog"),
  v.literal("todo"),
  v.literal("progress"),
  v.literal("review"),
  v.literal("done"),
);

export const taskPriority = v.union(
  v.literal("urgent"),
  v.literal("high"),
  v.literal("medium"),
  v.literal("low"),
  v.literal("none"),
);

export const projectStatus = v.union(
  v.literal("planning"),
  v.literal("active"),
  v.literal("risk"),
  v.literal("hold"),
  v.literal("complete"),
);

export const color = v.union(
  v.literal("indigo"), v.literal("blue"), v.literal("violet"),
  v.literal("teal"), v.literal("rose"), v.literal("amber"),
  v.literal("green"), v.literal("slate"),
);

export const label = v.union(
  v.literal("design"), v.literal("frontend"), v.literal("backend"),
  v.literal("research"), v.literal("content"), v.literal("bug"),
  v.literal("qa"), v.literal("growth"),
);

export const workspaceFields = {
  organizationId: v.optional(v.string()),
  ownerId: v.string(),
  name: v.string(),
  color,
  createdAt: v.number(),
  updatedAt: v.number(),
};

export const memberFields = {
  workspaceId: v.id("workspaces"),
  userId: v.string(),
  authUserId: v.optional(v.string()),
  name: v.string(),
  email: v.string(),
  title: v.string(),
  timeZone: v.string(),
  role: v.union(v.literal("Owner"), v.literal("Admin"), v.literal("Member")),
  createdAt: v.number(),
};

export const projectFields = {
  workspaceId: v.id("workspaces"),
  key: v.string(),
  name: v.string(),
  description: v.string(),
  color,
  status: projectStatus,
  leadId: v.id("members"),
  start: v.union(v.string(), v.null()),
  due: v.union(v.string(), v.null()),
  favorite: v.boolean(),
  archived: v.boolean(),
  taskSequence: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
};

export const subtask = v.object({
  id: v.string(),
  title: v.string(),
  done: v.boolean(),
});

export const taskFields = {
  workspaceId: v.id("workspaces"),
  projectId: v.id("projects"),
  key: v.string(),
  title: v.string(),
  description: v.string(),
  status: taskStatus,
  priority: taskPriority,
  assigneeId: v.union(v.id("members"), v.null()),
  start: v.union(v.string(), v.null()),
  due: v.union(v.string(), v.null()),
  labels: v.array(label),
  subtasks: v.array(subtask),
  favorite: v.boolean(),
  archived: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
  completedAt: v.union(v.number(), v.null()),
};

export const commentFields = {
  workspaceId: v.id("workspaces"),
  taskId: v.id("tasks"),
  authorId: v.id("members"),
  text: v.string(),
  createdAt: v.number(),
};

export const activityFields = {
  workspaceId: v.id("workspaces"),
  actorId: v.id("members"),
  projectId: v.id("projects"),
  taskId: v.union(v.id("tasks"), v.null()),
  verb: v.union(
    v.literal("created project"), v.literal("created task"),
    v.literal("changed status"), v.literal("commented"),
    v.literal("archived project"), v.literal("restored project"),
  ),
  extra: v.string(),
  createdAt: v.number(),
};

export const preferenceFields = {
  ownerId: v.string(),
  theme: v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
  accent: color,
  sidebar: v.union(v.literal("comfortable"), v.literal("compact")),
  density: v.union(v.literal("comfortable"), v.literal("compact")),
};

export const workspaceDoc = v.object({
  _id: v.id("workspaces"), _creationTime: v.number(), ...workspaceFields,
});
export const memberDoc = v.object({
  _id: v.id("members"), _creationTime: v.number(), ...memberFields,
});
export const projectDoc = v.object({
  _id: v.id("projects"), _creationTime: v.number(), ...projectFields,
});
export const taskDoc = v.object({
  _id: v.id("tasks"), _creationTime: v.number(), ...taskFields,
});
export const commentDoc = v.object({
  _id: v.id("comments"), _creationTime: v.number(), ...commentFields,
});
export const activityDoc = v.object({
  _id: v.id("activity"), _creationTime: v.number(), ...activityFields,
});
export const preferenceDoc = v.object({
  _id: v.id("preferences"), _creationTime: v.number(), ...preferenceFields,
});
