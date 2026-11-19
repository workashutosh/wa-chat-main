const express = require("express");
const router = express.Router();
const { campaignQ, contactQ, templateQ } = require("../db");
const { sendTemplate } = require("../whatsapp");
const { requireAuth } = require("../middleware/auth");

router.use(requireAuth);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── List campaigns ────────────────────────────────────────────────────────────
router.get("/", (_req, res) => {
  res.json(campaignQ.list.all());
});

// ── Get campaign + recipients ─────────────────────────────────────────────────
router.get("/:id", (req, res) => {
  const campaign = campaignQ.byId.get(req.params.id);
  if (!campaign) return res.status(404).json({ error: "Not found" });
  res.json({ ...campaign, recipients: campaignQ.recipients.all(req.params.id) });
});

// ── Create campaign (draft) ───────────────────────────────────────────────────
router.post("/", (req, res) => {
  const { name, template_name, language = "en_US", components = [], audience_type = "all", audience_value } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "name required" });
  if (!template_name) return res.status(400).json({ error: "template_name required" });

  const info = campaignQ.insert.run({
    name: name.trim(), template_name, language,
    components: JSON.stringify(components),
    audience_type, audience_value: audience_value ?? null,
    created_by: req.agent?.id ?? null,
  });
  res.json(campaignQ.byId.get(info.lastInsertRowid));
});

// ── Update campaign (draft only) ──────────────────────────────────────────────
router.patch("/:id", (req, res) => {
  const campaign = campaignQ.byId.get(req.params.id);
  if (!campaign) return res.status(404).json({ error: "Not found" });
  if (campaign.status !== "draft") return res.status(400).json({ error: "Only draft campaigns can be edited" });

  const { name, template_name, language, components, audience_type, audience_value } = req.body;
  campaignQ.update.run({
    id: req.params.id,
    name: name ?? campaign.name,
    template_name: template_name ?? campaign.template_name,
    language: language ?? campaign.language,
    components: components !== undefined ? JSON.stringify(components) : campaign.components,
    audience_type: audience_type ?? campaign.audience_type,
    audience_value: audience_value !== undefined ? audience_value : campaign.audience_value,
  });
  res.json(campaignQ.byId.get(req.params.id));
});

// ── Delete campaign ───────────────────────────────────────────────────────────
router.delete("/:id", (req, res) => {
  const campaign = campaignQ.byId.get(req.params.id);
  if (!campaign) return res.status(404).json({ error: "Not found" });
  if (campaign.status === "running") return res.status(400).json({ error: "Cannot delete a running campaign" });
  campaignQ.delete.run(req.params.id);
  res.json({ ok: true });
});

// ── Preview audience count ────────────────────────────────────────────────────
router.post("/preview-audience", (req, res) => {
  const { audience_type, audience_value } = req.body;
  let count = 0;
  if (audience_type === "all") {
    count = campaignQ.optedInAll.all().length;
  } else if (audience_type === "tag" && audience_value) {
    count = campaignQ.contactsByTag.all(audience_value).length;
  } else if (audience_type === "custom" && audience_value) {
    try { count = JSON.parse(audience_value).length; } catch {}
  }
  res.json({ count });
});

// ── Launch campaign ───────────────────────────────────────────────────────────
router.post("/:id/launch", async (req, res) => {
  const campaign = campaignQ.byId.get(req.params.id);
  if (!campaign) return res.status(404).json({ error: "Not found" });
  if (campaign.status !== "draft") return res.status(400).json({ error: "Campaign already launched" });

  // Validate template is APPROVED
  const tpl = templateQ.list.all().find((t) => t.name === campaign.template_name);
  if (!tpl) return res.status(400).json({ error: `Template "${campaign.template_name}" not found` });
  if (tpl.status !== "APPROVED") return res.status(400).json({ error: `Template is ${tpl.status} — only APPROVED templates can be sent` });

  // Resolve audience
  let contacts = [];
  if (campaign.audience_type === "all") {
    contacts = campaignQ.optedInAll.all();
  } else if (campaign.audience_type === "tag") {
    contacts = campaignQ.contactsByTag.all(campaign.audience_value ?? "");
  } else if (campaign.audience_type === "custom") {
    try {
      const ids = JSON.parse(campaign.audience_value || "[]");
      contacts = ids.map((id) => contactQ.byId.get(id)).filter(Boolean);
    } catch { contacts = []; }
  }

  if (!contacts.length) return res.status(400).json({ error: "No eligible contacts in audience" });

  // Insert recipient rows
  for (const c of contacts) {
    campaignQ.addRecipient.run({ campaign_id: campaign.id, wa_id: c.wa_id, contact_name: c.name });
  }

  // Mark running
  campaignQ.setRunning.run({ id: campaign.id, started_at: Date.now(), total: contacts.length });

  // Return 202 immediately — send in background
  res.json({ ok: true, total: contacts.length });

  const io = req.app.get("io");
  const components = JSON.parse(campaign.components || "[]");

  for (const c of contacts) {
    try {
      await sendTemplate(c.wa_id, campaign.template_name, campaign.language, components);
      campaignQ.updateRecipient.run({ campaign_id: campaign.id, wa_id: c.wa_id, status: "sent", sent_at: Date.now(), error: null });
      campaignQ.incrSent.run(campaign.id);
    } catch (err) {
      const errMsg = err.response?.data?.error?.message ?? err.message ?? "Unknown error";
      campaignQ.updateRecipient.run({ campaign_id: campaign.id, wa_id: c.wa_id, status: "failed", sent_at: null, error: errMsg.slice(0, 300) });
      campaignQ.incrFailed.run(campaign.id);
    }
    // Emit live progress
    const updated = campaignQ.byId.get(campaign.id);
    io?.emit("campaign_progress", { id: campaign.id, sent: updated.sent, failed: updated.failed, total: updated.total });
    await sleep(300); // 300ms between sends to avoid rate limits
  }

  campaignQ.setCompleted.run(Date.now(), campaign.id);
  io?.emit("campaign_progress", { id: campaign.id, completed: true });
  console.log(`[campaign] ${campaign.id} "${campaign.name}" completed`);
});

module.exports = router;
