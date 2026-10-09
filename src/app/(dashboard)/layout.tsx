import type { ReactNode } from "react";
import AuthProvider from "@/components/providers/auth-provider";
import { WorkspaceProvider } from "@/components/providers/workspace-provider";
import { fetchAuthQuery } from "@/lib/auth-server";
import { api } from "../../../convex/_generated/api";
import { redirect } from "next/navigation";
import AppearanceSync from "@/components/providers/appearance-sync";
import DashboardFrame from "@/components/layout/dashboard-frame";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await fetchAuthQuery(api.auth.currentUser, {});
  if (!user) redirect("/login");
  return (
    <AuthProvider>
      <WorkspaceProvider>
        <AppearanceSync />
        <DashboardFrame>{children}</DashboardFrame>
      </WorkspaceProvider>
    </AuthProvider>
  );
}
