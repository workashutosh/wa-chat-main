const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { agentQ } = require("../db");
const { signToken, requireAuth } = require("../middleware/auth");

router.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "email and password required" });

  const agent = agentQ.byEmail.get(email.toLowerCase());
  if (!agent || !agent.is_active) return res.status(401).json({ error: "Invalid credentials" });

  if (!bcrypt.compareSync(password, agent.password))
    return res.status(401).json({ error: "Invalid credentials" });

  const token = signToken(agent);
  const { password: _, ...safe } = agent;
  res.json({ token, agent: safe });
});

router.get("/me", requireAuth, (req, res) => {
  res.json(req.agent);
});

module.exports = router;
