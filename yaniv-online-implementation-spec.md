# Yaniv Online — Implementation Specification

**Status:** MVP specification  
**Audience:** Implementing coding agent  
**Language:** English only  
**Primary platform:** Mobile web, responsive through desktop  
**Game size:** 2–4 players  
**Persistence:** Active rooms only; no accounts, history, statistics, or long-term game storage

---

## 1. Product summary

Build a private, browser-based implementation of the card game **Yaniv**. A player creates a room, receives a short code and shareable URL, and up to three other people join by entering a display name. The game runs in realtime and is controlled entirely by the server so that clients cannot manipulate cards, turns, scores, or randomization.

The application is intentionally small:

- No user accounts
- No public matchmaking
- No chat or reactions
- No spectators
- No bots
- No turn timer
- No saved match history
- No admin dashboard
- No installation requirement
- One codebase and one Vercel deployment
- One small Redis resource for active room state and realtime coordination

The desired experience is closer to opening a private board-game link with friends than joining a competitive gaming platform.

---

## 2. Fixed product decisions

### 2.1 Game configuration

| Setting | MVP value |
|---|---:|
| Players | 2–4 |
| Deck | 52 standard cards + 2 jokers |
| Starting hand | 5 cards |
| Yaniv threshold | 5 points or fewer |
| Ace value | 1 |
| Number-card value | Face value |
| Jack, Queen, King | 10 |
| Joker value | 0 |
| Assaf penalty | Caller’s hand value + 30 |
| Score limit | A player is eliminated above 100 |
| Exact 50 | Score resets to 0 |
| Exact 100 | Score resets to 50 |
| Turn timer | None |
| Match history | None |
| Language | English |

All rule constants must live in one shared configuration module rather than being scattered through components or route handlers.

### 2.2 Disconnect policy

An active round pauses when a non-eliminated player disconnects.

- The server marks a player disconnected after the WebSocket closes or heartbeats fail.
- The same player can reclaim the seat using their existing session token.
- The game resumes automatically when all required players reconnect.
- After a player has been disconnected for at least 2 minutes, the current host can choose **Remove player and restart round**.
- Removing a player aborts only the current round. Scores from completed rounds remain unchanged.
- All cards are collected and a new round is dealt to the remaining active players.
- If the host disconnects, host status transfers after 30 seconds to the longest-connected active player.
- If fewer than two players remain, the match ends without recording a winner.
- There is always an **Leave game** or **End game** escape route; players are never trapped in a paused room.

This is preferable to silently playing for an absent person or modifying a partially played hand.

---

## 3. Recommended technical architecture

### 3.1 Stack

Use a single TypeScript repository:

- **Nuxt 4**
- **Vue 3**
- **Nitro server routes**
- **Native WebSocket endpoint through Nitro**
- **Vercel Functions with Fluid Compute**
- **Upstash Redis provisioned through the Vercel Marketplace**
- **Zod** for network payload validation
- **Vitest** for unit and integration tests
- **Playwright** for browser tests
- **pnpm** as package manager
- Styling with plain scoped CSS and design tokens, or Tailwind CSS if the implementing agent is substantially faster with it

Do not add a relational database. Redis is used only for active rooms, short-lived sessions, concurrency control, and pub/sub.

### 3.2 Why this architecture

Nuxt keeps the browser UI, HTTP endpoints, WebSocket endpoint, validation, and shared TypeScript game engine in one project. Vercel can host the full application. Redis is still required because WebSocket reconnects or separate players may land on different Vercel Function instances; in-memory room state is therefore not authoritative.

The complete operational footprint is:

1. One Git repository
2. One Vercel project
3. One Upstash Redis database connected to that project

No separately managed server is required.

### 3.3 Important Vercel constraint

Treat WebSocket connections as temporary transport connections, not as storage.

- Connections can close when a Vercel Function reaches its maximum duration.
- Clients must reconnect automatically.
- A reconnect may reach another function instance.
- Every authoritative room mutation must be written to Redis.
- Redis pub/sub must notify all function instances that currently have clients in the same room.
- A newly connected client must be able to reconstruct everything from Redis.

The client must tolerate a connection closing at any time without losing its seat or corrupting the match.

### 3.4 Fallback if Vercel WebSockets prove unstable

Do not implement this initially, but isolate transport behind an interface so the WebSocket layer could later be replaced with Ably or another managed realtime provider. The game engine, Redis model, actions, and client projections should remain unchanged.

---

## 4. Architecture boundaries

Split the project conceptually into four layers.

### 4.1 Pure game domain

Contains no Nuxt, Redis, WebSocket, browser, or date APIs.

Responsibilities:

- Card definitions and values
- Deck generation
- Cryptographically supplied shuffle input
- Legal discard validation
- Turn validation
- Yaniv and Assaf resolution
- Scoring
- Score resets
- Elimination
- Round setup
- Match completion
- Public/private state projections

All game-domain functions should be deterministic when given their state, action, timestamp, and random source.

### 4.2 Application service

Responsibilities:

- Authenticate room player
- Load room from Redis
- Validate action envelope
- Call pure reducer
- Atomically commit the next room state
- Publish room version update
- Return action acknowledgement or structured error
- Refresh room TTL

### 4.3 Transport

Responsibilities:

