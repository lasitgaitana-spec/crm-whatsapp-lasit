require('dotenv').config()
const mysql = require('mysql2/promise')

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'crm_whatsapp',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
})

// Asegurar zona horaria de la sesión para todas las conexiones del pool (Colombia -05:00)
try {
  // mysql2/promise Pool emite el evento 'connection' por cada conexión creada
  // Establecemos la zona horaria de la sesión a -05:00 (America/Bogota sin DST)
  pool.on && pool.on('connection', (conn) => {
    try { conn.query("SET time_zone = '-05:00'") } catch {}
  })
} catch {}

async function ensureDatabaseExists() {
  const host = process.env.DB_HOST || 'localhost'
  const port = Number(process.env.DB_PORT || 3306)
  const user = process.env.DB_USER || 'root'
  const password = process.env.DB_PASS || ''
  const dbName = process.env.DB_NAME || 'crm_whatsapp'
  const conn = await mysql.createConnection({ host, port, user, password })
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`)
  await conn.end()
}

async function initSchema() {
  await ensureDatabaseExists()
  // Crea tablas si no existen
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    jid VARCHAR(128) UNIQUE,
    phone VARCHAR(32),
    name VARCHAR(128),
    platforms VARCHAR(32) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  // Asegurar columna platforms para contactos (whatsapp/telegram/both)
  try {
    const [platCol] = await pool.query(`SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'platforms'`)
    if ((platCol[0]?.cnt || 0) === 0) {
      await pool.query(`ALTER TABLE users ADD COLUMN platforms VARCHAR(32) NULL`)
    }
  } catch {}

  await pool.query(`CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(128) PRIMARY KEY,
    sender_jid VARCHAR(128),
    text TEXT,
    ts BIGINT,
    from_me TINYINT(1),
    status ENUM('sent','delivered','read') NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_sender_ts (sender_jid, ts)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  await pool.query(`CREATE TABLE IF NOT EXISTS media (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    message_id VARCHAR(128),
    user_jid VARCHAR(128),
    type ENUM('image','video','audio','document','sticker','unknown') NOT NULL,
    mime VARCHAR(128),
    filename VARCHAR(256),
    path VARCHAR(512),
    size BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_type (user_jid, type),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  await pool.query(`CREATE TABLE IF NOT EXISTS labels (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL UNIQUE,
    description VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  await pool.query(`CREATE TABLE IF NOT EXISTS field_folders (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  // Tabla de campos (si no existe) y columna de carpeta
  await pool.query(`CREATE TABLE IF NOT EXISTS fields (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL UNIQUE,
    description VARCHAR(255) NULL,
    type ENUM('text','number','date','datetime') NOT NULL DEFAULT 'text',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  // Asegurar columna folder_id
  try {
    const [folderCol] = await pool.query(`SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fields' AND COLUMN_NAME = 'folder_id'`)
    if ((folderCol[0]?.cnt || 0) === 0) {
      await pool.query(`ALTER TABLE fields ADD COLUMN folder_id BIGINT NULL`)
    }
  } catch {}
  // Asegurar índice de folder_id
  try {
    const [idxRows] = await pool.query(`SHOW INDEX FROM fields WHERE Key_name = 'idx_folder_id'`)
    if ((idxRows?.length || 0) === 0) {
      await pool.query(`ALTER TABLE fields ADD INDEX idx_folder_id (folder_id)`)
    }
  } catch {}
  // Asegurar clave foránea a field_folders
  try {
    const [fkRows] = await pool.query(`SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fields' AND CONSTRAINT_NAME = 'fk_fields_folder'`)
    if ((fkRows[0]?.cnt || 0) === 0) {
      await pool.query(`ALTER TABLE fields ADD CONSTRAINT fk_fields_folder FOREIGN KEY (folder_id) REFERENCES field_folders(id) ON DELETE SET NULL`)
    }
  } catch {}
  // Asegurar columna type (para compatibilidad con DB antiguas)
  try {
    const [typeCol] = await pool.query(`SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fields' AND COLUMN_NAME = 'type'`)
    if ((typeCol[0]?.cnt || 0) === 0) {
      await pool.query(`ALTER TABLE fields ADD COLUMN type ENUM('text','number','date','datetime') NOT NULL DEFAULT 'text'`)
    }
  } catch {}
  // Asegurar columna is_system (para campos prediseñados)
  try {
    const [systemCol] = await pool.query(`SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fields' AND COLUMN_NAME = 'is_system'`)
    if ((systemCol[0]?.cnt || 0) === 0) {
      await pool.query(`ALTER TABLE fields ADD COLUMN is_system TINYINT(1) NOT NULL DEFAULT 0`)
    }
  } catch {}
  // Crear campo prediseñado "Nombre Cliente" si no existe
  try {
    const [existingField] = await pool.query(`SELECT COUNT(*) AS cnt FROM fields WHERE name = 'Nombre Cliente'`)
    if ((existingField[0]?.cnt || 0) === 0) {
      await pool.query(`INSERT INTO fields (name, description, type, is_system) VALUES ('Nombre Cliente', 'Campo prediseñado que captura automáticamente el nombre del usuario desde Contactos', 'text', 1)`)
    }
    // Si existe pero aún no está marcado como sistema, corregirlo
    await pool.query(`UPDATE fields SET is_system = 1 WHERE name = 'Nombre Cliente' AND (is_system IS NULL OR is_system = 0)`)
  } catch {}
  // Crear campo prediseñado "Fecha" si no existe
  try {
    const [existingFecha] = await pool.query(`SELECT COUNT(*) AS cnt FROM fields WHERE name = 'Fecha'`)
    if ((existingFecha[0]?.cnt || 0) === 0) {
      await pool.query(`INSERT INTO fields (name, description, type, is_system) VALUES ('Fecha', 'Campo del sistema que representa la fecha actual con formato Día {dd} de {mes} de {aaaa}', 'date', 1)`)
    }
    // Si existe pero aún no está marcado como sistema, corregirlo
    await pool.query(`UPDATE fields SET is_system = 1 WHERE name = 'Fecha' AND (is_system IS NULL OR is_system = 0)`)
  } catch {}

  // Tabla de relación usuario-etiquetas
  await pool.query(`CREATE TABLE IF NOT EXISTS user_labels (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    label_id BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_user_label (user_id, label_id),
    INDEX idx_label (label_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (label_id) REFERENCES labels(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  // Valores de campos personalizados por usuario
  await pool.query(`CREATE TABLE IF NOT EXISTS user_field_values (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    field_id BIGINT NOT NULL,
    value TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_user_field (user_id, field_id),
    INDEX idx_field (field_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (field_id) REFERENCES fields(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  // Campañas: carpetas y flujos
  await pool.query(`CREATE TABLE IF NOT EXISTS campaign_flow_folders (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL UNIQUE,
    color VARCHAR(16) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  // Asegurar columna color para carpetas de flujos
  try {
    const [colorCol] = await pool.query(`SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'campaign_flow_folders' AND COLUMN_NAME = 'color'`)
    if ((colorCol[0]?.cnt || 0) === 0) {
      await pool.query(`ALTER TABLE campaign_flow_folders ADD COLUMN color VARCHAR(16) NULL`)
    }
  } catch {}

  await pool.query(`CREATE TABLE IF NOT EXISTS campaign_flows (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    folder_id BIGINT NULL,
    connections VARCHAR(64) NULL,
    runs VARCHAR(64) NULL,
    ctr VARCHAR(64) NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_name (name),
    INDEX idx_folder (folder_id),
    FOREIGN KEY (folder_id) REFERENCES campaign_flow_folders(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  // Asegurar que connections sea MEDIUMTEXT para guardar flujos grandes
  try {
    const [connCol] = await pool.query(`SELECT DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'campaign_flows' AND COLUMN_NAME = 'connections'`)
    const dtype = (connCol[0]?.DATA_TYPE || '').toLowerCase()
    const clen = Number(connCol[0]?.CHARACTER_MAXIMUM_LENGTH || 0)
    if (dtype !== 'mediumtext' && dtype !== 'text') {
      await pool.query(`ALTER TABLE campaign_flows MODIFY COLUMN connections MEDIUMTEXT NULL`)
    } else if (dtype === 'text' && clen < 65535) {
      // Si fuese TEXT pequeño, lo ampliamos
      await pool.query(`ALTER TABLE campaign_flows MODIFY COLUMN connections MEDIUMTEXT NULL`)
    }
  } catch {}

  // Mensajes masivos: carpetas y flujos
  await pool.query(`CREATE TABLE IF NOT EXISTS bulk_flow_folders (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL UNIQUE,
    color VARCHAR(16) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  // Asegurar columna color en carpetas de bulk
  try {
    const [colorCol2] = await pool.query(`SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bulk_flow_folders' AND COLUMN_NAME = 'color'`)
    if ((colorCol2[0]?.cnt || 0) === 0) {
      await pool.query(`ALTER TABLE bulk_flow_folders ADD COLUMN color VARCHAR(16) NULL`)
    }
  } catch {}

  await pool.query(`CREATE TABLE IF NOT EXISTS bulk_flows (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    folder_id BIGINT NULL,
    connections VARCHAR(64) NULL,
    runs VARCHAR(64) NULL,
    ctr VARCHAR(64) NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_name (name),
    INDEX idx_folder (folder_id),
    FOREIGN KEY (folder_id) REFERENCES bulk_flow_folders(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  // Asegurar que connections sea MEDIUMTEXT para bulk
  try {
    const [connCol2] = await pool.query(`SELECT DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bulk_flows' AND COLUMN_NAME = 'connections'`)
    const dtype2 = (connCol2[0]?.DATA_TYPE || '').toLowerCase()
    const clen2 = Number(connCol2[0]?.CHARACTER_MAXIMUM_LENGTH || 0)
    if (dtype2 !== 'mediumtext' && dtype2 !== 'text') {
      await pool.query(`ALTER TABLE bulk_flows MODIFY COLUMN connections MEDIUMTEXT NULL`)
    } else if (dtype2 === 'text' && clen2 < 65535) {
      await pool.query(`ALTER TABLE bulk_flows MODIFY COLUMN connections MEDIUMTEXT NULL`)
    }
  } catch {}

  // === Agentes (generales) y secciones (pestañas) ===
  await pool.query(`CREATE TABLE IF NOT EXISTS agents (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    advisor_name VARCHAR(128) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  // Asegurar columna "advisor_name" en agents
  try {
    const [advCol] = await pool.query(`SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agents' AND COLUMN_NAME = 'advisor_name'`)
    if ((advCol[0]?.cnt || 0) === 0) {
      await pool.query(`ALTER TABLE agents ADD COLUMN advisor_name VARCHAR(128) NULL AFTER name`)
    }
  } catch {}

  await pool.query(`CREATE TABLE IF NOT EXISTS agent_sections (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    agent_id BIGINT NOT NULL,
    name VARCHAR(128) NOT NULL,
    content MEDIUMTEXT NULL,
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_agent (agent_id),
    INDEX idx_position (position),
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  // Asegurar columna "active" en agent_sections
  try {
    const [col] = await pool.query(`SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_sections' AND COLUMN_NAME = 'active'`)
    if ((col[0]?.cnt || 0) === 0) {
      await pool.query(`ALTER TABLE agent_sections ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1`)
    }
  } catch {}

  // === Gemini: agentes y conocimiento ===
  await pool.query(`CREATE TABLE IF NOT EXISTS gemini_agents (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    agent_type ENUM('super','generic') NOT NULL DEFAULT 'super',
    domain VARCHAR(64) NULL,
    base_prompt MEDIUMTEXT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_type (agent_type)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  await pool.query(`CREATE TABLE IF NOT EXISTS gemini_knowledge_items (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    agent_id BIGINT NOT NULL,
    author VARCHAR(64) NULL,
    content MEDIUMTEXT NOT NULL,
    tags VARCHAR(256) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_agent (agent_id),
    FOREIGN KEY (agent_id) REFERENCES gemini_agents(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  // === Manuales guardados (repositorio independiente, no asigna a agentes) ===
  await pool.query(`CREATE TABLE IF NOT EXISTS saved_manuals (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NULL,
    content MEDIUMTEXT NOT NULL,
    agent_name VARCHAR(128) NULL,
    section_name VARCHAR(128) NULL,
    voice_id VARCHAR(64) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  // Intento de migración suave: añadir columna voice_id si la tabla ya existía sin ella
  try {
    // Verificar existencia mediante INFORMATION_SCHEMA para soportar MySQL/MariaDB sin IF NOT EXISTS
    const [cols] = await pool.query(`SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'saved_manuals' AND COLUMN_NAME = 'voice_id'`)
    if ((cols[0]?.cnt || 0) === 0) {
      await pool.query(`ALTER TABLE saved_manuals ADD COLUMN voice_id VARCHAR(64) NULL`)
    }
  } catch (e) { /* ignorar si ya existe o si hay permisos limitados */ }

  // === Capataz: configuración persistente ===
  await pool.query(`CREATE TABLE IF NOT EXISTS capataz_config (
    id TINYINT PRIMARY KEY,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    greeting_text VARCHAR(512) NULL,
    require_full_name TINYINT(1) NOT NULL DEFAULT 1,
    auto_labels TEXT NULL,
    interest_routes MEDIUMTEXT NULL,
    kb_text MEDIUMTEXT NULL,
    agent_name VARCHAR(128) NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  // Migración suave: añadir columna agent_name si no existe
  try {
    const [colsCfg] = await pool.query(`SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'capataz_config' AND COLUMN_NAME = 'agent_name'`)
    if ((colsCfg[0]?.cnt || 0) === 0) {
      await pool.query(`ALTER TABLE capataz_config ADD COLUMN agent_name VARCHAR(128) NULL`)
    }
    // Semilla de valor por defecto si está NULL
    await pool.query(`UPDATE capataz_config SET agent_name = COALESCE(agent_name, 'Recepcionita') WHERE id = 1`)
  } catch {}
  // Migración suave: añadir columna kb_text si no existe
  try {
    const [kbCol] = await pool.query(`SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'capataz_config' AND COLUMN_NAME = 'kb_text'`)
    if ((kbCol[0]?.cnt || 0) === 0) {
      await pool.query(`ALTER TABLE capataz_config ADD COLUMN kb_text MEDIUMTEXT NULL`)
    }
  } catch {}
  // Semilla de configuración por defecto
  try {
    const [rows] = await pool.query(`SELECT COUNT(*) AS cnt FROM capataz_config WHERE id = 1`)
    if ((rows[0]?.cnt || 0) === 0) {
      await pool.query(`INSERT INTO capataz_config (id, enabled, greeting_text, require_full_name, auto_labels, interest_routes, kb_text, agent_name) VALUES (1, 1, '¡Hola! Soy Recepcionita 🤖. ¿Me confirmas tu nombre completo (nombre y apellidos)?', 1, '[]', '[]', NULL, 'Recepcionita')`)
    }
  } catch {}

  // === Recepcionista: configuración independiente ===
  await pool.query(`CREATE TABLE IF NOT EXISTS recepcionista_config (
    id TINYINT PRIMARY KEY,
    agent_name VARCHAR(255) NULL,
    kb_text MEDIUMTEXT NULL,
    voice_id VARCHAR(255) NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  // Migraciones suaves para columnas (defensivo si el esquema cambia)
  try { await pool.query(`ALTER TABLE recepcionista_config ADD COLUMN agent_name VARCHAR(255) NULL`) } catch {}
  try { await pool.query(`ALTER TABLE recepcionista_config ADD COLUMN kb_text MEDIUMTEXT NULL`) } catch {}
  try { await pool.query(`ALTER TABLE recepcionista_config ADD COLUMN voice_id VARCHAR(255) NULL`) } catch {}
  try { await pool.query(`ALTER TABLE recepcionista_config ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`) } catch {}
  // Semilla del registro único id=1
  try {
    const [rcfg] = await pool.query(`SELECT COUNT(*) AS cnt FROM recepcionista_config WHERE id = 1`)
    if ((rcfg[0]?.cnt || 0) === 0) {
      await pool.query(`INSERT INTO recepcionista_config (id, agent_name, kb_text, voice_id) VALUES (1, 'Sofía', NULL, NULL)`)
    }
  } catch {}

  // === Recepcionista: tarjetas de asignación ===
  await pool.query(`CREATE TABLE IF NOT EXISTS recepcionista_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NULL,
    program VARCHAR(128) NULL,
    agent_id INT NULL,
    tag_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  // === Memoria del agente por JID (persistencia de sesión)
  await pool.query(`CREATE TABLE IF NOT EXISTS agent_memory (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    jid VARCHAR(128) UNIQUE,
    client_name VARCHAR(128) NULL,
    program VARCHAR(128) NULL,
    stage ENUM('conversation','completed') NOT NULL DEFAULT 'conversation',
    last_message_ts BIGINT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_jid (jid)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
}

async function upsertLabel({ name, description }) {
  const n = String(name || '').trim()
  if (!n) return
  await pool.query(`INSERT INTO labels (name, description) VALUES (?,?)
    ON DUPLICATE KEY UPDATE description=VALUES(description)`, [n, description || null])
}

async function listLabels({ q = '' } = {}) {
  const query = String(q || '').trim()
  let sql = `SELECT id, name, description, created_at FROM labels`
  const params = []
  if (query) { sql += ` WHERE name LIKE ? OR description LIKE ?`; params.push(`%${query}%`, `%${query}%`) }
  sql += ` ORDER BY created_at DESC LIMIT 500`
  const [rows] = await pool.query(sql, params)
  return rows
}

async function updateLabel({ id, name, description }) {
  const labelId = Number(id)
  if (!labelId || labelId <= 0) return
  const n = String(name || '').trim()
  const d = description ? String(description).trim() : null
  if (!n) return
  await pool.query(`UPDATE labels SET name = ?, description = ? WHERE id = ?`, [n, d, labelId])
}

async function deleteLabel({ id }) {
  const labelId = Number(id)
  if (!labelId || labelId <= 0) return
  await pool.query(`DELETE FROM labels WHERE id = ?`, [labelId])
}

async function upsertField({ name, description, folderId = null, type = 'text' }) {
  const n = String(name || '').trim()
  if (!n) return
  const t = ['text','number','date','datetime'].includes(String(type)) ? String(type) : 'text'
  const fId = folderId ? Number(folderId) : null
  await pool.query(`INSERT INTO fields (name, description, folder_id, type) VALUES (?,?,?,?)
    ON DUPLICATE KEY UPDATE description=VALUES(description), folder_id=VALUES(folder_id), type=VALUES(type)`, [n, description || null, fId, t])
}

async function listFields({ q = '', folderId = null } = {}) {
  const query = String(q || '').trim()
  let sql = `SELECT f.id, f.name, f.description, f.type, f.created_at, f.folder_id, f.is_system, ff.name AS folder_name FROM fields f LEFT JOIN field_folders ff ON ff.id = f.folder_id`
  const params = []
  const where = []
  if (query) { where.push(`(f.name LIKE ? OR f.description LIKE ?)`); params.push(`%${query}%`, `%${query}%`) }
  if (folderId) { where.push(`f.folder_id = ?`); params.push(Number(folderId)) }
  if (where.length) sql += ` WHERE ` + where.join(' AND ')
  sql += ` ORDER BY f.is_system DESC, f.created_at DESC LIMIT 500`
  const [rows] = await pool.query(sql, params)
  return rows
}

async function updateField({ id, name, description, folderId = null, type = 'text' }) {
  const fieldId = Number(id)
  if (!fieldId || fieldId <= 0) return
  
  // Verificar si es un campo del sistema
  const [systemCheck] = await pool.query(`SELECT is_system FROM fields WHERE id = ?`, [fieldId])
  if (systemCheck[0]?.is_system) {
    throw new Error('No se pueden editar campos prediseñados del sistema')
  }
  
  const n = String(name || '').trim()
  const d = description ? String(description).trim() : null
  if (!n) return
  const t = ['text','number','date','datetime'].includes(String(type)) ? String(type) : 'text'
  const fId = folderId ? Number(folderId) : null
  await pool.query(`UPDATE fields SET name = ?, description = ?, folder_id = ?, type = ? WHERE id = ?`, [n, d, fId, t, fieldId])
}

async function deleteField({ id }) {
  const fieldId = Number(id)
  if (!fieldId || fieldId <= 0) return
  
  // Verificar si es un campo del sistema
  const [systemCheck] = await pool.query(`SELECT is_system FROM fields WHERE id = ?`, [fieldId])
  if (systemCheck[0]?.is_system) {
    throw new Error('No se pueden eliminar campos prediseñados del sistema')
  }
  
  await pool.query(`DELETE FROM fields WHERE id = ?`, [fieldId])
}

// Carpetas (folders)
async function createFolder({ name }) {
  const n = String(name || '').trim()
  if (!n) return
  await pool.query(`INSERT INTO field_folders (name) VALUES (?) ON DUPLICATE KEY UPDATE id=id`, [n])
}

async function listFolders({ q = '' } = {}) {
  const query = String(q || '').trim()
  let sql = `SELECT id, name, created_at FROM field_folders`
  const params = []
  if (query) { sql += ` WHERE name LIKE ?`; params.push(`%${query}%`) }
  sql += ` ORDER BY created_at DESC LIMIT 500`
  const [rows] = await pool.query(sql, params)
  return rows
}

async function updateFolder({ id, name }) {
  const folderId = Number(id)
  const n = String(name || '').trim()
  if (!folderId || folderId <= 0 || !n) return
  await pool.query(`UPDATE field_folders SET name = ? WHERE id = ?`, [n, folderId])
}

async function deleteFolder({ id }) {
  const folderId = Number(id)
  if (!folderId || folderId <= 0) return
  // Desasociar campos antes de borrar
  await pool.query(`UPDATE fields SET folder_id = NULL WHERE folder_id = ?`, [folderId])
  await pool.query(`DELETE FROM field_folders WHERE id = ?`, [folderId])
}

async function upsertUser({ jid, phone, name, platforms = undefined }) {
  if (!jid) return
  if (typeof platforms === 'undefined') {
    await pool.query(`INSERT INTO users (jid, phone, name) VALUES (?,?,?)
      ON DUPLICATE KEY UPDATE phone=IFNULL(VALUES(phone), phone), name=IFNULL(VALUES(name), name)`, [jid, phone || null, name || null])
  } else {
    await pool.query(`INSERT INTO users (jid, phone, name, platforms) VALUES (?,?,?,?)
      ON DUPLICATE KEY UPDATE phone=IFNULL(VALUES(phone), phone), name=IFNULL(VALUES(name), name), platforms=IFNULL(VALUES(platforms), platforms)`, [jid, phone || null, name || null, platforms || null])
  }
}

async function insertMessage({ id, sender, text, ts, fromMe, status }) {
  if (!id) return
  // Normalizar status a ENUM('sent','delivered','read')
  let st = status
  if (typeof st === 'number') {
    // Baileys: 1=sent, 2=delivered, 3/4=read
    st = st >= 3 ? 'read' : (st === 2 ? 'delivered' : 'sent')
  }
  if (st && typeof st === 'string') {
    const allowed = ['sent', 'delivered', 'read']
    if (!allowed.includes(st)) st = null
  }
  await pool.query(`INSERT INTO messages (id, sender_jid, text, ts, from_me, status) VALUES (?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE status=VALUES(status), text=IFNULL(VALUES(text), text)`, [id, sender, text || null, ts || Date.now(), fromMe ? 1 : 0, st || null])
}

// Campañas: carpetas y flujos (CRUD)
async function createCampaignFolder({ name, color = null }) {
  const n = String(name || '').trim()
  if (!n) return
  const c = String(color || '').trim()
  const isHex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c)
  const col = isHex ? c.toLowerCase() : null
  const [res] = await pool.query(`INSERT INTO campaign_flow_folders (name, color) VALUES (?, ?)`, [n, col])
  return { id: res.insertId }
}

async function listCampaignFolders() {
  const [rows] = await pool.query(`SELECT id, name, color, created_at FROM campaign_flow_folders ORDER BY created_at DESC LIMIT 500`)
  return rows
}

async function updateCampaignFolder({ id, name, color = undefined }) {
  const folderId = Number(id)
  const n = String(name || '').trim()
  if (!folderId || folderId <= 0 || !n) return
  if (typeof color === 'undefined') {
    await pool.query(`UPDATE campaign_flow_folders SET name = ? WHERE id = ?`, [n, folderId])
  } else {
    const c = String(color || '').trim()
    const isHex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c)
    const col = isHex ? c.toLowerCase() : null
    await pool.query(`UPDATE campaign_flow_folders SET name = ?, color = ? WHERE id = ?`, [n, col, folderId])
  }
}

async function deleteCampaignFolder({ id }) {
  const folderId = Number(id)
  if (!folderId || folderId <= 0) return
  await pool.query(`UPDATE campaign_flows SET folder_id = NULL WHERE folder_id = ?`, [folderId])
  await pool.query(`DELETE FROM campaign_flow_folders WHERE id = ?`, [folderId])
}

async function createCampaignFlow({ name, folderId = null }) {
  const n = String(name || '').trim()
  const fId = folderId ? Number(folderId) : null
  if (!n) return
  const [res] = await pool.query(`INSERT INTO campaign_flows (name, folder_id, connections, runs, ctr) VALUES (?,?,?,?,?)`, [n, fId, '-', '-', '-'])
  const [rows] = await pool.query(`SELECT cf.id, cf.name, cf.folder_id, ff.name AS folder_name, cf.connections, cf.runs, cf.ctr, DATE_FORMAT(cf.updated_at, '%d/%m/%Y %H:%i') as updatedAt FROM campaign_flows cf LEFT JOIN campaign_flow_folders ff ON ff.id = cf.folder_id WHERE cf.id = ?`, [res.insertId])
  return rows[0]
}

async function listCampaignFlows({ q = '', folderId = null } = {}) {
  const query = String(q || '').trim()
  const fId = folderId ? Number(folderId) : null
  let sql = `SELECT cf.id, cf.name, cf.folder_id, ff.name AS folder_name, cf.connections, cf.runs, cf.ctr, DATE_FORMAT(cf.updated_at, '%d/%m/%Y %H:%i') as updatedAt FROM campaign_flows cf LEFT JOIN campaign_flow_folders ff ON ff.id = cf.folder_id`
  const params = []
  const where = []
  if (query) { where.push(`cf.name LIKE ?`); params.push(`%${query}%`) }
  if (fId) { where.push(`cf.folder_id = ?`); params.push(fId) }
  if (where.length) sql += ` WHERE ` + where.join(' AND ')
  sql += ` ORDER BY cf.updated_at DESC, cf.created_at DESC LIMIT 500`
  const [rows] = await pool.query(sql, params)
  return rows
}

async function updateCampaignFlow({ id, name = undefined, folderId = undefined, connections = undefined }) {
  const flowId = Number(id)
  if (!flowId || flowId <= 0) return
  const sets = []
  const params = []
  if (name !== undefined) {
    const n = String(name || '').trim()
    if (n) { sets.push('name = ?'); params.push(n) }
  }
  if (folderId !== undefined) {
    const fId = folderId ? Number(folderId) : null
    sets.push('folder_id = ?'); params.push(fId)
  }
  if (connections !== undefined) {
    const connStr = typeof connections === 'string' ? connections : JSON.stringify(connections)
    sets.push('connections = ?'); params.push(connStr)
  }
  if (!sets.length) return
  sets.push('updated_at = CURRENT_TIMESTAMP')
  await pool.query(`UPDATE campaign_flows SET ${sets.join(', ')} WHERE id = ?`, [...params, flowId])
}

async function deleteCampaignFlow({ id }) {
  const flowId = Number(id)
  if (!flowId || flowId <= 0) return
  await pool.query(`DELETE FROM campaign_flows WHERE id = ?`, [flowId])
}

async function getCampaignFlow({ id }) {
  const flowId = Number(id)
  if (!flowId || flowId <= 0) return null
  const [rows] = await pool.query(`SELECT cf.id, cf.name, cf.folder_id, ff.name AS folder_name, cf.connections, cf.runs, cf.ctr, DATE_FORMAT(cf.updated_at, '%d/%m/%Y %H:%i') as updatedAt FROM campaign_flows cf LEFT JOIN campaign_flow_folders ff ON ff.id = cf.folder_id WHERE cf.id = ?`, [flowId])
  return rows[0] || null
}

// Mensajes Masivos: carpetas y flujos (CRUD)
async function createBulkFolder({ name, color = null }) {
  const n = String(name || '').trim()
  if (!n) return
  const c = String(color || '').trim()
  const isHex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c)
  const col = isHex ? c.toLowerCase() : null
  const [res] = await pool.query(`INSERT INTO bulk_flow_folders (name, color) VALUES (?, ?)`, [n, col])
  return { id: res.insertId }
}

async function listBulkFolders() {
  const [rows] = await pool.query(`SELECT id, name, color, created_at FROM bulk_flow_folders ORDER BY created_at DESC LIMIT 500`)
  return rows
}

async function updateBulkFolder({ id, name, color = undefined }) {
  const folderId = Number(id)
  const n = String(name || '').trim()
  if (!folderId || folderId <= 0 || !n) return
  if (typeof color === 'undefined') {
    await pool.query(`UPDATE bulk_flow_folders SET name = ? WHERE id = ?`, [n, folderId])
  } else {
    const c = String(color || '').trim()
    const isHex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c)
    const col = isHex ? c.toLowerCase() : null
    await pool.query(`UPDATE bulk_flow_folders SET name = ?, color = ? WHERE id = ?`, [n, col, folderId])
  }
}

async function deleteBulkFolder({ id }) {
  const folderId = Number(id)
  if (!folderId || folderId <= 0) return
  await pool.query(`UPDATE bulk_flows SET folder_id = NULL WHERE folder_id = ?`, [folderId])
  await pool.query(`DELETE FROM bulk_flow_folders WHERE id = ?`, [folderId])
}

async function createBulkFlow({ name, folderId = null }) {
  const n = String(name || '').trim()
  const fId = folderId ? Number(folderId) : null
  if (!n) return
  const [res] = await pool.query(`INSERT INTO bulk_flows (name, folder_id, connections, runs, ctr) VALUES (?,?,?,?,?)`, [n, fId, '-', '-', '-'])
  const [rows] = await pool.query(`SELECT bf.id, bf.name, bf.folder_id, bff.name AS folder_name, bf.connections, bf.runs, bf.ctr, DATE_FORMAT(bf.updated_at, '%d/%m/%Y %H:%i') as updatedAt FROM bulk_flows bf LEFT JOIN bulk_flow_folders bff ON bff.id = bf.folder_id WHERE bf.id = ?`, [res.insertId])
  return rows[0]
}

async function listBulkFlows({ q = '', folderId = null } = {}) {
  const query = String(q || '').trim()
  const fId = folderId ? Number(folderId) : null
  let sql = `SELECT bf.id, bf.name, bf.folder_id, bff.name AS folder_name, bf.connections, bf.runs, bf.ctr, DATE_FORMAT(bf.updated_at, '%d/%m/%Y %H:%i') as updatedAt FROM bulk_flows bf LEFT JOIN bulk_flow_folders bff ON bff.id = bf.folder_id`
  const params = []
  const where = []
  if (query) { where.push(`bf.name LIKE ?`); params.push(`%${query}%`) }
  if (fId) { where.push(`bf.folder_id = ?`); params.push(fId) }
  if (where.length) sql += ` WHERE ` + where.join(' AND ')
  sql += ` ORDER BY bf.updated_at DESC, bf.created_at DESC LIMIT 500`
  const [rows] = await pool.query(sql, params)
  return rows
}

async function updateBulkFlow({ id, name = undefined, folderId = undefined, connections = undefined }) {
  const flowId = Number(id)
  if (!flowId || flowId <= 0) return
  const sets = []
  const params = []
  if (name !== undefined) {
    const n = String(name || '').trim()
    if (n) { sets.push('name = ?'); params.push(n) }
  }
  if (folderId !== undefined) {
    const fId = folderId ? Number(folderId) : null
    sets.push('folder_id = ?'); params.push(fId)
  }
  if (connections !== undefined) {
    const connStr = typeof connections === 'string' ? connections : JSON.stringify(connections)
    sets.push('connections = ?'); params.push(connStr)
  }
  if (!sets.length) return
  sets.push('updated_at = CURRENT_TIMESTAMP')
  await pool.query(`UPDATE bulk_flows SET ${sets.join(', ')} WHERE id = ?`, [...params, flowId])
}

async function deleteBulkFlow({ id }) {
  const flowId = Number(id)
  if (!flowId || flowId <= 0) return
  await pool.query(`DELETE FROM bulk_flows WHERE id = ?`, [flowId])
}

async function getBulkFlow({ id }) {
  const flowId = Number(id)
  if (!flowId || flowId <= 0) return null
  const [rows] = await pool.query(`SELECT bf.id, bf.name, bf.folder_id, bff.name AS folder_name, bf.connections, bf.runs, bf.ctr, DATE_FORMAT(bf.updated_at, '%d/%m/%Y %H:%i') as updatedAt FROM bulk_flows bf LEFT JOIN bulk_flow_folders bff ON bff.id = bf.folder_id WHERE bf.id = ?`, [flowId])
  return rows[0] || null
}

async function insertMedia({ messageId, userJid, type, mime, filename, path, size }) {
  await pool.query(`INSERT INTO media (message_id, user_jid, type, mime, filename, path, size) VALUES (?,?,?,?,?,?,?)`, [messageId, userJid, type, mime || null, filename || null, path, size || null])
}

async function cleanup({ userJid = null, olderThanDays = 30, type = null }) {
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000
  // Seleccionar media a borrar
  let sql = `SELECT id, path FROM media WHERE 1=1`
  const params = []
  if (userJid) { sql += ` AND user_jid = ?`; params.push(userJid) }
  if (type) { sql += ` AND type = ?`; params.push(type) }
  sql += ` AND created_at < FROM_UNIXTIME(?/1000)`; params.push(cutoff)
  const [rows] = await pool.query(sql, params)
  const fs = require('fs')
  for (const r of rows) {
    try { if (r.path && fs.existsSync(r.path)) fs.unlinkSync(r.path) } catch {}
  }
  if (rows.length > 0) {
    const ids = rows.map(r => r.id)
    await pool.query(`DELETE FROM media WHERE id IN (${ids.map(() => '?').join(',')})`, ids)
  }
  // Opcional: borrar mensajes muy antiguos sin media
  await pool.query(`DELETE FROM messages WHERE ts < ?`, [cutoff])
  return { deleted: rows.length }
}

// === Agents helpers ===
async function createAgent({ name, advisorName = null }) {
  const n = String(name || '').trim()
  if (!n) throw new Error('Nombre de agente requerido')
  const a = advisorName ? String(advisorName).trim() : null
  const [res] = await pool.query(`INSERT INTO agents (name, advisor_name) VALUES (?, ?)`, [n, a])
  return { id: res.insertId }
}

async function insertAgentSection({ agentId, name, content = null, position = 0, active = 1 }) {
  const aId = Number(agentId)
  const n = String(name || '').trim()
  const pos = Number(position) || 0
  const act = active ? 1 : 0
  if (!aId || !n) throw new Error('Sección inválida')
  const [res] = await pool.query(`INSERT INTO agent_sections (agent_id, name, content, position, active) VALUES (?,?,?,?,?)`, [aId, n, content || null, pos, act])
  return { id: res.insertId }
}

// Inserta o actualiza el contenido de una sección por nombre, conservando el resto
async function upsertAgentSection({ agentId, name, content = null }) {
  const aId = Number(agentId)
  const n = String(name || '').trim()
  if (!aId || !n) throw new Error('Datos inválidos para upsert de sección')
  const c = content !== undefined && content !== null ? String(content) : null
  // Busca si existe sección con ese nombre
  const [rows] = await pool.query(`SELECT id FROM agent_sections WHERE agent_id = ? AND name = ? LIMIT 1`, [aId, n])
  const existing = rows[0] || null
  if (existing) {
    await pool.query(`UPDATE agent_sections SET content = ? WHERE id = ?`, [c, existing.id])
    return { id: existing.id, updated: true }
  } else {
    const [res] = await pool.query(`INSERT INTO agent_sections (agent_id, name, content, position, active) VALUES (?,?,?,?,?)`, [aId, n, c, 0, 1])
    return { id: res.insertId, created: true }
  }
}

async function replaceAgentSections({ agentId, sections = [] }) {
  const aId = Number(agentId)
  if (!aId) throw new Error('AgentId inválido')
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    await conn.query(`DELETE FROM agent_sections WHERE agent_id = ?`, [aId])
    let pos = 0
    for (const s of sections) {
      const name = String(s?.name || '').trim()
      if (!name) continue
      const content = s?.content ? String(s.content) : null
      const active = s?.active !== false ? 1 : 0
      await conn.query(`INSERT INTO agent_sections (agent_id, name, content, position, active) VALUES (?,?,?,?,?)`, [aId, name, content, pos, active])
      pos += 1
    }
    await conn.commit()
    return { ok: true }
  } catch (e) {
    try { await conn.rollback() } catch {}
    throw e
  } finally {
    conn.release()
  }
}

async function listAgentsSummary() {
  const [rows] = await pool.query(`
    SELECT a.id, a.name, DATE_FORMAT(a.updated_at, '%d/%m/%Y %H:%i') as updatedAt,
           a.advisor_name AS advisorName,
           (SELECT COUNT(*) FROM agent_sections s WHERE s.agent_id = a.id) as sections
    FROM agents a ORDER BY a.updated_at DESC, a.created_at DESC LIMIT 200`)
  return rows
}

async function getAgentWithSections({ id }) {
  const aId = Number(id)
  if (!aId) return null
  const [agents] = await pool.query(`SELECT id, name, advisor_name AS advisorName, DATE_FORMAT(updated_at, '%d/%m/%Y %H:%i') as updatedAt FROM agents WHERE id = ?`, [aId])
  const agent = agents[0] || null
  if (!agent) return null
  const [secs] = await pool.query(`SELECT id, name, content, position, active, created_at FROM agent_sections WHERE agent_id = ? ORDER BY position ASC, id ASC`, [aId])
  agent.sections = secs
  return agent
}

async function updateAgentName({ id, name, advisorName = null }) {
  const aId = Number(id)
  const n = String(name || '').trim()
  if (!aId || !n) throw new Error('Datos inválidos para actualizar agente')
  const a = advisorName ? String(advisorName).trim() : null
  await pool.query(`UPDATE agents SET name = ?, advisor_name = ? WHERE id = ?`, [n, a, aId])
  return { ok: true }
}

async function deleteAgent({ id }) {
  const aId = Number(id)
  if (!aId) throw new Error('ID inválido')
  await pool.query(`DELETE FROM agents WHERE id = ?`, [aId])
  return { ok: true }
}

// === Gemini helpers ===
async function upsertGeminiAgent({ name, agentType = 'super', domain = null, basePrompt = null, active = 1 }) {
  const n = String(name || '').trim()
  const t = ['super','generic'].includes(String(agentType)) ? String(agentType) : 'super'
  const d = domain ? String(domain).trim() : null
  const p = basePrompt ? String(basePrompt).trim() : null
  const a = active ? 1 : 0
  // Un agente por tipo (super único)
  await pool.query(`INSERT INTO gemini_agents (name, agent_type, domain, base_prompt, active) VALUES (?,?,?,?,?)
    ON DUPLICATE KEY UPDATE name=VALUES(name), domain=VALUES(domain), base_prompt=VALUES(base_prompt), active=VALUES(active)`, [n || 'Super Agente', t, d, p, a])
  const [rows] = await pool.query(`SELECT * FROM gemini_agents WHERE agent_type = ?`, [t])
  return rows[0]
}

async function getGeminiAgent({ agentType = 'super' } = {}) {
  const t = ['super','generic'].includes(String(agentType)) ? String(agentType) : 'super'
  const [rows] = await pool.query(`SELECT * FROM gemini_agents WHERE agent_type = ?`, [t])
  return rows[0] || null
}

async function insertGeminiKnowledge({ agentId, author = null, content, tags = null }) {
  const aId = Number(agentId)
  const c = String(content || '').trim()
  if (!aId || !c) return
  const auth = author ? String(author).trim() : null
  const tg = tags ? String(tags).trim() : null
  const [res] = await pool.query(`INSERT INTO gemini_knowledge_items (agent_id, author, content, tags) VALUES (?,?,?,?)`, [aId, auth, c, tg])
  return { id: res.insertId }
}

async function listGeminiKnowledge({ agentId, limit = 50 } = {}) {
  const aId = Number(agentId)
  const lim = Math.max(1, Math.min(200, Number(limit) || 50))
  const [rows] = await pool.query(`SELECT id, author, content, tags, created_at FROM gemini_knowledge_items WHERE agent_id = ? ORDER BY id DESC LIMIT ?`, [aId, lim])
  return rows
}

// === Saved manuals helpers ===
async function insertSavedManual({ title = null, content, agentName = null, sectionName = null, voiceId = null }) {
  const c = String(content || '').trim()
  if (!c) throw new Error('Contenido requerido')
  const t = title ? String(title).trim() : null
  const a = agentName ? String(agentName).trim() : null
  const s = sectionName ? String(sectionName).trim() : null
  const v = voiceId ? String(voiceId).trim() : null
  const [res] = await pool.query(`INSERT INTO saved_manuals (title, content, agent_name, section_name, voice_id) VALUES (?,?,?,?,?)`, [t, c, a, s, v])
  return { id: res.insertId }
}

async function listSavedManuals({ limit = 100 } = {}) {
  const lim = Math.max(1, Math.min(200, Number(limit) || 100))
  const [rows] = await pool.query(`SELECT id, title, agent_name AS agentName, section_name AS sectionName, voice_id AS voiceId, LEFT(content, 512) AS preview, created_at FROM saved_manuals ORDER BY id DESC LIMIT ?`, [lim])
  return rows
}

async function getSavedManual({ id }) {
  const mid = Number(id)
  if (!mid) return null
  const [rows] = await pool.query(`SELECT id, title, agent_name AS agentName, section_name AS sectionName, voice_id AS voiceId, content, created_at FROM saved_manuals WHERE id = ?`, [mid])
  return rows[0] || null
}

async function updateSavedManual({ id, title = null, content, agentName = null, sectionName = null, voiceId = null }) {
  const mid = Number(id)
  if (!mid) throw new Error('ID requerido')
  const c = String(content || '').trim()
  if (!c) throw new Error('Contenido requerido')
  const t = title ? String(title).trim() : null
  const a = agentName ? String(agentName).trim() : null
  const s = sectionName ? String(sectionName).trim() : null
  const v = voiceId ? String(voiceId).trim() : null
  await pool.query(`UPDATE saved_manuals SET title = ?, content = ?, agent_name = ?, section_name = ?, voice_id = ? WHERE id = ?`, [t, c, a, s, v, mid])
  return { id: mid }
}

async function deleteSavedManual({ id }) {
  const mid = Number(id)
  if (!mid) return
  await pool.query(`DELETE FROM saved_manuals WHERE id = ?`, [mid])
  return { ok: true }
}

// === Capataz helpers ===
async function getCapatazConfig() {
  const [rows] = await pool.query(`SELECT id, enabled, greeting_text AS greetingText, require_full_name AS requireFullName, auto_labels AS autoLabels, interest_routes AS interestRoutes, kb_text AS kbText, agent_name AS agentName, DATE_FORMAT(updated_at, '%d/%m/%Y %H:%i') as updatedAt FROM capataz_config WHERE id = 1`)
  const r = rows[0] || null
  if (!r) return null
  let labels = []
  let routes = []
  try { labels = r.autoLabels ? JSON.parse(r.autoLabels) : [] } catch {}
  try { routes = r.interestRoutes ? JSON.parse(r.interestRoutes) : [] } catch {}
  return {
    enabled: !!r.enabled,
    greetingText: r.greetingText || '',
    requireFullName: !!r.requireFullName,
    autoLabels: Array.isArray(labels) ? labels : [],
    interestRoutes: Array.isArray(routes) ? routes : [],
    kbText: r.kbText || '',
    agentName: r.agentName || '',
    updatedAt: r.updatedAt,
  }
}

async function upsertCapatazConfig({ enabled = 1, greetingText = null, requireFullName = 1, autoLabels = [], interestRoutes = [], kbText = null, agentName = null }) {
  const en = enabled ? 1 : 0
  const req = requireFullName ? 1 : 0
  const greet = greetingText ? String(greetingText).trim() : null
  const labelsStr = JSON.stringify(Array.isArray(autoLabels) ? autoLabels.map(x => Number(x)).filter(x => x > 0) : [])
  const routesStr = JSON.stringify(Array.isArray(interestRoutes) ? interestRoutes.map(r => ({
    agentId: Number(r?.agentId) || null,
    name: String(r?.name || '').trim() || null,
    keywords: Array.isArray(r?.keywords) ? r.keywords.map(k => String(k).trim()).filter(Boolean) : [],
  })) : [])
  const kb = kbText ? String(kbText) : null
  const aName = agentName ? String(agentName).trim() : null
  await pool.query(`INSERT INTO capataz_config (id, enabled, greeting_text, require_full_name, auto_labels, interest_routes, kb_text, agent_name) VALUES (1, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE enabled=VALUES(enabled), greeting_text=VALUES(greeting_text), require_full_name=VALUES(require_full_name), auto_labels=VALUES(auto_labels), interest_routes=VALUES(interest_routes), kb_text=VALUES(kb_text), agent_name=VALUES(agent_name)`, [en, greet, req, labelsStr, routesStr, kb, aName])
  return await getCapatazConfig()
}

// === Recepcionista helpers ===
async function getRecepcionistaConfig() {
  const [rows] = await pool.query(`SELECT id, agent_name AS agentName, kb_text AS kbText, voice_id AS voiceId, DATE_FORMAT(updated_at, '%d/%m/%Y %H:%i') as updatedAt FROM recepcionista_config WHERE id = 1`)
  const r = rows[0] || null
  if (!r) return { agentName: '', kbText: '', voiceId: null, updatedAt: null }
  return {
    agentName: r.agentName || '',
    kbText: r.kbText || '',
    voiceId: r.voiceId || null,
    updatedAt: r.updatedAt,
  }
}

async function upsertRecepcionistaConfig({ agentName = null, kbText = null, voiceId = null }) {
  const aName = agentName ? String(agentName).trim() : null
  const kb = kbText != null ? String(kbText) : null
  const vId = voiceId ? String(voiceId).trim() : null
  await pool.query(`INSERT INTO recepcionista_config (id, agent_name, kb_text, voice_id) VALUES (1, ?, ?, ?)
    ON DUPLICATE KEY UPDATE agent_name=VALUES(agent_name), kb_text=VALUES(kb_text), voice_id=VALUES(voice_id)`, [aName, kb, vId])
  return await getRecepcionistaConfig()
}

// === Recepcionista assignments helpers ===
async function listRecepcionistaAssignments() {
  const [rows] = await pool.query(`SELECT id, title, program, agent_id AS agentId, tag_id AS tagId, DATE_FORMAT(updated_at, '%d/%m/%Y %H:%i') as updatedAt FROM recepcionista_assignments ORDER BY created_at DESC LIMIT 500`)
  return rows
}

async function getRecepcionistaAssignment({ id }) {
  const aid = Number(id)
  if (!aid) return null
  const [rows] = await pool.query(`SELECT id, title, program, agent_id AS agentId, tag_id AS tagId, DATE_FORMAT(updated_at, '%d/%m/%Y %H:%i') as updatedAt FROM recepcionista_assignments WHERE id = ?`, [aid])
  return rows[0] || null
}

async function upsertRecepcionistaAssignment({ id = null, title = null, program = null, agentId = null, tagId = null }) {
  const aid = id ? Number(id) : null
  const t = title ? String(title).trim() : null
  const p = program ? String(program).trim() : null
  const aId = agentId ? Number(agentId) : null
  const tgId = tagId ? Number(tagId) : null
  if (aid) {
    await pool.query(`UPDATE recepcionista_assignments SET title = ?, program = ?, agent_id = ?, tag_id = ? WHERE id = ?`, [t, p, aId, tgId, aid])
    return await getRecepcionistaAssignment({ id: aid })
  } else {
    const [res] = await pool.query(`INSERT INTO recepcionista_assignments (title, program, agent_id, tag_id) VALUES (?,?,?,?)`, [t, p, aId, tgId])
    return await getRecepcionistaAssignment({ id: res.insertId })
  }
}

async function deleteRecepcionistaAssignment({ id }) {
  const aid = Number(id)
  if (!aid) return { ok: false, error: 'id inválido' }
  await pool.query(`DELETE FROM recepcionista_assignments WHERE id = ?`, [aid])
  return { ok: true }
}

// === Agent memory helpers ===
async function getAgentMemoryByJid(jid) {
  const j = String(jid || '').trim()
  if (!j) return null
  const [rows] = await pool.query(`SELECT jid, client_name AS clientName, program, stage, last_message_ts AS lastMessageTs, updated_at AS updatedAt FROM agent_memory WHERE jid = ?`, [j])
  const r = rows[0] || null
  if (!r) return null
  return {
    jid: r.jid,
    clientName: r.clientName || null,
    program: r.program || null,
    stage: r.stage || 'conversation',
    lastMessageTs: r.lastMessageTs || null,
    updatedAt: r.updatedAt || null,
  }
}

async function upsertAgentMemoryByJid({ jid, clientName = undefined, program = undefined, stage = undefined, lastMessageTs = undefined }) {
  const j = String(jid || '').trim()
  if (!j) return { ok: false }
  // Leer registro actual para componer actualización parcial
  const existing = await getAgentMemoryByJid(j)
  const next = {
    clientName: typeof clientName === 'undefined' ? (existing?.clientName || null) : (clientName || null),
    program: typeof program === 'undefined' ? (existing?.program || null) : (program || null),
    stage: typeof stage === 'undefined' ? (existing?.stage || 'conversation') : (stage || 'conversation'),
    lastMessageTs: typeof lastMessageTs === 'undefined' ? (existing?.lastMessageTs || null) : (lastMessageTs || null),
  }
  await pool.query(`INSERT INTO agent_memory (jid, client_name, program, stage, last_message_ts) VALUES (?,?,?,?,?)
    ON DUPLICATE KEY UPDATE client_name=VALUES(client_name), program=VALUES(program), stage=VALUES(stage), last_message_ts=VALUES(last_message_ts)`, [j, next.clientName, next.program, next.stage, next.lastMessageTs])
  return { ok: true }
}

module.exports = { pool, initSchema, upsertUser, insertMessage, insertMedia, cleanup, ensureDatabaseExists, upsertLabel, listLabels, updateLabel, deleteLabel, upsertField, listFields, updateField, deleteField, createFolder, listFolders, updateFolder, deleteFolder, createCampaignFolder, listCampaignFolders, updateCampaignFolder, deleteCampaignFolder, createCampaignFlow, listCampaignFlows, updateCampaignFlow, deleteCampaignFlow, getCampaignFlow, createBulkFolder, listBulkFolders, updateBulkFolder, deleteBulkFolder, createBulkFlow, listBulkFlows, updateBulkFlow, deleteBulkFlow, getBulkFlow, createAgent, insertAgentSection, upsertAgentSection, replaceAgentSections, listAgentsSummary, getAgentWithSections, updateAgentName, deleteAgent, upsertGeminiAgent, getGeminiAgent, insertGeminiKnowledge, listGeminiKnowledge, insertSavedManual, listSavedManuals, getSavedManual, updateSavedManual, deleteSavedManual, getCapatazConfig, upsertCapatazConfig, getRecepcionistaConfig, upsertRecepcionistaConfig, listRecepcionistaAssignments, getRecepcionistaAssignment, upsertRecepcionistaAssignment, deleteRecepcionistaAssignment, getAgentMemoryByJid, upsertAgentMemoryByJid }