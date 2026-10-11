"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { authClient } from "@/lib/auth-client";
import { api } from "../../../convex/_generated/api";
import { authRouteLink } from "./auth-return";

type Invitation = NonNullable<Awaited<ReturnType<typeof authClient.organization.getInvitation>>["data"]>;
function InvitationContent() {
  const params = useSearchParams();
  const id = params.get("id");
  const next = `/accept-invitation?${new URLSearchParams({ id: id || "" })}`;
  const { data: session, isPending } = authClient.useSession();
  const capabilities = useQuery(api.capabilities.publicStatus, {});
  const config = useQuery(api.auth.googleSignInConfig, {});
  const [loadedInvitation, setLoadedInvitation] = useState<{ key: string; data: Invitation | null } | null>(null);
  const [clock, setClock] = useState<number | null>(null);
  const userId = session?.user.id;
  const userEmail = session?.user.email;
  const emailVerified = session?.user.emailVerified;
  const invitationKey = `${id || ""}:${userId || ""}:${userEmail || ""}:${Boolean(emailVerified)}`;
  const invitation = loadedInvitation?.key === invitationKey ? loadedInvitation.data : null;
  const loading = Boolean(userId && id && loadedInvitation?.key !== invitationKey);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    let live = true;
    if (!userId || !id) return;
    void authClient.organization.getInvitation({ query: { id } }).then(result => {
      if (!live) return;
      setClock(Date.now());
      if (result.error || !result.data) {
        setLoadedInvitation({ key: invitationKey, data: null });
        setError("This invitation is unavailable. It may have expired, been canceled, or belong to another email address.");
      } else {
        setLoadedInvitation({ key: invitationKey, data: result.data });
        setError("");
      }
    }).catch(() => {
      if (!live) return;
      setLoadedInvitation({ key: invitationKey, data: null });
      setError("The invitation could not be loaded. Please try again.");
    });
    return () => { live = false; };
  }, [userId, id, invitationKey]);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  if (!id) return <p role="alert" className="err">This invitation link is incomplete. Ask your organization administrator for a new invitation.</p>;
  if (isPending) return <p role="status">Checking your session…</p>;
  if (!session) return <><p>Sign in with the email address that received this invitation. Your invitation will stay attached to the sign-in flow.</p><div className="org-inline"><Link className="btn btn-primary" href={authRouteLink("/login", next)}>Sign in to review</Link><Link className="btn btn-secondary" href={authRouteLink("/signup", next)}>Create an account</Link></div></>;
  if (loading) return <p role="status">Loading your invitation…</p>;
  const wrongEmail = invitation && invitation.email.toLowerCase() !== session.user.email.toLowerCase();
  const expired = invitation && clock !== null && new Date(invitation.expiresAt).getTime() <= clock;
  const unavailable = invitation && invitation.status !== "pending";
  return <>
    {error ? <p className="err" role="alert">{error}</p> : null}
    {notice ? <p className="org-notice" role="status">{notice}</p> : null}
    {invitation && !complete ? <>
      <p><strong>{invitation.organizationName}</strong> invited you as <strong>{invitation.role}</strong>.</p>
      <p className="hint">Signed in as {session.user.email}.</p>
      {wrongEmail ? <p className="err" role="alert">This invitation is for a different email address. Sign out and sign in with the address that received it.</p> : expired ? <p className="err" role="alert">This invitation has expired. Ask an administrator for a new invitation.</p> : unavailable ? <p className="hint" role="status">This invitation is {invitation.status}. No further action is available.</p> : !session.user.emailVerified ? <div className="org-notice"><p>Verify your email address before accepting this invitation.</p><button className="btn btn-secondary" disabled={pending || capabilities?.emailEnabled !== true} onClick={async () => {
        setPending(true); setError("");
        try {
          const result = await authClient.sendVerificationEmail({ email: session.user.email, callbackURL: new URL(next, config?.authOrigin || window.location.origin).href });
          if (result.error) setError("Verification email could not be requested. Please try again later.");
          else setNotice("Verification email requested. Open the link, then return to this invitation.");
        } catch { setError("Verification email could not be requested."); } finally { setPending(false); }
      }}>{pending ? "Requesting…" : "Send verification email"}</button>{capabilities && !capabilities.emailEnabled ? <p className="hint">Email delivery is awaiting sender setup. Contact your administrator.</p> : null}</div> : <div className="org-inline">
        <button className="btn btn-primary" disabled={pending} onClick={async () => {
          setPending(true); setError("");
          try {
            const accepted = await authClient.organization.acceptInvitation({ invitationId: id });
            if (accepted.error) { setError("The invitation could not be accepted. It may have expired or your account may not match the recipient."); return; }
            setComplete(true); setNotice("You’ve joined the organization. Open Organizations to choose a workspace.");
            const active = await authClient.organization.setActive({ organizationId: invitation.organizationId });
            if (active.error) setError("You joined successfully, but the active organization could not be selected. Select it from Organizations.");
          } catch { setError("Unable to accept the invitation. Please try again."); } finally { setPending(false); }
        }}>{pending ? "Please wait…" : "Accept invitation"}</button>
        <button className="btn btn-secondary" disabled={pending} onClick={async () => {
          setPending(true); setError("");
          try {
            const result = await authClient.organization.rejectInvitation({ invitationId: id });
            if (result.error) setError("The invitation could not be declined.");
            else { setComplete(true); setNotice("Invitation declined."); }
          } catch { setError("Unable to decline the invitation."); } finally { setPending(false); }
        }}>Decline</button>
      </div>}
    </> : null}
    <p className="auth-foot"><Link href="/organizations">Open organizations</Link>{wrongEmail ? <> · <button className="btn btn-secondary" disabled={pending} onClick={async () => { setPending(true); try { const result = await authClient.signOut(); if (result.error) throw new Error(); window.location.assign(authRouteLink("/login", next)); } catch { setError("Could not sign out. Please try again."); setPending(false); } }}>Switch account</button></> : null}</p>
  </>;
}
export default function AcceptInvitationPage() {
  return <main className="auth"><div className="auth-top"><Link href="/" className="org-product">ALIAS TASK</Link></div><div className="auth-c"><div className="auth-card"><h1>Organization invitation</h1><p className="sub">Review your invitation before joining a shared workspace.</p><Suspense fallback={<p role="status">Loading invitation…</p>}><InvitationContent /></Suspense></div></div></main>;
}
