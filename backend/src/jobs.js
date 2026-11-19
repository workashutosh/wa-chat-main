const cron = require("node-cron");
const { dripQ, convQ, msgQ, contactQ, db } = require("./db");
const { sendText } = require("./whatsapp");

// Prepared statement for polling new inbound messages
const pollInbound = db.prepare(`
  SELECT m.*, cv.contact_wa_id, c.name as contact_name
  FROM messages m
  JOIN conversations cv ON cv.id = m.conversation_id
  JOIN contacts c ON c.wa_id = cv.contact_wa_id
  WHERE m.direction = 'inbound' AND m.id > ?
  ORDER BY m.id ASC
  LIMIT 50
`);

// Runs every minute — processes due drip sequence steps
function startJobs(io) {
  cron.schedule("* * * * *", async () => {
    const due = dripQ.dueSteps.all(Date.now());
    for (const item of due) {
      try {
        const result = await sendText(item.contact_wa_id, item.body);
        const wamid = result.messages?.[0]?.id ?? `drip_${Date.now()}`;
        const ts = Date.now();

        // Ensure conversation exists
        const conv = convQ.getOrCreate(item.contact_wa_id);
        if (conv) {
          msgQ.insert.run({ wamid, conversation_id: conv.id, direction: "outbound", type: "text", body: item.body, status: "sent", is_note: 0, sender_id: null, timestamp: ts, reply_to_wamid: null, media_url: null });
          convQ.touch.run(ts, conv.id);
          io?.emit("new_message", { conversation_id: conv.id, contact_wa_id: item.contact_wa_id, message: { wamid, conversation_id: conv.id, direction: "outbound", type: "text", body: item.body, status: "sent", is_note: 0, timestamp: ts } });
        }

        // Advance to next step
        const allSteps = dripQ.stepsFor.all(item.sequence_id);
        const nextStep = allSteps[item.current_step + 1];
        if (nextStep) {
          dripQ.advanceStep.run({ step: item.current_step + 1, next: Date.now() + nextStep.delay_hours * 3600000, done: 0, id: item.id });
        } else {
          dripQ.advanceStep.run({ step: item.current_step, next: null, done: 1, id: item.id });
        }
      } catch (err) {
        console.error("[drip]", err.message);
      }
    }
  });

  // Poll for new inbound messages every 3 seconds and emit via socket.
  // This bridges the gap between wa-webhook (port 3001) writing to SQLite
  // and wa-chat-app (port 3002) needing to push real-time events to browsers.
  let lastSeenId = (() => {
    const row = db.prepare("SELECT MAX(id) as max_id FROM messages WHERE direction='inbound'").get();
    return row?.max_id ?? 0;
  })();

  setInterval(() => {
    try {
      const newMsgs = pollInbound.all(lastSeenId);
      for (const msg of newMsgs) {
        const { contact_wa_id, contact_name, ...message } = msg;
        io?.emit("new_message", { conversation_id: msg.conversation_id, contact_wa_id, contact_name, message });
        // Also update unread count in memory via socket
        io?.emit("conversation_updated", { id: msg.conversation_id });
        if (msg.id > lastSeenId) lastSeenId = msg.id;
      }
    } catch (err) {
      console.error("[poll-inbound]", err.message);
    }
  }, 3000);

  console.log("[jobs] Drip cron started");
}

module.exports = { startJobs };
