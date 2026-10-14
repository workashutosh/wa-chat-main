const router = require("express").Router();
const { templateQ } = require("../db");
const { fetchTemplates } = require("../whatsapp");
const { requireAuth } = require("../middleware/auth");

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

module.exports = router;
