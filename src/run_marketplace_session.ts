import { createInfraiClient } from "./infrai_client.js";
import { MarketplaceSessionService } from "./session_poll_service.js";

async function main(): Promise<void> {
  const infrai = createInfraiClient();
  const service = new MarketplaceSessionService(infrai);

  const result = await service.runLivePoll({
    sessionId: "session-ward-a-17",
    asset: {
      assetId: "infusion-pump-44",
      sellerId: "seller-clinic-8",
      title: "Refurbished infusion pump",
      reserveCents: 125000,
      handoffLocation: "Receiving desk, Building B"
    },
    buyers: [
      {
        buyerId: "buyer-hospital-2",
        displayName: "North Ward",
        offeredCents: 121000,
        pollChoice: "interested",
        clientEventId: "buyer-hospital-2-1"
      },
      {
        buyerId: "buyer-hospital-7",
        displayName: "South Campus",
        offeredCents: 127500,
        pollChoice: "interested",
        clientEventId: "buyer-hospital-7-1"
      },
      {
        buyerId: "buyer-lab-9",
        displayName: "Lab Annex",
        offeredCents: 118000,
        pollChoice: "watching",
        clientEventId: "buyer-lab-9-1"
      }
    ]
  });

  const viewerToken = await service.issueViewerToken("session-ward-a-17", "viewer-console-1");

  console.log(JSON.stringify({ result, viewerToken }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
