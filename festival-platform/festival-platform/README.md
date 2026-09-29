# Campus Festival Management Platform

A full-stack MVP for managing a campus festival's competitions: student registration
(online + on-site "Green Room"), a real-time anonymized judge portal, panel scoring
with averaging, live leaderboards, and certificate generation.

Built from the platform spec: JEDS/organizer portal, judging system, student
registration & code-letter IDs, and real-time judge ↔ Green Room sync.

## Stack

- **Backend:** Node.js, Express, Socket.IO (real-time), better-sqlite3 (zero-config file DB), pdfkit (certificates)
- **Frontend:** React (Vite), React Router, socket.io-client, plain CSS
- **Infra:** Docker + docker-compose for one-command local run

No payment/financial features are included, per the plan.

## Features implemented

- **Programs/Competitions:** organizer creates writing (pre-submitted) or stage (live) programs with a short code and time slot.
- **Student Registration:** one shared form for stage & writing programs; open to all campus members; both online (self-service) and on-site ("Green Room", organizer-entered) registration.
- **Code Letters & Participant IDs:** students choose an available performance code per program (A–Z, then AA–ZZ); the code sets their order, not signup time. Participant ID format `FEST-[ProgramCode]-[RegNumber]-[Code]`, e.g. `FEST-ESH-001-A`.
- **Judge Accounts:** system-issued judge codes (seeded examples below); organizers manually assign judges to programs.
- **Real-Time Judge Portal:** WebSocket push (Socket.IO) — new Green Room registrations appear in the judge's list within ~1-2 seconds, no refresh needed.
- **Anonymized Judging:** judges see Code Letter only, never student name/ID; they pick who to judge next (no forced order).
- **Panel Scoring:** numeric score (0-100) + letter grade (A-F) + remarks (≤500 chars); one submission per judge per participant, final — no revision/appeal endpoint exists.
- **Averaging & Confidentiality:** final rank uses the average of submitted judge scores. Judge scorecards are available to organizers for result review and correction; judges and the public do not see other judges' individual scorecards.
- **Live Leaderboard:** public page, ranked per program, updates in real time as scores come in.
- **Certificates:** auto-generated PDF certificates for 1st/2nd/3rd place.
- **Published-results posters:** organizers can download a podium poster as a PNG with the supplied festival logos and footer.
- **Team leader registration:** team leaders can submit a roster of up to 25 students for one program; each student is validated and receives an individual participant ID. Partial failures remain listed for correction.
- **Tie review:** the organizer results screen flags equal averages around the podium and asks the organizer to review scorecards and assign distinct places.
- **Judge progress and conflicts:** dashboard progress refreshes every 15 seconds; the schedule watch lists judges assigned to overlapping time slots.
- **Per-student judge panels:** organizers can override a student's panel in the Green Room or restore the program's default panel. Panel changes recalculate completion and averages; removed panelists' old scorecards remain visible as archived and do not count.
- **QR check-in:** organizers can make a scannable participant QR from the registration list. Scanning opens a sign-in protected check-in page; arrival can be confirmed or undone.
- **Bulk certificates:** download the published podium certificates together as one ZIP file.
- **Live display:** `/live-results` shows published results with larger projector-friendly type and a full-screen option.
- **Student result alerts:** on *My Results*, students can opt in to browser notifications while keeping that page open.
- **CSV tools:** organizers can import registration CSV rosters and export all registrations. Imported rows must include `code_letter`; students choose an available A–Z (then AA–ZZ) performance code during registration. Codes are unique per program and determine performance order. The import reports invalid/duplicate rows without dropping successful records.
- **Activity history:** the organizer dashboard records registration changes, judge and program changes, score corrections, check-ins, podium edits, and publication actions.

## Project structure

