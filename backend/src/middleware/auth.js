const jwt = require("jsonwebtoken");
const { agentQ } = require("../db");

const SECRET = process.env.JWT_SECRET || "wa_chat_secret_change_me";

function signToken(agent) {
  return jwt.sign({ id: agent.id, role: agent.role }, SECRET, { expiresIn: "7d" });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
  try {
    const payload = jwt.verify(header.slice(7), SECRET);
    const agent = agentQ.byId.get(payload.id);
    if (!agent || !agent.is_active) return res.status(401).json({ error: "Unauthorized" });
    req.agent = agent;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

function requireAdmin(req, res, next) {
  if (req.agent?.role !== "admin") return res.status(403).json({ error: "Admin only" });
  next();
}

module.exports = { signToken, requireAuth, requireAdmin, SECRET };