- HTTP create/join endpoints
- WebSocket connection lifecycle
- Heartbeats and presence
- Action messages
- Reconnection
- Broadcasting tailored snapshots

The transport must never implement game rules.

### 4.4 Client application

Responsibilities:

- Render the latest server projection
- Let the player select and order cards
- Let the player choose a draw source
- Submit actions
- Display pending, stale, disconnected, paused, round-result, and error states
- Never infer or commit authoritative outcomes locally

Optimistic UI may highlight selected cards or show a pending button, but it must not remove cards or advance turns until a server snapshot confirms the action.

---

## 5. Card and rules specification

## 5.1 Deck

Use one 54-card deck for all supported player counts.

Each physical card has a unique immutable ID.

```ts
type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades'
type Rank =
  | 'A' | '2' | '3' | '4' | '5' | '6' | '7'
  | '8' | '9' | '10' | 'J' | 'Q' | 'K'
  | 'JOKER'

interface Card {
  id: string
  suit: Suit | null
  rank: Rank
  value: number
}
```

Suggested IDs:

- `clubs-A`
- `hearts-10`
- `joker-1`
- `joker-2`

Card IDs must never be reused within a deck.

## 5.2 Values

```ts
A = 1
2–10 = numeric face value
J, Q, K = 10
Joker = 0
```

`handValue(hand)` is the sum of card values. A joker used as a wildcard still scores 0.

## 5.3 Valid discards

A player must discard exactly one legal packet, then draw exactly one card.

A legal packet is one of:

1. **Single:** Any one card.
2. **Set:** Two or more cards of the same rank.
3. **Run:** Three or more consecutive ranks of the same suit.

Rules for sets:

- Ordinary sets contain the same printed rank.
- The two jokers may be discarded together as a joker set.
- A joker is not a wildcard in an ordinary rank set.
- Sets may be explicitly ordered by the player because only endpoint cards are drawable by the next player.

Rules for runs:

- All non-joker cards must have the same suit.
- Ace is low only.
- Valid sequence examples: A–2–3, 7–8–9, 10–J–Q–K.
- Q–K–A is invalid.
- Jokers may stand for missing ranks.
- A run is valid when at least one assignment of joker positions creates one consecutive same-suit sequence.
- The server must reject ambiguous submitted orderings that do not themselves describe a valid consecutive sequence.
- The client should normally sort a run into ascending sequence order.
- Multiple jokers are allowed if the sequence remains valid.
- A run cannot be made entirely from jokers because its suit and rank range would be undefined.

Do not implement slam-downs, out-of-turn draws, or other optional variants.

## 5.4 Draw sources

After choosing a discard packet, the player chooses exactly one draw source:

- The top card of the face-down draw pile
- The first card of the previous player’s discard packet
- The last card of the previous player’s discard packet

When the previous discard packet has one card, first and last are the same and should appear as one option.

Middle cards of a multi-card packet cannot be drawn.

The draw source is selected against the packet that existed **before** the current player’s discard. The player cannot draw back a card from their own new discard packet.

## 5.5 Atomic turn action

A normal turn is one atomic server action containing:

```ts
interface PlayTurnAction {
  type: 'play_turn'
  discardCardIds: string[]       // in intentional packet order
  draw:
    | { source: 'deck' }
    | { source: 'previous_discard'; cardId: string }
}
```

The server validates the discard and draw against the same pre-action state, then applies both together. This prevents a disconnect between “discard” and “draw” from leaving the game in a half-turn state.

After a valid turn:

1. Remove discarded cards from the player’s hand.
2. Remove the selected drawn card from its source.
3. Add the drawn card to the player’s hand.
4. Move the prior discard packet’s unclaimed cards into discard history.
5. Set the newly discarded cards as `lastDiscardPacket`.
6. Advance to the next non-eliminated player.
7. Increment room version.
8. Persist and broadcast.

## 5.6 Calling Yaniv

A player can call Yaniv only when:

- It is their turn.
- It is the beginning of the turn.
- Their hand value is 5 or fewer.
- The room is playing and not paused.
- The current phase is `awaiting_turn`.

Calling Yaniv ends the round immediately. Other players do not receive a final turn.

```ts
interface CallYanivAction {
  type: 'call_yaniv'
}
```

## 5.7 Successful Yaniv

The call succeeds only if the caller’s hand value is strictly lower than every other non-eliminated player’s hand value.

Round scoring:

- Caller adds 0.
- Every other active player adds their hand value.

## 5.8 Assaf

Assaf occurs if at least one other active player has a hand value equal to or lower than the caller.

Round scoring:

- Caller adds `caller hand value + 30`.
- The opponent or opponents with the lowest qualifying hand value add 0.
- Every other active player adds their own hand value.
- If multiple opponents tie for the lowest qualifying value, all tied opponents add 0.

This rule must be covered with explicit tests for lower and equal hands.

## 5.9 Score transformations and elimination

After all round additions are calculated, process each player independently in this order:

1. Add round points to previous match score.
2. If the new score is exactly 50, set it to 0.
3. Else if the new score is exactly 100, set it to 50.
4. Else if the new score is greater than 100, mark the player eliminated.
5. Otherwise retain the new score.

The exact resets happen before elimination. A score of exactly 100 is therefore not eliminated.

