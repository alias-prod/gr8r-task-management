/** Return only local paths, including when an invitation sends the user through auth. */
export function safeAuthReturn(value: string | null | undefined): string {
  if (!value || value !== value.trim() || !value.startsWith("/") || value.startsWith("//")) return "/";
  let decoded = value;
  try {
    for (let depth = 0; depth < 2; depth++) {
      if (/[\\\u0000-\u001f\u007f]/.test(decoded) || decoded.startsWith("//")) return "/";
      decoded = decodeURIComponent(decoded);
    }
    if (/[\\\u0000-\u001f\u007f]/.test(decoded) || decoded.startsWith("//")) return "/";
    const parsed = new URL(value, "https://alias-task.invalid");
    if (parsed.origin !== "https://alias-task.invalid" || parsed.pathname.startsWith("/api/auth")) return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch { return "/"; }
}

export function authRouteLink(route: "/login" | "/signup" | "/forgot" | "/reset", next: string): string {
  const target = safeAuthReturn(next);
  return target === "/" ? route : `${route}?${new URLSearchParams({ next: target })}`;
}

export function googleAuthURLs(origin: string, signup: boolean, next: string | null) {
  const returnPath = safeAuthReturn(next);
  const standalone = new URL(authRouteLink(signup ? "/signup" : "/login", returnPath), origin);
  const error = new URL(authRouteLink(signup ? "/signup" : "/login", returnPath), origin);
  error.searchParams.set("error", "google");
  return { standaloneURL: standalone.href, callbackURL: new URL(returnPath, origin).href, errorCallbackURL: error.href };
}
