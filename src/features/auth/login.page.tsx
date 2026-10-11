"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { authRouteLink, safeAuthReturn } from "@/features/organizations/auth-return";
import { GoogleSignInButton } from "./google-sign-in";

function AuthCard({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return <main className="auth"><div className="auth-top"><Link href="/login" className="row" style={{ fontWeight: 600, gap: 8 }}><span className="ws-logo brand" style={{ width: 22, height: 22 }} aria-hidden="true">A</span>ALIAS TASK</Link></div><div className="auth-c"><div className="auth-card"><h1>{title}</h1><p className="sub">{sub}</p>{children}</div></div></main>;
}

function CredentialsForm({ signup = false }: { signup?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeAuthReturn(params.get("next"));
  const capabilities = useQuery(api.capabilities.publicStatus, {});
  const config = useQuery(api.auth.googleSignInConfig, {});
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const signupEnabled = capabilities?.passwordSignupEnabled === true;
  const callbackURL = () => new URL(next, config?.authOrigin || window.location.origin).href;
  return <>
    <GoogleSignInButton signup={signup} />
    <div className="or" aria-hidden="true">or continue with email</div>
    {signup && capabilities && !signupEnabled ? <p className="hint" role="status">Email account creation is awaiting sender setup. You can still continue with Google.</p> : null}
    {notice ? <div className="org-notice" role="status"><strong>Check your inbox</strong><p>{notice}</p><Link href={authRouteLink("/login", next)}>Back to sign in</Link></div> : <form className="col" style={{ gap: 14 }} aria-busy={pending} onSubmit={async event => {
      event.preventDefault();
      if (pending || (signup && !signupEnabled)) return;
      setPending(true); setError("");
      try {
        const result = signup
          ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password, callbackURL: callbackURL() })
          : await authClient.signIn.email({ email: email.trim(), password });
        if (result.error) {
          setError(result.error.code === "EMAIL_NOT_VERIFIED" ? "Verify your email before signing in. If delivery is enabled, check your inbox for a verification link." : signup ? "Unable to create an account. Check your details or try signing in." : "Unable to sign in. Check your email and password and try again.");
        } else if (signup) {
          setNotice("Open the verification link we’ve requested for your email address. Your account is not signed in until your email is verified.");
        } else { router.replace(next); router.refresh(); }
      } catch { setError("Unable to connect. Please try again."); }
      finally { setPending(false); }
    }}>
      {signup ? <div className="field"><label className="label" htmlFor="auth-name">Full name</label><input id="auth-name" name="name" className="input input-lg" autoComplete="name" value={name} onChange={event => setName(event.target.value)} required maxLength={100} disabled={pending || !signupEnabled} /></div> : null}
      <div className="field"><label className="label" htmlFor="auth-email">Email</label><input id="auth-email" name="email" className="input input-lg" type="email" autoComplete="email" spellCheck={false} value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} disabled={pending || (signup && !signupEnabled)} aria-describedby={error ? "auth-error" : undefined} aria-invalid={Boolean(error)} /></div>
      <div className="field"><label className="label" htmlFor="auth-password">Password</label><input id="auth-password" name="password" className="input input-lg" type="password" autoComplete={signup ? "new-password" : "current-password"} value={password} onChange={event => setPassword(event.target.value)} required minLength={8} maxLength={128} disabled={pending || (signup && !signupEnabled)} aria-describedby={error ? "auth-error" : signup ? "password-hint" : undefined} aria-invalid={Boolean(error)} />{signup ? <span id="password-hint" className="hint">Use at least 8 characters.</span> : null}</div>
      {error ? <p id="auth-error" className="err" role="alert">{error}</p> : null}
      <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={pending || (signup && !signupEnabled)}>{pending ? "Please wait…" : signup ? "Create account" : "Sign in"}</button>
    </form>}
    {!signup ? <p className="auth-foot"><Link href={authRouteLink("/forgot", next)}>Forgot password?</Link></p> : null}
    <p className="auth-foot">{signup ? "Already have an account? " : "New here? "}<Link href={authRouteLink(signup ? "/login" : "/signup", next)}>{signup ? "Sign in" : "Create an account"}</Link></p>
  </>;
}

