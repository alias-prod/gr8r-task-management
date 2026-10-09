"use client";

import { useState } from "react";
import { useWorkspaceStore } from "@/store/workspace-store";

export function NewProjectForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const { addProject, pending, error } = useWorkspaceStore((state) => state);
  if (!open) return <button className="btn btn-primary" onClick={() => setOpen(true)}>New project</button>;
  return <form className="panel col" style={{ padding: 16, gap: 12, maxWidth: 520, marginBottom: 16 }} aria-label="New project" onSubmit={async (event) => {
    event.preventDefault();
    if (pending) return;
    const id = await addProject({ name, key, description });
    if (id) { setOpen(false); setName(""); setKey(""); setDescription(""); }
  }}>
    <div className="field"><label className="label" htmlFor="project-name">Project name</label><input id="project-name" className="input" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} /></div>
    <div className="field"><label className="label" htmlFor="project-key">Project key</label><input id="project-key" className="input" value={key} onChange={(event) => setKey(event.target.value.toUpperCase())} required pattern="[A-Za-z][A-Za-z0-9]{1,7}" maxLength={8} aria-describedby="project-key-hint" /><span id="project-key-hint" className="hint">2–8 letters or numbers, starting with a letter. Used in task IDs.</span></div>
    <div className="field"><label className="label" htmlFor="project-description">Description</label><textarea id="project-description" className="textarea" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} /></div>
    {error ? <p role="alert" className="err">{error}</p> : null}
    <div className="row"><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Create project"}</button><button type="button" className="btn btn-secondary" disabled={pending} onClick={() => setOpen(false)}>Cancel</button></div>
  </form>;
}
