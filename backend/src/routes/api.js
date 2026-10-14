const express = require("express");
const db = require("../db");
const { sendTextMessage } = require("../whatsapp");

const router = express.Router();

// GET /api/conversations
router.get("/conversations", (_req, res) => {
  const contacts = db.getContacts();
  res.json(contacts);
});

// GET /api/conversations/:waId/messages
router.get("/conversations/:waId/messages", (req, res) => {
  const messages = db.getMessages(req.params.waId);
  db.clearUnread(req.params.waId);
  res.json(messages);
});

// POST /api/conversations/:waId/send
router.post("/conversations/:waId/send", async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: "text required" });

  const { waId } = req.params;

  try {
    const result = await sendTextMessage(waId, text.trim());
    const wamid = result.messages?.[0]?.id ?? `local_${Date.now()}`;
    const ts = Date.now();

    db.upsertContact({ wa_id: waId, name: waId, phone: waId });
    db.touchContact(waId, ts);
    db.insertMessage({
      wamid,
      contact_wa_id: waId,
      direction: "outbound",
      type: "text",
      body: text.trim(),
      status: "sent",
      timestamp: ts,
    });

    const message = { wamid, contact_wa_id: waId, direction: "outbound", type: "text", body: text.trim(), status: "sent", timestamp: ts };
    req.app.get("io")?.emit("new_message", { contact: { wa_id: waId }, message });

    res.json({ success: true, wamid });
  } catch (err) {
    console.error("[api] send error:", err.response?.data ?? err.message);
    res.status(500).json({ error: err.response?.data?.error?.message ?? "Failed to send" });
  }
});

module.exports = router;