Eliminated players:

- Remain visible in the scoreboard.
- Do not receive cards.
- Are skipped in turn order.
- Cannot perform game actions.
- May remain connected to see the match, but MVP does not call this spectator mode and does not allow new spectators.

## 5.10 Match winner

The match ends when one non-eliminated player remains.

Edge case: if a round would eliminate every remaining player:

1. Compare their post-round scores before applying elimination.
2. Keep the player or players with the lowest post-round score active.
3. If exactly one player has the lowest score, that player wins.
4. If multiple players tie for lowest score, those players remain active and another round is played; all higher-scoring players are eliminated.

The winner is displayed, but the result is not stored beyond the room TTL.

## 5.11 Round start and dealer

First round:

- Choose a starting player using cryptographically secure randomness.
- Choose a dealer as the seat immediately before the starting player.

Later rounds:

- The next round’s starting player is the player with the lowest hand value in the previous round.
- On successful Yaniv, this is normally the caller.
- On Assaf, this is one of the Assaf winners.
- If multiple players tie, choose the first tied player clockwise after the Yaniv caller.
- Dealer moves clockwise by one active seat each round.

Deal five cards to each non-eliminated player. Turn one additional card face up to form the initial `lastDiscardPacket`.

## 5.12 Empty draw pile

When a player chooses the deck and the draw pile is empty:

- Collect all cards in `discardHistory`.
- Do not collect the current `lastDiscardPacket`, because its endpoint cards must remain available.
- Shuffle the collected cards into a new draw pile.
- Continue the draw.
- If no cards are available even after this operation, reject the action with `DRAW_PILE_UNAVAILABLE`. This should be extremely rare and must not corrupt state.

---

## 6. Room and session lifecycle

## 6.1 Creating a room

`POST /api/rooms`

Request:

```json
{
  "displayName": "Sam"
}
```

Server behavior:

- Validate and normalize display name.
- Generate a six-character room code.
- Create the player, token, and lobby state.
- Store the room with TTL.
- Return room code, share URL, player ID, and raw player token.

Response:

```json
{
  "roomCode": "K7M4PX",
  "sharePath": "/room/K7M4PX",
  "playerId": "uuid",
  "playerToken": "opaque-secret"
}
```

## 6.2 Room codes

Use six characters from an unambiguous uppercase alphabet such as:

```txt
ABCDEFGHJKLMNPQRSTUVWXYZ23456789
```

Exclude `I`, `O`, `0`, and `1`.

Creation must use a collision-safe Redis operation. Retry with a new code if the key already exists.

Codes are case-insensitive in input and normalized to uppercase.

## 6.3 Joining

`POST /api/rooms/:code/join`

Request:

```json
{
  "displayName": "David"
}
```

Reject when:

- Room does not exist
- Match has already started
- Room already has four players
- Name is invalid
- Same normalized display name is already used in the room

Return a new player ID and token.

## 6.4 Display-name rules

- Trim leading and trailing whitespace.
- Collapse repeated internal whitespace.
- Length: 1–20 Unicode characters.
- Reject control characters.
- Escape normally when rendered; never use raw HTML.
- Display names do not need to be globally unique, only unique inside a room after case-folding.

## 6.5 Session token

Generate at least 256 bits of cryptographically secure randomness.

- Send raw token only to that player.
- Store only a SHA-256 hash in room state.
- The client stores current room credentials in `localStorage` to survive refresh and temporary browser closure.
- Clear local credentials when the player explicitly leaves, the room expires, or the user joins another seat.
- Never put the token in the room URL, logs, analytics, or query string.
- The first WebSocket message performs authentication.

A user who loses the token cannot reclaim the existing hand in MVP.

## 6.6 TTL

Recommended sliding expiry:

- Lobby: 2 hours after last activity
- Active or paused match: 6 hours after last activity
- Finished match: 1 hour after completion

Any authenticated connection, heartbeat, or valid action refreshes the relevant TTL. No cron cleanup is needed; Redis expiry is authoritative.

---

## 7. Authoritative room state

A practical server-only shape:

```ts
interface RoomState {
  schemaVersion: 1
  code: string
  status: 'lobby' | 'playing' | 'paused' | 'finished'
  version: number

  createdAt: string
  updatedAt: string
  expiresAt: string

  hostPlayerId: string

  players: Array<{
    id: string
    tokenHash: string
    displayName: string
    seat: number
    connectionStatus: 'connected' | 'disconnected' | 'left'
    connectedAt: string | null
    disconnectedAt: string | null
    lastSeenAt: string | null

    score: number
    eliminated: boolean
    hand: string[]
    readyForNextRound: boolean
  }>

  game: null | {
    roundNumber: number
    dealerPlayerId: string
    startingPlayerId: string
    currentTurnPlayerId: string | null

    phase: 'awaiting_turn' | 'round_over' | 'match_over'

    drawPile: string[]
    discardHistory: string[]
    lastDiscardPacket: string[]

    roundResult: null | RoundResult
    winnerPlayerId: string | null
  }

  recentActionIds: Array<{
    actionId: string
    playerId: string
    resultingVersion: number
  }>
}
```

Store complete state as one JSON value for MVP. The state is small enough that this is simpler and safer than normalizing it across many Redis keys.

