import { afterEach, describe, expect, it, vi } from "vitest";
import type { GenericCtx } from "@convex-dev/better-auth";
import type { DataModel } from "../convex/_generated/dataModel";
import { createAuthOptions } from "../convex/auth";
import { emailConfiguration, escapeEmailHTML, sendTransactionalEmail, transactionalEmailContent } from "../convex/email";
const ctx = {} as GenericCtx<DataModel>;
function configureEmail() {
  vi.stubEnv("RESEND_API_KEY", "test-only-not-a-real-key");
  vi.stubEnv("RESEND_FROM", "ALIAS TASK <noreply@example.test>");
  vi.stubEnv("BETTER_AUTH_URL", "https://workspace.example.test");
  vi.stubEnv("RESEND_EMAIL_ENABLED", "true");
}
afterEach(() => vi.unstubAllEnvs());
describe("transactional email safety", () => {
  it("gates new password signup while retaining Google and existing password login", () => {
    vi.stubEnv("RESEND_EMAIL_ENABLED", undefined);
    const options = createAuthOptions(ctx);
    expect(options.emailAndPassword.enabled).toBe(true);
    expect(options.emailAndPassword.disableSignUp).toBe(true);
    expect(options.emailAndPassword.requireEmailVerification).toBe(false);
  });
  it("requires email verification once a sender is deliberately activated", () => {
    configureEmail();
    expect(emailConfiguration().ready).toBe(true);
    const options = createAuthOptions(ctx);
    expect(options.emailAndPassword.disableSignUp).toBe(false);
    expect(options.emailAndPassword.requireEmailVerification).toBe(true);
    expect(options.emailAndPassword.autoSignIn).toBe(false);
    expect(options.emailVerification.sendOnSignUp).toBe(true);
  });
  it.each(["RESEND_API_KEY", "RESEND_FROM", "BETTER_AUTH_URL", "RESEND_EMAIL_ENABLED"])("fails closed without %s", async (key) => {
    configureEmail(); vi.stubEnv(key, undefined);
    expect(emailConfiguration().ready).toBe(false);
    await expect(sendTransactionalEmail(ctx, { to: "user@example.test", title: "Verify email", description: "Confirm your email", url: "https://workspace.example.test/verify", action: "Verify" })).rejects.toThrow();
  });
  it("rejects cross-origin authentication email links", async () => {
    configureEmail();
    await expect(sendTransactionalEmail(ctx, { to: "user@example.test", title: "Verify", description: "Verify", url: "https://attacker.example/verify", action: "Verify" })).rejects.toThrow("canonical app origin");
  });
  it("escapes user-controlled HTML and prevents subject header injection", () => {
    const content = transactionalEmailContent({ title: '<img src=x onerror="alert(1)">\r\nBcc: bad@example.test', description: "<script>alert(1)</script>", url: 'https://workspace.example.test/?id=a&name="test"', action: "<Accept>" });
    expect(content.html).not.toContain("<script>");
    expect(content.html).not.toContain("<img");
    expect(content.html).toContain("&lt;Accept&gt;");
    expect(content.subject).not.toMatch(/[\r\n]/);
    expect(escapeEmailHTML("<&\"'>")).toBe("&lt;&amp;&quot;&#39;&gt;");
  });
  it("rejects test-only senders and insecure production origins", () => {
    configureEmail(); vi.stubEnv("RESEND_FROM", "onboarding@resend.dev");
    expect(emailConfiguration().ready).toBe(false);
    configureEmail(); vi.stubEnv("BETTER_AUTH_URL", "http://workspace.example.test");
    expect(emailConfiguration().ready).toBe(false);
  });
});
