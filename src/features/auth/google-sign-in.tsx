"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { authClient } from "@/lib/auth-client";
import { api } from "../../../convex/_generated/api";

const signInError = "Unable to sign in with Google. Please try again or use your email and password.";

function GoogleSignInControl({ signup }: { signup: boolean }) {
  const config = useQuery(api.auth.googleSignInConfig, {});
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [standaloneURL, setStandaloneURL] = useState("");
  const displayedError = error || (!attempted && searchParams.has("error") ? signInError : "");

  async function signIn() {
    if (pending || !config?.enabled || !config.authOrigin) return;
    setAttempted(true);
    setError("");
    setStandaloneURL("");

    if (window.self !== window.top || window.location.origin !== config.authOrigin) {
      // Google's account chooser cannot run inside the embedded preview.
      // Start on the canonical origin so OAuth state and callback cookies match.
      const url = new URL(signup ? "/signup" : "/login", config.authOrigin).href;
      window.open(url, "_blank", "noopener,noreferrer");
      setStandaloneURL(url);
      return;
    }

    setPending(true);
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: new URL("/", config.authOrigin).href,
        newUserCallbackURL: new URL("/", config.authOrigin).href,
        errorCallbackURL: new URL(`${signup ? "/signup" : "/login"}?error=google`, config.authOrigin).href,
      });
      if (result.error || !result.data?.url) {
        setError(signInError);
        setPending(false);
      }
    } catch {
      setError(signInError);
      setPending(false);
    }
  }

  return (
    <div className="social">
      <button
        className="btn btn-secondary btn-lg btn-block"
        type="button"
        disabled={pending || !config?.enabled}
        aria-busy={pending}
        aria-describedby={displayedError ? "google-auth-error" : config && !config.enabled ? "google-auth-setup" : undefined}
        onClick={signIn}
      >
        <span aria-live="polite">{pending ? "Connecting to Google…" : "Continue with Google"}</span>
      </button>
      {config && !config.enabled ? (
        <p id="google-auth-setup" className="hint">Google sign-in is awaiting setup. You can still sign in with email below.</p>
      ) : null}
      {standaloneURL ? (
        <p className="hint" role="status">
          Continue with Google in the new tab. If it did not open, <a href={standaloneURL} target="_blank" rel="noopener noreferrer">open sign-in in a new tab</a>.
        </p>
      ) : null}
      {displayedError ? <p id="google-auth-error" className="err" role="alert">{displayedError}</p> : null}
    </div>
  );
}

export function GoogleSignInButton({ signup = false }: { signup?: boolean }) {
  return (
    <Suspense fallback={<button className="btn btn-secondary btn-lg btn-block" type="button" disabled>Continue with Google</button>}>
      <GoogleSignInControl signup={signup} />
    </Suspense>
  );
}
