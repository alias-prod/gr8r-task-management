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

Sign in using Google or a real email/password account. Authentication and private workspace data are stored in Convex through Better Auth. Dashboard routes require an authenticated user; workspace operations verify ownership and membership.

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
| `GOOGLE_CLIENT_ID` | Google web-application OAuth client ID, not an iOS/Android client ID |
| `GOOGLE_CLIENT_SECRET` | Server-only secret, stored as a Vercel Secret |
| `BETTER_AUTH_SECRET` | Server-only Better Auth signing/encryption secret |

### Convex backend

Set `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` in the corresponding Convex deployment too. Set `BETTER_AUTH_URL` to the canonical app origin and `AUTH_ENV=production` in production. Convex supplies its own platform `CONVEX_SITE_URL`; that does not populate Next.js's `NEXT_PUBLIC_CONVEX_SITE_URL`.

The Google web client must allow the canonical origin and the exact callback `<canonical-origin>/api/auth/callback/google`. Keep existing callbacks when adding this app to a shared client.

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
