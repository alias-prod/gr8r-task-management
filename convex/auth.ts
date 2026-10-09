import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { v } from "convex/values";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import authConfig from "./auth.config";

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  // Convex's hosted development runtime does not use Next.js's NODE_ENV.
  const development = process.env.NODE_ENV === "development" || process.env.AUTH_ENV === "development";
  const baseURL = process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL);
  return betterAuth({
    baseURL,
    database: authComponent.adapter(ctx),
    emailAndPassword: { enabled: true, autoSignIn: true, minPasswordLength: 8, maxPasswordLength: 128 },
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
    plugins: [convex({ authConfig })],
  });
};

export const currentUser = query({
  args: {},
  returns: v.union(v.null(), v.object({ id: v.string(), name: v.string(), email: v.string() })),
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    return user ? { id: user._id, name: user.name, email: user.email } : null;
  },
});
