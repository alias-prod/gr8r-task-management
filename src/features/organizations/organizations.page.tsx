"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { Building2, ArrowLeft, Users, Mail, Plus } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { api } from "../../../convex/_generated/api";

type Organization = NonNullable<Awaited<ReturnType<typeof authClient.organization.list>>["data"]>[number];
// Client plugin's full-organization output is loosely inferred; keep UI fields explicit.
type OrganizationMember = { id: string; userId: string; role: string; user: { name: string; email: string } };
type OrganizationInvitation = { id: string; email: string; role: string; status: string; expiresAt: Date | string | number };
type FullOrganization = { id: string; name: string; slug: string; members: OrganizationMember[]; invitations: OrganizationInvitation[] };
type Role = "owner" | "admin" | "member";
export function managementRole(role: string | undefined): Role {
  const values = (role || "member").split(",").map(value => value.trim());
  if (values.some(value => !["owner", "admin", "member"].includes(value))) return "member";
  return values.includes("owner") ? "owner" : values.includes("admin") ? "admin" : "member";
}

export default function OrganizationsPage() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const active = authClient.useActiveOrganization();
  const capabilities = useQuery(api.capabilities.publicStatus, {});
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selected, setSelected] = useState("");
  const [details, setDetails] = useState<{ key: string; data: FullOrganization | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [clock, setClock] = useState<number | null>(null);
  const detailsKey = `${selected}:${revision}`;
  const full = details?.key === detailsKey ? details.data : null;
  const detailsLoading = Boolean(selected && details?.key !== detailsKey);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [confirmMember, setConfirmMember] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const loadOrganizations = useCallback(async () => {
    try {
      const result = await authClient.organization.list();
      if (result.error || !result.data) throw new Error();
      setOrganizations(result.data);
      setSelected(previous => result.data.some(item => item.id === previous) ? previous : result.data[0]?.id || "");
    } catch { setError("Your organizations could not be loaded. Try refreshing."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let live = true;
    void authClient.organization.list().then(result => {
      if (!live) return;
      if (result.error || !result.data) {
        setError("Your organizations could not be loaded. Try refreshing.");
      } else {
        setOrganizations(result.data);
        setSelected(previous => result.data.some(item => item.id === previous) ? previous : result.data[0]?.id || "");
      }
    }).catch(() => {
      if (live) setError("Your organizations could not be loaded. Try refreshing.");
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    let live = true;
    if (!selected) return;
    void authClient.organization.getFullOrganization({ query: { organizationId: selected, membersLimit: 100 } }).then(result => {
      if (!live) return;
      setClock(Date.now());
      if (result.error || !result.data) {
        setDetails({ key: detailsKey, data: null });
        setError("Organization details are unavailable. Your membership may have changed.");
      } else setDetails({ key: detailsKey, data: result.data });
    }).catch(() => {
      if (!live) return;
      setDetails({ key: detailsKey, data: null });
      setError("Unable to load organization details.");
    });
    return () => { live = false; };
  }, [selected, detailsKey]);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => { if (confirmMember) cancelRef.current?.focus(); }, [confirmMember]);
  const myMember = full?.members.find(member => member.userId === session?.user.id);
  const role = managementRole(myMember?.role);
  const canManage = role === "owner" || role === "admin";
  async function run(key: string, operation: () => Promise<{ error: unknown }>, success: string) {
    if (pending) return false;
    setPending(key); setError(""); setNotice("");
    try {
      const result = await operation();
      if (result.error) throw new Error();
      setNotice(success); setRevision(value => value + 1); return true;
    } catch { setError("The change could not be saved. Check your permissions and try again."); return false; }
    finally { setPending(""); }
  }
  return <main className="org-page">
    <header className="org-header"><Link href="/" className="org-back"><ArrowLeft size={16} />Back to workspace</Link><span className="org-product">ALIAS TASK</span></header>
    <div className="org-title"><Building2 size={24} aria-hidden="true" /><div><h1>Organizations</h1><p>Manage shared workspaces, members, and invitations.</p></div></div>
    {error ? <div className="org-notice org-error" role="alert">{error}<button type="button" className="btn btn-secondary" onClick={() => { setError(""); setLoading(true); void loadOrganizations(); setRevision(value => value + 1); }} disabled={Boolean(pending)}>Retry</button></div> : null}
    {notice ? <p className="org-notice" role="status">{notice}</p> : null}
    <section className="org-section" aria-labelledby="org-scope-title"><div className="org-section-head"><h2 id="org-scope-title">Your organizations</h2><button className="btn btn-secondary" type="button" disabled={Boolean(pending)} onClick={async () => { if (await run("personal", () => authClient.organization.setActive({ organizationId: null }), "Personal workspace selected.")) router.push("/"); }}>Use personal workspace</button></div>
      {loading ? <p role="status" className="hint">Loading organizations…</p> : organizations.length ? <div className="org-inline"><div className="field org-grow"><label htmlFor="organization-select" className="label">Organization</label><select id="organization-select" className="input" value={selected} onChange={event => { setSelected(event.target.value); setConfirmMember(null); setError(""); }} disabled={Boolean(pending)}>{organizations.map(organization => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></div><button className="btn btn-primary" disabled={!selected || Boolean(pending)} onClick={async () => { if (await run("activate", () => authClient.organization.setActive({ organizationId: selected }), "Organization selected.")) router.push("/"); }}>Open workspaces</button></div> : <p className="org-empty">You don’t belong to an organization yet. Create one below, or accept an invitation from your email.</p>}
      {active.data ? <p className="hint">Active organization: {active.data.name}</p> : <p className="hint">Your personal workspace is currently active.</p>}
    </section>
    <section className="org-section" aria-labelledby="create-org-title"><div className="org-section-head"><h2 id="create-org-title"><Plus size={16} aria-hidden="true" />Create an organization</h2></div>
      <form className="org-create-form" onSubmit={async event => {
        event.preventDefault(); if (pending) return; setPending("create"); setError(""); setNotice("");
        try {
          const result = await authClient.organization.create({ name: name.trim(), slug: slug.trim().toLowerCase() });
          if (result.error || !result.data) { setError("Organization creation failed. The slug may be taken, or you may have reached your organization limit."); return; }
          setLoading(true); await loadOrganizations(); setSelected(result.data.id); setName(""); setSlug(""); setNotice("Organization created. Open its workspaces to create your first shared workspace.");
        } catch { setError("Unable to create your organization. Please try again."); } finally { setPending(""); }
      }}>
        <div className="field"><label htmlFor="org-name" className="label">Name</label><input id="org-name" className="input" value={name} onChange={event => setName(event.target.value)} required maxLength={100} autoComplete="organization" disabled={Boolean(pending)} /></div>
        <div className="field"><label htmlFor="org-slug" className="label">Unique slug</label><input id="org-slug" className="input" value={slug} onChange={event => setSlug(event.target.value)} required maxLength={80} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" aria-describedby="slug-help" disabled={Boolean(pending)} /><span id="slug-help" className="hint">Lowercase letters, numbers, and single hyphens.</span></div>
        <button className="btn btn-primary" disabled={Boolean(pending)}>{pending === "create" ? "Creating…" : "Create organization"}</button>
      </form>
    </section>
    {detailsLoading ? <section className="org-section" role="status">Loading members and invitations…</section> : full ? <>
      <section className="org-section" aria-labelledby="org-members-title"><div className="org-section-head"><h2 id="org-members-title"><Users size={16} aria-hidden="true" />Members of {full.name}</h2><span className="org-badge">{role}</span></div>
        <p className="hint">Roles and membership are enforced by Better Auth. Removing a member also removes their shared workspace access.</p>
        <div className="org-table-wrap"><table className="org-table"><thead><tr><th scope="col">Member</th><th scope="col">Role</th><th scope="col">Actions</th></tr></thead><tbody>{full.members.map(member => {
          const targetRole = managementRole(member.role);
          const ownRow = member.userId === session?.user.id;
          const editable = canManage && !ownRow && (role === "owner" || targetRole !== "owner");
          return <tr key={member.id}><td><strong>{member.user.name}{ownRow ? " (you)" : ""}</strong><span className="org-secondary">{member.user.email}</span></td><td>{editable ? <select className="input" aria-label={`Role for ${member.user.name}`} value={targetRole} disabled={Boolean(pending)} onChange={event => { const nextRole = event.target.value as Role; void run(`role:${member.id}`, () => authClient.organization.updateMemberRole({ organizationId: selected, memberId: member.id, role: nextRole }), "Member role updated."); }}><option value="member">Member</option><option value="admin">Admin</option>{role === "owner" ? <option value="owner">Owner</option> : null}</select> : <span className="org-badge">{targetRole}</span>}</td><td>{editable ? confirmMember === member.id ? <div className="org-confirm" role="group" aria-label={`Confirm removal of ${member.user.name}`}><span>Remove this member?</span><button className="btn btn-secondary" ref={cancelRef} disabled={Boolean(pending)} onClick={() => setConfirmMember(null)}>Cancel</button><button className="btn btn-secondary org-danger" disabled={Boolean(pending)} onClick={async () => { if (await run(`remove:${member.id}`, () => authClient.organization.removeMember({ organizationId: selected, memberIdOrEmail: member.id }), "Member removed.")) setConfirmMember(null); }}>Remove member</button></div> : <button className="btn btn-secondary" disabled={Boolean(pending)} onClick={() => setConfirmMember(member.id)}>Remove</button> : <span className="hint">{ownRow ? "Current account" : "Read only"}</span>}</td></tr>;
        })}</tbody></table></div>
      </section>
      <section className="org-section" aria-labelledby="org-invitations-title"><div className="org-section-head"><h2 id="org-invitations-title"><Mail size={16} aria-hidden="true" />Invitations</h2></div>
        {!canManage ? <p className="hint">Only organization owners and admins can send or cancel invitations.</p> : capabilities?.organizationInvitationsEnabled !== true ? <p className="org-notice" role="status">Invitations are awaiting verified email sender setup. No invitation email will be sent until delivery is enabled.</p> : <form className="org-inline" onSubmit={async event => { event.preventDefault(); if (await run("invite", () => authClient.organization.inviteMember({ organizationId: selected, email: email.trim(), role: inviteRole }), "Invitation queued for email delivery. The recipient must sign in with this email and verify it to accept.")) setEmail(""); }}><div className="field org-grow"><label className="label" htmlFor="invite-email">Email address</label><input id="invite-email" type="email" className="input" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} disabled={Boolean(pending)} /></div><div className="field"><label className="label" htmlFor="invite-role">Role</label><select id="invite-role" className="input" value={inviteRole} onChange={event => setInviteRole(event.target.value as "member" | "admin")} disabled={Boolean(pending)}><option value="member">Member</option><option value="admin">Admin</option></select></div><button className="btn btn-primary" disabled={Boolean(pending)}>{pending === "invite" ? "Sending…" : "Send invitation"}</button></form>}
        {full.invitations.length ? <div className="org-table-wrap"><table className="org-table"><thead><tr><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody>{full.invitations.map(invitation => <tr key={invitation.id}><td>{invitation.email}</td><td>{invitation.role}</td><td><span className="org-badge">{invitation.status === "pending" && clock !== null && new Date(invitation.expiresAt).getTime() < clock ? "expired" : invitation.status}</span></td><td>{canManage && invitation.status === "pending" ? <button className="btn btn-secondary" disabled={Boolean(pending)} onClick={() => void run(`cancel:${invitation.id}`, () => authClient.organization.cancelInvitation({ invitationId: invitation.id }), "Invitation canceled.")}>Cancel invitation</button> : <span className="hint">No action</span>}</td></tr>)}</tbody></table></div> : <p className="org-empty">No invitations yet.</p>}
      </section>
    </> : null}
  </main>;
}