## 7.1 Redis keys

```txt
yaniv:room:{ROOM_CODE}       JSON RoomState
yaniv:room:{ROOM_CODE}:pub   Redis pub/sub channel
```

Optional short-lived rate-limit keys:

```txt
yaniv:rate:create:{IP_HASH}
yaniv:rate:join:{IP_HASH}
```

## 7.2 Never expose server state directly

The server state contains every hand and token hash. It must never be returned as-is.

Generate a projection for each authenticated player.

---

## 8. Client state projection

```ts
interface ClientRoomSnapshot {
  schemaVersion: 1
  roomCode: string
  status: 'lobby' | 'playing' | 'paused' | 'finished'
  version: number
  hostPlayerId: string
  selfPlayerId: string

  players: Array<{
    id: string
    displayName: string
    seat: number
    connectionStatus: 'connected' | 'disconnected' | 'left'
    score: number
    eliminated: boolean
    handCount: number
    readyForNextRound: boolean
  }>

  game: null | {
    roundNumber: number
    dealerPlayerId: string
    startingPlayerId: string
    currentTurnPlayerId: string | null
    phase: 'awaiting_turn' | 'round_over' | 'match_over'

    ownHand: Card[]
    ownHandValue: number

    drawPileCount: number
    lastDiscardPacket: Card[]

    canCallYaniv: boolean
    legalDrawCardIds: string[]

    roundResult: ClientRoundResult | null
    winnerPlayerId: string | null
  }

  disconnectRecovery: null | {
    missingPlayerIds: string[]
    hostCanRestartWithoutMissingPlayers: boolean
  }
}
```

During active play:

- Clients see only their own card identities.
- Clients see opponents’ hand counts.
- Clients see the current discard packet.
- Clients see draw-pile count, not its order.

At round end:

- `roundResult` may reveal every active player’s final hand.
- Eliminated players’ hands are empty because they were not dealt.

---

## 9. Realtime protocol

## 9.1 Connection endpoint

Use one WebSocket endpoint, for example:

```txt
/api/ws
```

Do not encode room credentials in the URL.

## 9.2 Client-to-server messages

Every message is a JSON object validated with Zod.

### Authenticate

```json
{
  "type": "authenticate",
  "roomCode": "K7M4PX",
  "playerToken": "opaque-secret",
  "clientInstanceId": "uuid",
  "lastKnownVersion": 12
}
```

The server must require authentication before processing any other message.

### Heartbeat

```json
{
  "type": "heartbeat",
  "sentAt": 1784470000000
}
```

### Action

```json
{
  "type": "action",
  "actionId": "uuid",
  "expectedVersion": 12,
  "action": {
    "type": "call_yaniv"
  }
}
```

Supported action types:

```ts
type GameAction =
  | { type: 'start_match' }
  | PlayTurnAction
  | { type: 'call_yaniv' }
  | { type: 'ready_next_round' }
  | { type: 'remove_disconnected_and_restart_round'; playerId: string }
  | { type: 'leave_room' }
  | { type: 'end_room' }
```

## 9.3 Server-to-client messages

### Authenticated

```json
{
  "type": "authenticated",
  "snapshot": {}
}
```

### Snapshot

Send a complete player-specific projection after every committed state change.

```json
{
  "type": "snapshot",
  "snapshot": {}
}
```

Full snapshots are intentionally preferred over a complex stream of small patches. Room state is tiny, and full snapshots make reconnects and stale-client recovery much simpler.

### Action acknowledgement

```json
{
  "type": "action_ack",
  "actionId": "uuid",
  "version": 13
}
```

### Structured error

```json
{
  "type": "error",
  "code": "NOT_YOUR_TURN",
  "message": "It is not your turn.",
  "actionId": "uuid",
  "recoverable": true,
  "snapshot": {}
}
```

Include a fresh snapshot for stale-state or rule-validation errors when useful.

### Pong

```json
{
  "type": "pong",
  "sentAt": 1784470000000,
  "serverAt": 1784470000024
}
```

## 9.4 Reconnection

Client behavior:

1. On unexpected close, show a connection banner.
2. Reconnect with exponential backoff: roughly 1, 2, 4, 8, 16, then 30 seconds maximum.
3. Add small random jitter.
4. On open, authenticate again with stored credentials and `lastKnownVersion`.
5. Replace all local authoritative state with the received snapshot.
6. Do not resubmit an action unless it lacks acknowledgement and the same `actionId` is reused.

Server behavior:

- Authentication restores the seat.
- Mark player connected.
- Publish presence update.
- Send latest snapshot.
- If all required players are connected, resume a paused game automatically.

## 9.5 Presence and heartbeat

Recommended:

- Client heartbeat every 20 seconds.
- Consider connection stale after about 60 seconds without heartbeat, even if no close event arrived.
- Use server timestamps, not client clocks, for disconnect durations.
- Presence is advisory; game actions still authenticate against the room state.

---

## 10. Concurrency and atomic commits

Multiple clients can submit against the same room version. The server must prevent double turns and lost updates.

### 10.1 Reducer flow

For every action:

