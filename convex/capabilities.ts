import { v } from "convex/values";
import { query } from "./_generated/server";
import { emailConfiguration } from "./email";
import { getOrganizationMembership } from "./auth";
export const publicStatus = query({args:{},returns:v.object({emailEnabled:v.boolean(),passwordSignupEnabled:v.boolean(),organizationInvitationsEnabled:v.boolean()}),handler:async()=>{const ready=emailConfiguration().ready;return {emailEnabled:ready,passwordSignupEnabled:ready,organizationInvitationsEnabled:ready};}});
export const organizationRole = query({args:{organizationId:v.string()},returns:v.union(v.literal("owner"),v.literal("admin"),v.literal("member"),v.null()),handler:async(ctx,args)=>(await getOrganizationMembership(ctx,args.organizationId))?.role??null});
