import type { Doc } from "../../convex/_generated/dataModel";
import type { WorkspaceData } from "@/types/workspace";

export function workspaceData(
  workspace: Doc<"workspaces">,
  member: Doc<"members">,
  projects: Doc<"projects">[],
  tasks: Doc<"tasks">[],
  activity: Doc<"activity">[],
  members: Doc<"members">[] = [member],
): WorkspaceData {
  return {
    ws: { name: workspace.name, url: workspace._id, color: workspace.color, brand: true },
    me: member._id,
    members: members.map(person => ({ id: person._id, name: person.name, email: person.email, title: person.title, role: person.role, team: "", color: workspace.color, status: "active" as const, last: person.createdAt, tz: person.timeZone })),
    teams: [],
    projects: projects.map((project) => ({
      id: project._id, key: project.key, name: project.name, icon: "folder-kanban", color: project.color, status: project.status, team: "", lead: project.leadId, due: project.due ?? "", start: project.start ?? "", fav: project.favorite, members: [...new Set([project.leadId, ...(project.memberIds ?? [])])], desc: project.description, milestones: [], last: project.updatedAt, private: project.private ?? true, archived: project.archived,
    })),
    tasks: tasks.map((task, index) => ({
      id: task._id, key: task.key, project: task.projectId, title: task.title, status: task.status, assignee: task.assigneeId, priority: task.priority, due: task.due, start: task.start, labels: task.labels, subtasks: task.subtasks, attachments: [], deps: [], desc: task.description, estimate: null, created: task.createdAt, updated: task.updatedAt, order: index, fav: task.favorite, recur: null, completedAt: task.completedAt ?? undefined, archived: task.archived,
    })),
    comments: [],
    activity: activity.map((item) => ({ id: item._id, by: item.actorId, verb: item.verb, task: item.taskId, project: item.projectId, at: item.createdAt, extra: item.extra })),
    notifs: [], files: [], events: [], projOrder: projects.map((project) => project._id),
  };
}
