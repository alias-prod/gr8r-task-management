import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { organization } from "better-auth/plugins/organization";
import { APIError } from "better-auth/api";
import authSchema from "./betterAuth/schema";
import { emailConfiguration, sendTransactionalEmail } from "./email";
import { ConvexError, v } from "convex/values";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import authConfig from "./auth.config";

export const authComponent = createClient<DataModel, typeof authSchema>(components.betterAuth, { local: { schema: authSchema } });

function getAuthBaseURL() {
  return process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL);
}

export const createAuthOptions = (ctx: GenericCtx<DataModel>) => {
  // Convex's hosted development runtime does not use Next.js's NODE_ENV.
  const development = process.env.NODE_ENV === "development" || process.env.AUTH_ENV === "development";
  const baseURL = getAuthBaseURL();
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const emailReady = emailConfiguration().ready;
  return {
    appName: "ALIAS TASK",
    baseURL,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true, disableSignUp: !emailReady, requireEmailVerification: emailReady,
      autoSignIn: false, minPasswordLength: 8, maxPasswordLength: 128,
      sendResetPassword: async ({ user, url }) => {
        await sendTransactionalEmail(ctx, { to: user.email, title: "Reset your ALIAS TASK password", description: "Use this secure link to choose a new password. This link expires shortly.", url, action: "Reset password" });
      },
    },
    emailVerification: {
      sendOnSignUp: emailReady, sendOnSignIn: emailReady, autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendTransactionalEmail(ctx, { to: user.email, title: "Verify your email address", description: "Confirm your email address to securely use ALIAS TASK and accept organization invitations.", url, action: "Verify email" });
      },
    },
    socialProviders: googleClientId && googleClientSecret && baseURL ? {
      google: {
        clientId: googleClientId,
        clientSecret: googleClientSecret,
        prompt: "select_account",
        accessType: "online",
      },
    } : {},
    trustedOrigins: [
      ...(baseURL ? [baseURL] : []),
      ...(development ? [
        "http://localhost:3000", "http://localhost:3003",
        ...[process.env.V0_RUNTIME_URL, process.env.V0_DEV_APP_URL, process.env.V0_BUILD_URL, process.env.V0_SANDBOX_URL].filter((origin): origin is string => Boolean(origin)),
      ] : [
        ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
        ...(process.env.VERCEL_PROJECT_PRODUCTION_URL ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`] : []),
      ]),
    ],
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    ...(development ? {
      advanced: {
        // Secure cross-site cookies are required by the embedded v0 preview.
        defaultCookieAttributes: { sameSite: "none" as const, secure: true },
      },
    } : {}),
    plugins: [
      organization({
        creatorRole: "owner", organizationLimit: 20, membershipLimit: 100,
        requireEmailVerificationOnInvitation: true, invitationExpiresIn: 60 * 60 * 48,
        organizationHooks: {
          beforeCreateInvitation: async () => {
            const configuration = emailConfiguration();
            if (!configuration.ready) throw new APIError("SERVICE_UNAVAILABLE", { message: configuration.reason });
          },
        },
        sendInvitationEmail: async (data) => {
          if (!baseURL) throw new ConvexError("Set BETTER_AUTH_URL before sending invitations.");
          const invitationURL = new URL("/accept-invitation", baseURL);
          invitationURL.searchParams.set("id", data.id);
          await sendTransactionalEmail(ctx, { to: data.email, title: `Join ${data.organization.name} on ALIAS TASK`, description: `${data.inviter.user.name} invited you to ${data.organization.name} as ${data.role}. Sign in with this email address and verify it before accepting.`, url: invitationURL.href, action: "Review invitation", idempotencyKey: `organization-invitation:${data.id}` });
        },
      }),
      convex({ authConfig }),
    ],
  } satisfies BetterAuthOptions;
};

export const createAuth = (ctx: GenericCtx<DataModel>) => betterAuth(createAuthOptions(ctx));

export const googleSignInConfig = query({
  args: {},
  returns: v.object({ enabled: v.boolean(), authOrigin: v.union(v.string(), v.null()) }),
  handler: async () => {
    const baseURL = getAuthBaseURL();
    return {
      enabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && baseURL),
      authOrigin: baseURL ? new URL(baseURL).origin : null,
    };
  },
});

export const currentUser = query({
  args: {},
  returns: v.union(v.null(), v.object({ id: v.string(), name: v.string(), email: v.string() })),
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    return user ? { id: user._id, name: user.name, email: user.email } : null;
  },
});

export async function requireAuthUser(ctx: GenericCtx<DataModel>) {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user) throw new ConvexError("Sign in to access your workspace.");
  return user;
}

export type OrganizationRole = "owner" | "admin" | "member";

export function normalizeOrganizationRole(role: string): OrganizationRole | null {
  const roles = role.split(",").map((value) => value.trim());
  if (roles.some((value) => !["owner", "admin", "member"].includes(value))) return null;
  return roles.includes("owner") ? "owner" : roles.includes("admin") ? "admin" : roles.includes("member") ? "member" : null;
}

type OrganizationMember = { id: string; organizationId: string; userId: string; role: string };

export async function getOrganizationMembership(ctx: GenericCtx<DataModel>, organizationId: string): Promise<{ userId: string; role: OrganizationRole } | null> {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user) return null;
  const adapter = authComponent.adapter(ctx)(createAuthOptions(ctx));
  const member = await adapter.findOne<OrganizationMember>({ model: "member", where: [{ field: "organizationId", value: organizationId }, { field: "userId", value: user._id }] });
  if (!member || member.userId !== user._id || member.organizationId !== organizationId) return null;
  const organizationRecord = await adapter.findOne<{ id: string }>({ model: "organization", where: [{ field: "id", value: organizationId }] });
  if (!organizationRecord || organizationRecord.id !== organizationId) return null;
  const role = normalizeOrganizationRole(member.role);
  return role ? { userId: user._id, role } : null;
}

export async function listOrganizationMemberships(ctx: GenericCtx<DataModel>): Promise<Array<{ organizationId: string; userId: string; role: OrganizationRole }>> {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user) return [];
  const members = await authComponent.adapter(ctx)(createAuthOptions(ctx)).findMany<OrganizationMember>({ model: "member", where: [{ field: "userId", value: user._id }], limit: 101 });
  if (members.length > 100) throw new ConvexError("Too many organization memberships to list. Select an organization directly or contact support.");
  return members.flatMap((member) => { const role = normalizeOrganizationRole(member.role); return role ? [{ organizationId: member.organizationId, userId: user._id, role }] : []; });
}

export const emailSignInConfig = query({
  args: {},
  returns: v.object({ enabled: v.boolean(), reason: v.union(v.string(), v.null()) }),
  handler: async () => { const configuration = emailConfiguration(); return { enabled: configuration.ready, reason: configuration.reason }; },
});
