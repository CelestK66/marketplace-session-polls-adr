import { z } from "zod";
import { InfraiClient, InfraiError } from "./infrai_client.js";

const assetSchema = z.object({
  assetId: z.string().min(1),
  sellerId: z.string().min(1),
  title: z.string().min(1),
  reserveCents: z.number().int().nonnegative(),
  handoffLocation: z.string().min(1)
});

const buyerUpdateSchema = z.object({
  buyerId: z.string().min(1),
  displayName: z.string().min(1),
  offeredCents: z.number().int().nonnegative(),
  pollChoice: z.enum(["interested", "watching", "pass"]),
  clientEventId: z.string().min(1)
});

const sessionInputSchema = z.object({
  sessionId: z.string().min(1),
  asset: assetSchema,
  buyers: z.array(buyerUpdateSchema).min(1)
});

export type MarketplaceSessionInput = z.infer<typeof sessionInputSchema>;

export type SessionDecision = {
  state: "awaiting-bids" | "order-handoff-ready";
  winningBuyerId: string | null;
  winningOfferCents: number | null;
  pollTally: {
    interested: number;
    watching: number;
    pass: number;
  };
  handoffSummary: string | null;
};

export function decideSessionOutcome(input: MarketplaceSessionInput): SessionDecision {
  const parsed = sessionInputSchema.parse(input);

  const tally = {
    interested: 0,
    watching: 0,
    pass: 0
  };

  for (const buyer of parsed.buyers) {
    tally[buyer.pollChoice] += 1;
  }

  const ranked = [...parsed.buyers].sort((a, b) => {
    if (b.offeredCents !== a.offeredCents) {
      return b.offeredCents - a.offeredCents;
    }
    return a.buyerId.localeCompare(b.buyerId);
  });

  const winner = ranked.find((buyer) => buyer.offeredCents >= parsed.asset.reserveCents) ?? null;

  if (!winner) {
    return {
      state: "awaiting-bids",
      winningBuyerId: null,
      winningOfferCents: null,
      pollTally: tally,
      handoffSummary: null
    };
  }

  return {
    state: "order-handoff-ready",
    winningBuyerId: winner.buyerId,
    winningOfferCents: winner.offeredCents,
    pollTally: tally,
    handoffSummary: `${parsed.asset.title} reserved for ${winner.displayName} at ${parsed.asset.handoffLocation}`
  };
}

export class MarketplaceSessionService {
  private infrai: InfraiClient;

  constructor(infrai: InfraiClient) {
    this.infrai = infrai;
  }

  async runLivePoll(input: MarketplaceSessionInput): Promise<SessionDecision> {
    const parsed = sessionInputSchema.parse(input);
    const decision = decideSessionOutcome(parsed);
    const channel = `marketplace.session.${parsed.sessionId}`;

    try {
      await this.infrai.realtime.channel.create({
        channel,
        type: "public",
        vendor: "infrai"
      });
    } catch (error) {
      if (!(error instanceof InfraiError) || error.status !== 409) {
        throw error;
      }
    }

    await this.infrai.realtime.publish({
      channel,
      event: "seller.asset.opened",
      data: {
        assetId: parsed.asset.assetId,
        sellerId: parsed.asset.sellerId,
        title: parsed.asset.title,
        reserveCents: parsed.asset.reserveCents,
        handoffLocation: parsed.asset.handoffLocation,
        clientEventId: `asset-${parsed.asset.assetId}`
      }
    });

    for (const buyer of parsed.buyers) {
      await this.infrai.realtime.publish({
        channel,
        event: "buyer.update.recorded",
        data: {
          buyerId: buyer.buyerId,
          displayName: buyer.displayName,
          offeredCents: buyer.offeredCents,
          pollChoice: buyer.pollChoice,
          clientEventId: buyer.clientEventId
        }
      });
    }

    await this.infrai.realtime.publish({
      channel,
      event: "session.order.handoff",
      data: {
        state: decision.state,
        winningBuyerId: decision.winningBuyerId,
        winningOfferCents: decision.winningOfferCents,
        pollTally: decision.pollTally,
        handoffSummary: decision.handoffSummary,
        clientEventId: `handoff-${parsed.sessionId}`
      }
    });

    return decision;
  }

  async issueViewerToken(sessionId: string, clientId: string): Promise<Record<string, unknown>> {
    return this.infrai.realtime.token.issue({
      client_id: clientId,
      channels: [`marketplace.session.${sessionId}`],
      capabilities: ["subscribe"],
      ttl_seconds: 900
    });
  }
}
