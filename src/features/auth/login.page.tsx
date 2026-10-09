"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { GoogleSignInButton } from "./google-sign-in";

function AuthCard({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <main className="auth">
      <div className="auth-top"><Link href="/login" className="row" style={{ fontWeight: 600, gap: 8 }}><span className="ws-logo brand" style={{ width: 22, height: 22 }}>G</span>Gr8r Studio</Link></div>
      <div className="auth-c"><div className="auth-card"><h1>{title}</h1><p className="sub">{sub}</p>{children}</div></div>
    </main>
  );
}

function CredentialsForm({ signup = false }: { signup?: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  return <>
    <GoogleSignInButton signup={signup} />
    <div className="or" aria-hidden="true">or continue with email</div>
    <form className="col" style={{ gap: 14 }} aria-busy={pending} onSubmit={async (event) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const result = signup
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
        : await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) {
        setError(signup ? "Unable to create an account. Check your details or try signing in." : "Unable to sign in. Check your email and password and try again.");
      } else {
        router.replace("/");
        router.refresh();
      }
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      setPending(false);
    }
  }}>
    {signup ? <div className="field"><label className="label" htmlFor="auth-name">Full name</label><input id="auth-name" name="name" className="input input-lg" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} /></div> : null}
    <div className="field"><label className="label" htmlFor="auth-email">Email</label><input id="auth-email" name="email" className="input input-lg" type="email" autoComplete="email" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} aria-describedby={error ? "auth-error" : undefined} aria-invalid={Boolean(error)} /></div>
    <div className="field"><label className="label" htmlFor="auth-password">Password</label><input id="auth-password" name="password" className="input input-lg" type="password" autoComplete={signup ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} maxLength={128} aria-describedby={error ? "auth-error" : signup ? "password-hint" : undefined} aria-invalid={Boolean(error)} />{signup ? <span id="password-hint" className="hint">Use at least 8 characters.</span> : null}</div>
    {error ? <p id="auth-error" className="err" role="alert">{error}</p> : null}
    <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={pending}>{pending ? "Please wait…" : signup ? "Create account" : "Sign in"}</button>
    </form>
  </>;
}

export default function LoginPage() {
  return <AuthCard title="Welcome back" sub="Sign in to your private workspace."><CredentialsForm /><p className="auth-foot">New here? <Link href="/signup">Create an account</Link></p></AuthCard>;
}

export function SignupPage() {
  return <AuthCard title="Create your account" sub="Your projects and tasks, saved securely."><CredentialsForm signup /><p className="auth-foot">Already have an account? <Link href="/login">Sign in</Link></p></AuthCard>;
}

export function ForgotPage() {
  return <AuthCard title="Password recovery" sub="Email recovery is not configured for this workspace."><p>No reset email has been sent. Contact your workspace administrator for help.</p><p className="auth-foot"><Link href="/login">Back to sign in</Link></p></AuthCard>;
}

export function ResetPage() {
  return <ForgotPage />;
}
