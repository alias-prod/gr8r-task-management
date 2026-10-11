import { handler } from "@/lib/auth-server";

// Keep this nested endpoint explicit for preview routers that misresolve catch-all paths.
export async function POST(request: Request) {
  return handler.POST(request);
}
