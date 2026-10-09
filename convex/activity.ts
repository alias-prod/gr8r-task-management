import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireWorkspace } from "./access";
import { activityDoc } from "./model";
import { pagination } from "./validation";

export const list = query({
  args: { workspaceId: v.id("workspaces"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(activityDoc),
  handler: async (ctx, args) => {
    await requireWorkspace(ctx, args.workspaceId);
    return await ctx.db.query("activity")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .paginate(pagination(args.paginationOpts));
  },
});
