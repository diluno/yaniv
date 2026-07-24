import { expect, test, type Page } from '@playwright/test'

// Two browser contexts play together against the dev server.

/** Fill a field until its submit button enables (guards the hydration race). */
async function fillUntilEnabled(page: Page, label: string, value: string, button: string): Promise<void> {
  await expect(async () => {
    await page.getByLabel(label).fill(value)
    await expect(page.getByRole('button', { name: button })).toBeEnabled({ timeout: 500 })
  }).toPass({ timeout: 15_000 })
}

async function createRoom(page: Page, name: string): Promise<string> {
  await page.goto('/')
  await fillUntilEnabled(page, 'Your name', name, 'Create room')
  await page.getByRole('button', { name: 'Create room' }).click()
  await expect(page.getByRole('heading', { name: /^Room/ })).toBeVisible()
  const code = await page.locator('.code').innerText()
  return code.trim()
}

async function joinRoom(page: Page, code: string, name: string): Promise<void> {
  await page.goto(`/room/${code}`)
  await fillUntilEnabled(page, 'Your name', name, 'Join game')
  await page.getByRole('button', { name: 'Join game' }).click()
  await expect(page.getByRole('heading', { name: /^Room/ })).toBeVisible()
}

async function playAnyTurn(page: Page): Promise<void> {
  // Select the first card in hand (retry until the hand becomes interactive),
  // choose deck draw, submit.
  await expect(async () => {
    const card = page.locator('.hand .card').first()
    if (await card.getAttribute('aria-pressed') !== 'true') await card.click()
    await expect(card).toHaveAttribute('aria-pressed', 'true', { timeout: 500 })
  }).toPass({ timeout: 15_000 })
  await page.getByRole('button', { name: /Draw from deck/ }).click()
  await page.getByRole('button', { name: /^Discard 1/ }).click()
}

function turnOwner(alice: Page, bob: Page): Promise<Page> {
  return Promise.race([
    alice.locator('.turn-message', { hasText: 'Your turn' }).waitFor().then(() => alice),
    bob.locator('.turn-message', { hasText: 'Your turn' }).waitFor().then(() => bob),
  ])
}

test('create, join, start, and play synchronized turns', async ({ browser }) => {
  const aliceCtx = await browser.newContext()
  const bobCtx = await browser.newContext()
  const alice = await aliceCtx.newPage()
  const bob = await bobCtx.newPage()

  const code = await createRoom(alice, 'Alice')
  await joinRoom(bob, code, 'Bob')

  // Lobby sync: Alice sees Bob.
  await expect(alice.getByText('Bob')).toBeVisible()
  await alice.getByRole('button', { name: 'Start game' }).click()

  // Both see the board.
  await expect(alice.getByText('Deck')).toBeVisible()
  await expect(bob.getByText('Deck')).toBeVisible()

  // No opponent card identities in Bob's snapshot beyond counts/discard:
  // opponent hand is rendered only as a count.
  await expect(bob.locator('.cards')).toContainText('5')

  // Play three turns; after the first owner is known, turns simply alternate.
  let current = await turnOwner(alice, bob)
  for (let i = 0; i < 3; i++) {
    const other = current === alice ? bob : alice
    await playAnyTurn(current)
    await expect(other.locator('.turn-message', { hasText: 'Your turn' })).toBeVisible({ timeout: 10_000 })
    current = other
  }

  // Draw from the previous discard endpoint once.
  await current.locator('.hand .card').first().click()
  const endpoint = current.locator('.packet .pick').first()
  await endpoint.click()
  await current.getByRole('button', { name: /^Discard 1/ }).click()
  const other = current === alice ? bob : alice
  await expect(other.locator('.turn-message', { hasText: 'Your turn' })).toBeVisible({ timeout: 10_000 })

  await aliceCtx.close()
  await bobCtx.close()
})

test('refresh reclaims the same seat and hand', async ({ browser }) => {
  const aliceCtx = await browser.newContext()
  const bobCtx = await browser.newContext()
  const alice = await aliceCtx.newPage()
  const bob = await bobCtx.newPage()

  const code = await createRoom(alice, 'Alice')
  await joinRoom(bob, code, 'Bob')
  await alice.getByRole('button', { name: 'Start game' }).click()
  await expect(alice.getByText('Deck')).toBeVisible()

  await expect(alice.locator('.hand .card')).toHaveCount(5)
  const handBefore = await alice.locator('.hand .card').allInnerTexts()

  await alice.reload()
  await expect(alice.getByText('Deck')).toBeVisible()
  await expect(alice.locator('.hand .card')).toHaveCount(5)
  const handAfter = await alice.locator('.hand .card').allInnerTexts()
  expect(handAfter).toEqual(handBefore)

  await aliceCtx.close()
  await bobCtx.close()
})

test('disconnect pauses the game; reconnect resumes it', async ({ browser }) => {
  const aliceCtx = await browser.newContext()
  const bobCtx = await browser.newContext()
  const alice = await aliceCtx.newPage()
  const bob = await bobCtx.newPage()

  const code = await createRoom(alice, 'Alice')
  await joinRoom(bob, code, 'Bob')
  await alice.getByRole('button', { name: 'Start game' }).click()
  await expect(bob.getByText('Deck')).toBeVisible()

  await bob.close()
  await expect(alice.getByRole('heading', { name: 'Game paused' })).toBeVisible({ timeout: 15_000 })

  const bob2 = await bobCtx.newPage()
  await bob2.goto(`/room/${code}`)
  await expect(alice.getByRole('heading', { name: 'Game paused' })).toBeHidden({ timeout: 15_000 })

  await aliceCtx.close()
  await bobCtx.close()
})

test('mobile viewport has no horizontal page overflow', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 320, height: 640 } })
  const page = await ctx.newPage()
  await createRoom(page, 'Solo')
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  await ctx.close()
})

test('opponent hand identities are absent from network payloads', async ({ browser }) => {
  const aliceCtx = await browser.newContext()
  const bobCtx = await browser.newContext()
  const alice = await aliceCtx.newPage()
  const bob = await bobCtx.newPage()

  const wsPayloads: string[] = []
  bob.on('websocket', (ws) => {
    ws.on('framereceived', frame => wsPayloads.push(String(frame.payload)))
  })

  const code = await createRoom(alice, 'Alice')
  await joinRoom(bob, code, 'Bob')
  await alice.getByRole('button', { name: 'Start game' }).click()
  await expect(bob.getByText('Deck')).toBeVisible()
  await expect(alice.locator('.hand .card')).toHaveCount(5)

  // Alice's hand as she sees it (aria-labels like "Seven of hearts").
  const aliceCards = await alice.locator('.hand .card').evaluateAll(els =>
    els.map(el => el.getAttribute('aria-label')))

  const bobSnapshots = wsPayloads.filter(p => p.includes('"snapshot"'))
  expect(bobSnapshots.length).toBeGreaterThan(0)
  for (const payload of bobSnapshots) {
    const parsed = JSON.parse(payload)
    const snapshot = parsed.snapshot
    if (!snapshot?.game) continue
    // ownHand must be Bob's; opponents appear only as counts.
    const players = snapshot.players
    const aliceEntry = players.find((p: any) => p.displayName === 'Alice')
    expect(aliceEntry.hand).toBeUndefined()
    expect(aliceEntry.handCount).toBeGreaterThan(0)
  }
  expect(aliceCards).toHaveLength(5)

  await aliceCtx.close()
  await bobCtx.close()
})
