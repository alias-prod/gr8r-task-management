import { describe, expect, it } from "vitest";
import { authRouteLink, googleAuthURLs, safeAuthReturn } from "../src/features/organizations/auth-return";

describe("safe invitation auth return", () => {
  it.each([null, "https://evil.test", "//evil.test", "/\\evil.test", "/%2f%2fevil.test", "/%252f%252fevil.test", "/\nevil.test", "/api/auth/get-session", " /organizations", "/%ZZ"])("rejects unsafe target %s", target => expect(safeAuthReturn(target)).toBe("/"));
  it("preserves a local invitation target and encoded id", () => expect(safeAuthReturn("/accept-invitation?id=abc%2Fdef")).toBe("/accept-invitation?id=abc%2Fdef"));
  it("retains next across canonical Google fallback and its callback", () => {
    const urls = googleAuthURLs("https://app.example.test", false, "/accept-invitation?id=abc");
    expect(new URL(urls.standaloneURL).searchParams.get("next")).toBe("/accept-invitation?id=abc");
    expect(urls.callbackURL).toBe("https://app.example.test/accept-invitation?id=abc");
    expect(new URL(urls.errorCallbackURL).searchParams.get("next")).toBe("/accept-invitation?id=abc");
    expect(new URL(urls.errorCallbackURL).searchParams.get("error")).toBe("google");
  });
  it("cannot send a Google callback to an arbitrary origin", () => expect(googleAuthURLs("https://app.example.test", true, "//evil.test").callbackURL).toBe("https://app.example.test/"));
  it("carries return path across email auth routes", () => expect(new URL(authRouteLink("/forgot", "/organizations"), "https://app.example.test").searchParams.get("next")).toBe("/organizations"));
});
