import { Resend } from "@convex-dev/resend";
import type { GenericCtx } from "@convex-dev/better-auth";
import { ConvexError } from "convex/values";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";

// API verified against the installed official Resend Convex component README.
// Activation is deliberate: configure a verified sender before enabling delivery.
export function emailConfiguration() {
  const from = process.env.RESEND_FROM?.trim();
  const enabled = process.env.RESEND_EMAIL_ENABLED === "true";
  const key = process.env.RESEND_API_KEY;
  const origin = process.env.BETTER_AUTH_URL;
  if (!enabled || !key?.trim() || key === "[SENSITIVE]" || !from || !origin) {
    return { ready: false as const, reason: "Email delivery is not configured. Set RESEND_API_KEY, RESEND_FROM, BETTER_AUTH_URL and RESEND_EMAIL_ENABLED=true after verifying the sender domain." };
  }
  const address = from.match(/(?:<)?([^<>\s]+@[^<>\s]+)(?:>)?$/)?.[1];
  let parsed: URL;
  try { parsed = new URL(origin); } catch { return { ready: false as const, reason: "BETTER_AUTH_URL must be a valid canonical app origin." }; }
  if (!address || /[\r\n]/.test(from) || /@resend\.dev$/i.test(address) || (parsed.protocol !== "https:" && !(process.env.AUTH_ENV === "development" && ["localhost", "127.0.0.1"].includes(parsed.hostname)))) {
    return { ready: false as const, reason: "Configure a verified sender on your own domain and a secure canonical app origin." };
  }
  return { ready: true as const, from, origin: parsed.origin, reason: null };
}

export function escapeEmailHTML(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export function transactionalEmailContent(input: { title: string; description: string; url: string; action: string }) {
  const title = escapeEmailHTML(input.title);
  const description = escapeEmailHTML(input.description);
  const action = escapeEmailHTML(input.action);
  const href = escapeEmailHTML(input.url);
  return {
    subject: input.title.replace(/[\r\n]/g, " ").slice(0, 160),
    text: `${input.title}\n\n${input.description}\n\n${input.action}: ${input.url}\n\nIf you did not request this, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px;color:#172033"><p style="font-size:12px;letter-spacing:2px">ALIAS TASK</p><h1 style="font-size:24px">${title}</h1><p style="line-height:1.6">${description}</p><p><a href="${href}" style="display:inline-block;background:#3549eb;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">${action}</a></p><p style="font-size:12px;color:#637083">If you did not request this, you can ignore this email.</p></div>`,
  };
}

export async function sendTransactionalEmail(ctx: GenericCtx<DataModel>, input: { to: string; title: string; description: string; url: string; action: string; idempotencyKey?: string }) {
  const configuration = emailConfiguration();
  if (!configuration.ready) throw new ConvexError(configuration.reason);
  const link = new URL(input.url);
  if (link.origin !== configuration.origin) throw new ConvexError("Authentication email links must use the canonical app origin.");
  if (!("runMutation" in ctx)) throw new ConvexError("Email delivery requires an authentication action or mutation context.");
  const resend = new Resend(components.resend, { testMode: false });
  // This awaits durable enqueue, not delivery. Errors are propagated, never simulated.
  return await resend.sendEmail(ctx, { from: configuration.from, to: input.to, ...transactionalEmailContent(input), ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}) });
}
