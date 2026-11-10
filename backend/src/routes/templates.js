const router = require("express").Router();
const { templateQ } = require("../db");
const { fetchTemplates, createTemplate, deleteTemplate } = require("../whatsapp");
const { requireAuth, requireAdmin } = require("../middleware/auth");

router.use(requireAuth);

router.get("/", (req, res) => res.json(templateQ.list.all()));

// Sync templates from Meta WABA
router.post("/sync", async (req, res) => {
  try {
    const templates = await fetchTemplates();
    for (const t of templates) {
      templateQ.upsert.run({
        meta_id: t.id,
        name: t.name,
        language: t.language ?? "en_US",
        category: t.category,
        status: t.status,
        components: JSON.stringify(t.components ?? []),
      });
    }
    res.json({ synced: templates.length });
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message ?? "Sync failed" });
  }
});

// Create template and submit to Meta for approval
router.post("/", requireAdmin, async (req, res) => {
  const { name, category, language, components } = req.body;
  if (!name || !category || !language || !components) {
    return res.status(400).json({ error: "name, category, language, components required" });
  }
  if (!/^[a-z0-9_]+$/.test(name)) {
    return res.status(400).json({ error: "Name must be lowercase letters, numbers and underscores only" });
  }

  try {
    const result = await createTemplate({ name, category, language, components });
    templateQ.upsert.run({
      meta_id: result.id,
      name,
      language,
      category,
      status: result.status ?? "PENDING",
      components: JSON.stringify(components),
    });
    const saved = templateQ.list.all().find((t) => t.meta_id === result.id) ?? { name, category, language, status: "PENDING", components: JSON.stringify(components) };
    res.json(saved);
  } catch (err) {
    console.error("[create-template]", err.response?.data ?? err.message);
    res.status(500).json({ error: err.response?.data?.error?.message ?? "Failed to create template" });
  }
});

// Toggle enabled (admin only, affects what agents see in chat)
router.patch("/:id/enabled", requireAdmin, (req, res) => {
  const template = templateQ.byId.get(req.params.id);
  if (!template) return res.status(404).json({ error: "Not found" });
  if (template.status !== "APPROVED") return res.status(400).json({ error: "Only approved templates can be enabled" });
  const enabled = req.body.enabled ? 1 : 0;
  templateQ.setEnabled.run(enabled, req.params.id);
  res.json({ ok: true, enabled });
});

// Delete template (removes from Meta + local DB)
router.delete("/:id", requireAdmin, async (req, res) => {
  const template = templateQ.byId.get(req.params.id);
  if (!template) return res.status(404).json({ error: "Not found" });
  if (template.meta_id) {
    try { await deleteTemplate(template.meta_id); } catch (err) {
      console.error("[delete-template]", err.response?.data ?? err.message);
    }
  }
  templateQ.delete.run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
