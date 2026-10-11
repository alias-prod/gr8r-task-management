/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { vi } from "vitest";
import { components } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import authSchema from "../../convex/betterAuth/schema";
import type { Doc as AuthDoc } from "../../convex/betterAuth/_generated/dataModel";

const modules = import.meta.glob(["../../convex/**/*.{ts,js}", "!../../convex/**/*.d.ts", "!../../convex/betterAuth/**/*"]);
const authModules = import.meta.glob(["../../convex/betterAuth/**/*.{ts,js}", "!../../convex/betterAuth/**/*.d.ts"]);
const issuer = "https://auth.example.test";
export function configureAuthTestEnvironment() {
  vi.stubEnv("BETTER_AUTH_SECRET", "test-only-not-for-real-authentication-long-secret-123456789");
  vi.stubEnv("BETTER_AUTH_URL", "https://workspace.example.test");
  vi.stubEnv("CONVEX_SITE_URL", issuer);
  vi.stubEnv("AUTH_ENV", "development");
  vi.stubEnv("RESEND_EMAIL_ENABLED", undefined);
}
export function testDatabase() {
  const database = convexTest(schema, modules);
  database.registerComponent("betterAuth", authSchema, authModules);
  return database;
}
export type TestDatabase = ReturnType<typeof testDatabase>;
export async function sessionForAuthUser(database: TestDatabase, user: AuthDoc<"user">, label: string, expiresAt = Date.now() + 86_400_000) {
  const now = Date.now();
  const session = await database.run((ctx) => ctx.runMutation(components.betterAuth.adapter.create, { input: { model: "session", data: { userId: user._id, token: `test-only-session-${label}-${user._id}`, createdAt: now, updatedAt: now, expiresAt } } })) as AuthDoc<"session">;
  const actor = database.withIdentity({ subject: user._id, issuer, tokenIdentifier: `${issuer}|${user._id}`, sessionId: session._id, email: user.email, name: user.name });
  return { actor, session };
}
export async function authActor(database: TestDatabase, label: string) {
  const now = Date.now();
  const user = await database.run((ctx) => ctx.runMutation(components.betterAuth.adapter.create, { input: { model: "user", data: { name: label, email: `${label}@example.test`, emailVerified: true, createdAt: now, updatedAt: now } } })) as AuthDoc<"user">;
  return { user, ...await sessionForAuthUser(database, user, label) };
}
export async function createOrganization(database: TestDatabase, slug: string) {
  return await database.run((ctx) => ctx.runMutation(components.betterAuth.adapter.create, { input: { model: "organization", data: { name: slug, slug, createdAt: Date.now() } } })) as AuthDoc<"organization">;
}
export async function addOrganizationMember(database: TestDatabase, organizationId: string, userId: string, role: "owner" | "admin" | "member") {
  return await database.run((ctx) => ctx.runMutation(components.betterAuth.adapter.create, { input: { model: "member", data: { organizationId, userId, role, createdAt: Date.now() } } })) as AuthDoc<"member">;
}
export async function removeOrganizationMember(database: TestDatabase, membershipId: string) {
  await database.run((ctx) => ctx.runMutation(components.betterAuth.adapter.deleteOne, { input: { model: "member", where: [{ field: "_id", value: membershipId }] } }));
}
export async function changeOrganizationRole(database: TestDatabase, membershipId: string, role: "owner" | "admin" | "member") {
  await database.run((ctx) => ctx.runMutation(components.betterAuth.adapter.updateOne, { input: { model: "member", where: [{ field: "_id", value: membershipId }], update: { role } } }));
}
export async function expireSession(database: TestDatabase, sessionId: string) {
  await database.run((ctx) => ctx.runMutation(components.betterAuth.adapter.updateOne, { input: { model: "session", where: [{ field: "_id", value: sessionId }], update: { expiresAt: Date.now() - 1 } } }));
}
export async function revokeSession(database: TestDatabase, sessionId: string) {
  await database.run((ctx) => ctx.runMutation(components.betterAuth.adapter.deleteOne, { input: { model: "session", where: [{ field: "_id", value: sessionId }] } }));
}
