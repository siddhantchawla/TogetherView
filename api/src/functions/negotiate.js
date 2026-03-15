const { app } = require("@azure/functions");
const { WebPubSubServiceClient } = require("@azure/web-pubsub");

// 1. Initialize the Service Client using your Connection String from local.settings.json
const connectionString = process.env.WebPubSubConnectionString;
const hubName = "TogetherViewHub";

app.http("negotiate", {
  methods: ["GET"],
  authLevel: "anonymous", // For MVP, we allow anonymous access
  handler: async (request, context) => {
    try {
      // 2. Extract Room ID and User ID from the request
      const roomID = request.query.get("room");
      const userId = request.query.get("userId");

      if (!roomID) {
        return { status: 400, body: "Missing 'room' query parameter." };
      }

      const serviceClient = new WebPubSubServiceClient(
        connectionString,
        hubName,
      );

      // 3. Generate a signed WebSocket URL
      // This token grants permission to join the specific room and send messages to it
      const token = await serviceClient.getClientAccessToken({
        userId: userId,
        roles: [
          `webpubsub.joinLeaveGroup.${roomID}`,
          `webpubsub.sendToGroup.${roomID}`,
        ],
      });

      console.log(
        `TogetherView: Negotiated access for user ${userId} to room ${roomID}`,
      );

      // 4. Return the URL to the Chrome Extension
      return {
        jsonBody: { url: token.url },
        headers: { "Access-Control-Allow-Origin": "*" }, // Ensure CORS doesn't block local testing
      };
    } catch (error) {
      context.error("Negotiation Error:", error);
      return { status: 500, body: "Internal Server Error" };
    }
  },
});
