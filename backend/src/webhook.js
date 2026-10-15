const crypto = require("crypto");
const express = require("express");
const { contactQ, convQ, msgQ, autoQ } = require("./db");
const { sendText, markAsRead } = require("./whatsapp");

const router = express.Router();

router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log("[webhook] verified");
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

router.post("/", (req, res) => {
  if (!isValidSignature(req)) return res.sendStatus(401);
  const body = req.body;
  if (body.object !== "whatsapp_business_account") return res.sendStatus(404);
  res.sendStatus(200);

  const io = req.app.get("io");
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field === "messages") processChange(change.value, io);
    }
  }
});

function processChange(value, io) {
  const { contacts, messages, statuses } = value;

  if (messages) {
    for (const msg of messages) {
      const wa_id = msg.from;
      const name = contacts?.find((c) => c.wa_id === wa_id)?.profile?.name ?? wa_id;
      const ts = parseInt(msg.timestamp, 10) * 1000;
      const body = extractBody(msg);

      // Upsert contact & conversation
      contactQ.upsert.run({ wa_id, name, phone: wa_id });
      const conv = convQ.getOrCreate(wa_id);
      if (!conv) return;

      convQ.touch.run(ts, conv.id);
      convQ.incrUnread.run(conv.id);

      const media_url = extractMediaId(msg);
      const info = msgQ.insert.run({ wamid: msg.id, conversation_id: conv.id, direction: "inbound", type: msg.type, body, status: "received", is_note: 0, sender_id: null, timestamp: ts, reply_to_wamid: null, media_url });

      markAsRead(msg.id);

      const message = { id: info.lastInsertRowid, wamid: msg.id, conversation_id: conv.id, direction: "inbound", type: msg.type, body, status: "received", is_note: 0, sender_id: null, timestamp: ts, media_url };
      io?.emit("new_message", { conversation_id: conv.id, contact_wa_id: wa_id, contact_name: name, message });

      // Run automation rules
      runAutomation(wa_id, body, conv.id, io);
    }
  }

  if (statuses) {
    for (const s of statuses) {
      msgQ.updateStatus.run(s.status, s.id);
      io?.emit("message_status", { wamid: s.id, status: s.status });
    }
  }
}

function runAutomation(wa_id, body, conv_id, io) {
  const rules = autoQ.active.all();
  for (const rule of rules) {
    if (rule.trigger_type !== "keyword") continue;
    const keyword = (rule.trigger_value ?? "").toLowerCase().trim();
    if (!keyword || !body.toLowerCase().includes(keyword)) continue;

    const actions = JSON.parse(rule.actions);
    for (const action of actions) {
      if (action.type === "send_message" && action.text) {
        sendText(wa_id, action.text).then((result) => {
          const wamid = result.messages?.[0]?.id ?? `auto_${Date.now()}`;
          const ts = Date.now();
          const info = msgQ.insert.run({ wamid, conversation_id: conv_id, direction: "outbound", type: "text", body: action.text, status: "sent", is_note: 0, sender_id: null, timestamp: ts, reply_to_wamid: null, media_url: null });
          io?.emit("new_message", { conversation_id: conv_id, contact_wa_id: wa_id, message: { id: info.lastInsertRowid, wamid, conversation_id: conv_id, direction: "outbound", type: "text", body: action.text, status: "sent", is_note: 0, sender_id: null, timestamp: ts } });
        }).catch(console.error);
      }
      if (action.type === "assign_to" && action.agent_id) {
        convQ.assign.run(action.agent_id, conv_id);
        io?.emit("conversation_updated", { id: conv_id, assigned_to: action.agent_id });
      }
      if (action.type === "set_status" && action.status) {
        convQ.setStatus.run(action.status, conv_id);
        io?.emit("conversation_updated", { id: conv_id, status: action.status });
      }
    }
    break; // first matching rule wins
  }
}

function extractMediaId(msg) {
  switch (msg.type) {
    case "image":    return msg.image?.id ?? null;
    case "video":    return msg.video?.id ?? null;
    case "audio":    return msg.audio?.id ?? null;
    case "document": return msg.document?.id ?? null;
    case "sticker":  return msg.sticker?.id ?? null;
    default:         return null;
  }
}

function extractBody(msg) {
  switch (msg.type) {
    case "text":     return msg.text?.body ?? "";
    case "image":    return msg.image?.caption ?? "📷 Image";
    case "audio":    return "🎤 Audio";
    case "video":    return msg.video?.caption ?? "🎥 Video";
    case "document": return `📄 ${msg.document?.filename ?? "Document"}`;
    case "location": return `📍 ${msg.location?.latitude}, ${msg.location?.longitude}`;
    case "sticker":  return "🎭 Sticker";
    case "interactive":
      return msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? "Interactive";
    default: return `[${msg.type}]`;
  }
}

function isValidSignature(req) {
  const secret = process.env.APP_SECRET;
  if (!secret) return true;
  const sig = req.headers["x-hub-signature-256"];
  if (!sig) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

module.exports = router;
