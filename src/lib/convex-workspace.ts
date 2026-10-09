import type { Doc } from "../../convex/_generated/dataModel";
import type { WorkspaceData } from "@/types/workspace";

export function workspaceData(
  workspace: Doc<"workspaces">,
  member: Doc<"members">,
  projects: Doc<"projects">[],
  tasks: Doc<"tasks">[],
  activity: Doc<"activity">[],
): WorkspaceData {
  return {
    ws: { name: workspace.name, url: workspace._id, color: workspace.color, brand: true },
    me: member._id,
    members: [{ id: member._id, name: member.name, email: member.email, title: member.title, role: member.role, team: "", color: workspace.color, status: "active", last: member.createdAt, tz: member.timeZone }],
    teams: [],
    projects: projects.map((project) => ({
      id: project._id, key: project.key, name: project.name, icon: "folder-kanban", color: project.color, status: project.status, team: "", lead: project.leadId, due: project.due ?? "", start: project.start ?? "", fav: project.favorite, members: [project.leadId], desc: project.description, milestones: [], last: project.updatedAt, private: true, archived: project.archived,
    })),
    tasks: tasks.map((task, index) => ({
      id: task._id, key: task.key, project: task.projectId, title: task.title, status: task.status, assignee: task.assigneeId, priority: task.priority, due: task.due, start: task.start, labels: task.labels, subtasks: task.subtasks, attachments: [], deps: [], desc: task.description, estimate: null, created: task.createdAt, updated: task.updatedAt, order: index, fav: task.favorite, recur: null, completedAt: task.completedAt ?? undefined, archived: task.archived,
    })),
    comments: [],
    activity: activity.map((item) => ({ id: item._id, by: item.actorId, verb: item.verb, task: item.taskId, project: item.projectId, at: item.createdAt, extra: item.extra })),
    notifs: [], files: [], events: [], projOrder: projects.map((project) => project._id),
  };
}
