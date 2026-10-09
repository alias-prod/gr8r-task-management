"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useConvexAuth } from "convex/react";
import { authClient } from "@/lib/auth-client";

export default function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const { isAuthenticated, isLoading } = useConvexAuth();
  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, session, router]);
  if (isPending || isLoading || !isAuthenticated) return <main className="page" role="status">Verifying your session…</main>;
  return children;
}
