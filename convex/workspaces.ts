import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getWorkspaceAccess, requireIdentity, requireWorkspace, requireWorkspaceAdmin } from "./access";
import { authComponent, createAuthOptions, getOrganizationMembership, normalizeOrganizationRole } from "./auth";
import { color, memberDoc, workspaceDoc } from "./model";
import { text } from "./validation";

const role = v.union(v.literal("owner"), v.literal("admin"), v.literal("member"));
const displayRole = (value: "owner" | "admin" | "member") => value === "owner" ? "Owner" as const : value === "admin" ? "Admin" as const : "Member" as const;

export const list = query({
  args: { organizationId: v.optional(v.string()) }, returns: v.array(workspaceDoc),
  handler: async (ctx,args) => {
    const identity = await requireIdentity(ctx);
    if (args.organizationId) {
      if (!await getOrganizationMembership(ctx,args.organizationId)) throw new ConvexError("Organization not found or access denied.");
      return await ctx.db.query("workspaces").withIndex("by_organization", q => q.eq("organizationId", args.organizationId)).take(100);
    }
    return await ctx.db.query("workspaces").withIndex("by_owner_and_org",q => q.eq("ownerId",identity.tokenIdentifier).eq("organizationId",undefined)).take(100);
  },
});

export const current = query({
  args: { workspaceId: v.optional(v.id("workspaces")) },
  returns: v.union(v.object({ workspace: workspaceDoc, member: memberDoc, role }),v.null()),
  handler: async(ctx,args) => {
    const identity = await requireIdentity(ctx);
    const workspace = args.workspaceId ? await ctx.db.get(args.workspaceId) : await ctx.db.query("workspaces").withIndex("by_owner_and_org", q => q.eq("ownerId",identity.tokenIdentifier).eq("organizationId",undefined)).first();
    if (!workspace) return null;
    const access = await requireWorkspace(ctx,workspace._id);
    return { workspace:access.workspace, member:{...access.member,role:displayRole(access.role)}, role:access.role };
  },
});

export const getAccess = query({
  args:{workspaceId:v.id("workspaces")},returns:v.object({workspaceId:v.id("workspaces"),organizationId:v.union(v.string(),v.null()),role}),
  handler:async(ctx,args)=>{const access=await getWorkspaceAccess(ctx,args.workspaceId);return {workspaceId:access.workspace._id,organizationId:access.workspace.organizationId??null,role:access.role};},
});

export const syncMembership = mutation({
  args:{workspaceId:v.id("workspaces")},returns:v.null(),
  handler:async(ctx,args)=>{
    const access=await getWorkspaceAccess(ctx,args.workspaceId);
    const existing=await ctx.db.query("members").withIndex("by_workspace_and_user",q=>q.eq("workspaceId",args.workspaceId).eq("userId",access.identity.tokenIdentifier)).unique();
    if(existing) await ctx.db.patch(existing._id,{role:displayRole(access.role),authUserId:access.identity.userId});
    else await ctx.db.insert("members",{workspaceId:args.workspaceId,userId:access.identity.tokenIdentifier,authUserId:access.identity.userId,name:access.identity.name??"Member",email:access.identity.email??"",title:"",timeZone:"UTC",role:displayRole(access.role),createdAt:Date.now()});
    return null;
  },
});

export const members = query({
  args:{workspaceId:v.id("workspaces")},returns:v.array(memberDoc),
  handler:async(ctx,args)=>{
    const access=await getWorkspaceAccess(ctx,args.workspaceId);
    const rows=await ctx.db.query("members").withIndex("workspaceId",q=>q.eq("workspaceId",args.workspaceId)).take(100);
    if(!access.workspace.organizationId)return rows;
    const authoritative=await authComponent.adapter(ctx)(createAuthOptions(ctx)).findMany<{userId:string;role:string}>({model:"member",where:[{field:"organizationId",value:access.workspace.organizationId}],limit:101});
    if(authoritative.length>100)throw new ConvexError("Organization membership limit exceeded.");
    return rows.flatMap(person=>{const actual=authoritative.find(record=>record.userId===person.authUserId);const role=actual?normalizeOrganizationRole(actual.role):null;return role?[{...person,role:displayRole(role)}]:[];});
  },
});

