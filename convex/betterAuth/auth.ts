import { createAuth } from "../auth";
// Static export for Better Auth CLI schema generation only.
export const auth = createAuth({} as Parameters<typeof createAuth>[0]);
