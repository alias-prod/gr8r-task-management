import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireIdentity } from "./access";
import { preferenceDoc, preferenceFields } from "./model";

export const get = query({
  args: {},
  returns: v.union(preferenceDoc, v.null()),
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    return await ctx.db.query("preferences")
      .withIndex("by_owner", (q) => q.eq("ownerId", identity.tokenIdentifier))
      .unique();
  },
});

export const set = mutation({
  args: {
    theme: preferenceFields.theme,
    accent: preferenceFields.accent,
    sidebar: preferenceFields.sidebar,
    density: preferenceFields.density,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const existing = await ctx.db.query("preferences")
      .withIndex("by_owner", (q) => q.eq("ownerId", identity.tokenIdentifier))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("preferences", { ...args, ownerId: identity.tokenIdentifier });
    }
    return null;
  },
});
