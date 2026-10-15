const router = require("express").Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { convQ, msgQ, contactQ, cannedQ, tagQ } = require("../db");
const { sendText, sendTemplate, uploadMedia, sendImage, markAsRead } = require("../whatsapp");
const { requireAuth } = require("../middleware/auth");

const uploadsDir = path.join(__dirname, "../../uploads/outbound");
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (_req, file, cb) => cb(null, `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`),
  }),
  limits: { fileSize: 16 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Images only"));
  },
});

router.use(requireAuth);

// ── Start new conversation (outbound first message) ───────────────────────────
// WhatsApp requires a pre-approved template to initiate a new chat.
// If the contact has chatted within 24h a plain text works too.
router.post("/new", async (req, res) => {
  const { phone, name, message, template_name, language = "en_US" } = req.body;
  if (!phone) return res.status(400).json({ error: "phone required" });
  if (!message && !template_name) return res.status(400).json({ error: "message or template_name required" });

  const wa_id = phone.replace(/\D/g, ""); // strip non-digits
  const contactName = name?.trim() || `+${wa_id}`;

  contactQ.upsert.run({ wa_id, name: contactName, phone: wa_id });
  const conv = convQ.getOrCreate(wa_id);

  const ts = Date.now();
  let wamid, body;

  try {
    if (template_name) {
      const result = await sendTemplate(wa_id, template_name, language, []);
      wamid = result.messages?.[0]?.id ?? `local_${ts}`;
      body = `[Template: ${template_name}]`;
    } else {
      const result = await sendText(wa_id, message.trim());
      wamid = result.messages?.[0]?.id ?? `local_${ts}`;
      body = message.trim();
    }

    msgQ.insert.run({ wamid, conversation_id: conv.id, direction: "outbound", type: template_name ? "template" : "text", body, status: "sent", is_note: 0, sender_id: req.agent.id, timestamp: ts, reply_to_wamid: null, media_url: null });
    convQ.touch.run(ts, conv.id);

    const message_obj = { wamid, conversation_id: conv.id, direction: "outbound", type: template_name ? "template" : "text", body, status: "sent", is_note: 0, sender_id: req.agent.id, sender_name: req.agent.name, timestamp: ts };
    req.app.get("io")?.emit("new_message", { conversation_id: conv.id, contact_wa_id: wa_id, contact_name: contactName, message: message_obj });

    // Return the full conversation so the frontend can open it immediately
    const fullConv = convQ.list.all().find((c) => c.id === conv.id);
    res.json({ conversation: fullConv ?? conv });
  } catch (err) {
    console.error("[new-chat]", err.response?.data ?? err.message);
    res.status(500).json({ error: err.response?.data?.error?.message ?? "Failed to send. For new contacts use an approved template." });
  }
});

// ── List conversations ────────────────────────────────────────────────────────
router.get("/", (req, res) => {
  const { status, assigned } = req.query;
  let rows = convQ.list.all();
  if (status) rows = rows.filter((r) => r.status === status);
  if (assigned === "me") rows = rows.filter((r) => r.assigned_to === req.agent.id);
  res.json(rows);
});

// ── Get single conversation ───────────────────────────────────────────────────
router.get("/:id", (req, res) => {
  const conv = convQ.byId.get(req.params.id);
  if (!conv) return res.status(404).json({ error: "Not found" });
  const contact = contactQ.byId.get(conv.contact_wa_id);
  contact.tags = tagQ.forContact.all(contact.wa_id);
  res.json({ ...conv, contact });
});

// ── Messages for conversation ─────────────────────────────────────────────────
router.get("/:id/messages", (req, res) => {
  convQ.clearUnread.run(req.params.id);
  const messages = msgQ.list.all(req.params.id);
  res.json(messages);
});

// ── Send message ──────────────────────────────────────────────────────────────
router.post("/:id/send", async (req, res) => {
  const { text, reply_to_wamid } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: "text required" });

  const conv = convQ.byId.get(req.params.id);
  if (!conv) return res.status(404).json({ error: "Not found" });

  const contact = contactQ.byId.get(conv.contact_wa_id);
  if (contact.blacklisted) return res.status(403).json({ error: "Contact is blacklisted" });

  try {
    const result = await sendText(contact.wa_id, text.trim(), reply_to_wamid ?? null);
    const wamid = result.messages?.[0]?.id ?? `local_${Date.now()}`;
    const ts = Date.now();

    const info = msgQ.insert.run({ wamid, conversation_id: conv.id, direction: "outbound", type: "text", body: text.trim(), status: "sent", is_note: 0, sender_id: req.agent.id, timestamp: ts, reply_to_wamid: reply_to_wamid ?? null, media_url: null });
    convQ.touch.run(ts, conv.id);

    // Fetch reply context to include in response
    let replyCtx = {};
    if (reply_to_wamid) {
      const replied = msgQ.byWamid.get(reply_to_wamid);
      if (replied) replyCtx = { reply_to_body: replied.body, reply_to_direction: replied.direction };
    }

    const message = { id: info.lastInsertRowid, wamid, conversation_id: conv.id, direction: "outbound", type: "text", body: text.trim(), status: "sent", is_note: 0, sender_id: req.agent.id, sender_name: req.agent.name, timestamp: ts, reply_to_wamid: reply_to_wamid ?? null, ...replyCtx };
    req.app.get("io")?.emit("new_message", { conversation_id: conv.id, contact_wa_id: contact.wa_id, message });

    res.json(message);
  } catch (err) {
    console.error("[send]", err.response?.data ?? err.message);
    res.status(500).json({ error: err.response?.data?.error?.message ?? "Send failed" });
  }
});