1. Load raw room JSON from Redis.
2. Authenticate actor from token hash.
3. Reject duplicate `actionId` by returning its existing result.
4. Check `expectedVersion`.
5. Parse room state and validate action.
6. Produce `nextState` with a pure reducer.
7. Increment `version`.
8. Add action ID to a bounded recent-action list.
9. Atomically compare-and-set the Redis value.
10. If comparison fails, reload and retry a small number of times.
11. Publish `{ roomCode, version }`.
12. Return acknowledgement.

### 10.2 Compare-and-set

Use a small Redis Lua script or equivalent atomic operation:

- Confirm the stored room value/version matches the value used by the reducer.
- Set the new JSON with refreshed TTL.
- Publish the new version.
- Return success/failure.

Do not implement a process-local mutex. It would not protect against other Vercel instances.

### 10.3 Idempotency

Every mutation action has a UUID `actionId`.

Keep the most recent 50 action IDs in room state. If an authenticated player resends the same action after reconnecting, return the already committed version instead of applying it twice.

### 10.4 Pub/sub fan-out

Each active function instance:

- Maintains local WebSocket connections grouped by room.
- Subscribes once per room channel, not once per socket.
- On a room version notification, fetches the room state once.
- Builds a tailored snapshot for each local socket.
- Sends the correct private projection to each player.
- Unsubscribes when the instance has no local sockets for that room.

Never publish complete room state, card hands, or tokens on a broadly named channel.

---

## 11. Server-side validations and error codes

All actions must be validated on the server.

Recommended stable error codes:

```txt
AUTH_REQUIRED
AUTH_INVALID
ROOM_NOT_FOUND
ROOM_EXPIRED
ROOM_FULL
ROOM_ALREADY_STARTED
ROOM_NOT_IN_LOBBY
ROOM_NOT_PLAYING
ROOM_PAUSED
NOT_HOST
NOT_A_PLAYER
PLAYER_ELIMINATED
NOT_YOUR_TURN
STALE_STATE
DUPLICATE_NAME
INVALID_NAME
INVALID_PAYLOAD
CARD_NOT_IN_HAND
DUPLICATE_CARD_ID
INVALID_DISCARD
INVALID_DISCARD_ORDER
INVALID_DRAW_SOURCE
DRAW_CARD_NOT_AVAILABLE
DRAW_PILE_UNAVAILABLE
YANIV_VALUE_TOO_HIGH
ROUND_NOT_OVER
PLAYER_ALREADY_READY
PLAYER_NOT_DISCONNECTED
DISCONNECT_GRACE_NOT_REACHED
NOT_ENOUGH_PLAYERS
ACTION_RATE_LIMITED
INTERNAL_ERROR
```

Messages shown to users should be friendly. Codes remain stable for tests and client logic.

Never reveal hidden card IDs or internal state in an error.

---

## 12. User interface specification

## 12.1 Visual direction

Use a **modern, calm tabletop** style:

- Deep muted green play surface
- Warm off-white cards and panels
- Dark charcoal text
- One restrained warm accent for primary actions
- Rounded cards with subtle borders rather than heavy shadows
- Standard red/black suits
- Clear card ranks using text and suit symbols
- Minimal animation: card selection, deal entrance, and round-result reveal
- No casino imagery, fake wood, coins, confetti overload, or glossy 3D effects

The game should feel friendly and legible rather than like online gambling.

Respect reduced-motion preferences.

## 12.2 Home screen

Elements:

- Yaniv title
- Short sentence: “Create a private room or join with a code.”
- Display-name field
- Primary **Create room** button
- Room-code field
- Secondary **Join room** button
- Compact “How to play” disclosure with the MVP rules

Remember the display name locally for convenience, but do not create an account.

## 12.3 Lobby

Show:

- Room code prominently
- Share link button using normal browser share when supported; otherwise select/copy affordance
- Player list in seat order
- Connection status
- Empty seat placeholders up to four
- “2–4 players” hint
- Host marker
- Host-only **Start game** button, enabled at two or more connected players
- Leave room action

No ready-up step is needed before the first round.

Joining via `/room/:code` should display a name-entry form when the browser does not already own a seat token.

## 12.4 Mobile game layout

Design for a 320–430 px viewport first.

Top region:

- Opponents arranged compactly
- Name, score, connection status, eliminated status, and card count
- Current-turn indicator
- Expandable scoreboard if four players make the row crowded

Center table:

- Face-down draw pile with remaining-card count
- Previous discard packet laid horizontally or slightly fanned
- Clear labels: “Deck” and “Last play”
- Current turn message

Bottom region:

- Own score and hand total
- Own hand in a horizontally scrollable/fanned row
- Cards large enough to identify and tap
- Selected cards lift upward
- Selected discard order shown explicitly
- Draw-source choices
- Primary action button

Persistent controls must not cover cards or depend on hover.

## 12.5 Card selection and ordering

Interaction:

- Tap a card to select or deselect.
- Selected cards appear in a “Your play” strip in intended discard order.
- Tapping selected cards in the strip can reorder them; drag-and-drop may be added but cannot be the only method.
- The UI identifies the packet as Single, Set, Run, or Invalid.
- Runs may offer an **Auto-order** action.
- Invalid selections explain the problem without requiring submission.

The client-side validator is for feedback only. The server repeats all validation.

## 12.6 Draw choice

Once a potentially valid discard is selected, show:

