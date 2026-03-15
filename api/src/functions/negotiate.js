const { app } = require("@azure/functions");
const { WebPubSubServiceClient } = require("@azure/web-pubsub");

const connectionString = process.env.WebPubSubConnectionString;
const hubName = "TogetherViewHub";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

app.http("negotiate", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return { status: 204, headers: CORS_HEADERS };
    }

    try {
      const roomID = request.query.get("room");
      const userId = request.query.get("userId");

      if (!roomID) {
        return {
          status: 400,
          body: "Missing 'room' query parameter.",
          headers: CORS_HEADERS,
        };
      }

      const serviceClient = new WebPubSubServiceClient(
        connectionString,
        hubName,
      );

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

      return {
        jsonBody: { url: token.url },
        headers: CORS_HEADERS,
      };
    } catch (error) {
      context.error("Negotiation Error:", error);
      return {
        status: 500,
        body: "Internal Server Error",
        headers: CORS_HEADERS,
      };
    }
  },
});
