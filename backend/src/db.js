const Database = require("better-sqlite3");
const path = require("path");
const bcrypt = require("bcryptjs");

const db = new Database(path.join(__dirname, "../data.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("wal_autocheckpoint = 100"); // checkpoint every 100 pages to keep WAL small

db.exec(`
  -- Agents (team members)
  CREATE TABLE IF NOT EXISTS agents (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    email      TEXT UNIQUE NOT NULL,
    password   TEXT NOT NULL,
    role       TEXT NOT NULL DEFAULT 'agent' CHECK(role IN ('admin','agent')),
    avatar     TEXT,
    is_active  INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
  );

  -- Contacts
  CREATE TABLE IF NOT EXISTS contacts (
    wa_id          TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    phone          TEXT NOT NULL,
    email          TEXT,
    opted_in       INTEGER NOT NULL DEFAULT 1,
    blacklisted    INTEGER NOT NULL DEFAULT 0,
    notes          TEXT,
    custom_fields  TEXT DEFAULT '{}',
    created_at     INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
    updated_at     INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
  );

  -- Tags
  CREATE TABLE IF NOT EXISTS tags (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT UNIQUE NOT NULL,
    color TEXT NOT NULL DEFAULT '#6366f1'
  );

  -- Contact <-> Tag
  CREATE TABLE IF NOT EXISTS contact_tags (
    contact_wa_id TEXT NOT NULL REFERENCES contacts(wa_id) ON DELETE CASCADE,
    tag_id        INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (contact_wa_id, tag_id)
  );

  -- Conversations
  CREATE TABLE IF NOT EXISTS conversations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_wa_id   TEXT NOT NULL REFERENCES contacts(wa_id),
    assigned_to     INTEGER REFERENCES agents(id),
    status          TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','pending','resolved')),
    last_message_at INTEGER DEFAULT 0,
    unread_count    INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
  );
  CREATE INDEX IF NOT EXISTS idx_conv_contact ON conversations(contact_wa_id);
  CREATE INDEX IF NOT EXISTS idx_conv_status  ON conversations(status);

  -- Messages
  CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    wamid           TEXT UNIQUE,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id),
    direction       TEXT NOT NULL CHECK(direction IN ('inbound','outbound')),
    type            TEXT NOT NULL DEFAULT 'text',
    body            TEXT,
    status          TEXT NOT NULL DEFAULT 'sent',
    is_note         INTEGER NOT NULL DEFAULT 0,
    sender_id       INTEGER REFERENCES agents(id),
    timestamp       INTEGER NOT NULL,
    reply_to_wamid  TEXT,
    media_url       TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id);

  -- Canned responses
  CREATE TABLE IF NOT EXISTS canned_responses (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    shortcut   TEXT UNIQUE NOT NULL,
    title      TEXT NOT NULL,
    body       TEXT NOT NULL,
    created_by INTEGER REFERENCES agents(id),
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
  );

  -- Templates (synced from Meta)
  CREATE TABLE IF NOT EXISTS templates (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    meta_id    TEXT UNIQUE,
    name       TEXT NOT NULL,
    language   TEXT NOT NULL DEFAULT 'en_US',
    category   TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'PENDING',
    components TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
  );

  -- Campaigns
  CREATE TABLE IF NOT EXISTS campaigns (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','running','completed','failed')),
    template_name  TEXT NOT NULL,
    language       TEXT NOT NULL DEFAULT 'en_US',
    components     TEXT NOT NULL DEFAULT '[]',
    audience_type  TEXT NOT NULL DEFAULT 'all' CHECK(audience_type IN ('all','tag','custom')),
    audience_value TEXT,
    total          INTEGER NOT NULL DEFAULT 0,
    sent           INTEGER NOT NULL DEFAULT 0,
    failed         INTEGER NOT NULL DEFAULT 0,
    started_at     INTEGER,
    completed_at   INTEGER,
    created_by     INTEGER REFERENCES agents(id),
    created_at     INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS campaign_recipients (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id  INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    wa_id        TEXT NOT NULL,
    contact_name TEXT,
    status       TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed')),
    sent_at      INTEGER,
    error        TEXT,
    UNIQUE(campaign_id, wa_id)
  );

  -- Automation rules
  CREATE TABLE IF NOT EXISTS automation_rules (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    trigger_type  TEXT NOT NULL CHECK(trigger_type IN ('keyword','new_conversation','opt_in')),
    trigger_value TEXT,
    actions       TEXT NOT NULL DEFAULT '[]',
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
  );

  -- Drip sequences
  CREATE TABLE IF NOT EXISTS drip_sequences (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    is_active  INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS drip_steps (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    sequence_id  INTEGER NOT NULL REFERENCES drip_sequences(id) ON DELETE CASCADE,
    step_order   INTEGER NOT NULL DEFAULT 0,
    delay_hours  INTEGER NOT NULL DEFAULT 0,
    type         TEXT NOT NULL DEFAULT 'text' CHECK(type IN ('text','template')),
    body         TEXT,
    template_id  INTEGER REFERENCES templates(id)
  );

  CREATE TABLE IF NOT EXISTS contact_sequences (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_wa_id TEXT NOT NULL REFERENCES contacts(wa_id) ON DELETE CASCADE,
    sequence_id  INTEGER NOT NULL REFERENCES drip_sequences(id) ON DELETE CASCADE,
    current_step INTEGER NOT NULL DEFAULT 0,
    started_at   INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
    next_send_at INTEGER,
    completed    INTEGER NOT NULL DEFAULT 0,
    UNIQUE(contact_wa_id, sequence_id)
  );
`);

// ── Seed admin user if none exists ────────────────────────────────────────────
const adminExists = db.prepare("SELECT id FROM agents WHERE role = 'admin' LIMIT 1").get();
if (!adminExists) {
  const hash = bcrypt.hashSync("admin123", 10);
  db.prepare("INSERT INTO agents (name, email, password, role) VALUES (?,?,?,?)").run(
    "Admin", "admin@nexusbizsol.com", hash, "admin"
  );
  console.log("[db] Seeded admin  →  admin@nexusbizsol.com / admin123");
}

// ── Migrations (run before preparing statements) ──────────────────────────────
try { db.exec("ALTER TABLE contacts ADD COLUMN phone TEXT NOT NULL DEFAULT ''"); } catch (_) {}
try { db.exec("ALTER TABLE contacts ADD COLUMN email TEXT"); } catch (_) {}
try { db.exec("ALTER TABLE contacts ADD COLUMN opted_in INTEGER NOT NULL DEFAULT 1"); } catch (_) {}
try { db.exec("ALTER TABLE contacts ADD COLUMN blacklisted INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
try { db.exec("ALTER TABLE contacts ADD COLUMN notes TEXT"); } catch (_) {}
try { db.exec("ALTER TABLE contacts ADD COLUMN custom_fields TEXT DEFAULT '{}'"); } catch (_) {}
try { db.exec("ALTER TABLE contacts ADD COLUMN created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)"); } catch (_) {}
try { db.exec("ALTER TABLE contacts ADD COLUMN updated_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)"); } catch (_) {}
try { db.exec("ALTER TABLE messages ADD COLUMN reply_to_wamid TEXT"); } catch (_) {}
try { db.exec("ALTER TABLE messages ADD COLUMN media_url TEXT"); } catch (_) {}
try { db.exec("ALTER TABLE agents ADD COLUMN phone TEXT"); } catch (_) {}
try { db.exec("ALTER TABLE agents ADD COLUMN agent_type TEXT DEFAULT 'agent'"); } catch (_) {}
try { db.exec("ALTER TABLE agents ADD COLUMN permissions TEXT DEFAULT '{}'"); } catch (_) {}
try { db.exec("ALTER TABLE templates ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1"); } catch (_) {}
try { db.exec("ALTER TABLE conversations ADD COLUMN lead_status TEXT DEFAULT 'new_lead'"); } catch (_) {}
try { db.exec("ALTER TABLE conversations ADD COLUMN label TEXT"); } catch (_) {}
try { db.exec("ALTER TABLE contacts ADD COLUMN source TEXT DEFAULT 'whatsapp'"); } catch (_) {}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Agents
const agentQ = {
  byEmail:  db.prepare("SELECT * FROM agents WHERE email = ?"),
  byId:     db.prepare("SELECT id,name,email,role,avatar,is_active,phone,agent_type,permissions,created_at FROM agents WHERE id = ?"),
  list:     db.prepare("SELECT id,name,email,role,is_active,phone,agent_type,permissions,created_at FROM agents"),
  insert:   db.prepare("INSERT INTO agents (name,email,password,role,phone,agent_type,permissions) VALUES (@name,@email,@password,@role,@phone,@agent_type,@permissions)"),
  update:   db.prepare("UPDATE agents SET name=@name,role=@role,is_active=@is_active,phone=@phone,agent_type=@agent_type,permissions=@permissions WHERE id=@id"),
  updatePassword: db.prepare("UPDATE agents SET password=? WHERE id=?"),
};

// Contacts
const contactQ = {
  upsert: db.prepare(`
    INSERT INTO contacts (wa_id, name, phone)
    VALUES (@wa_id, @name, @phone)
    ON CONFLICT(wa_id) DO UPDATE SET
      name = CASE WHEN @name != wa_id THEN @name ELSE contacts.name END,
      updated_at = unixepoch('now') * 1000
  `),
  list:   db.prepare("SELECT * FROM contacts ORDER BY updated_at DESC"),
  byId:   db.prepare("SELECT * FROM contacts WHERE wa_id = ?"),
  update: db.prepare(`
    UPDATE contacts SET name=@name, email=@email, opted_in=@opted_in,
    blacklisted=@blacklisted, notes=@notes, updated_at=unixepoch('now')*1000
    WHERE wa_id=@wa_id
  `),
  optOut: db.prepare("UPDATE contacts SET opted_in=0 WHERE wa_id=?"),
  delete: db.prepare("DELETE FROM contacts WHERE wa_id=?"),
};

// Tags
const tagQ = {
  list:          db.prepare("SELECT * FROM tags"),
  insert:        db.prepare("INSERT OR IGNORE INTO tags (name,color) VALUES (@name,@color)"),
  forContact:    db.prepare(`SELECT t.* FROM tags t JOIN contact_tags ct ON ct.tag_id=t.id WHERE ct.contact_wa_id=?`),
  addToContact:  db.prepare("INSERT OR IGNORE INTO contact_tags (contact_wa_id,tag_id) VALUES (?,?)"),
  removeFromContact: db.prepare("DELETE FROM contact_tags WHERE contact_wa_id=? AND tag_id=?"),
  clearContact:  db.prepare("DELETE FROM contact_tags WHERE contact_wa_id=?"),
  delete:        db.prepare("DELETE FROM tags WHERE id=?"),
};

// Conversations
const _convInsert   = db.prepare("INSERT INTO conversations (contact_wa_id) VALUES (?)");
const _convByContact = db.prepare("SELECT * FROM conversations WHERE contact_wa_id=? ORDER BY id ASC LIMIT 1");

function getOrCreateConv(wa_id) {
  const existing = _convByContact.get(wa_id);
  if (existing) return existing;
  const info = _convInsert.run(wa_id);
  return { id: info.lastInsertRowid, contact_wa_id: wa_id, status: "open", unread_count: 0, last_message_at: 0 };
}

const convQ = {
  getOrCreate: getOrCreateConv,
  byContact: _convByContact,
  list: db.prepare(`
    SELECT cv.*, c.name as contact_name, c.phone, c.opted_in, c.blacklisted, c.source as contact_source,
           a.name as agent_name,
           m.body as last_message, m.direction as last_direction,
           (SELECT COUNT(*) FROM messages WHERE conversation_id=cv.id AND is_note=1) as notes_count
    FROM conversations cv
    JOIN contacts c ON c.wa_id = cv.contact_wa_id
    LEFT JOIN agents a ON a.id = cv.assigned_to
    LEFT JOIN messages m ON m.id = (
      SELECT id FROM messages WHERE conversation_id=cv.id AND is_note=0 ORDER BY timestamp DESC LIMIT 1
    )
    ORDER BY cv.last_message_at DESC
  `),
  listByAgent: db.prepare(`
    SELECT cv.*, c.name as contact_name, c.phone,
           m.body as last_message, m.direction as last_direction
    FROM conversations cv
    JOIN contacts c ON c.wa_id = cv.contact_wa_id
    LEFT JOIN messages m ON m.id = (
      SELECT id FROM messages WHERE conversation_id=cv.id AND is_note=0 ORDER BY timestamp DESC LIMIT 1
    )
    WHERE cv.assigned_to=?
    ORDER BY cv.last_message_at DESC
  `),
  byId:          db.prepare("SELECT * FROM conversations WHERE id=?"),
  assign:        db.prepare("UPDATE conversations SET assigned_to=? WHERE id=?"),
  setStatus:     db.prepare("UPDATE conversations SET status=? WHERE id=?"),
  setLeadStatus: db.prepare("UPDATE conversations SET lead_status=? WHERE id=?"),
  setLabel:      db.prepare("UPDATE conversations SET label=? WHERE id=?"),
  touch:         db.prepare("UPDATE conversations SET last_message_at=? WHERE id=?"),
  incrUnread:    db.prepare("UPDATE conversations SET unread_count=unread_count+1 WHERE id=?"),
  clearUnread:   db.prepare("UPDATE conversations SET unread_count=0 WHERE id=?"),
};

// Messages
const msgQ = {
  insert: db.prepare(`
    INSERT OR IGNORE INTO messages (wamid,conversation_id,direction,type,body,status,is_note,sender_id,timestamp,reply_to_wamid,media_url)
    VALUES (@wamid,@conversation_id,@direction,@type,@body,@status,@is_note,@sender_id,@timestamp,@reply_to_wamid,@media_url)
  `),
  list: db.prepare(`
    SELECT m.*, a.name as sender_name,
           r.body as reply_to_body, r.direction as reply_to_direction, r.sender_id as reply_to_sender_id,
           ra.name as reply_to_sender_name
    FROM messages m
    LEFT JOIN agents a ON a.id = m.sender_id
    LEFT JOIN messages r ON r.wamid = m.reply_to_wamid
    LEFT JOIN agents ra ON ra.id = r.sender_id
    WHERE m.conversation_id=? ORDER BY m.timestamp ASC
  `),
  updateStatus:  db.prepare("UPDATE messages SET status=? WHERE wamid=?"),
  byWamid:       db.prepare("SELECT * FROM messages WHERE wamid=?"),
};

// Canned responses
const cannedQ = {
  list:   db.prepare("SELECT cr.*, a.name as creator FROM canned_responses cr LEFT JOIN agents a ON a.id=cr.created_by ORDER BY cr.shortcut"),
  insert: db.prepare("INSERT INTO canned_responses (shortcut,title,body,created_by) VALUES (@shortcut,@title,@body,@created_by)"),
  update: db.prepare("UPDATE canned_responses SET shortcut=@shortcut,title=@title,body=@body WHERE id=@id"),
  delete: db.prepare("DELETE FROM canned_responses WHERE id=?"),
  byShortcut: db.prepare("SELECT * FROM canned_responses WHERE shortcut=?"),
};

// Templates
const templateQ = {
  list:       db.prepare("SELECT * FROM templates ORDER BY created_at DESC"),
  upsert:     db.prepare(`INSERT INTO templates (meta_id,name,language,category,status,components) VALUES (@meta_id,@name,@language,@category,@status,@components) ON CONFLICT(meta_id) DO UPDATE SET status=@status, components=@components`),
  byId:       db.prepare("SELECT * FROM templates WHERE id=?"),
  delete:     db.prepare("DELETE FROM templates WHERE id=?"),
  setEnabled: db.prepare("UPDATE templates SET enabled=? WHERE id=?"),
};

// Automation
const autoQ = {
  list:      db.prepare("SELECT * FROM automation_rules ORDER BY created_at DESC"),
  insert:    db.prepare("INSERT INTO automation_rules (name,trigger_type,trigger_value,actions) VALUES (@name,@trigger_type,@trigger_value,@actions)"),
  update:    db.prepare("UPDATE automation_rules SET name=@name,trigger_type=@trigger_type,trigger_value=@trigger_value,actions=@actions,is_active=@is_active WHERE id=@id"),
  delete:    db.prepare("DELETE FROM automation_rules WHERE id=?"),
  active:    db.prepare("SELECT * FROM automation_rules WHERE is_active=1"),
};

// Drip
const dripQ = {
  listSeqs:       db.prepare("SELECT * FROM drip_sequences ORDER BY created_at DESC"),
  insertSeq:      db.prepare("INSERT INTO drip_sequences (name) VALUES (?)"),
  stepsFor:       db.prepare("SELECT * FROM drip_steps WHERE sequence_id=? ORDER BY step_order ASC"),
  insertStep:     db.prepare("INSERT INTO drip_steps (sequence_id,step_order,delay_hours,type,body,template_id) VALUES (@sequence_id,@step_order,@delay_hours,@type,@body,@template_id)"),
  enrollContact:  db.prepare("INSERT OR IGNORE INTO contact_sequences (contact_wa_id,sequence_id,next_send_at) VALUES (?,?,?)"),
  dueSteps:       db.prepare("SELECT cs.*, ds.body, ds.type, ds.template_id FROM contact_sequences cs JOIN drip_steps ds ON ds.sequence_id=cs.sequence_id AND ds.step_order=cs.current_step WHERE cs.completed=0 AND cs.next_send_at<=?"),
  advanceStep:    db.prepare("UPDATE contact_sequences SET current_step=@step,next_send_at=@next,completed=@done WHERE id=@id"),
};

// Campaigns
const campaignQ = {
  list:            db.prepare(`SELECT c.*, a.name as creator_name FROM campaigns c LEFT JOIN agents a ON a.id=c.created_by ORDER BY c.created_at DESC`),
  byId:            db.prepare(`SELECT c.*, a.name as creator_name FROM campaigns c LEFT JOIN agents a ON a.id=c.created_by WHERE c.id=?`),
  insert:          db.prepare(`INSERT INTO campaigns (name,template_name,language,components,audience_type,audience_value,created_by) VALUES (@name,@template_name,@language,@components,@audience_type,@audience_value,@created_by)`),
  update:          db.prepare(`UPDATE campaigns SET name=@name,template_name=@template_name,language=@language,components=@components,audience_type=@audience_type,audience_value=@audience_value WHERE id=@id AND status='draft'`),
  delete:          db.prepare(`DELETE FROM campaigns WHERE id=? AND status!='running'`),
  setRunning:      db.prepare(`UPDATE campaigns SET status='running',started_at=@started_at,total=@total WHERE id=@id`),
  setCompleted:    db.prepare(`UPDATE campaigns SET status='completed',completed_at=? WHERE id=?`),
  setFailed:       db.prepare(`UPDATE campaigns SET status='failed',completed_at=? WHERE id=?`),
  incrSent:        db.prepare(`UPDATE campaigns SET sent=sent+1 WHERE id=?`),
  incrFailed:      db.prepare(`UPDATE campaigns SET failed=failed+1 WHERE id=?`),
  recipients:      db.prepare(`SELECT * FROM campaign_recipients WHERE campaign_id=? ORDER BY id ASC`),
  addRecipient:    db.prepare(`INSERT OR IGNORE INTO campaign_recipients (campaign_id,wa_id,contact_name) VALUES (@campaign_id,@wa_id,@contact_name)`),
  updateRecipient: db.prepare(`UPDATE campaign_recipients SET status=@status,sent_at=@sent_at,error=@error WHERE campaign_id=@campaign_id AND wa_id=@wa_id`),
  contactsByTag:   db.prepare(`SELECT c.* FROM contacts c JOIN contact_tags ct ON ct.contact_wa_id=c.wa_id JOIN tags t ON t.id=ct.tag_id WHERE t.name=? AND c.opted_in=1`),
  optedInAll:      db.prepare(`SELECT * FROM contacts WHERE opted_in=1`),
};

module.exports = { db, agentQ, contactQ, tagQ, convQ, msgQ, cannedQ, templateQ, autoQ, dripQ, campaignQ };