// ── Send template ─────────────────────────────────────────────────────────────
router.post("/:id/send-template", async (req, res) => {
  const { template_name, language = "en_US", components = [] } = req.body;
  const conv = convQ.byId.get(req.params.id);
  if (!conv) return res.status(404).json({ error: "Not found" });

  try {
    const result = await sendTemplate(conv.contact_wa_id, template_name, language, components);
    const wamid = result.messages?.[0]?.id ?? `local_${Date.now()}`;
    const ts = Date.now();
    const body = `[Template: ${template_name}]`;

    const info = msgQ.insert.run({ wamid, conversation_id: conv.id, direction: "outbound", type: "template", body, status: "sent", is_note: 0, sender_id: req.agent.id, timestamp: ts, reply_to_wamid: null, media_url: null });
    convQ.touch.run(ts, conv.id);

    const message = { id: info.lastInsertRowid, wamid, conversation_id: conv.id, direction: "outbound", type: "template", body, status: "sent", is_note: 0, sender_id: req.agent.id, sender_name: req.agent.name, timestamp: ts };
    req.app.get("io")?.emit("new_message", { conversation_id: conv.id, contact_wa_id: conv.contact_wa_id, message });

    res.json(message);
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message ?? "Send failed" });
  }
});

// ── Send image ────────────────────────────────────────────────────────────────
router.post("/:id/send-image", upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "image required" });

  const conv = convQ.byId.get(req.params.id);
  if (!conv) return res.status(404).json({ error: "Not found" });

  const contact = contactQ.byId.get(conv.contact_wa_id);
  if (contact.blacklisted) return res.status(403).json({ error: "Contact is blacklisted" });

  try {
    const buffer = fs.readFileSync(req.file.path);
    const { id: mediaId } = await uploadMedia(buffer, req.file.mimetype, req.file.filename);

    const caption = req.body.caption?.trim() ?? "";
    const result = await sendImage(contact.wa_id, mediaId, caption);
    const wamid = result.messages?.[0]?.id ?? `img_${Date.now()}`;
    const ts = Date.now();
    const media_url = `/api/uploads/outbound/${req.file.filename}`;

    const info = msgQ.insert.run({ wamid, conversation_id: conv.id, direction: "outbound", type: "image", body: caption || "📷 Image", status: "sent", is_note: 0, sender_id: req.agent.id, timestamp: ts, reply_to_wamid: null, media_url });
    convQ.touch.run(ts, conv.id);

    const message = { id: info.lastInsertRowid, wamid, conversation_id: conv.id, direction: "outbound", type: "image", body: caption || "📷 Image", status: "sent", is_note: 0, sender_id: req.agent.id, sender_name: req.agent.name, timestamp: ts, media_url };
    req.app.get("io")?.emit("new_message", { conversation_id: conv.id, contact_wa_id: contact.wa_id, message });

    res.json(message);
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    console.error("[send-image]", err.response?.data ?? err.message);
    res.status(500).json({ error: err.response?.data?.error?.message ?? "Image send failed" });
  }
});

// ── Internal note ─────────────────────────────────────────────────────────────
router.post("/:id/note", (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: "text required" });
  const conv = convQ.byId.get(req.params.id);
  if (!conv) return res.status(404).json({ error: "Not found" });

  const ts = Date.now();
  const info = msgQ.insert.run({ wamid: `note_${ts}`, conversation_id: conv.id, direction: "outbound", type: "text", body: text.trim(), status: "sent", is_note: 1, sender_id: req.agent.id, timestamp: ts, reply_to_wamid: null, media_url: null });

  const message = { id: info.lastInsertRowid, wamid: `note_${ts}`, conversation_id: conv.id, direction: "outbound", type: "text", body: text.trim(), status: "sent", is_note: 1, sender_id: req.agent.id, sender_name: req.agent.name, timestamp: ts };
  req.app.get("io")?.emit("new_message", { conversation_id: conv.id, contact_wa_id: conv.contact_wa_id, message });

  res.json(message);
});

// ── Assign ────────────────────────────────────────────────────────────────────
router.post("/:id/assign", (req, res) => {
  const { agent_id } = req.body;
  convQ.assign.run(agent_id ?? null, req.params.id);
  req.app.get("io")?.emit("conversation_updated", { id: parseInt(req.params.id), assigned_to: agent_id });
  res.json({ ok: true });
});

// ── Status ────────────────────────────────────────────────────────────────────
router.post("/:id/status", (req, res) => {
  const { status } = req.body;
  if (!["open","pending","resolved"].includes(status)) return res.status(400).json({ error: "invalid status" });
  convQ.setStatus.run(status, req.params.id);
  req.app.get("io")?.emit("conversation_updated", { id: parseInt(req.params.id), status });
  res.json({ ok: true });
});

// ── Canned responses ──────────────────────────────────────────────────────────
router.get("/canned/all", (req, res) => res.json(cannedQ.list.all()));

router.post("/canned/all", (req, res) => {
  const { shortcut, title, body } = req.body;
  const info = cannedQ.insert.run({ shortcut, title, body, created_by: req.agent.id });
  res.json({ id: info.lastInsertRowid, shortcut, title, body });
});

router.put("/canned/:id", (req, res) => {
  const { shortcut, title, body } = req.body;
  cannedQ.update.run({ shortcut, title, body, id: req.params.id });
  res.json({ ok: true });
});

router.delete("/canned/:id", (req, res) => {
  cannedQ.delete.run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
