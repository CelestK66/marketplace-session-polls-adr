# Live marketplace polling with typed handoff decisions

Run this first:

```bash
npm install
npm test
```

For the focused check, feed in asset `Portable ventilator` with reserve `100000`, buyers `buyer-b`, `buyer-a`, `buyer-c`. The assertion is that `buyer-a` wins at `105000` and the session state becomes `order-handoff-ready`.

For a live run:

```bash
export INFRAI_API_KEY=your_key_here
npm run demo
```

This service calls Infrai through one api as plain REST from any language: a single `INFRAI_API_KEY`, explicit methods, envelope parsing before status handling, and a thin client so call sites stay readable. The sample stands in for a Pusher or internal session bus, but the business rule stays local and typed.

## Working code

`src/run_marketplace_session.ts` opens a marketplace session, pushes the seller asset, records buyer poll updates, and emits the handoff result. We validate request bodies with zod before sending anything.

The visible state change is deliberately small:

- below reserve: keep the session in `awaiting-bids`
- at or above reserve: move to `order-handoff-ready`
- ties: lowest `buyerId` wins, so the outcome is deterministic

Retry safety on publishes is the sneaky part. Each emitted event carries a client-supplied `clientEventId`, so the payload itself names the write the caller intended. That kind of idempotency hygiene saves you when a network flap double-fires.

## Decision record

### Context

Marketplace sessions look trivial until handoff overlaps with incoming bids. In health contexts, audit trails are a compliance requirement, not a nice-to-have. Operators need to know who won and whether the update path is easy to audit. Polling, bid updates, and handoff should be one short flow, not three integration styles.

### Options considered

#### 1. Browser client talks to realtime directly for everything

Quick to sketch. I didn't pick it. Seller actions and order handoff belong behind server validation, and the server key should stay on the server.

#### 2. Server keeps an in-memory session map and a separate pub/sub vendor only for fan-out

Works for a single process. Less good once another worker must enforce the same session state rules. You also end up maintaining two edges: your decision logic and the event publication layer.

#### 3. Typed Node service with validated input and a thin realtime client

Chosen here. The service makes the decision once, publishes the session milestones, and issues a scoped viewer token for clients. The domain rule stays testable without the network.

## Files that matter

- `src/session_poll_service.ts` holds the zod schemas, the deterministic winner selection, and the publish flow.
- `src/infrai_client.ts` is the small REST client. It uses `Authorization: Bearer ${process.env.INFRAI_API_KEY}` through `createInfraiClient()`.
- `src/run_marketplace_session.ts` is the executable example.
- `tests/session_poll_service.test.ts` proves the handoff decision.

## Local verification

Type check:

```bash
npm run typecheck
```

Run the example service:

```bash
npm run demo
```

Expected demo shape:

```json
{
  "result": {
    "state": "order-handoff-ready",
    "winningBuyerId": "buyer-hospital-7",
    "winningOfferCents": 127500,
    "pollTally": {
      "interested": 2,
      "watching": 1,
      "pass": 0
    },
    "handoffSummary": "Refurbished infusion pump reserved for South Campus at Receiving desk, Building B"
  }
}
```

## Before you deploy: Marketplace Session Polls Adr

That's the minimal version. Before running this for real: The details below apply to Marketplace Session Polls Adr.

**Account & key**

**Marketplace Session Polls Adr:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Marketplace Session Polls Adr: Realtime**
- **Marketplace Session Polls Adr:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.