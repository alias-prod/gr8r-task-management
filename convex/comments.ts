import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireTask } from "./access";
import { commentDoc } from "./model";
import { pagination, text } from "./validation";

export const list = query({
  args: { taskId: v.id("tasks"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(commentDoc),
  handler: async (ctx, args) => {
    await requireTask(ctx, args.taskId);
    return await ctx.db.query("comments")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("desc")
      .paginate(pagination(args.paginationOpts));
  },
});

export const create = mutation({
  args: { taskId: v.id("tasks"), text: v.string() },
  returns: v.id("comments"),
  handler: async (ctx, args) => {
    const { task, member } = await requireTask(ctx, args.taskId);
    const now = Date.now();
    const commentId = await ctx.db.insert("comments", {
      workspaceId: task.workspaceId,
      taskId: task._id,
      authorId: member._id,
      text: text(args.text, "Comment", 5000),
      createdAt: now,
    });
    await ctx.db.patch(task._id, { updatedAt: now });
    await ctx.db.insert("activity", {
      workspaceId: task.workspaceId,
      actorId: member._id,
      projectId: task.projectId,
      taskId: task._id,
      verb: "commented",
      extra: "",
      createdAt: now,
    });
    return commentId;
  },
});
