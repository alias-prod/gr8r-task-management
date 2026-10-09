"use client";

import { useState, type ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexBetterAuthProvider, type AuthClient } from "@convex-dev/better-auth/react";
import { authClient } from "@/lib/auth-client";

export default function ConvexProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!));
  // The adapter's 0.12.5 AuthClient generic incorrectly infers useSession.data as never on Better Auth 1.6.33.
  return <ConvexBetterAuthProvider client={client} authClient={authClient as unknown as AuthClient}>{children}</ConvexBetterAuthProvider>;
}
