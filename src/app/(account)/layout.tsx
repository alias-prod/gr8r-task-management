import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import AuthProvider from "@/components/providers/auth-provider";
import { fetchAuthQuery } from "@/lib/auth-server";
import { api } from "../../../convex/_generated/api";

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const user = await fetchAuthQuery(api.auth.currentUser, {});
  if (!user) redirect("/login?next=%2Forganizations");
  return <AuthProvider>{children}</AuthProvider>;
}