export const create = mutation({
  args:{name:v.string(),profileName:v.string(),organizationId:v.optional(v.string())},returns:v.id("workspaces"),
  handler:async(ctx,args)=>{
    const identity=await requireIdentity(ctx);const name=text(args.name,"Workspace name",100);const profileName=text(args.profileName,"Your name",100);
    let currentRole: "owner"|"admin"|"member"="owner";
    if(args.organizationId){
      const membership=await getOrganizationMembership(ctx,args.organizationId);
      if(!membership) throw new ConvexError("Organization not found or access denied.");
      requireWorkspaceAdmin(membership.role);currentRole=membership.role;
      const count=await ctx.db.query("workspaces").withIndex("by_organization",q=>q.eq("organizationId",args.organizationId)).take(100);
      if(count.length>=100)throw new ConvexError("This organization has reached its 100-workspace limit.");
    }else{
      const existing=await ctx.db.query("workspaces").withIndex("by_owner_and_org",q=>q.eq("ownerId",identity.tokenIdentifier).eq("organizationId",undefined)).first();
      if(existing)return existing._id;
    }
    const now=Date.now();const workspaceId=await ctx.db.insert("workspaces",{...(args.organizationId?{organizationId:args.organizationId}:{}),ownerId:identity.tokenIdentifier,name,color:"indigo",createdAt:now,updatedAt:now});
    await ctx.db.insert("members",{workspaceId,userId:identity.tokenIdentifier,authUserId:identity.userId,name:profileName,email:identity.email??"",title:"",timeZone:"UTC",role:displayRole(currentRole),createdAt:now});
    return workspaceId;
  },
});

export const update = mutation({
  args:{workspaceId:v.id("workspaces"),name:v.string(),color},returns:v.null(),
  handler:async(ctx,args)=>{const access=await requireWorkspace(ctx,args.workspaceId);requireWorkspaceAdmin(access.role);await ctx.db.patch(args.workspaceId,{name:text(args.name,"Workspace name",100),color:args.color,updatedAt:Date.now()});return null;},
});
export const updateProfile = mutation({
  args:{workspaceId:v.id("workspaces"),name:v.string(),title:v.string()},returns:v.null(),
  handler:async(ctx,args)=>{const {member}=await requireWorkspace(ctx,args.workspaceId);await ctx.db.patch(member._id,{name:text(args.name,"Your name",100),title:text(args.title,"Job title",120,true)});return null;},
});
export const reserveVoiceSession = mutation({
  args:{workspaceId:v.id("workspaces")},returns:v.null(),
  handler:async(ctx,args)=>{
    const access=await getWorkspaceAccess(ctx,args.workspaceId);const now=Date.now();
    const row=await ctx.db.query("voiceReservations").withIndex("by_scope",q=>q.eq("userId",access.identity.userId).eq("workspaceId",args.workspaceId)).unique();
    if(row&&now-row.lastRequestedAt<30_000)throw new ConvexError("Wait 30 seconds before starting another voice session.");
    const recent=await ctx.db.query("voiceReservations").withIndex("by_user_requested_at",q=>q.eq("userId",access.identity.userId).gt("lastRequestedAt",now-3_600_000)).take(101);
    const total=recent.filter(item=>now-item.windowStart<3_600_000).reduce((sum,item)=>sum+item.count,0);
    if(recent.length>100||total>=6)throw new ConvexError("Voice session limit reached. Try again next hour.");
    const inWindow=row&&now-row.windowStart<3_600_000;
    if(inWindow&&row.count>=6)throw new ConvexError("Voice session limit reached. Try again next hour.");
    const fields={userId:access.identity.userId,workspaceId:args.workspaceId,windowStart:inWindow?row.windowStart:now,lastRequestedAt:now,count:inWindow?row.count+1:1};
    if(row)await ctx.db.patch(row._id,fields);else await ctx.db.insert("voiceReservations",fields);return null;
  },
});
