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
- **Code Letters & Participant IDs:** assigned in registration order per program (A, B, C...); Participant ID format `FEST-[ProgramCode]-[RegNumber]-[CodeLetter]`, e.g. `FEST-ESH-001-A`.
- **Judge Accounts:** system-issued judge codes (seeded examples below); organizers manually assign judges to programs.
- **Real-Time Judge Portal:** WebSocket push (Socket.IO) — new Green Room registrations appear in the judge's list within ~1-2 seconds, no refresh needed.
- **Anonymized Judging:** judges see Code Letter only, never student name/ID; they pick who to judge next (no forced order).
- **Panel Scoring:** numeric score (0-100) + letter grade (A-F) + remarks (≤500 chars); one submission per judge per participant, final — no revision/appeal endpoint exists.
- **Averaging & Confidentiality:** final rank uses the average of all submitted judge scores; individual judge scores are never exposed to organizers or the public, only the average.
- **Live Leaderboard:** public page, ranked per program, updates in real time as scores come in.
- **Certificates:** auto-generated PDF certificates for 1st/2nd/3rd place.

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

1. Organizer logs in → **Programs** → creates competitions (e.g. "Essay Writing (English)", type `writing`; "Qawwali Night", type `stage`).
2. Organizer assigns judges to each program from **Green Room**.
3. Students self-register online at `/register`, or organizer adds them on-site from **Green Room** — both get a Code Letter + Participant ID instantly.
4. Judge logs in, opens **Judge Portal**, selects the program — sees the anonymized, live-updating list and scores whoever they pick.
5. **Leaderboard** updates in real time as scores land; once all assigned judges have scored a participant, their status flips to "judged" and their average appears in the rankings.
6. Organizer downloads 1st/2nd/3rd place certificates from Green Room's results table.

## Teams, publishing & live results (added)

- **Two teams:** every registration picks **Team 1 – Aliora** or **Team 2 – Nexiora** (required, online and on-site). Judges never see the team or name while scoring.
- **Publishing:** once every participant in a program has been scored by every assigned judge, any assigned judge can press **Publish results** in the Judge Portal (the organizer can also publish/unpublish from *Dashboard → Programs*).
- **Live on the home page:** published results appear right under the hero and update by themselves over Socket.IO (with a 30-second refresh as a fallback). The `/leaderboard` page shows every published program.
- **Team points:** 1st = 5, 2nd = 3, 3rd = 1 for the winner's team (edit `backend/teams.js`). Equal scores share a place. Winners (top 3) are shown by name; everyone else by code letter only.
- **Student ID:** 4 digits + 2–3 letters + 3 digits (e.g. `2023CSE001`), validated on the form and on the server. Valid IDs register instantly.
- **Admin Dashboard** (`/admin/dashboard`): counts for everything, per-program quotas, and edit/delete for programs, judges and registrations.

Seeded judges: `JUDGE-2024-001`, `-002`, `-003` (password `judge123`). Change all default passwords before going live.

## Notes / next steps for production hardening

- Auth is intentionally minimal (plaintext password match, no JWT/session) to keep the MVP simple to run locally — add bcrypt hashing + JWT/session cookies before any real deployment.
- Writing-competition file uploads (essays/stories) aren't wired up yet — `submission_file` exists in the schema as a placeholder; add multer + file storage when ready.
- better-sqlite3 is fine for a single-server festival deployment; swap to Postgres if you need multiple backend instances.
- Add rate limiting / input sanitization before exposing the public registration form to the internet.

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

> The older organizer routes (Green Room, Programs page) are unchanged and still unauthenticated on the API
> side, as in the original MVP. Only the Control Room is token-protected.

Docker: `ADMIN_CODE=boss ADMIN_PASSWORD='choose-a-strong-one' docker compose up --build`
