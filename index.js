require("dotenv").config();
const express = require("express");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// Parse raw body for signature verification, then also parse JSON
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// ── Webhook verification (GET) ──────────────────────────────────────────────
// Meta sends hub.mode, hub.verify_token, hub.challenge as query params.
// We must echo hub.challenge back if the token matches.
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log("Webhook verified successfully.");
    return res.status(200).send(challenge);
  }

  console.warn("Webhook verification failed — token mismatch or wrong mode.");
  res.sendStatus(403);
});

// ── Incoming message handler (POST) ─────────────────────────────────────────
app.post("/webhook", (req, res) => {
  // Validate payload signature to confirm the request is from Meta
  if (!isValidSignature(req)) {
    console.warn("Invalid signature — request rejected.");
    return res.sendStatus(401);
  }

  const body = req.body;

  if (body.object !== "whatsapp_business_account") {
    return res.sendStatus(404);
  }

  // Acknowledge receipt immediately — Meta retries if it doesn't get 200 quickly
  res.sendStatus(200);

  // Process each entry and its changes asynchronously
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field === "messages") {
        handleMessagesChange(change.value);
      }
    }
  }
});

// ── Message change handler ───────────────────────────────────────────────────
function handleMessagesChange(value) {
  const { metadata, contacts, messages, statuses } = value;

  if (messages) {
    for (const msg of messages) {
      const from = msg.from; // sender's WhatsApp number
      const senderName = contacts?.find((c) => c.wa_id === from)?.profile?.name ?? from;

      console.log(`\n📨 Message from ${senderName} (${from})`);
      console.log(`   Phone number ID: ${metadata.phone_number_id}`);

      switch (msg.type) {
        case "text":
          console.log(`   Text: ${msg.text.body}`);
          // TODO: reply, store in DB, trigger your business logic, etc.
          break;

        case "image":
          console.log(`   Image ID: ${msg.image.id}  Caption: ${msg.image.caption ?? ""}`);
          break;

        case "audio":
          console.log(`   Audio ID: ${msg.audio.id}`);
          break;

        case "document":
          console.log(`   Document: ${msg.document.filename}  ID: ${msg.document.id}`);
          break;

        case "location":
          console.log(`   Location: ${msg.location.latitude}, ${msg.location.longitude}`);
          break;

        case "interactive":
          // Button reply or list reply
          if (msg.interactive.type === "button_reply") {
            console.log(`   Button reply: ${msg.interactive.button_reply.title}`);
          } else if (msg.interactive.type === "list_reply") {
            console.log(`   List reply: ${msg.interactive.list_reply.title}`);
          }
          break;

        default:
          console.log(`   Unhandled message type: ${msg.type}`);
      }
    }
  }

  if (statuses) {
    for (const status of statuses) {
      console.log(`\n📋 Status update — message ${status.id}: ${status.status} (to: ${status.recipient_id})`);
    }
  }
}

// ── Signature validation ─────────────────────────────────────────────────────
// Meta signs every POST with HMAC-SHA256 using your App Secret.
// Header: X-Hub-Signature-256: sha256=<hex>
function isValidSignature(req) {
  const appSecret = process.env.APP_SECRET;
  if (!appSecret) {
    console.warn("APP_SECRET not set — skipping signature check (unsafe in production).");
    return true;
  }

  const signature = req.headers["x-hub-signature-256"];
  if (!signature) return false;

  const expected = "sha256=" + crypto
    .createHmac("sha256", appSecret)
    .update(req.rawBody)
    .digest("hex");

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`WhatsApp webhook listening on port ${PORT}`);
  console.log(`Verification endpoint: GET  http://localhost:${PORT}/webhook`);
  console.log(`Messages endpoint:     POST http://localhost:${PORT}/webhook`);
});
