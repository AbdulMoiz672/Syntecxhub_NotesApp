# Syntecxhub_NotesApp

A notes app built with Next.js. Create, edit, search, pin, tag, and organize notes into folders. Notes are saved locally and can sync through MongoDB.

## Requirements

- Node.js 20.19.0 or newer
- npm
- MongoDB running on this machine for account-based sync (optional; local notes work without it)

## Local setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without MongoDB configuration, notes remain available in this browser and device. Use **Export** to download a JSON backup.

## MongoDB sync

1. Install MongoDB Community Server and make sure it is running on `localhost:27017`.
2. Copy `.env.example` to `.env.local` in the project root. The supplied URI is `mongodb://localhost:27017/`; set `MONGODB_DB` to the database name you want to use.
3. Restart the development server, choose **Sync**, and create an account. Sign in with that account on other devices that use this same app server and database.

Keep `.env.local` private. The MongoDB URI is used only by server-side routes. A random session-signing key is generated once and stored in the database; deleting that database invalidates existing sessions. Passwords are hashed before storage. Account passwords must be 8 to 72 UTF-8 bytes.

The localhost URI is for local development. A deployed app needs a MongoDB server reachable from its host; `localhost` on a remote host refers to that host, not your development computer.

## Checks

```bash
npm run lint
npm run build
```

## Project structure

- `src/app/page.tsx` - Notes interface, local persistence, and cloud sync client
- `src/app/page.module.css` - Responsive workspace styling
- `src/app/api/auth/route.ts` - Account registration, sign-in, and sign-out
- `src/app/api/workspace/route.ts` - Authenticated MongoDB workspace sync
- `src/lib/` - MongoDB connection, sessions, and workspace merge logic