- Draw from deck
- Take the first endpoint of the previous packet
- Take the last endpoint when different

A card endpoint must be visually selectable. The final primary button can read:

- `Play turn`
- Or more specifically, `Discard 3 · Draw from deck`

No result is applied locally until acknowledged by the server.

## 12.7 Yaniv action

Show a prominent but not dangerous-looking **Call Yaniv** button only when:

- It is the player’s turn
- Their hand is 5 points or lower
- The room is not paused
- The round is active

Require a lightweight confirmation:

> Call Yaniv with 4 points?

This avoids accidental calls on mobile.

## 12.8 Round result

Display a full-screen mobile sheet or centered desktop dialog:

- “Yaniv” or “Assaf”
- Every player’s revealed hand
- Hand value
- Points added
- Score before and after
- Exact-50 or exact-100 reset, clearly explained
- Eliminated players
- Next-round starter
- Ready status

Each active player clicks **Ready for next round**. When all active connected players are ready, the server deals automatically.

## 12.9 Paused state

Overlay the board but keep it visible.

Example:

> Waiting for David to reconnect.

Show:

- Time disconnected
- Automatic resume explanation
- For host after two minutes: **Remove David and restart round**
- Leave game
- Host-transfer status when applicable

Never continue accepting gameplay actions while paused.

## 12.10 Finished state

Show:

- Winner
- Final scoreboard
- **Play again** button that resets all scores and starts a new match with the same connected players
- **Leave room**

`Play again` can be treated as a post-MVP enhancement if time is constrained. The required MVP path is returning to the home screen.

---

## 13. Accessibility

Minimum requirements:

- Keyboard-operable cards and controls
- Visible focus states
- Buttons have accessible names
- Do not encode suits or player state by color alone
- Announce turn changes and connection changes using a polite live region
- Use `aria-pressed` for selected cards
- Use text labels for card rank and suit
- Minimum touch target around 44 × 44 CSS pixels
- Sufficient contrast
- Respect `prefers-reduced-motion`
- Avoid automatically moving keyboard focus on every realtime snapshot
- Modal focus trapping and Escape behavior
- Screen-reader text such as “Seven of hearts, selected”

---

## 14. Suggested repository structure

```txt
/
├─ app/
│  ├─ assets/
│  │  └─ css/
│  ├─ components/
│  │  ├─ cards/
│  │  │  ├─ PlayingCard.vue
│  │  │  ├─ CardHand.vue
│  │  │  └─ DiscardPacket.vue
│  │  ├─ game/
│  │  │  ├─ GameBoard.vue
│  │  │  ├─ OpponentSeat.vue
│  │  │  ├─ TurnControls.vue
│  │  │  ├─ Scoreboard.vue
│  │  │  ├─ RoundResult.vue
│  │  │  └─ PausedOverlay.vue
│  │  └─ room/
│  │     ├─ CreateRoomForm.vue
│  │     ├─ JoinRoomForm.vue
│  │     └─ Lobby.vue
│  ├─ composables/
│  │  ├─ useRoomSession.ts
│  │  ├─ useRoomSocket.ts
│  │  └─ useCardSelection.ts
│  ├─ pages/
│  │  ├─ index.vue
│  │  └─ room/[code].vue
│  └─ types/
│
├─ server/
│  ├─ api/
│  │  ├─ rooms/
│  │  │  ├─ index.post.ts
│  │  │  └─ [code]/
│  │  │     └─ join.post.ts
│  │  └─ ws.ts
│  ├─ services/
│  │  ├─ room-service.ts
│  │  ├─ action-service.ts
│  │  ├─ presence-service.ts
│  │  └─ broadcast-service.ts
│  ├─ repositories/
│  │  └─ redis-room-repository.ts
│  └─ utils/
│     ├─ auth.ts
│     ├─ room-code.ts
│     └─ rate-limit.ts
│
├─ shared/
│  ├─ game/
│  │  ├─ cards.ts
│  │  ├─ constants.ts
│  │  ├─ deck.ts
│  │  ├─ discard-validation.ts
│  │  ├─ scoring.ts
│  │  ├─ reducer.ts
│  │  ├─ projection.ts
│  │  └─ invariants.ts
│  ├─ protocol/
│  │  ├─ client-messages.ts
│  │  ├─ server-messages.ts
│  │  └─ actions.ts
│  └─ types/
│
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  └─ e2e/
│
├─ nuxt.config.ts
├─ package.json
└─ README.md
```

Adapt route filename details to the exact Nitro WebSocket convention supported by the pinned Nuxt/Nitro versions.

---

## 15. Game-engine API

Recommended pure functions:

```ts
createDeck(): Card[]
shuffleDeck(cards: Card[], randomBytes: RandomSource): Card[]
cardValue(card: Card): number
handValue(cards: Card[]): number

classifyDiscard(cardsInSubmittedOrder: Card[]): DiscardClassification
isValidSet(cards: Card[]): boolean
isValidRun(cardsInSubmittedOrder: Card[]): boolean

createInitialMatch(room: RoomState, random: RandomSource, now: Date): RoomState
startRound(state: RoomState, starterId: string, random: RandomSource, now: Date): RoomState

applyAction(
  state: RoomState,
  actorId: string,
  action: GameAction,
  context: { now: Date; random: RandomSource }
): RoomState

resolveYaniv(state: RoomState, callerId: string, now: Date): RoomState
applyRoundScores(state: RoomState, result: RoundResult): RoomState

projectRoomForPlayer(state: RoomState, playerId: string): ClientRoomSnapshot
assertRoomInvariants(state: RoomState): void
```

