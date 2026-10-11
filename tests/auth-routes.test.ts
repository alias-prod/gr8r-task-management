import { beforeEach, describe, expect, it, vi } from "vitest";

const handler = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn() }));
vi.mock("@/lib/auth-server", () => ({ handler }));

import { POST as socialPOST } from "../src/app/api/auth/sign-in/social/route";
import { GET as callbackGET } from "../src/app/api/auth/callback/google/route";
import { GET, POST } from "../src/app/api/auth/[...all]/route";

beforeEach(() => vi.resetAllMocks());

describe("auth proxy routes", () => {
  it.each([
    ["explicit social sign-in", socialPOST, "POST", "/api/auth/sign-in/social"],
    ["explicit Google callback", callbackGET, "GET", "/api/auth/callback/google"],
    ["catch-all session", GET, "GET", "/api/auth/get-session"],
    ["catch-all sign-in", POST, "POST", "/api/auth/sign-in/email"],
  ] as const)("forwards %s without changing the request or response", async (_name, route, method, path) => {
    const request = new Request(`https://app.example${path}`, {
      method,
      headers: { origin: "https://app.example" },
      ...(method === "POST" ? { body: JSON.stringify({ provider: "google" }) } : {}),
    });
    const response = new Response(null, {
      status: 302,
      headers: { location: "https://app.example/", "set-cookie": "test=value; HttpOnly; Secure" },
    });
    handler[method].mockResolvedValue(response);
    expect(await route(request)).toBe(response);
    expect(handler[method]).toHaveBeenCalledExactlyOnceWith(request);
  });
});
