import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "http://localhost:3001" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("wa_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auth
export const login = (email, password) => api.post("/api/auth/login", { email, password }).then((r) => r.data);
export const getMe = () => api.get("/api/auth/me").then((r) => r.data);

// Conversations
export const getConversations = (params) => api.get("/api/conversations", { params }).then((r) => r.data);
export const startNewChat = (data) => api.post("/api/conversations/new", data).then((r) => r.data);
export const getConversation = (id) => api.get(`/api/conversations/${id}`).then((r) => r.data);
export const getMessages = (id) => api.get(`/api/conversations/${id}/messages`).then((r) => r.data);
export const sendMessage = (id, text, reply_to_wamid) => api.post(`/api/conversations/${id}/send`, { text, reply_to_wamid }).then((r) => r.data);
export const sendTemplate = (id, data) => api.post(`/api/conversations/${id}/send-template`, data).then((r) => r.data);
export const addNote = (id, text) => api.post(`/api/conversations/${id}/note`, { text }).then((r) => r.data);
export const assignConversation = (id, agent_id) => api.post(`/api/conversations/${id}/assign`, { agent_id }).then((r) => r.data);
export const setConversationStatus = (id, status) => api.post(`/api/conversations/${id}/status`, { status }).then((r) => r.data);

// Canned responses
export const getCannedResponses = () => api.get("/api/conversations/canned/all").then((r) => r.data);
export const createCannedResponse = (data) => api.post("/api/conversations/canned/all", data).then((r) => r.data);
export const updateCannedResponse = (id, data) => api.put(`/api/conversations/canned/${id}`, data).then((r) => r.data);
export const deleteCannedResponse = (id) => api.delete(`/api/conversations/canned/${id}`).then((r) => r.data);

// Contacts
export const getContacts = () => api.get("/api/contacts").then((r) => r.data);
export const getContact = (waId) => api.get(`/api/contacts/${waId}`).then((r) => r.data);
export const updateContact = (waId, data) => api.put(`/api/contacts/${waId}`, data).then((r) => r.data);
export const deleteContact = (waId) => api.delete(`/api/contacts/${waId}`).then((r) => r.data);
export const importContacts = (file) => { const fd = new FormData(); fd.append("file", file); return api.post("/api/contacts/import", fd).then((r) => r.data); };
export const exportContactsCsv = () => window.open((import.meta.env.VITE_API_URL || "http://localhost:3001") + "/api/contacts/export/csv");
export const getTags = () => api.get("/api/contacts/tags/all").then((r) => r.data);
export const createTag = (name, color) => api.post("/api/contacts/tags/all", { name, color }).then((r) => r.data);

// Templates
export const getTemplates = () => api.get("/api/templates").then((r) => r.data);
export const syncTemplates = () => api.post("/api/templates/sync").then((r) => r.data);

// Automation
export const getRules = () => api.get("/api/automation/rules").then((r) => r.data);
export const createRule = (data) => api.post("/api/automation/rules", data).then((r) => r.data);
export const updateRule = (id, data) => api.put(`/api/automation/rules/${id}`, data).then((r) => r.data);
export const deleteRule = (id) => api.delete(`/api/automation/rules/${id}`).then((r) => r.data);
export const getSequences = () => api.get("/api/automation/sequences").then((r) => r.data);
export const createSequence = (data) => api.post("/api/automation/sequences", data).then((r) => r.data);
export const enrollInSequence = (seqId, contact_wa_id) => api.post(`/api/automation/sequences/${seqId}/enroll`, { contact_wa_id }).then((r) => r.data);

// Agents
export const getAgents = () => api.get("/api/agents").then((r) => r.data);
export const createAgent = (data) => api.post("/api/agents", data).then((r) => r.data);
export const updateAgent = (id, data) => api.put(`/api/agents/${id}`, data).then((r) => r.data);

export default api;