The reducer should throw typed domain errors, not HTTP errors.

---

## 16. Invariants

Run invariant checks in tests and optionally in non-production runtime.

At all times:

- Every card ID appears in exactly one location among player hands, draw pile, discard history, and last discard packet.
- Total card count is exactly 54 during an active match.
- A player hand contains no duplicate IDs.
- Only active non-eliminated players can hold cards.
- Exactly one active player has the turn during `awaiting_turn`.
- The current-turn player is not eliminated or left.
- Room version increases by exactly one per committed mutation.
- Scores are integers and never negative.
- A non-eliminated score is at most 100.
- At least two active players exist while status is `playing`, except for the instant in which winner resolution occurs.
- Client projections never contain another player’s active hand.
- The caller can call Yaniv only at 5 or fewer.
- Round-over state has no current turn.
- A finished match has a winner or an explicit abandoned reason.

---

## 17. Security and abuse controls

This is a private MVP, but basic protections are still required.

- Validate every payload with size limits.
- Limit WebSocket message size, for example to 16 KB.
- Rate-limit create and join endpoints by hashed IP.
- Rate-limit action messages per authenticated player, allowing normal play but blocking floods.
- Reject more than one active seat connection for the same token, or close the older connection when a newer one authenticates.
- Use constant-time token-hash comparison where practical.
- Escape all display names.
- Do not log raw tokens, hands, full room JSON, or WebSocket authentication messages.
- Use secure random room codes, tokens, dealer selection, starter selection, and shuffling.
- Do not trust client-supplied timestamps, scores, hand totals, or card objects.
- Set sensible HTTP security headers.
- Do not expose a public room listing.
- Room code knowledge alone is not enough to control an existing seat.

For this private use case, room codes are invitations rather than high-security secrets. Player tokens protect seats.

---

## 18. Testing specification

## 18.1 Unit tests: cards and discards

Cover at minimum:

- All card values
- 54 unique card IDs
- Single-card discard
- Pairs, triples, and four-card sets
- Joker pair
- Invalid mixed-rank set
- Basic runs
- A–2–3
- 10–J–Q–K
- Rejection of Q–K–A
- Runs with one joker at beginning, middle, and end
- Runs with two jokers
- Rejection of mixed suits
- Rejection of all-joker run
- Submitted ordering and endpoint behavior
- Hand totals

## 18.2 Unit tests: scoring

Cover:

- Successful Yaniv
- Assaf with a lower opponent
- Assaf on an equal hand
- Multiple tied Assaf winners
- Caller penalty includes caller hand value
- Exact 50 resets to 0
- Exact 100 resets to 50
- 101 eliminates
- Reset occurs before elimination
- Multiple elimination edge cases
- Final-player winner
- All-remaining-players-would-eliminate edge case

## 18.3 Unit tests: reducer

Cover:

- Start requires host
- Start requires 2–4 connected players
- Correct deal count
- Correct turn order
- Legal atomic play turn
- Draw from deck
- Draw first endpoint
- Draw last endpoint
- Cannot draw middle card
- Cannot play card not in own hand
- Cannot act out of turn
- Cannot call Yaniv over 5
- Paused room rejects gameplay
- Eliminated player skipped
- Draw-pile rebuild
- Round-ready transition
- Disconnect restart-round behavior

## 18.4 Property/invariant tests

Use randomized legal sequences where practical.

After every reducer action:

- Card conservation
- Unique ownership
- Valid turn owner
- Valid score range
- Projection privacy
- Deterministic result for same inputs

## 18.5 Redis/application tests

- CAS succeeds on correct version
- CAS fails on stale version
- Simultaneous actions cannot both consume the same turn
- Duplicate action ID is idempotent
- TTL refreshes
- Pub/sub emits committed version
- Token authentication
- Room expiry behavior

## 18.6 Browser tests

Use multiple Playwright browser contexts to represent separate players.

Required flows:

1. Create room, join second player, start match.
2. Both players see synchronized turn and discard state.
3. Opponent hand identity is not present in network payload.
4. Play a legal turn from each draw source.
5. Call successful Yaniv and inspect score result.
6. Trigger Assaf and inspect penalty.
7. Reach exact 50 and exact 100.
8. Disconnect active player, verify pause, reconnect, verify resume.
9. Host removes a disconnected player after the grace period using a test clock.
10. Refresh browser and reclaim same seat.
11. Simulate WebSocket close and automatic reconnect.
12. Mobile viewport remains playable without horizontal page overflow.

---

## 19. Observability

Keep it lightweight.

Log structured events:

```txt
room_created
player_joined
player_connected
player_disconnected
match_started
turn_committed
yaniv_called
round_finished
player_eliminated
match_finished
room_abandoned
action_rejected
cas_retry
websocket_error
```

Include:

- Room code hash or room code if acceptable for private debugging
- Player ID, never token
- Room version
- Action type
- Error code
- Duration

Do not log card hands by default.

