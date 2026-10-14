const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { agentQ } = require("../db");
const { requireAuth, requireAdmin } = require("../middleware/auth");

router.use(requireAuth);

router.get("/", (req, res) => {
  res.json(agentQ.list.all());
});

router.post("/", requireAdmin, (req, res) => {
  const { name, email, password, role = "agent" } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: "name, email, password required" });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = agentQ.insert.run({ name, email: email.toLowerCase(), password: hash, role });
    res.json({ id: result.lastInsertRowid, name, email, role });
  } catch {
    res.status(409).json({ error: "Email already exists" });
  }
});

router.put("/:id", requireAdmin, (req, res) => {
  const { name, role, is_active } = req.body;
  agentQ.update.run({ name, role, is_active: is_active ? 1 : 0, id: req.params.id });
  res.json({ ok: true });
});

module.exports = router;
