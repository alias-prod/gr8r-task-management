import { handler } from "@/lib/auth-server";

// The OAuth return path must resolve without relying on preview catch-all routing.
export async function GET(request: Request) {
  return handler.GET(request);
}
