require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");

const webhookRouter = require("./webhook");
const authRouter = require("./routes/auth");
const agentsRouter = require("./routes/agents");
const contactsRouter = require("./routes/contacts");
const conversationsRouter = require("./routes/conversations");
const templatesRouter = require("./routes/templates");
const automationRouter = require("./routes/automation");
const { getMediaInfo, downloadMedia } = require("./whatsapp");
const { startJobs } = require("./jobs");

// Ensure upload dirs exist
const uploadsBase = path.join(__dirname, "../uploads");
fs.mkdirSync(path.join(uploadsBase, "outbound"), { recursive: true });
fs.mkdirSync(path.join(uploadsBase, "inbound"), { recursive: true });

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

// Serve uploaded outbound images
app.use("/uploads", express.static(uploadsBase));

// Proxy inbound WhatsApp media — cache to disk after first fetch
app.get("/api/media/:mediaId", async (req, res) => {
  const { mediaId } = req.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(mediaId)) return res.sendStatus(400);

  const cacheDir = path.join(uploadsBase, "inbound");
  const existing = fs.readdirSync(cacheDir).find((f) => f.startsWith(mediaId + "."));
  if (existing) return res.sendFile(path.join(cacheDir, existing));

  try {
    const { url, mimeType } = await getMediaInfo(mediaId);
    const { buffer } = await downloadMedia(url);
    const ext = (mimeType ?? "image/jpeg").split("/")[1].replace("jpeg", "jpg");
    const filename = `${mediaId}.${ext}`;
    fs.writeFileSync(path.join(cacheDir, filename), buffer);
    res.set("Content-Type", mimeType ?? "image/jpeg");
    res.send(buffer);
  } catch (err) {
    console.error("[media-proxy]", err.message);
    res.status(404).json({ error: "Media not found or expired" });
  }
});

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
