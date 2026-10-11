import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { filterProjectRecords, requireWorkspace } from "./access";
import { activityDoc } from "./model";
import { pagination } from "./validation";

export const list = query({
  args: { workspaceId: v.id("workspaces"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(activityDoc),
  handler: async (ctx, args) => {
    const access = await requireWorkspace(ctx, args.workspaceId);
    const result = await ctx.db.query("activity")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .paginate(pagination(args.paginationOpts));
    return { ...result, page: await filterProjectRecords(ctx, result.page, access) };
  },
});
