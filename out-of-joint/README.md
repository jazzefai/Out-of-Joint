# Out of Joint — Classic (No Cross-Table) · Mobile Companion App

A Jackbox-style PWA companion for the physical card game **Out of Joint — Classic**. Phones are controllers; the host screen is projected. No player accounts, no lead capture, no ads.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 App Router |
| Language | TypeScript |
| Styling | Tailwind CSS (Space Mono + DM Sans) |
| Database | Supabase (Postgres + Realtime) |
| Hosting | Vercel |

---

## Quick Start

### 1. Clone & install

```bash
git clone https://github.com/your-org/out-of-joint
cd out-of-joint
npm install
```

### 2. Supabase setup

1. Create a project at [supabase.com](https://supabase.com)
2. Run the migration in `supabase/migrations/001_initial_schema.sql` via the SQL editor
3. Copy your project URL and anon key

### 3. Environment variables

```bash
cp .env.local.example .env.local
# Edit .env.local with your Supabase credentials
```

### 4. Run locally

```bash
npm run dev
# App at http://localhost:3000
```

### 5. Deploy to Vercel

```bash
npx vercel --prod
# Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to Vercel env vars
```

---

## Project Structure

```
src/
├── app/
│   ├── layout.tsx              # Root layout (PWA meta, fonts)
│   ├── page.tsx                # Redirects → /join
│   ├── globals.css             # Tailwind + custom CSS
│   ├── host/
│   │   ├── new/page.tsx        # Create room, choose mode, set teams
│   │   └── room/[code]/page.tsx # Lobby + round controller + end screen
│   └── join/
│       ├── page.tsx            # Enter room code
│       └── [code]/page.tsx     # Team select + voting + results
├── components/
│   └── shared/
│       ├── StatBar.tsx         # E/C/A bars + CityStatsCard
│       ├── ParticipationMeter.tsx
│       ├── CountdownTimer.tsx
│       └── DeltaBadge.tsx      # Stat delta display
├── lib/
│   ├── supabase.ts             # Client singleton + service client
│   ├── session.ts              # Anonymous session (localStorage)
│   ├── actions.ts              # Server actions (room CRUD, game logic)
│   └── classicDeck.ts          # Hardcoded deck, tallying, tie-breaking
└── types/
    └── index.ts                # All TypeScript types

supabase/
└── migrations/
    └── 001_initial_schema.sql  # Schema, RLS, realtime, helper functions
```

---

## Game Deck (Hardcoded)

| Round | Title | Base Effect | A | B | C |
|---|---|---|---|---|---|
| 1 | Total Automation | E−3 | E+2/A−2 | E−2/C+3 | C−1/A+2 |
| 2 | Predictive Governance | A−2 | E+2/C−2/A−1 | E−1/C+2 | E−2/C+1/A+2 |
| 3 | Surveillance Drift | C−1/A−1 | E−2/A+2 | E−1/C−2/A+3 | E+3/C−2/A−2 |
| 4 | Hyper-Personalization | C−1 | E−1/A−2 | E−2/C−1/A+2 | E+2/C−1/A+1 |

---

## Play Modes

### Teams as Cities
- Each team has independent E/C/A stats
- In **teams mode**, each team votes internally; the majority per team wins
- Teams can collapse independently

### Whole Room One City
- Everyone shares one set of E/C/A stats
- A single global vote determines the net effect
- Room collapses together

---

## Round Flow (Host)

```
[Lobby] → Apply Base Effect
       → Open Voting  (60s countdown)
       → Close Voting (or auto-close on timer)
       → Apply Net Effect (winner, with tie-break)
       → Next Round / End Game
```

### Collapse Detection
If any stat (E, C, or A) reaches ≤ 0 after applying base or net effect, the team (or room) is marked collapsed. The host sees a **City Collapsed** screen with a prompt to reveal the meltdown ending card from the physical deck.

### Tie-Breaking
When two or more options tie in votes, a coin flip selects the winner. The host UI shows "Tie broken by coin flip — X wins" and the player who voted X sees their option highlighted.

---

## Anonymous Security Model

- **No player accounts.** Players are identified by a UUID stored in `localStorage` (`ooj_session_id`).
- **Host authentication.** When a room is created, a `host_secret` UUID is generated and stored in the host's `localStorage`. All state-mutating server actions verify this secret server-side before applying changes.
- **RLS.** All tables have Row Level Security enabled. Public read access is granted to all rows (filtered in queries by room ID/code). Writes are unrestricted at the DB level for insertions; the host secret provides the second layer of protection for privileged operations.
- **No cross-room data leakage.** All queries filter by `room_id` or join via room code.

---

## Supabase Realtime

All four tables are published to Supabase Realtime:

| Table | Who subscribes | Events |
|---|---|---|
| `rooms` | Host + all players | Phase changes, round advances |
| `teams` | Host + all players | Stat updates, collapse flags |
| `players` | Host | Headcount, team assignments |
| `votes` | Host | Participation meter |

---

## PWA Installation

Players can install the app to their home screen:
- iOS: Safari → Share → Add to Home Screen
- Android: Chrome → ⋮ → Add to Home Screen

The app launches in `standalone` mode (no browser chrome).

---

## Development Notes

### Adding more rounds
Edit `CLASSIC_DECK` in `src/lib/classicDeck.ts`. Update the round cap check in `actions.ts` (`current_round >= 4`).

### Changing voting timer
Pass `durationSeconds` to `openVoting()` in `actions.ts`. Currently defaults to 60s.

### Type-check
```bash
npm run type-check
```

---

## License

MIT — see LICENSE. 