export default function LoginPage() {
  return <AuthCard title="Welcome back" sub="Sign in to your workspaces and organizations."><Suspense fallback={<p role="status">Loading sign-in…</p>}><CredentialsForm /></Suspense></AuthCard>;
}
export function SignupPage() {
  return <AuthCard title="Create your account" sub="Your projects and tasks, saved securely."><Suspense fallback={<p role="status">Loading account setup…</p>}><CredentialsForm signup /></Suspense></AuthCard>;
}

function RecoveryForm({ reset = false }: { reset?: boolean }) {
  const params = useSearchParams();
  const next = safeAuthReturn(params.get("next"));
  const token = params.get("token");
  const capabilities = useQuery(api.capabilities.publicStatus, {});
  const config = useQuery(api.auth.googleSignInConfig, {});
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const unavailable = capabilities?.emailEnabled !== true;
  if (reset && (!token || params.has("error"))) return <><p role="alert" className="err">This reset link is missing or has expired. Request a new link.</p><Link href={authRouteLink("/forgot", next)}>Request a reset link</Link></>;
  return <>
    {!reset && capabilities && unavailable ? <p className="hint" role="status">Email recovery is awaiting verified sender setup. No reset email will be sent until delivery is enabled.</p> : null}
    {notice ? <div className="org-notice" role="status">{notice}</div> : <form className="col" style={{ gap: 14 }} aria-busy={pending} onSubmit={async event => {
      event.preventDefault(); if (pending || (!reset && unavailable)) return;
      if (reset && password !== confirmation) { setError("The passwords do not match."); return; }
      setPending(true); setError("");
      try {
        const result = reset
          ? await authClient.resetPassword({ newPassword: password, token: token! })
          : await authClient.requestPasswordReset({ email: email.trim(), redirectTo: new URL(authRouteLink("/reset", next), config?.authOrigin || window.location.origin).href });
        if (result.error) setError(reset ? "This reset link is invalid or expired. Request a new one." : "The reset request could not be sent. Please try again later.");
        else setNotice(reset ? "Your password has been updated. You can now sign in." : "If an account exists for this address, you’ll receive a password reset link.");
      } catch { setError("Unable to connect. Please try again."); }
      finally { setPending(false); }
    }}>
      {reset ? <><div className="field"><label className="label" htmlFor="reset-password">New password</label><input id="reset-password" type="password" className="input input-lg" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} required minLength={8} maxLength={128} disabled={pending} /></div><div className="field"><label className="label" htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" type="password" className="input input-lg" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} required minLength={8} maxLength={128} disabled={pending} /></div></> : <div className="field"><label className="label" htmlFor="recovery-email">Email</label><input id="recovery-email" type="email" className="input input-lg" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} disabled={pending || unavailable} /></div>}
      {error ? <p className="err" role="alert">{error}</p> : null}
      <button className="btn btn-primary btn-lg" disabled={pending || (!reset && unavailable)}>{pending ? "Please wait…" : reset ? "Update password" : "Send reset link"}</button>
    </form>}
    <p className="auth-foot"><Link href={authRouteLink("/login", next)}>Back to sign in</Link></p>
  </>;
}
export function ForgotPage() { return <AuthCard title="Reset your password" sub="We’ll send a secure link to your email address."><Suspense fallback={<p role="status">Loading recovery…</p>}><RecoveryForm /></Suspense></AuthCard>; }
export function ResetPage() { return <AuthCard title="Choose a new password" sub="Use a unique password of at least 8 characters."><Suspense fallback={<p role="status">Loading reset…</p>}><RecoveryForm reset /></Suspense></AuthCard>; }
