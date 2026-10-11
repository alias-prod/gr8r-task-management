"use client";
import Link from "next/link";
import {useState} from "react";
import {authClient} from "@/lib/auth-client";
import {useWorkspaceSelection} from "@/store/workspace-selection";
import styles from "./workspace-picker.module.css";
export default function WorkspacePicker(){
 const scope=useWorkspaceSelection();const {data:organizations,isPending}=authClient.useListOrganizations();
 const [pending,setPending]=useState(false);const [error,setError]=useState("");
 return <div className={styles.picker}><label htmlFor="organization-scope">Organization</label><select id="organization-scope" className="input" value={scope.organizationId??""} disabled={pending||isPending} onChange={async event=>{setPending(true);setError("");try{const result=await authClient.organization.setActive({organizationId:event.target.value||null});if(result.error)throw new Error();}catch{setError("Could not switch organization.");}finally{setPending(false);}}}><option value="">Personal workspace</option>{organizations?.map(org=><option key={org.id} value={org.id}>{org.name}</option>)}</select>
 <label htmlFor="workspace-scope">Workspace</label><select id="workspace-scope" className="input" value={scope.workspaceId} disabled={pending} onChange={event=>scope.selectWorkspace(event.target.value)}>{scope.workspaces.map(ws=><option key={ws._id} value={ws._id}>{ws.name}</option>)}</select>
 <div className={styles.footer}><span>{scope.organizationId?scope.role:"Private"}</span><Link href="/organizations">Manage</Link></div>{error?<p className="err" role="alert">{error}</p>:null}</div>;
}
