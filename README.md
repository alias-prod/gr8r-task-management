# Gr8r Studio

Gr8r Studio is a project and task workspace for planning work, tracking progress, and switching between a company view and a personal view. The app runs in the browser with local demo data, and it is structured so a real API can replace that data later.

## Features

- Workspace home with company health and a personal task view
- Projects, tasks, board and list views, calendar, and timeline
- Inbox, notifications, favorites, search, and activity
- Members, teams, profile, and workspace settings
- Archive and task details, including status, subtasks, and comments

## Stack

- Next.js 16 (App Router) and React 19
- TypeScript
- Zustand for client state
- Axios for HTTP, ready for a future API

## Project structure

```
src/
  app/          Routes and layouts only
  features/     Screens, UI, and feature logic
  components/   Shared layout, providers, and UI
  hooks/        Shared hooks
  lib/          Dates, seed data, workspace helpers, and the API client
  store/        Auth, workspace, view mode, and UI state
  styles/       Design tokens and global styles
  types/        Shared types
```

Route files re-export a feature page. Product code lives in `src/features`. Shared code stays in `src/components`, `src/hooks`, `src/lib`, and `src/store`.

`legacy/` keeps the previous static prototype. The running app does not use it.

## Getting started

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3003](http://localhost:3003).

Sign in using Google or a real email/password account. Authentication and workspace data are stored in Convex through Better Auth. Personal workspaces remain private. Organizations use authoritative Better Auth membership and owner/admin/member roles; members share their organization's workspaces. Dashboard operations check both fresh database-session validity and tenant access, including after membership removal or role changes.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server on port 3003 |
| `npm run build` | Production build |
| `npm run start` | Serve the production build on port 3003 |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Type-check the app and backend source |
| `npm run test:once` | Run the test suite once |

## Environment

Configure each deployment environment separately. Never point production at the development backend, commit secrets, or prefix secrets with `NEXT_PUBLIC_`.

### Vercel / Next.js

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_CONVEX_URL` | Matching deployment's `.convex.cloud` URL, used by the browser and server helpers |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | Matching deployment's `.convex.site` HTTP-actions URL, required for auth routes at build time |
| `CONVEX_DEPLOY_KEY` | Server-only deployment key for the intended Convex environment |
| `LIVEKIT_URL` | Approved LiveKit project's WebSocket URL |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Server-only project credentials |
| `LIVEKIT_AGENT_NAME` | Explicit dispatch name of the separately deployed voice worker |
| `LIVEKIT_DISPATCH_SECRET` | Separate server/worker dispatch-proof secret, at least 32 characters |

### Convex backend

Set `BETTER_AUTH_SECRET`, the web-application `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` in the corresponding Convex deployment. These authentication credentials are consumed by Convex, not enabled by Vercel-only copies. Set `BETTER_AUTH_URL` to the canonical app origin and `AUTH_ENV=production` in production. Convex supplies its own platform `CONVEX_SITE_URL`; that does not populate Next.js's `NEXT_PUBLIC_CONVEX_SITE_URL`.

The Google web client must allow the canonical origin and the exact callback `<canonical-origin>/api/auth/callback/google`. Keep existing callbacks when adding this app to a shared client.

## Organizations, email and voice

- `/organizations` manages real Better Auth organizations, active selection, members, roles and invitations. It is accessible without creating a personal workspace first.
- The sidebar switches organizations and workspaces. Owner/admin roles create and rename organization workspaces. Shared projects explicitly use `private: false` and allow workspace-member collaboration. Private projects default to lead-only access; their lead selects project members at creation or through **Manage project access**. Convex persists and enforces grants on project/task/comment reads and writes, and filters workspace-wide project/task/activity pages before returning rows. Missing legacy privacy fields remain private. Workspace admin status does not bypass private-project grants. Existing private workspaces are not automatically made shared.
- `/accept-invitation` preserves its destination through Google/email sign-in, checks the invited address, and requires a verified email. Shared membership is always read from the auth component rather than trusted from a stale workspace-member mirror.
- The local `convex/betterAuth` component preserves the original component name/tables and adds organization models. The app schema uses Convex Ents, retaining existing indices and adding workspace/project/member relationships.

### Resend component

Configure `RESEND_API_KEY`, `RESEND_FROM`, and `RESEND_EMAIL_ENABLED=true` in **Convex** only after confirming the key's intended scope and verifying the sender domain. Until then, password signup and invitations are disabled; Google and existing password login remain available. Verification, recovery and invitations use durable real email enqueue, not mock delivery. A queued message does not prove final delivery; verify receipt before declaring the email rollout complete. No subscription upgrade or DNS change is implied by deploying this code.

### LiveKit worker

See [`voice-agent/README.md`](voice-agent/README.md). The web app and long-running worker are separate deployments. Keep voice disabled until the owned project, worker hosting/quota, dispatch name, shared dispatch proof and inference allocation are confirmed. The endpoint authenticates and authorizes the workspace, checks origin, enforces a durable 30-second per-workspace cooldown and aggregate six-per-user/hour admission ceiling, then issues a short microphone-only token for an opaque room. The worker validates signed dispatch metadata before starting inference, has a ten-minute maximum session, no task API capabilities and no app recording/transcript storage. Existing workers are never replaced automatically. Provider/project retention policies require separate review.

## Deployment

The app deploys on Vercel from the repository root. Production is the Vercel project `gr8r-task-management` in ALIAS Prod and the Convex production deployment `amiable-koala-892` in `alias-prod/convex-red-jacket`.

Canonical production origin: `https://gr8r-task-management-snowy.vercel.app`.

1. Configure and verify production environment values in both services and Google's callback allowlist.
2. Deploy the Convex schema/functions using the production deploy key: `npx convex deploy --typecheck enable`. Do not disable schema validation or recreate an existing production database to bypass errors.
3. Deploy the matching frontend revision to the linked Vercel project. A successful local or v0-preview check does not prove production is deployed.
4. Verify Google sign-in through the production domain, session persistence after reload, and signed-out access isolation on every assigned alias.

- Framework preset: Next.js
- Build command: `npm run build`
- Output directory: Next.js default
- Install command: `npm install`
