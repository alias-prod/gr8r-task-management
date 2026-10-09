/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../convex/_generated/api";
import { createAuth } from "../convex/auth";
import schema from "../convex/schema";

const modules = import.meta.glob(["../convex/**/*.{ts,js}", "!../convex/**/*.d.ts"]);

beforeEach(() => {
  vi.stubEnv("BETTER_AUTH_SECRET", "test-only-secret-not-for-real-authentication-123456789");
  vi.stubEnv("BETTER_AUTH_URL", "https://workspace.example.test");
  vi.stubEnv("CONVEX_SITE_URL", "https://auth-test.convex.site");
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client.apps.googleusercontent.com");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-only-google-secret");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("AUTH_ENV", "development");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Google sign-in configuration", () => {
  it("exposes readiness and the canonical origin without exposing credentials", async () => {
    const database = convexTest(schema, modules);
    expect(await database.query(api.auth.googleSignInConfig, {})).toEqual({
      enabled: true,
      authOrigin: "https://workspace.example.test",
    });
  });

  it.each(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"])("keeps Google disabled when %s is missing", async (key) => {
    vi.stubEnv(key, undefined);
    const database = convexTest(schema, modules);
    expect((await database.query(api.auth.googleSignInConfig, {})).enabled).toBe(false);
    await database.run(async (ctx) => {
      const auth = createAuth(ctx);
      expect(auth.options.socialProviders.google).toBeUndefined();
      expect(auth.options.emailAndPassword.enabled).toBe(true);
      await auth.$context;
    });
  });

  it("requires a configured callback origin before enabling Google", async () => {
    for (const key of ["BETTER_AUTH_URL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL", "V0_RUNTIME_URL"]) {
      vi.stubEnv(key, undefined);
    }
    const database = convexTest(schema, modules);
    expect(await database.query(api.auth.googleSignInConfig, {})).toEqual({ enabled: false, authOrigin: null });
  });

  it("uses Google's account chooser without requesting Gmail or offline access", async () => {
    const database = convexTest(schema, modules);
    await database.run(async (ctx) => {
      const auth = createAuth(ctx);
      expect(auth.options.socialProviders.google).toEqual({
        clientId: "test-client.apps.googleusercontent.com",
        clientSecret: "test-only-google-secret",
        prompt: "select_account",
        accessType: "online",
      });
      expect(auth.options.emailAndPassword.enabled).toBe(true);
      expect(auth.options.advanced?.defaultCookieAttributes).toEqual({ sameSite: "none", secure: true });
      expect(auth.options.trustedOrigins).toContain("https://workspace.example.test");
      await auth.$context;
    });
  });

  it("keeps production on secure defaults and excludes preview origins", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_ENV", "production");
    vi.stubEnv("V0_RUNTIME_URL", "https://preview.example.test");
    const database = convexTest(schema, modules);
    await database.run(async (ctx) => {
      const auth = createAuth(ctx);
      expect(auth.options.advanced).toBeUndefined();
      expect(auth.options.trustedOrigins).not.toContain("https://preview.example.test");
      expect(auth.options.trustedOrigins).not.toContain("http://localhost:3000");
      await auth.$context;
    });
  });
});
