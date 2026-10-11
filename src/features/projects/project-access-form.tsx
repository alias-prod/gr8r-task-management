"use client";

import { useState } from "react";
import { useWorkspaceStore } from "@/store/workspace-store";

type AccessProject = { id: string; lead: string; private?: boolean; members: string[] };
export function ProjectAccessForm({ project }: { project: AccessProject }) {
  const { data, pending, error, setProjectAccess } = useWorkspaceStore(state => state);
  const [open, setOpen] = useState(false);
  const [privateProject, setPrivateProject] = useState(project.private ?? true);
  const [memberIds, setMemberIds] = useState(project.members);
  if (project.lead !== data.me) return null;
  if (!open) return <div style={{padding:"8px 20px"}}><button className="btn btn-secondary btn-sm" onClick={() => {setPrivateProject(project.private ?? true);setMemberIds(project.members);setOpen(true);}}>Manage project access</button></div>;
  return <form className="panel col" aria-label="Project access" style={{padding:16,gap:12,margin:20,maxWidth:520}} onSubmit={async event => {
    event.preventDefault();
    if (pending) return;
    if (await setProjectAccess(project.id, privateProject, memberIds.filter(id => data.members.some(member => member.id === id)))) setOpen(false);
  }}>
    <h2>Project access</h2>
    <label className="row"><input type="checkbox" checked={privateProject} disabled={pending} onChange={event => setPrivateProject(event.target.checked)}/>Private project</label>
    <p className="hint">{privateProject ? "Only the project lead and selected members can access this project." : "All members of this workspace can access this project."}</p>
    {privateProject ? <fieldset className="col" style={{gap:8}}><legend className="label">Project members</legend>{data.members.map(member => <label className="row" key={member.id}><input type="checkbox" disabled={pending || member.id === project.lead} checked={member.id === project.lead || memberIds.includes(member.id)} onChange={event => setMemberIds(ids => event.target.checked ? [...ids,member.id] : ids.filter(id => id !== member.id))}/>{member.name}{member.id === project.lead ? " (lead)" : ""}</label>)}</fieldset> : null}
    {error ? <p className="err" role="alert">{error}</p> : null}
    <div className="row"><button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "Saving…" : "Save access"}</button><button className="btn btn-secondary" type="button" disabled={pending} onClick={() => setOpen(false)}>Cancel</button></div>
  </form>;
}
