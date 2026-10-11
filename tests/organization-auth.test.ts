import { afterEach, describe, expect, it, vi } from "vitest";
import { authComponent, createAuthOptions, getOrganizationMembership, listOrganizationMemberships, normalizeOrganizationRole, requireAuthUser } from "../convex/auth";
import type { GenericCtx } from "@convex-dev/better-auth";
import type { DataModel } from "../convex/_generated/dataModel";
import schema from "../convex/betterAuth/schema";

const ctx = {} as GenericCtx<DataModel>;
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("organization auth policy", () => {
  it("enables the organization plugin without replacing the existing auth component tables", () => {
    const options = createAuthOptions(ctx);
    const plugin = options.plugins.find((item) => item.id === "organization");
    expect(plugin).toBeDefined();
    expect(plugin?.options.requireEmailVerificationOnInvitation).toBe(true);
    for (const table of ["user", "session", "account", "verification", "jwks", "organization", "member", "invitation"]) expect(schema.tables).toHaveProperty(table);
  });
  it("rejects an invitation before creating it when email delivery is unavailable", async () => {
    vi.stubEnv("RESEND_EMAIL_ENABLED", undefined);
    const plugin = createAuthOptions(ctx).plugins.find((item) => item.id === "organization");
    await expect(plugin?.options.organizationHooks?.beforeCreateInvitation?.()).rejects.toThrow("Email delivery is not configured");
  });
  it("does not relax Google account linking", () => {
    const options = createAuthOptions(ctx);
    expect(options).not.toHaveProperty("account.accountLinking.requireLocalEmailVerified");
    expect(options).not.toHaveProperty("account.accountLinking.trustedProviders");
  });
  it.each([["owner", "owner"], ["admin", "admin"], ["member", "member"], ["member,admin", "admin"], ["unknown", null], ["owner,unknown", null]])("normalizes only known role sets (%s)", (input, output) => { expect(normalizeOrganizationRole(input!)).toBe(output); });
  it("rejects missing or expired DB sessions before looking up membership", async () => {
    vi.spyOn(authComponent, "safeGetAuthUser").mockResolvedValue(undefined);
    const adapter = vi.spyOn(authComponent, "adapter");
    expect(await getOrganizationMembership(ctx, "organization-a")).toBeNull();
    expect(adapter).not.toHaveBeenCalled();
    await expect(requireAuthUser(ctx)).rejects.toThrow("Sign in");
  });
  it("looks up only the current authenticated user and requested organization", async () => {
    vi.spyOn(authComponent, "safeGetAuthUser").mockResolvedValue({ _id: "user-a" } as never);
    const findOne = vi.fn().mockResolvedValueOnce({ id: "membership-a", userId: "user-a", organizationId: "organization-a", role: "admin" }).mockResolvedValueOnce({ id: "organization-a" });
    vi.spyOn(authComponent, "adapter").mockReturnValue((() => ({ findOne })) as unknown as ReturnType<typeof authComponent.adapter>);
    expect(await getOrganizationMembership(ctx, "organization-a")).toEqual({ userId: "user-a", role: "admin" });
    expect(findOne).toHaveBeenCalledWith({ model: "member", where: [{ field: "organizationId", value: "organization-a" }, { field: "userId", value: "user-a" }] });
  });
  it("denies a fresh user with no authoritative organization membership", async () => {
    vi.spyOn(authComponent, "safeGetAuthUser").mockResolvedValue({ _id: "user-a" } as never);
    vi.spyOn(authComponent, "adapter").mockReturnValue((() => ({ findOne: vi.fn().mockResolvedValue(null) })) as unknown as ReturnType<typeof authComponent.adapter>);
    expect(await getOrganizationMembership(ctx, "organization-b")).toBeNull();
  });
  it("denies a stale membership after its organization has been deleted", async () => {
    vi.spyOn(authComponent, "safeGetAuthUser").mockResolvedValue({ _id: "user-a" } as never);
    const findOne = vi.fn().mockResolvedValueOnce({ id: "membership-a", userId: "user-a", organizationId: "organization-a", role: "owner" }).mockResolvedValueOnce(null);
    vi.spyOn(authComponent, "adapter").mockReturnValue((() => ({ findOne })) as unknown as ReturnType<typeof authComponent.adapter>);
    expect(await getOrganizationMembership(ctx, "organization-a")).toBeNull();
  });
  it("fails explicitly instead of truncating more than 100 memberships", async () => {
    vi.spyOn(authComponent, "safeGetAuthUser").mockResolvedValue({ _id: "user-a" } as never);
    vi.spyOn(authComponent, "adapter").mockReturnValue((() => ({ findMany: vi.fn().mockResolvedValue(Array.from({ length: 101 }, (_, index) => ({ id: String(index), organizationId: String(index), userId: "user-a", role: "member" }))) })) as unknown as ReturnType<typeof authComponent.adapter>);
    await expect(listOrganizationMemberships(ctx)).rejects.toThrow("Too many organization memberships");
  });
});
