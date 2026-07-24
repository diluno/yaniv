# Yaniv Online

A private, browser-based implementation of the card game **Yaniv** for 2–4 players. Create a room, share the code or link, and play in realtime. No accounts, no history — rooms live only in Redis and expire on inactivity.

## Stack

- **Nuxt 4 / Vue 3** — one codebase for UI, HTTP API, and WebSocket endpoint
- **Nitro WebSockets** (`/api/ws`) — realtime transport; clients reconnect automatically
- **Redis** (Upstash on Vercel, plain Redis locally) — authoritative room state, CAS commits, pub/sub fan-out
- **Zod** — network payload validation
- **Vitest** (unit + integration) and **Playwright** (browser E2E)

## Architecture

Four layers with strict boundaries:

1. **Pure game domain** (`shared/game/`) — deck, discard validation (sets/runs/jokers), turn reducer, Yaniv/Assaf scoring, score resets, elimination, projections, invariants. Deterministic given state + action + random source; no I/O.
2. **Application service** (`server/services/`) — authenticates the actor, runs the reducer, commits with a Lua compare-and-set against the stored room version, retries on conflict, publishes `{roomCode, version}` on the room channel. Duplicate `actionId`s are idempotent.
3. **Transport** (`server/api/`) — HTTP create/join, WebSocket authenticate/heartbeat/action, presence (pause on disconnect, auto-resume, host transfer), per-room pub/sub subscription that fans out **per-player private projections** — a client never receives another player's hand or any token hash.
4. **Client** (`app/`) — renders the latest server snapshot only; optimistic UI is limited to selection highlighting and a pending button.

Room state is stored as one JSON value at `yaniv:room:{CODE}` with sliding TTL (lobby 2 h, playing 6 h, finished 1 h). WebSocket connections are treated as disposable: every mutation lives in Redis, and a reconnect (to any function instance) reconstructs everything from a fresh snapshot.

## Rules (house configuration)

- 54-card deck (2 jokers), 5-card hands, Ace = 1, courts = 10, joker = 0
- Discard a single, a set of one rank (jokers are not wildcards in sets, but the two jokers form a pair), or a run of 3+ consecutive same-suit cards (ace low; jokers fill gaps)
- Then draw from the deck or take the first/last card of the previous play
- Call **Yaniv** at the start of your turn at ≤ 5 points; equal-or-lower opponent hand means **Assaf** (caller gets hand value + 30, lowest opponent(s) add 0)
- Exactly 50 → reset to 0; exactly 100 → reset to 50; above 100 → eliminated; last player standing wins

All rule constants live in `shared/game/constants.ts`.

## Local development

```bash
pnpm install
docker run -d --name yaniv-redis -p 6379:6379 redis:7-alpine
pnpm dev            # http://localhost:3000
```

Environment variables (see `.env.example`): `REDIS_URL` locally, `UPSTASH_REDIS_URL` in production. Defaults to `redis://localhost:6379`.

## Tests

```bash
pnpm test           # unit + integration (integration needs local Redis)
pnpm test:e2e       # Playwright, multi-context browser flows (starts dev server)
pnpm build          # production build
```

## Deployment (Vercel)

1. Create a Vercel project from this repository (framework: Nuxt).
2. Enable Fluid Compute and confirm WebSocket support for the project.
3. Add **Upstash Redis** via the Vercel Marketplace and connect it (injects `UPSTASH_REDIS_URL`). Choose a region near the function region (EU recommended).
4. Set the WebSocket function duration to the plan maximum — reconnect logic still handles connection closes at duration boundaries.
5. Deploy. The whole app is one Vercel project plus the Redis resource.

## Error codes

Stable codes (e.g. `NOT_YOUR_TURN`, `STALE_STATE`, `INVALID_DISCARD`, `YANIV_VALUE_TOO_HIGH`) are defined in `shared/game/errors.ts` and used across server responses, WebSocket errors, and tests.
