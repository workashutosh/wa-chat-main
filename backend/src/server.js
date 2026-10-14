require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const webhookRouter = require("./webhook");
const authRouter = require("./routes/auth");
const agentsRouter = require("./routes/agents");
const contactsRouter = require("./routes/contacts");
const conversationsRouter = require("./routes/conversations");
const templatesRouter = require("./routes/templates");
const automationRouter = require("./routes/automation");
const { startJobs } = require("./jobs");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL || "*", methods: ["GET", "POST"] },
});

app.set("io", io);
app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

app.use("/webhook",       webhookRouter);
app.use("/api/auth",      authRouter);
app.use("/api/agents",    agentsRouter);
app.use("/api/contacts",  contactsRouter);
app.use("/api/conversations", conversationsRouter);
app.use("/api/templates", templatesRouter);
app.use("/api/automation",automationRouter);
app.get("/health", (_req, res) => res.json({ ok: true }));

io.on("connection", (socket) => {
  console.log("[socket] connected:", socket.id);
  socket.on("disconnect", () => console.log("[socket] disconnected:", socket.id));
});

startJobs(io);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Backend on http://localhost:${PORT}`));
