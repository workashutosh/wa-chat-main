const router = require("express").Router();
const multer = require("multer");
const { parse } = require("csv-parse/sync");
const XLSX = require("xlsx");
const { db, contactQ, tagQ, convQ } = require("../db");
const { sendTemplate } = require("../whatsapp");
const { requireAuth } = require("../middleware/auth");

const upload = multer({ storage: multer.memoryStorage() });

router.use(requireAuth);

// ── List ──────────────────────────────────────────────────────────────────────
router.get("/", (req, res) => {
  const contacts = contactQ.list.all();
  const tags = tagQ.list.all();
  const tagMap = Object.fromEntries(tags.map((t) => [t.id, t]));

  const result = contacts.map((c) => {
    const ctags = tagQ.forContact.all(c.wa_id);
    return { ...c, tags: ctags };
  });
  res.json(result);
});

// ── Get one ───────────────────────────────────────────────────────────────────
router.get("/:waId", (req, res) => {
  const c = contactQ.byId.get(req.params.waId);
  if (!c) return res.status(404).json({ error: "Not found" });
  c.tags = tagQ.forContact.all(c.wa_id);
  res.json(c);
});

// ── Update ────────────────────────────────────────────────────────────────────
router.put("/:waId", (req, res) => {
  const { name, email, opted_in, blacklisted, notes, tags = [] } = req.body;
  const c = contactQ.byId.get(req.params.waId);
  if (!c) return res.status(404).json({ error: "Not found" });

  contactQ.update.run({ wa_id: c.wa_id, name: name ?? c.name, email: email ?? c.email, opted_in: opted_in ?? c.opted_in, blacklisted: blacklisted ?? c.blacklisted, notes: notes ?? c.notes });

  // Sync tags
  tagQ.clearContact.run(c.wa_id);
  for (const tagName of tags) {
    tagQ.insert.run({ name: tagName, color: randomColor() });
    const tag = tagQ.list.all().find((t) => t.name === tagName);
    if (tag) tagQ.addToContact.run(c.wa_id, tag.id);
  }

  res.json({ ok: true });
});

// ── Create ────────────────────────────────────────────────────────────────────
router.post("/", (req, res) => {
  const { name, phone, email } = req.body;
  if (!phone) return res.status(400).json({ error: "phone required" });
  const wa_id = String(phone).replace(/\D/g, "");
  const contactName = name?.trim() || `+${wa_id}`;
  contactQ.upsert.run({ wa_id, name: contactName, phone: wa_id });
  if (email) db.prepare("UPDATE contacts SET email=? WHERE wa_id=?").run(email, wa_id);
  res.json(contactQ.byId.get(wa_id));
});

// ── Delete ────────────────────────────────────────────────────────────────────
router.delete("/:waId", (req, res) => {
  contactQ.delete.run(req.params.waId);
  res.json({ ok: true });
});

// ── Opt-out ───────────────────────────────────────────────────────────────────
router.post("/:waId/optout", (req, res) => {
  contactQ.optOut.run(req.params.waId);
  res.json({ ok: true });
});

// ── Tags CRUD ─────────────────────────────────────────────────────────────────
router.get("/tags/all", (req, res) => res.json(tagQ.list.all()));

router.post("/tags/all", (req, res) => {
  const { name, color = "#6366f1" } = req.body;
  tagQ.insert.run({ name, color });
  res.json(tagQ.list.all().find((t) => t.name === name));
});

router.delete("/tags/:id", (req, res) => {
  tagQ.delete.run(req.params.id);
  res.json({ ok: true });
});

// ── CSV / Excel import ────────────────────────────────────────────────────────
router.post("/import", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "file required" });
  let rows = [];

  const ext = req.file.originalname.split(".").pop().toLowerCase();
  if (ext === "csv") {
    rows = parse(req.file.buffer, { columns: true, skip_empty_lines: true });
  } else {
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  }

  let imported = 0;
  for (const row of rows) {
    const phone = String(row.phone ?? row.Phone ?? row.PHONE ?? "").replace(/\D/g, "");
    const name  = String(row.name  ?? row.Name  ?? row.NAME  ?? phone);
    if (!phone) continue;
    contactQ.upsert.run({ wa_id: phone, name, phone });
    imported++;
  }
  res.json({ imported });
});

// ── CSV export ────────────────────────────────────────────────────────────────
router.get("/export/csv", (req, res) => {
  const contacts = contactQ.list.all();
  const header = "wa_id,name,phone,email,opted_in,blacklisted\n";
  const rows = contacts.map((c) =>
    [c.wa_id, `"${c.name}"`, c.phone, c.email ?? "", c.opted_in, c.blacklisted].join(",")
  );
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=contacts_${Date.now()}.csv`);
  res.send(header + rows.join("\n"));
});

// ── Bulk delete ───────────────────────────────────────────────────────────────
router.post("/bulk-delete", (req, res) => {
  const { wa_ids } = req.body;
  if (!Array.isArray(wa_ids) || !wa_ids.length) return res.status(400).json({ error: "wa_ids required" });
  const del = db.prepare("DELETE FROM contacts WHERE wa_id=?");
  const run = db.transaction((ids) => ids.forEach((id) => del.run(id)));
  run(wa_ids);
  res.json({ deleted: wa_ids.length });
});

// ── Broadcast template to contacts ───────────────────────────────────────────
router.post("/broadcast", async (req, res) => {
  const { wa_ids, template_name, language = "en_US", components = [] } = req.body;
  if (!Array.isArray(wa_ids) || !wa_ids.length) return res.status(400).json({ error: "wa_ids required" });
  if (!template_name) return res.status(400).json({ error: "template_name required" });

  let sent = 0, failed = 0;
  for (const wa_id of wa_ids) {
    try {
      await sendTemplate(wa_id, template_name, language, components);
      convQ.getOrCreate(wa_id);
      sent++;
    } catch (_) { failed++; }
  }
  res.json({ sent, failed, total: wa_ids.length });
});

function randomColor() {
  const colors = ["#6366f1","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899"];
  return colors[Math.floor(Math.random() * colors.length)];
}

module.exports = router;