```
festival-platform/
├── backend/
│   ├── server.js          # Express + Socket.IO entry point
│   ├── db.js               # SQLite schema + seed data
│   ├── routes/
│   │   ├── auth.js         # organizer/judge login, judge account creation
│   │   ├── programs.js     # competitions CRUD, judge assignment
│   │   ├── registrations.js# registration + code-letter/participant-ID logic
│   │   ├── scores.js       # judge scoring, one-final-score enforcement
│   │   └── results.js      # ranking/averaging + certificate PDF
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # routing + simple role-based auth
│   │   ├── api.js           # REST client
│   │   ├── socket.js        # Socket.IO client
│   │   └── pages/
│   │       ├── Register.jsx     # public student registration
│   │       ├── GreenRoom.jsx    # organizer on-site registration + judge assignment
│   │       ├── ProgramsAdmin.jsx# organizer: create competitions
│   │       ├── JudgePortal.jsx  # real-time anonymized judging UI
│   │       ├── Leaderboard.jsx  # public live results display
│   │       └── Login.jsx
│   └── Dockerfile
└── docker-compose.yml
```

## Quick start (Docker)

```bash
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:4000/api

## Quick start (without Docker)

```bash
# Terminal 1
cd backend
npm install
npm run dev        # http://localhost:4000

# Terminal 2
cd frontend
npm install
npm run dev         # http://localhost:5173, proxies /api to :4000
```

## Seeded accounts (change before real use)

| Role      | Code            | Password    |
|-----------|-----------------|-------------|
| Organizer | `ORG-001`       | organizer123|
| Judge     | `JUDGE-2024-001`| judge123    |
| Judge     | `JUDGE-2024-002`| judge123    |

## Typical flow

1. Organizer logs in → **Programs** → creates competitions (e.g. "Essay Writing (English)", type `writing`; "Qawwali", type `stage`, category `General`).
2. Organizer assigns judges to each program from **Green Room**.
3. Students self-register online at `/register`, or organizer adds them on-site from **Green Room** — both get a Code Letter + Participant ID instantly.
4. Judge logs in, opens **Judge Portal**, selects the program — sees the anonymized, live-updating list and scores whoever they pick.
5. Once every assigned judge has scored each participant, organizers can review averages privately in the Green Room.
6. An organizer explicitly publishes the completed results from **Dashboard → Programs**. Only then do they appear on the home page and leaderboard, and certificates become available.

## Teams, publishing & live results (added)

- **Two teams:** every registration picks **Team 1 – Aliora** or **Team 2 – Nexiora** (required, online and on-site). Judges never see the team or name while scoring.
- **Publishing:** judges submit scores. Organizers review scorecards and placements in *Dashboard → Results* and publish approved results. The API rejects publishing until every participant has a score from every currently assigned judge.
- **Live on the home page:** published results appear right under the hero and update by themselves over Socket.IO (with a 30-second refresh as a fallback). The `/leaderboard` page shows every published program.
- **Team points:** organizers enter optional point values for 1st, 2nd, and 3rd place per program. There are no preset values; blank means no points. Equal scores share a place. Winners (top 3) are shown by name; everyone else by code letter only.
- **Student ID:** 4 digits + 2–3 letters + 3 digits (e.g. `2023CSE001`), validated on the form and on the server. Valid IDs register instantly.
- **Admin Dashboard** (`/admin/dashboard`): counts for everything, per-program quotas, and edit/delete for programs, judges and registrations.

Seeded judges: `JUDGE-2024-001`, `-002`, `-003` (password `judge123`). Change all default passwords before going live.

## Security and deployment notes

- Organizer and judge APIs require server-checked bearer sessions. Passwords are stored as scrypt hashes; existing plaintext user passwords are upgraded automatically at startup. Sessions last 8 hours and are kept in memory, so signing in again is required after a backend restart.
- The seeded local accounts use published demo passwords. Change them before public use. The Control Room has a separate admin login; set `ADMIN_CODE` and `ADMIN_PASSWORD`.
- Writing-competition file uploads (essays/stories) aren't wired up yet — `submission_file` exists in the schema as a placeholder; add multer + file storage when ready.
- Run one persistent backend instance with durable storage for its SQLite database. This app uses Socket.IO and `better-sqlite3`; a static Vercel deployment alone cannot run the backend or preserve its database. Set the Vercel project's root directory to `frontend`, set `VITE_API_BASE` to `https://YOUR_BACKEND/api`, and set `VITE_SOCKET_URL` to `https://YOUR_BACKEND` before building. If the API base is missing in a production build, API calls show a clear configuration error instead of silently receiving the SPA HTML page.
- Set `FRONTEND_ORIGIN` on the backend to the exact Vercel site origin (for example `https://your-site.vercel.app`) to restrict API and Socket.IO browser origins. Set `NODE_ENV=production`, `ADMIN_CODE`, `ADMIN_PASSWORD`, and strong unique values for `SEED_ORGANIZER_PASSWORD` and `SEED_JUDGE_1_PASSWORD` through `SEED_JUDGE_3_PASSWORD`. Production refuses to start without secure seed passwords; local development keeps its convenience defaults.
- **Persistence caveat:** this app still uses SQLite. Render's free service filesystem is temporary, so don't deploy this build over the live service until a persistent database is connected and verified. The ZIP contains the feature changes; it does not configure an external database or alter the live site.

