const router = require("express").Router();
const multer = require("multer");
const { parse } = require("csv-parse/sync");
const XLSX = require("xlsx");
const { contactQ, tagQ } = require("../db");
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

function randomColor() {
  const colors = ["#6366f1","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899"];
  return colors[Math.floor(Math.random() * colors.length)];
}

module.exports = router;