Use Vercel runtime logs for MVP. Add external error tracking only after real usage demonstrates a need.

---

## 20. Deployment specification

1. Create a Vercel project from the Git repository.
2. Enable Fluid Compute if it is not already enabled.
3. Confirm WebSocket beta support is available for the project.
4. Add Upstash Redis from the Vercel Marketplace.
5. Place the Vercel Function and Redis primary in nearby European regions.
6. Confirm required Redis environment variables are injected.
7. Use the Node runtime for the WebSocket endpoint.
8. Configure the WebSocket function duration to the highest sensible value allowed by the selected Vercel plan.
9. Do not rely on that duration; reconnect logic remains mandatory.
10. Add production and preview deployment smoke tests.
11. Pin package versions in the lockfile.
12. Document local environment setup in `README.md`.

Suggested environment variables, adapted to the integration:

```txt
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
UPSTASH_REDIS_URL
ROOM_TOKEN_HASH_SECRET
PUBLIC_APP_ORIGIN
```

Use only the variables actually needed by the final Redis client strategy.

---

## 21. Implementation sequence

### Phase 1 — Pure game engine

Deliver:

- Card model and deck
- Shuffle abstraction
- Discard validation
- Turn reducer
- Yaniv/Assaf scoring
- Score reset/elimination logic
- Invariant suite
- Unit tests

Do not start realtime UI before the reducer is trustworthy.

### Phase 2 — Room repository and HTTP lobby

Deliver:

- Redis room repository
- Create room
- Join room
- Tokens
- TTL
- Lobby UI
- Start match
- Server projections

### Phase 3 — Realtime transport

Deliver:

- Nitro WebSocket endpoint
- Authentication
- Heartbeats
- Reconnect
- CAS commits
- Pub/sub fan-out
- Idempotent actions
- Presence and pause

### Phase 4 — Game UI

Deliver:

- Responsive board
- Own hand
- Opponent seats
- Selection/order UI
- Draw choice
- Yaniv call
- Round results
- Scoreboard
- Paused/reconnect states

### Phase 5 — Hardening

Deliver:

- Multi-context E2E tests
- Accessibility pass
- Rate limits
- Error handling
- Logging
- Deployment documentation
- Production smoke test

---

## 22. MVP acceptance criteria

The MVP is complete when all of the following are true:

- A player can create a room without an account.
- The room has a short code and direct join URL.
- Two to four players can join with unique room-local names.
- The host can start at two or more connected players.
- Every player receives five cards from one 54-card deck.
- Only the owning player can see their card identities.
- Turns synchronize in realtime across browsers.
- Singles, sets, and suited runs are validated correctly.
- Jokers work as zero-value cards and run wildcards.
- A player can draw from the deck or legal previous-discard endpoints.
- Yaniv can be called only at the beginning of the caller’s turn with 5 or fewer points.
- Successful Yaniv and Assaf resolve exactly as specified.
- Exact 50 resets to 0.
- Exact 100 resets to 50.
- Scores above 100 eliminate players.
- The last non-eliminated player wins.
- The game pauses on required-player disconnect.
- Refreshing or reconnecting restores the correct seat and hand.
- The host can remove a player after the grace period and restart the current round.
- No completed-game history is retained beyond room expiry.
- The interface is fully playable on a 320 px-wide viewport.
- WebSocket reconnection does not duplicate an action.
- Two simultaneous actions cannot both mutate the same turn.
- Automated tests cover rules, scoring, concurrency, reconnect, and one complete match flow.
- The entire application deploys as one Vercel project plus its connected Redis resource.

---

## 23. Explicit non-goals

Do not implement these unless separately requested:

- Accounts or passwords
- OAuth
- Public matchmaking
- Rankings
- Statistics
- Saved games
- Match replay
- Chat
- Emoji reactions
- Voice/video
- Spectator joining
- Bots or AI opponents
- Push notifications
- Native apps
- Monetization
- Custom rule editor
- Multiple decks
- Internationalization
- Sound or music
- Complex card animation
- Offline play

---

## 24. Definition of done for the implementing agent

Before declaring completion, the implementing agent must:

1. Run formatting, linting, type checking, unit tests, integration tests, and E2E tests.
2. Build the production application successfully.
3. Deploy a preview to Vercel.
4. Verify two separate browser contexts can complete several turns.
5. Verify mobile layout at 320, 375, and 430 px widths.
6. Inspect WebSocket reconnection after an intentional server/client close.
7. Verify no opponent hand data appears in client snapshots or browser logs.
8. Verify room state expires in Redis.
9. Verify duplicate action submission changes state only once.
10. Verify a stale version receives a safe recovery snapshot.
11. Document setup, environment variables, architecture, rules, and test commands in the repository README.

---

## 25. Reference basis

The rules in this specification combine the requested house rules with common Yaniv mechanics: a 54-card deck, five-card deal, sets and suited runs, jokers in runs, drawing an endpoint of the previous packet, calling at the start of a turn, and Assaf on an equal-or-lower opponent hand.

The deployment architecture is based on the current Vercel model in which WebSockets are available through Vercel Functions but connections can close at function-duration boundaries, requiring reconnection and external shared state. Upstash Redis provides short-lived key-value state, atomic operations, expiry, and pub/sub suitable for the room-coordination layer.
