const axios = require("axios");
const FormData = require("form-data");

const BASE = "https://graph.facebook.com/v21.0";

function client() {
  return axios.create({
    baseURL: BASE,
    headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` },
  });
}

async function sendText(to, text, replyToWamid) {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: false, body: text },
  };
  if (replyToWamid) payload.context = { message_id: replyToWamid };
  const { data } = await client().post(`/${process.env.PHONE_NUMBER_ID}/messages`, payload);
  return data;
}

async function sendTemplate(to, name, language, components = []) {
  const { data } = await client().post(`/${process.env.PHONE_NUMBER_ID}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: { name, language: { code: language }, components },
  });
  return data;
}

async function markAsRead(wamid) {
  await client().post(`/${process.env.PHONE_NUMBER_ID}/messages`, {
    messaging_product: "whatsapp",
    status: "read",
    message_id: wamid,
  }).catch(() => {});
}

async function fetchTemplates() {
  const { data } = await client().get(`/${process.env.WABA_ID}/message_templates`, {
    params: { limit: 100 },
  });
  return data.data ?? [];
}

async function uploadMedia(buffer, mimeType, filename) {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", buffer, { filename, contentType: mimeType });
  const { data } = await client().post(`/${process.env.PHONE_NUMBER_ID}/media`, form, {
    headers: form.getHeaders(),
  });
  return data; // { id: "...", ... }
}

async function sendImage(to, mediaId, caption = "") {
  const { data } = await client().post(`/${process.env.PHONE_NUMBER_ID}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "image",
    image: { id: mediaId, caption },
  });
  return data;
}

async function getMediaInfo(mediaId) {
  const { data } = await client().get(`/${mediaId}`);
  return { url: data.url, mimeType: data.mime_type };
}

async function downloadMedia(mediaUrl) {
  const { data, headers } = await axios.get(mediaUrl, {
    headers: { Authorization: `Bearer ${process.env.ACCESS_TOKEN}` },
    responseType: "arraybuffer",
  });
  return { buffer: Buffer.from(data), mimeType: headers["content-type"] };
}

module.exports = { sendText, sendTemplate, markAsRead, fetchTemplates, uploadMedia, sendImage, getMediaInfo, downloadMedia };