### Deploying the frontend to Vercel

1. Push this project to a GitHub repository.
2. Import that repository in Vercel and set **Root Directory** to `frontend`.
3. Add `VITE_API_BASE=https://YOUR_BACKEND/api` and `VITE_SOCKET_URL=https://YOUR_BACKEND` as Vercel environment variables, then deploy. Use the public HTTPS URL of the backend host; do not use `localhost`.
4. On the persistent backend host, deploy the `backend/Dockerfile` or run `node server.js` with Node.js 20+, keep `/app/data` on persistent storage when using Docker, and set `FRONTEND_ORIGIN` to the Vercel site URL. Configure `ADMIN_CODE` and `ADMIN_PASSWORD` there as well.
5. After both services are deployed, redeploy the Vercel frontend if you changed its environment variables. Change the seeded organizer and judge passwords in the app before inviting users.

The frontend build can be hosted on Vercel, but the backend must remain on a persistent host that supports a long-running Node process and Socket.IO. The included Docker Compose setup runs both locally.

## Premier & Junior categories

Every program belongs to a **Premier** (stage 28–41, written 42–59) or **Junior** (stage 96–120, written 121–161) category and has a festival
program number. The official lists are seeded on first run (`backend/programSeed.js`); after that the admin
owns them. Students pick a category first, then a program from that category. Program short codes default to
`P42` / `J121`, so participant IDs look like `FEST-J121-001-A`.

## Hidden admin console (Control Room)

A separate admin dashboard, not linked anywhere on the site and hidden from the nav and command palette:

- **URL:** `/control-room` (change it with the `VITE_ADMIN_PATH` build variable, e.g. `/hq-7f3k`).
- **Sign-in:** its own admin account, not the organizer/judge logins. Set `ADMIN_CODE` and `ADMIN_PASSWORD`
  environment variables on the backend. If you don't, a random password is generated on first start and printed
  **once** in the backend log (`ADMIN-001`). Passwords are stored hashed (scrypt); sessions last 8 hours, live in
  memory, and are cleared on sign-out; five wrong attempts locks that IP for a minute.
- **Server-side protection:** the console only uses `/api/control/*`, and every route there requires the admin token.
- **What it does:** create / edit / delete programs (category, number, type, language, slot, quota, judges),
  assign judges, publish / unpublish results, manage judge accounts, edit or delete registrations, see counts
  per category and team, and change the admin password.

> The legacy organizer pages and the Control Room both require server-side authorization. Public registration and the published-results feed remain available without a login.

Docker: `ADMIN_CODE=boss ADMIN_PASSWORD='choose-a-strong-one' docker compose up --build`
# Persistent data on Render Free

The backend keeps its existing SQLite schema and stores a consistent SQLite snapshot in Neon after each successful data-changing API request. At startup it restores that snapshot before loading the application routes. This keeps registrations, scores, judge assignments, published places, and account changes across Render restarts while avoiding an application-wide SQL rewrite.

To enable persistence on Render:

1. Create a Neon Postgres project on the free plan.
2. Add the Neon pooled connection string as the `DATABASE_URL` secret for the `rendezvous-api` Render service. Keep the URI private.
3. Deploy the backend. Its `/api/health` response reports `database: "neon"` when the connection is ready.

Production startup intentionally fails if `DATABASE_URL` is missing. The snapshot table is `rendezvous_app_state`; its single row is capped at 400 MB to leave room under Neon Free's storage limit. Run one Render backend instance for this SQLite snapshot design. Keep the database and app environment backups protected as they contain festival records and credentials.
