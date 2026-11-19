import test from "node:test";
import assert from "node:assert/strict";
import { decideSessionOutcome } from "../src/session_poll_service.js";

test("highest eligible offer moves the session to order handoff", () => {
  const result = decideSessionOutcome({
    sessionId: "session-9",
    asset: {
      assetId: "ventilator-3",
      sellerId: "seller-1",
      title: "Portable ventilator",
      reserveCents: 100000,
      handoffLocation: "Dock 2"
    },
    buyers: [
      {
        buyerId: "buyer-b",
        displayName: "Clinic B",
        offeredCents: 99000,
        pollChoice: "watching",
        clientEventId: "evt-1"
      },
      {
        buyerId: "buyer-a",
        displayName: "Clinic A",
        offeredCents: 105000,
        pollChoice: "interested",
        clientEventId: "evt-2"
      },
      {
        buyerId: "buyer-c",
        displayName: "Clinic C",
        offeredCents: 105000,
        pollChoice: "interested",
        clientEventId: "evt-3"
      }
    ]
  });

  assert.equal(result.state, "order-handoff-ready");
  assert.equal(result.winningBuyerId, "buyer-a");
  assert.equal(result.winningOfferCents, 105000);
  assert.deepEqual(result.pollTally, {
    interested: 2,
    watching: 1,
    pass: 0
  });
  assert.equal(result.handoffSummary, "Portable ventilator reserved for Clinic A at Dock 2");
});
