const router = require("express").Router();
const { autoQ, dripQ, templateQ } = require("../db");
const { requireAuth, requireAdmin } = require("../middleware/auth");

router.use(requireAuth);

// ── Rules ─────────────────────────────────────────────────────────────────────
router.get("/rules", (req, res) => res.json(autoQ.list.all()));

router.post("/rules", (req, res) => {
  const { name, trigger_type, trigger_value, actions } = req.body;
  const info = autoQ.insert.run({ name, trigger_type, trigger_value: trigger_value ?? null, actions: JSON.stringify(actions ?? []) });
  res.json({ id: info.lastInsertRowid, name, trigger_type, trigger_value, actions });
});

router.put("/rules/:id", (req, res) => {
  const { name, trigger_type, trigger_value, actions, is_active } = req.body;
  autoQ.update.run({ name, trigger_type, trigger_value: trigger_value ?? null, actions: JSON.stringify(actions ?? []), is_active: is_active ? 1 : 0, id: req.params.id });
  res.json({ ok: true });
});

router.delete("/rules/:id", (req, res) => {
  autoQ.delete.run(req.params.id);
  res.json({ ok: true });
});

// ── Drip sequences ────────────────────────────────────────────────────────────
router.get("/sequences", (req, res) => {
  const seqs = dripQ.listSeqs.all();
  res.json(seqs.map((s) => ({ ...s, steps: dripQ.stepsFor.all(s.id) })));
});

router.post("/sequences", (req, res) => {
  const { name, steps = [] } = req.body;
  const info = dripQ.insertSeq.run(name);
  const seqId = info.lastInsertRowid;
  steps.forEach((step, i) =>
    dripQ.insertStep.run({ sequence_id: seqId, step_order: i, delay_hours: step.delay_hours ?? 0, type: step.type ?? "text", body: step.body ?? null, template_id: step.template_id ?? null })
  );
  res.json({ id: seqId, name, steps });
});

// Enroll a contact into a sequence
router.post("/sequences/:id/enroll", (req, res) => {
  const { contact_wa_id } = req.body;
  const firstStep = dripQ.stepsFor.all(req.params.id)[0];
  const nextSendAt = firstStep ? Date.now() + firstStep.delay_hours * 3600000 : null;
  dripQ.enrollContact.run(contact_wa_id, req.params.id, nextSendAt);
  res.json({ ok: true });
});

module.exports = router;
