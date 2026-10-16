const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { agentQ } = require("../db");
const { requireAuth, requireAdmin } = require("../middleware/auth");

router.use(requireAuth);

router.get("/", (_req, res) => {
  res.json(agentQ.list.all());
});

router.post("/", requireAdmin, (req, res) => {
  const { name, email, password, role = "agent", phone = null, agent_type = "agent", permissions = "{}" } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: "name, email, password required" });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = agentQ.insert.run({
      name, email: email.toLowerCase(), password: hash,
      role: agent_type === "admin" ? "admin" : "agent",
      phone, agent_type,
      permissions: typeof permissions === "string" ? permissions : JSON.stringify(permissions),
    });
    res.json({ id: result.lastInsertRowid, name, email, role, agent_type });
  } catch {
    res.status(409).json({ error: "Email already exists" });
  }
});

router.put("/:id", requireAdmin, (req, res) => {
  const { name, role, is_active, phone, agent_type, permissions, password } = req.body;
  agentQ.update.run({
    name, role: agent_type === "admin" ? "admin" : "agent",
    is_active: is_active ? 1 : 0,
    phone: phone ?? null,
    agent_type: agent_type ?? "agent",
    permissions: typeof permissions === "string" ? permissions : JSON.stringify(permissions ?? {}),
    id: req.params.id,
  });
  if (password) {
    agentQ.updatePassword.run(bcrypt.hashSync(password, 10), req.params.id);
  }
  res.json({ ok: true });
});

module.exports = router;
