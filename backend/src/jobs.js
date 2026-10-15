const cron = require("node-cron");
const { dripQ, convQ, msgQ, contactQ } = require("./db");
const { sendText } = require("./whatsapp");

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

  console.log("[jobs] Drip cron started");
}

module.exports = { startJobs };
