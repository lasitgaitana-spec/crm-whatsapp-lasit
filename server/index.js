require('dotenv').config()
const express = require('express')
const cors = require('cors')
const makeWASocket = require('@whiskeysockets/baileys').default
const { useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, downloadContentFromMessage, jidNormalizedUser } = require('@whiskeysockets/baileys')
const path = require('path')
const fs = require('fs')
const qrcode = require('qrcode')
const http = require('http')
const { Server } = require('socket.io')
const { pool, initSchema, upsertUser, insertMessage, insertMedia, cleanup, upsertLabel, listLabels, updateLabel, deleteLabel, upsertField, listFields, updateField, deleteField, createFolder, listFolders, updateFolder, deleteFolder, createCampaignFolder, listCampaignFolders, updateCampaignFolder, deleteCampaignFolder, createCampaignFlow, listCampaignFlows, updateCampaignFlow, deleteCampaignFlow, getCampaignFlow, createBulkFolder, listBulkFolders, updateBulkFolder, deleteBulkFolder, createBulkFlow, listBulkFlows, updateBulkFlow, deleteBulkFlow, getBulkFlow, createAgent, insertAgentSection, upsertAgentSection, replaceAgentSections, listAgentsSummary, getAgentWithSections, updateAgentName, deleteAgent, upsertGeminiAgent, getGeminiAgent, insertGeminiKnowledge, listGeminiKnowledge, insertSavedManual, listSavedManuals, getSavedManual, updateSavedManual, deleteSavedManual, getCapatazConfig, upsertCapatazConfig, getRecepcionistaConfig, upsertRecepcionistaConfig, listRecepcionistaAssignments, getRecepcionistaAssignment, upsertRecepcionistaAssignment, deleteRecepcionistaAssignment, getAgentMemoryByJid, upsertAgentMemoryByJid } = require('./db')
const multer = require('multer')
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })
const XLSX = require('xlsx')
const googleTTS = require('google-tts-api')
const { GoogleGenerativeAI } = require('@google/generative-ai')

console.log('--- SERVER STARTING ---')
console.log('DB_HOST:', process.env.DB_HOST)
console.log('DB_NAME:', process.env.DB_NAME)

let textToSpeech
try {
  // La dependencia puede no estar disponible en algunos entornos hasta instalarla
  textToSpeech = require('@google-cloud/text-to-speech')
} catch (_) {
  textToSpeech = null
}

const app = express()
// Aumentar límite de JSON para contenidos de KB grandes
app.use(express.json({ limit: '10mb' }))
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176', 'http://localhost:5177', 'http://localhost:5178'], credentials: true }))
app.use('/storage', express.static(path.resolve(process.env.STORAGE_DIR || 'storage')))
// Inicializa esquema de base de datos al arrancar el servidor
initSchema().catch(() => {})

// Evitar que errores no manejados tumben el proceso
process.on('unhandledRejection', (reason) => {
  try {
    console.error('[unhandledRejection]', reason)
  } catch {}
})
process.on('uncaughtException', (err) => {
  try {
    console.error('[uncaughtException]', err)
  } catch {}
})

// Crear servidor HTTP y Socket.IO
const httpServer = http.createServer(app)
const io = new Server(httpServer, { cors: { origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176', 'http://localhost:5177', 'http://localhost:5178'] } })

let sock = null
let waStatus = 'idle' // idle | qr | connected | disconnected
let lastQrString = null
let connectedUser = null
let unreadCount = 0
let lastMessage = null
let inbox = [] // { id, sender, text, ts }

// Buffer de logs en memoria
let logs = []
const addLog = (entry) => {
  logs.push({ ts: Date.now(), ...entry })
  if (logs.length > 500) logs.shift()
}

// Registro de transmisiones para panel y control
const transmissions = new Map() // id -> { status, total, sent, failed, failReasons, paused, stopped, createdAt, nextAt, name, platform, moduleType, flowId }
const scheduledTimers = new Map() // id -> timeout handle
const getTransmissionSnapshot = (t) => {
  if (!t) return null
  const { id, status, total, sent, failed, failReasons, paused, stopped, createdAt, nextAt, name, platform, moduleType, flowId } = t
  return { id, status, total, sent, failed, failReasons, paused, stopped, createdAt, nextAt, name, platform, moduleType, flowId }
}

// ==== Gemini API Key helpers ====
function maskKey(k = '') {
  if (!k) return ''
  const suffix = k.slice(-4)
  return `••••${suffix}`
}

function setEnvVar(filePath, key, value) {
  try {
    let content = ''
    if (fs.existsSync(filePath)) {
      content = fs.readFileSync(filePath, 'utf8')
    }
    const lines = content.split(/\r?\n/)
    let found = false
    const out = lines.map((line) => {
      if (line.startsWith(key + '=')) {
        found = true
        return `${key}=${value}`
      }
      return line
    })
    if (!found) out.push(`${key}=${value}`)
    const finalText = out.filter(Boolean).join('\n') + '\n'
    fs.writeFileSync(filePath, finalText)
    // Update current process env too (without logging)
    process.env[key] = value
    return true
  } catch (e) {
    return false
  }
}

// ==== Helpers de carpeta por flujo ====
function slugify(name = '') {
  return String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\-_ ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 64)
}

function getFlowUploadDir(flow) {
  const base = path.resolve(process.env.STORAGE_DIR || 'storage', 'uploads', 'flows')
  const folder = `${flow.id}-${slugify(flow.name || 'flujo')}`
  return path.join(base, folder)
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function getTtsPreviewDir() {
  const base = path.resolve(process.env.STORAGE_DIR || 'storage', 'tts', 'previews')
  ensureDir(base)
  return base
}

// Cliente opcional de Google Cloud TTS (usa ADC o credenciales JSON en env)
function getGCloudTtsClient() {
  try {
    if (!textToSpeech) return null
    const hasJson = !!process.env.GOOGLE_TTS_CREDENTIALS_JSON
    const hasPath = !!process.env.GOOGLE_APPLICATION_CREDENTIALS
    if (!hasJson && !hasPath) return null
    if (hasJson) {
      const creds = JSON.parse(process.env.GOOGLE_TTS_CREDENTIALS_JSON)
      return new textToSpeech.TextToSpeechClient({ credentials: creds })
    }
    // Si existe GOOGLE_APPLICATION_CREDENTIALS o ADC configurada, esto funcionará
    return new textToSpeech.TextToSpeechClient()
  } catch (e) {
    return null
  }
}

// Mapeo de las 8 voces forzando acento colombiano (es-CO)
// Nota: Para diferenciar perfiles, uso variaciones de speakingRate y pitch.
// Femeninas usan 'es-CO-Neural2-A'; Masculinas usan 'es-CO-Neural2-B'.
const TTS_VOICE_MAP = {
  Zephyr:    { languageCode: 'es-CO', name: 'es-CO-Neural2-A', ssmlGender: 'FEMALE', speakingRate: 1.05, pitch: 2.0 },  // Amable
  Kore:      { languageCode: 'es-CO', name: 'es-CO-Neural2-A', ssmlGender: 'FEMALE', speakingRate: 0.98, pitch: -0.5 }, // Profesional
  Leda:      { languageCode: 'es-CO', name: 'es-CO-Neural2-A', ssmlGender: 'FEMALE', speakingRate: 1.10, pitch: 3.5 },  // Joven
  Callirrhoe:{ languageCode: 'es-CO', name: 'es-CO-Neural2-A', ssmlGender: 'FEMALE', speakingRate: 1.00, pitch: 0.5 },  // Clara
  Puck:      { languageCode: 'es-CO', name: 'es-CO-Neural2-B', ssmlGender: 'MALE',   speakingRate: 1.03, pitch: 1.0 },  // Amable
  Orus:      { languageCode: 'es-CO', name: 'es-CO-Neural2-B', ssmlGender: 'MALE',   speakingRate: 0.97, pitch: -1.0 }, // Profesional
  Fenrir:    { languageCode: 'es-CO', name: 'es-CO-Neural2-B', ssmlGender: 'MALE',   speakingRate: 1.08, pitch: 2.0 },  // Energético
  Algenib:   { languageCode: 'es-CO', name: 'es-CO-Neural2-B', ssmlGender: 'MALE',   speakingRate: 0.95, pitch: -3.0 }, // Grave
}

async function synthesizeWithCloudTTS({ text, presetId }) {
  const client = getGCloudTtsClient()
  if (!client) return null

  const fallback = { languageCode: 'es-CO', name: 'es-CO-Neural2-A', ssmlGender: 'FEMALE', speakingRate: 1.0, pitch: 0.0 }
  const conf = TTS_VOICE_MAP[presetId] || fallback
  const input = { text }
  const voice = { languageCode: conf.languageCode, name: conf.name, ssmlGender: conf.ssmlGender }
  const audioConfig = { audioEncoding: 'MP3', speakingRate: conf.speakingRate, pitch: conf.pitch, effectsProfileId: ['headphone-class-device'] }

  try {
    const [response] = await client.synthesizeSpeech({ input, voice, audioConfig })
    const audioContent = response?.audioContent
    if (!audioContent) return null
    return Buffer.from(audioContent, 'base64')
  } catch (e) {
    // Evitar crash si ADC no está configurado
    addLog({ type: 'warn', scope: 'tts.cloud', error: e?.message || String(e) })
    return null
  }
}

// Gemini TTS usando las voces predefinidas del archivo Agente (Zephyr, Kore, etc.)
async function synthesizeWithGeminiTTS({ text, presetId }) {
  try {
    const apiKey = String(process.env.GEMINI_API_KEY || '').trim()
    if (!apiKey) return null
    const voiceName = String(presetId || '').trim() || 'Zephyr'
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`
    const ttsText = `TTS con acento colombiano amable: ${String(text || '').replace(/LASÏT/g, 'La S I T con tilde en la I')}`
    const payload = {
      contents: [{ parts: [{ text: ttsText }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } }
      },
      model: 'gemini-2.5-flash-preview-tts'
    }
    const resp = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    if (!resp.ok) {
      addLog({ type: 'warn', scope: 'tts.gemini', error: `HTTP ${resp.status}` })
      return null
    }
    const data = await resp.json()
    const part = data?.candidates?.[0]?.content?.parts?.[0]
    const inline = part?.inlineData
    const b64 = inline?.data
    const mime = inline?.mimeType || ''
    if (!b64 || !mime.startsWith('audio/')) return null
    const m = /rate=(\d+)/.exec(mime)
    const sampleRate = m ? parseInt(m[1], 10) : 48000
    const pcmBuf = Buffer.from(b64, 'base64')
    return pcm16ToWav(pcmBuf, sampleRate)
  } catch (e) {
    addLog({ type: 'warn', scope: 'tts.gemini', error: e?.message || String(e) })
    return null
  }
}

function pcm16ToWav(pcmBuffer, sampleRate) {
  const numChannels = 1
  const bytesPerSample = 2
  const byteRate = sampleRate * numChannels * bytesPerSample
  const blockAlign = numChannels * bytesPerSample
  const dataSize = pcmBuffer.length
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(numChannels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(byteRate, 28)
  buffer.writeUInt16LE(blockAlign, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  pcmBuffer.copy(buffer, 44)
  return buffer
}

// Emitir estado e inbox inicial al conectar cliente
io.on('connection', (socket) => {
  socket.emit('wa:status', { status: waStatus, user: connectedUser })
  socket.emit('wa:inbox', { messages: inbox })
})

function resetInbox() {
  unreadCount = 0
  lastMessage = null
  inbox = []
}

// Helper para resolver LID a número usando mapeo inverso de Baileys
function resolvePhoneFromLid(lidJid) {
  try {
    if (!lidJid || !/@lid$/.test(lidJid)) return null
    const lidDigits = lidJid.split('@')[0]
    // Buscar archivo de mapeo inverso en wa_auth
    const mappingPath = path.join(__dirname, 'wa_auth', `lid-mapping-${lidDigits}_reverse.json`)
    if (fs.existsSync(mappingPath)) {
      const data = fs.readFileSync(mappingPath, 'utf8')
      // El contenido suele ser una cadena JSON con el número, ej: "573208707880"
      const phone = JSON.parse(data)
      if (phone) return phone + '@s.whatsapp.net'
    }
  } catch (e) {
    // Silencioso, si falla asumimos que no se pudo resolver
  }
  return null
}

// Control de reconexión para Baileys
let baileysReconnectAttempts = 0
let baileysReconnectTimeout = null

async function startWhatsAppBaileys(force = false) {
  await initSchema().catch(() => {})
  const { state, saveCreds } = await useMultiFileAuthState('wa_auth')
  const { version } = await fetchLatestBaileysVersion()

  if (sock && !force) {
    try { await sock.ws.close() } catch {}
    sock = null
  }

  // Limpiar cualquier reconexión pendiente antes de iniciar
  if (baileysReconnectTimeout) { try { clearTimeout(baileysReconnectTimeout) } catch {} baileysReconnectTimeout = null }

  waStatus = 'idle'
  lastQrString = null
  connectedUser = null

  sock = makeWASocket({ version, auth: state, printQRInTerminal: true, browser: ['Lasit CRM', 'Chrome', '1.0'] })

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update
    if (qr) { waStatus = 'qr'; lastQrString = qr; io.emit('wa:status', { status: waStatus, user: connectedUser }); addLog({ type: 'status', status: 'qr' }) }
    if (connection === 'open') {
      waStatus = 'connected'
      lastQrString = null
      // Al conectar, reiniciar contador/timeout de reconexión
      baileysReconnectAttempts = 0
      if (baileysReconnectTimeout) { try { clearTimeout(baileysReconnectTimeout) } catch {} baileysReconnectTimeout = null }
      try {
        const me = sock.user || (state.creds && state.creds.me) || null
        const jid = me?.id || null
        const phoneMatch = jid ? String(jid).match(/(\d+):/) : null
        const phoneNumber = phoneMatch ? phoneMatch[1] : null
        connectedUser = { id: me?.id, name: me?.name || me?.id || 'Desconocido', phoneNumber }
        await upsertUser({ jid: connectedUser.id, phone: connectedUser.phoneNumber, name: connectedUser.name })
      } catch {}
      resetInbox()
      io.emit('wa:status', { status: waStatus, user: connectedUser })
      io.emit('wa:inbox', { messages: inbox })
      addLog({ type: 'status', status: 'connected', user: connectedUser })
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      const isLoggedOut = code === DisconnectReason.loggedOut
      waStatus = 'disconnected'
      connectedUser = null
      lastQrString = null
      io.emit('wa:status', { status: waStatus, user: connectedUser })
      addLog({ type: 'status', status: 'disconnected', code })
      // Reintentar si no fue cierre por logout completo, con backoff exponencial
      if (!isLoggedOut) {
        // Evitar múltiples reconexiones simultáneas
        if (baileysReconnectTimeout) { try { clearTimeout(baileysReconnectTimeout) } catch {} }
        const base = 5000 // 5s
        const factor = Math.min(baileysReconnectAttempts, 4) // limitar crecimiento
        const delay = Math.min(base * Math.pow(2, factor), 60000) // máx 60s
        baileysReconnectAttempts += 1
        addLog({ type: 'wa:reconnect_schedule', attempt: baileysReconnectAttempts, delayMs: delay, code })
        baileysReconnectTimeout = setTimeout(() => {
          startWhatsApp(false).catch(() => {})
        }, delay)
      }
    }
  })

  sock.ev.on('messages.upsert', async (m) => {
    const up = m.messages || []
    for (const msg of up) {
      try {
        const fromMe = !!msg.key?.fromMe
        const remote = msg.key?.remoteJid || 'unknown'
        const participant = msg.key?.participant || null
        // Si es mensaje de grupo entrante, usar el participante (remitente real)
        let rawJid = remote
        if (!fromMe && /@g\.us$/.test(remote) && participant) {
          rawJid = participant
        }
        const normalized = (typeof jidNormalizedUser === 'function') ? jidNormalizedUser(rawJid) : rawJid
        let sender = toSWhatsApp(normalized)
        // Asegurar JID estable para usuario: remover sufijo de dispositivo si existe
        if (/@s\.whatsapp\.net$/.test(sender) && sender.includes(':')) {
          sender = sender.replace(/:\d+(?=@s\.whatsapp\.net)/, '')
        }
        // Si el JID viene como @lid (ID vinculado), intentar resolver el número real
        let resolvedByOnWhatsApp = false
        if (/@lid$/.test(sender)) {
          console.log(`[DEBUG] Attempting to resolve LID: ${sender}`)
          // Intentar resolver usando mapeo local de autenticación primero (más confiable)
          const localResolved = resolvePhoneFromLid(sender)
          console.log(`[DEBUG] localResolved result: ${localResolved}`)
          if (localResolved) {
            sender = localResolved
            resolvedByOnWhatsApp = true
          } else {
            try {
              const core = String(sender).split('@')[0]
              const base = core.includes(':') ? core.split(':')[0] : core
              const digits = base.replace(/\D/g, '')
              if (digits && digits.length >= 8 && digits.length <= 15) {
                const existsInfo = await sock.onWhatsApp(digits)
                if (Array.isArray(existsInfo) && existsInfo[0]?.exists && existsInfo[0]?.jid && /@s\.whatsapp\.net$/.test(existsInfo[0].jid)) {
                  sender = existsInfo[0].jid
                  resolvedByOnWhatsApp = true
                }
              }
            } catch {}
          }
        }
        // Log diagnóstico para rastrear origen del JID mostrado en UI
        try {
          addLog({
            type: 'diag.sender',
            scope: 'messages.upsert',
            fromMe,
            remote,
            participant,
            chosenRaw: rawJid,
            normalized,
            sender,
            resolvedByOnWhatsApp,
            pushName: msg.pushName || null,
            keyId: msg.key?.id || null
          })
        } catch {}
        // Desenrollar contenido para mensajes envueltos (ephemeral, viewOnce, deviceSent)
        const unwrapMessageContent = (mm) => {
          try {
            if (!mm) return {}
            if (mm.ephemeralMessage?.message) return mm.ephemeralMessage.message
            if (mm.viewOnceMessageV2?.message) return mm.viewOnceMessageV2.message
            if (mm.viewOnceMessageV2Extension?.message) return mm.viewOnceMessageV2Extension.message
            if (mm.deviceSentMessage?.message) return mm.deviceSentMessage.message
            return mm
          } catch { return mm || {} }
        }
        const extractTextFromBaileys = (mc) => {
          try {
            if (!mc) return null
            // Conversación simple
            if (mc.conversation) return mc.conversation
            // Texto extendido
            if (mc.extendedTextMessage?.text) return mc.extendedTextMessage.text
            // Respuesta de botones
            if (mc.buttonsResponseMessage?.selectedDisplayText) return mc.buttonsResponseMessage.selectedDisplayText
            // Respuesta de lista
            if (mc.listResponseMessage?.title) return mc.listResponseMessage.title
            // Interactivo (algunas versiones)
            if (mc.interactiveResponseMessage?.body?.text) return mc.interactiveResponseMessage.body.text
            // Fallback: caption en media
            if (mc.imageMessage?.caption) return mc.imageMessage.caption
            if (mc.videoMessage?.caption) return mc.videoMessage.caption
            return null
          } catch { return null }
        }
        const mraw = msg.message || {}
        const mContent = unwrapMessageContent(mraw)
        const wrapper = mraw?.ephemeralMessage ? 'ephemeral'
          : mraw?.viewOnceMessageV2 ? 'viewOnce'
          : mraw?.viewOnceMessageV2Extension ? 'viewOnceExt'
          : mraw?.deviceSentMessage ? 'deviceSent'
          : 'none'
        const text = extractTextFromBaileys(mContent)
        const ts = (msg.messageTimestamp || Date.now()) * 1000
        const id = msg.key.id
        if (!fromMe) {
          unreadCount += 1
          lastMessage = { sender, text: text || '[no-text]', ts }
        }
        // Enriquecer evento con nombre y teléfono mostrable
        const pushName = msg.pushName || null
        // Intentar obtener número confiable del remitente
        let displayPhone = null
        try {
          // 1) Si el remitente final es estándar, tomarlo del JID
          if (/@s\.whatsapp\.net$/.test(sender)) {
            displayPhone = String(sender).split('@')[0].replace(/\D/g, '')
          }
          // 2) Si vino de grupo y hay participante estándar, usarlo
          if (!displayPhone && participant && /@s\.whatsapp\.net$/.test(String(participant))) {
            displayPhone = String(participant).split('@')[0].replace(/\D/g, '')
          }
          // 3) Si se resolvió por onWhatsApp desde @lid, intentar extraer del normalized/raw
          if (!displayPhone && resolvedByOnWhatsApp) {
            const core = String(normalized || rawJid || remote || '').replace(/@.*/, '')
            const digits = core.replace(/\D/g, '')
            if (digits && digits.length >= 8 && digits.length <= 15) displayPhone = digits
          }
        } catch {}
        const item = { id, sender, text: text || '[no-text]', ts, fromMe, pushName, displayPhone }
        inbox.push(item)
        if (inbox.length > 100) inbox.shift()
        await insertMessage({ id, sender, text, ts, fromMe, status: null })
        // Capturar y estabilizar contacto del cliente en BD cuando hay mensaje entrante
        try {
          if (!fromMe) {
            await upsertAgentMemoryByJid({ jid: sender, lastMessageTs: ts })
            // Guardar teléfono si pudimos determinarlo (incluye participante en grupo o resolución desde @lid)
            const candidate = String(item.displayPhone || '').replace(/\D/g, '')
            if (candidate && candidate.length >= 8 && candidate.length <= 15) {
              await upsertUser({ jid: sender, phone: candidate, name: pushName || null })
              addLog({ type: 'contact.capture', jid: sender, phone: candidate })
            } else {
              // Actualizar/guardar nombre sin teléfono cuando no es posible obtenerlo
              await upsertUser({ jid: sender, phone: undefined, name: pushName || null })
              addLog({ type: 'contact.capture.skip_phone', jid: sender, reason: 'no-phone-available', pushName })
            }
          }
        } catch (e) { addLog({ type: 'error', scope: 'wa.contact.capture', error: e?.message || String(e) }) }
        io.emit('wa:message', item)
        addLog({ type: 'message', ...item })
        addLog({ type: 'message_extract', id, sender, wrapper, hasText: !!text })
        // Auto-respuesta backend: si está habilitada por configuración, procesar con Recepcionista
        if (!fromMe && text && String(text).trim().length > 0) {
          try {
            const ok = await handleCapatazInbound(sock, { sender, text })
            if (!ok) {
              addLog({ type: 'info', scope: 'wa.autoreply', note: 'Auto-reply no aplicado (delegado o deshabilitado)', sender })
            }
          } catch (e) {
            addLog({ type: 'error', scope: 'wa.autoreply.handle', error: e?.message || String(e), sender })
          }
        }
        // Manejo de medios: imagen, audio, documento, video
        const mediaType = mContent.imageMessage ? 'image'
          : mContent.videoMessage ? 'video'
          : mContent.audioMessage ? 'audio'
          : mContent.documentMessage ? 'document'
          : mContent.stickerMessage ? 'sticker'
          : null
        if (mediaType) {
          const node = mContent.imageMessage || mContent.videoMessage || mContent.audioMessage || mContent.documentMessage || mContent.stickerMessage
          const stream = await downloadContentFromMessage(node, mediaType === 'sticker' ? 'image' : mediaType)
          const userDigits = String(sender).replace(/@.+$/, '')
          const baseDir = path.resolve(process.env.STORAGE_DIR || 'storage', userDigits, String(new Date(ts).getFullYear()), String(new Date(ts).getMonth()+1))
          fs.mkdirSync(baseDir, { recursive: true })
          const mime = node.mimetype || 'application/octet-stream'
          const ext = (mime.split('/')[1] || 'bin').toLowerCase()
          const filename = `${id}.${ext}`
          const outPath = path.join(baseDir, filename)
          const writeStream = fs.createWriteStream(outPath)
          for await (const chunk of stream) { writeStream.write(chunk) }
          writeStream.end()
          await insertMedia({ messageId: id, userJid: sender, type: mediaType, mime, filename, path: outPath, size: null })
          const publicPath = `/storage/${userDigits}/${new Date(ts).getFullYear()}/${new Date(ts).getMonth()+1}/${filename}`
          const existing = inbox.find(x => x.id === id)
          if (existing) {
            existing.media = { type: mediaType, mime, path: publicPath, filename }
            io.emit('wa:message', existing)
          }
          // Si es audio entrante del usuario, procesar respuesta por voz si backend está habilitado
          if (mediaType === 'audio' && !fromMe) {
            try {
              const okA = await handleCapatazInboundAudio(sock, { sender })
              if (!okA) {
                addLog({ type: 'info', scope: 'wa.autoreply.audio', note: 'Auto-reply audio no aplicado (delegado o deshabilitado)', sender })
              }
            } catch (e) {
              addLog({ type: 'error', scope: 'wa.autoreply.audio.handle', error: e?.message || String(e), sender })
            }
          }
        }
      } catch (e) {
        console.error('Error al procesar mensaje', e)
        addLog({ type: 'error', scope: 'messages.upsert', error: e.message })
      }
    }
  })

  // Actualiza estados de entrega/lectura de mensajes enviados
  sock.ev.on('messages.update', async (updates) => {
    for (const u of updates) {
      const id = u.key?.id
      const status = u.update?.status
      const msg = inbox[id] || {}
      inbox[id] = { ...msg, status }
      try {
        await insertMessage({
          id,
          sender: msg?.sender || null,
          text: msg?.text || null,
          ts: msg?.ts || Date.now(),
          fromMe: 1,
          status,
        })
      } catch (e) {
        console.error('Error actualizando mensaje', e)
        addLog({ type: 'error', scope: 'messages.update', error: e.message })
      }
      addLog({ type: 'message_update', id, status })
    }
  })

  sock.ev.on('creds.update', saveCreds)
}

// Modo whatsapp-web.js (alternativa a Baileys)
// Forzar Baileys para compatibilidad con emparejamiento por código
const USE_WWEBJS = false
let WWebJS = null
try { WWebJS = require('whatsapp-web.js') } catch (e) {
  try {
    const wwebLocalPath = path.resolve(__dirname, '../whatsapp-web.js-main/whatsapp-web.js-main')
    WWebJS = require(wwebLocalPath)
  } catch (e2) {}
}
const toCUs = (jid) => String(jid || '').replace(/@s\.whatsapp\.net$/, '@c.us')
// Normaliza cualquier identificador de WhatsApp a JID estándar "<digits>@s.whatsapp.net"
// Casos manejados:
// - "<digits>@c.us"            -> "<digits>@s.whatsapp.net"
// - "<digits>@lid"             -> se mantiene (no convertir; puede ser ID externo)
// - "<digits>:<dev>@lid"       -> se mantiene (no convertir; puede ser ID externo)
// - "<digits>:<dev>@s.whatsapp.net" -> "<digits>@s.whatsapp.net"
// - Mantiene intactos grupos "...@g.us" y broadcast
const toSWhatsApp = (jid) => {
  try {
    let s = String(jid || '').trim()
    if (!s) return ''
    // No tocar grupos ni broadcast
    if (/@g\.us$/.test(s) || /@broadcast$/.test(s)) return s
    // Unificar dominios conocidos (NO convertir @lid)
    s = s
      .replace(/@c\.us$/, '@s.whatsapp.net')
      .replace(/:\d+@s\.whatsapp\.net$/, '@s.whatsapp.net')
    // Mantener intactos los JID con dominio @lid (no convertir)
    if (/@lid$/.test(s)) return s
    const m = s.match(/^([^@]+)@s\.whatsapp\.net$/)
    if (m) {
      const digits = m[1].replace(/\D/g, '')
      if (digits) return `${digits}@s.whatsapp.net`
    }
    return s
  } catch { return String(jid || '') }
}

// Wrapper selector
async function startWhatsApp(force = false) {
  addLog({ type: 'wa:start', mode: (USE_WWEBJS && WWebJS) ? 'wwebjs' : 'baileys', force })
  if (USE_WWEBJS && WWebJS) { return await startWhatsAppWweb(force) }
  return await startWhatsAppBaileys(force)
}

// Variables para keepalive y reconexión
let keepaliveInterval = null
let reconnectTimeout = null

// =============================
// Capataz y Recepcionista: Dispatcher de WhatsApp
// =============================
// Estado de sesiones por JID
let capatazConfigCache = null
const capatazSessions = new Map()

// Cargar configuración Capataz (para habilitar, etiquetas y rutas de interés)
async function getActiveCapatazConfig() {
  if (!capatazConfigCache) {
    capatazConfigCache = await getCapatazConfig().catch(() => null)
  }
  // Por defecto deshabilitado: el frontend maneja la auto-respuesta para evitar duplicados
  // Mantener campos de rutas/etiquetas
  return capatazConfigCache || { enabled: false, greetingText: '', requireFullName: 1, autoLabels: [], interestRoutes: [], agentName: '' }
}
function setCapatazConfigCache(cfg) { capatazConfigCache = cfg }

// Cache sencillo de configuración del Recepcionista (nombre, KB y voz)
let recepcionistaConfigCache = null
async function getActiveRecepcionistaConfig() {
  if (!recepcionistaConfigCache) {
    recepcionistaConfigCache = await getRecepcionistaConfig().catch(() => null)
  }
  return recepcionistaConfigCache || { agentName: '', kbText: '', voiceId: null }
}
function setRecepcionistaConfigCache(cfg) { recepcionistaConfigCache = cfg }

// Utilidades de texto
function normalizeText(t) {
  return String(t || '').trim()
}
function isLikelyFullName(t) {
  const s = normalizeText(t).replace(/[\d_@#*•|\-]+/g, ' ').replace(/\s+/g, ' ').trim()
  const parts = s.split(' ').filter(x => x.length >= 2)
  return parts.length >= 2
}
function extractCleanName(t) {
  const s = normalizeText(t).replace(/[\d_@#*•|\-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return s
}
function findInterest(text, routes = []) {
  const s = normalizeText(text).toLowerCase()
  for (const it of routes) {
    const kws = Array.isArray(it?.keywords) ? it.keywords : []
    if (kws.some(k => s.includes(String(k).toLowerCase()))) return { agentId: it.agentId || null, name: it.name || null }
  }
  return null
}

async function sendWaText(sock, toJid, body) {
  try {
    if (!BACKEND_SENDING_ENABLED) { addLog({ type: 'info', scope: 'capataz.send', note: 'Backend sending disabled' }); return false }
    if (!sock || !toJid || !body) return false
    let target = String(toJid)
    // Normalizar JID: algunos remotos vienen como 57XXXXXXXXX:device@s.whatsapp.net
    if (/@s\.whatsapp\.net$/.test(target) && target.includes(':')) {
      const base = target.replace(/:\d+(?=@s\.whatsapp\.net)/, '')
      target = base
    }
    // Simular "escribiendo" antes de enviar según longitud del texto
    {
      const words = String(body).trim().split(/\s+/).filter(Boolean).length
      const MULT = Number(process.env.WA_TYPING_MULTIPLIER || 1)
      const MAX_MS = Number(process.env.WA_TYPING_DELAY_MAX_MS || 6000)
      let delayMs = Math.max(1000, Math.ceil(words / 2) * 1000 * MULT) // 1s cada 2 palabras, mínimo 1s, ajustable
      if (isFinite(MAX_MS) && MAX_MS > 0) delayMs = Math.min(delayMs, MAX_MS)
      const start = Date.now()
      addLog({ type: 'typing.sim.backend', jid: target, seconds: Math.floor(delayMs/1000) })
      if (String(waStatus) !== 'connected') {
        await sleep(Math.min(delayMs, 2000))
      } else if (USE_WWEBJS && WWebJS && typeof sock.getChatById === 'function') {
        // whatsapp-web.js: usar estado de chat (@c.us)
        const chatId = toCUs(target)
        try {
          const chat = await sock.getChatById(chatId)
          if (chat && typeof chat.sendStateTyping === 'function') {
            try { await chat.sendStateTyping() } catch {}
            while (Date.now() - start < delayMs) {
              await sleep(1000)
              try { await chat.sendStateTyping() } catch {}
            }
            try { await chat.sendStatePaused() } catch {}
          } else {
            while (Date.now() - start < delayMs) { await sleep(250) }
          }
        } catch {
          while (Date.now() - start < delayMs) { await sleep(250) }
        }
      } else if (typeof sock.presenceSubscribe === 'function' && typeof sock.sendPresenceUpdate === 'function') {
        // Baileys: presence composing/paused (@s.whatsapp.net)
        try { await sock.presenceSubscribe(target) } catch {}
        try { await sock.sendPresenceUpdate('composing', target) } catch {}
        while (Date.now() - start < delayMs) {
          await sleep(1000)
          try { await sock.sendPresenceUpdate('composing', target) } catch {}
        }
        try { await sock.sendPresenceUpdate('paused', target) } catch {}
      } else {
        // Fallback: si no hay API de presencia, al menos esperar
        while (Date.now() - start < delayMs) { await sleep(250) }
      }
    }

    // Enviar
    await sock.sendMessage(target, { text: String(body) })
    try { await upsertAgentMemoryByJid({ jid: target, lastMessageTs: Date.now() }) } catch {}
    return true
  } catch (e) {
    addLog({ type: 'error', scope: 'capataz.send', error: e?.message || String(e) })
    return false
  }
}

// Helpers para asegurar campos y guardar valores por contacto (JID)
async function ensureFieldId(name, type = 'text') {
  const n = String(name || '').trim()
  if (!n) return null
  try {
    const [rows] = await pool.query(`SELECT id FROM fields WHERE name = ?`, [n])
    const fid = rows[0]?.id || null
    if (fid) return fid
    await upsertField({ name: n, type })
    const [rows2] = await pool.query(`SELECT id FROM fields WHERE name = ?`, [n])
    return rows2[0]?.id || null
  } catch {
    return null
  }
}

async function setUserFieldValueByJid(jid, fieldName, value, type = 'text') {
  try {
    const [urows] = await pool.query(`SELECT id FROM users WHERE jid = ?`, [String(jid)])
    const userId = urows[0]?.id || null
    if (!userId) return false
    const fieldId = await ensureFieldId(fieldName, type)
    if (!fieldId) return false
    await pool.query(
      `INSERT INTO user_field_values (user_id, field_id, value) VALUES (?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)`,
      [userId, fieldId, value != null ? String(value) : null]
    )
    return true
  } catch {
    return false
  }
}

// === Funciones de Gemini para Agente Recepcionista ===

// Bandera global para permitir o bloquear envíos automáticos desde backend
// Cuando está en 'false' (por defecto), el backend NO enviará mensajes automáticamente,
// excepto mediante los endpoints explícitos del frontend (/api/wa/send, /api/wa/send-media, /api/wa/send-location).
const BACKEND_SENDING_ENABLED = String(process.env.WA_BACKEND_SENDING_ENABLED || 'false').toLowerCase() === 'true'

// Inicializar Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

// Función para obtener saludo según horario
function getTimeBasedGreeting() {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) {
    return "Buenos días"
  } else if (hour >= 12 && hour < 18) {
    return "Buenas tardes"
  } else {
    return "Buenas noches"
  }
}

// === Helper: sintetizar texto a audio y enviar por WhatsApp ===
// Intenta Gemini TTS (WAV), luego Cloud TTS (MP3). Si ambos fallan, retorna null.
async function sendWaAudioFromText(sock, toJid, text, presetId = 'Zephyr') {
  try {
    if (!BACKEND_SENDING_ENABLED) { addLog({ type: 'info', scope: 'tts.send', note: 'Backend sending disabled' }); return false }
    if (!sock || !toJid || !text) return false
    // Simular "grabando"/"escribiendo" antes de enviar audio (basado en palabras)
    {
      let target = String(toJid)
      if (/@s\.whatsapp\.net$/.test(target) && target.includes(':')) {
        const base = target.replace(/:\d+(?=@s\.whatsapp\.net)/, '')
        target = base
      }
      const words = String(text).trim().split(/\s+/).filter(Boolean).length
      const MULT = Number(process.env.WA_TYPING_MULTIPLIER || 1)
      const MAX_MS = Number(process.env.WA_TYPING_DELAY_MAX_MS || 6000)
      let delayMs = Math.max(1000, Math.ceil(words / 2) * 1000 * MULT)
      if (isFinite(MAX_MS) && MAX_MS > 0) delayMs = Math.min(delayMs, MAX_MS)
      const start = Date.now()
      addLog({ type: 'recording.sim.backend', jid: target, seconds: Math.floor(delayMs/1000) })
      if (String(waStatus) !== 'connected') {
        await sleep(Math.min(delayMs, 2000))
      } else if (USE_WWEBJS && WWebJS && typeof sock.getChatById === 'function') {
        const chatId = toCUs(target)
        try {
          const chat = await sock.getChatById(chatId)
          if (chat && typeof chat.sendStateRecording === 'function') {
            try { await chat.sendStateRecording() } catch {}
            while (Date.now() - start < delayMs) {
              await sleep(1000)
              try { await chat.sendStateRecording() } catch {}
            }
            try { await chat.sendStatePaused() } catch {}
          } else {
            while (Date.now() - start < delayMs) { await sleep(250) }
          }
        } catch {
          while (Date.now() - start < delayMs) { await sleep(250) }
        }
      } else if (typeof sock.presenceSubscribe === 'function' && typeof sock.sendPresenceUpdate === 'function') {
        try { await sock.presenceSubscribe(target) } catch {}
        try { await sock.sendPresenceUpdate('recording', target) } catch {}
        while (Date.now() - start < delayMs) {
          await sleep(1000)
          try { await sock.sendPresenceUpdate('recording', target) } catch {}
        }
        try { await sock.sendPresenceUpdate('paused', target) } catch {}
      } else {
        while (Date.now() - start < delayMs) { await sleep(250) }
      }
    }
    // 1) Gemini TTS
    try {
      const wavBuf = await synthesizeWithGeminiTTS({ text, presetId })
      if (wavBuf && wavBuf.length > 0) {
        await sock.sendMessage(toJid, { audio: wavBuf, mimetype: 'audio/wav' })
        addLog({ type: 'send_audio', presetId, engine: 'gemini', toJid })
        return true
      }
    } catch (e) { addLog({ type: 'warn', scope: 'tts.send.gemini', error: e?.message || String(e) }) }

    // 2) Google Cloud TTS
    try {
      const mp3Buf = await synthesizeWithCloudTTS({ text, presetId })
      if (mp3Buf && mp3Buf.length > 0) {
        await sock.sendMessage(toJid, { audio: mp3Buf, mimetype: 'audio/mpeg' })
        addLog({ type: 'send_audio', presetId, engine: 'gcloud', toJid })
        return true
      }
    } catch (e) { addLog({ type: 'warn', scope: 'tts.send.cloud', error: e?.message || String(e) }) }

    return false
  } catch (e) {
    addLog({ type: 'error', scope: 'tts.send', error: e?.message || String(e) })
    return false
  }
}

// Función para llamar a Gemini API
async function callGeminiAPI(userMessage, conversationHistory = [], knowledgeBase = '', interestList = [], agentName = 'Recepcionita', state = {}) {
  try {
    // Si no hay API Key configurada, responder con fallback claro sin intentar la API
    const hasKey = !!String(process.env.GEMINI_API_KEY || '').trim()
    if (!hasKey) {
      const greeting = getTimeBasedGreeting()
      const isAudio = /nota de voz/i.test(String(userMessage || ''))
      // Heurística básica para texto: detectar nombre y programa por palabras clave
      if (!isAudio) {
        const raw = String(userMessage || '')
        const cleaned = extractCleanName(raw)
        const stop = ['hola','buenas','tardes','dias','días','noches','buenos','hey','qué','que','tal','mi','nombre','es','soy','me','llamo','para','por','de','la','el','un','una']
        let detectedClientName = null
        // 1) Detectar por patrón explícito
        try {
          const m = raw.match(/(?:me\s+llamo|mi\s+nombre\s+es|soy)\s+([A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]+)*)/i)
          if (m && m[1]) {
            const candidate = extractCleanName(m[1])
            detectedClientName = candidate
          }
        } catch {}
        // 2) Si no hay patrón, tomar primeras 2 palabras relevantes
        if (!detectedClientName) {
          const tokens = cleaned.split(' ').filter(x => x.length >= 2 && /^[A-Za-zÁÉÍÓÚÑáéíóúñ]+$/.test(x))
          const tokensFiltered = tokens.filter(t => !stop.includes(t.toLowerCase()))
          if (tokensFiltered.length >= 1) {
            const candidate = tokensFiltered.slice(0, 1).join(' ')
            detectedClientName = candidate
          }
        }
        // Detección de programa por keywords; prioriza interestList si viene
        const s = raw.toLowerCase()
        let detectedProgram = null
        const interestNames = Array.isArray(interestList) ? interestList.map(x => String(x?.name || '').toLowerCase()) : []
        const interestKeywords = Array.isArray(interestList) ? interestList.flatMap(x => Array.isArray(x?.keywords) ? x.keywords.map(k => String(k).toLowerCase()) : []) : []
        const candidates = [
          { name: 'Bachillerato Virtual', kw: ['virtual'] },
          { name: 'Bachillerato por ciclos', kw: ['ciclo','ciclos'] },
          { name: 'Técnico en motos', kw: ['moto','motos'] },
          { name: 'Cursos de Conducción', kw: ['conducci','licenc'] },
        ]
        if (interestNames.length || interestKeywords.length) {
          if (interestKeywords.some(k => s.includes(k))) {
            const matchName = interestNames.find(n => s.includes(n)) || null
            detectedProgram = matchName || 'Programa de interés'
          }
        }
        if (!detectedProgram) {
          for (const c of candidates) {
            if (c.kw.some(k => s.includes(k))) { detectedProgram = c.name; break }
          }
        }

        // Sin API key, no forzar respuestas ni saludos; salida mínima
        const response = ''
        const conversationComplete = false
        return { detectedClientName, detectedProgram, response, conversationComplete }
      }
      // Fallback para audio
      return {
        detectedClientName: null,
        detectedProgram: null,
        // No enviar texto prediseñado en fallbacks de audio
        response: '',
        conversationComplete: false
      }
    }

    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
    const model = genAI.getGenerativeModel({ model: modelName })

    // Esquema de salida estructurada
    const schema = {
      type: 'object',
      properties: {
        detectedClientName: { type: 'string' },
        detectedProgram: { type: 'string' },
        response: { type: 'string' },
        conversationComplete: { type: 'boolean' }
      },
      required: ['response', 'conversationComplete']
    }

    // Construir instrucciones del sistema con la KB
    const systemPrompt = [
      `Eres ${agentName}, recepcionista del Colegio LASIT. Conversas en español (Colombia) con tono cordial, humano y profesional.`,
      `Tu nombre del agente es exactamente: "${agentName}". Nunca te identifiques con otro nombre ni variantes. No digas que eres un modelo de lenguaje.`,
      `Reglas:
1) Revisa primero la sección de información general cuando la pregunta sea amplia. No digas que no sabes sin revisar el contexto.
2) No copies textualmente del contexto ni imites su formato; responde con texto natural.
3) Si la pregunta es amplia y hay múltiples opciones, usa una pregunta breve de seguimiento en vez de listar todo.
4) Si hay recursos (PDFs, ubicaciones), menciónalos y ofrécelos si el cliente lo solicita.
5) No te refieras a la existencia de una "base de conocimiento"; habla como humano.
6) No inventes información; si falta en el contexto, dilo amablemente.`,
      `Contexto institucional (usar solo si ayuda y sin citarlo):
${String(knowledgeBase || '').trim() || '(sin conocimiento adicional)'}`,
      `Salida requerida: Devuelve únicamente un JSON que siga el esquema indicado. La clave "response" debe contener una redacción natural y humana (sin plantillas ni markdown).`
    ].join('\n\n')

    // Mapear el historial al formato contents (usuario/modelo)
    const contents = []
    const hist = Array.isArray(conversationHistory) ? conversationHistory.slice(-6) : []
    for (const item of hist) {
      const r = String(item?.role || 'user').trim().toLowerCase()
      const role = (r === 'model' || r === 'agent' || r === 'assistant') ? 'model' : 'user'
      const textPart = String(item?.message || item?.text || '').trim()
      if (!textPart) continue
      contents.push({ role, parts: [{ text: textPart }] })
    }
    contents.push({ role: 'user', parts: [{ text: String(userMessage || '').trim() }] })

    // Llamada usando el SDK con systemInstruction y schema
    const result = await model.generateContent({
      contents,
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema }
    })

    const response = await result.response
    const text = response.text()

    let parsed
    try {
      parsed = JSON.parse(text)
    } catch (e) {
      // Intentar extraer bloque JSON (```json ... ``` o primer {...}) cuando hay texto adicional
      const codeBlockMatch = text.match(/```json\s*([\s\S]*?)```/i)
      const candidate = codeBlockMatch ? codeBlockMatch[1] : (() => {
        const first = text.indexOf('{')
        const last = text.lastIndexOf('}')
        return first !== -1 && last !== -1 && last > first ? text.slice(first, last + 1) : ''
      })()
      try {
        parsed = candidate ? JSON.parse(candidate) : null
      } catch (_) {
        parsed = null
      }
      if (!parsed || typeof parsed !== 'object') {
        parsed = {
          detectedClientName: null,
          detectedProgram: null,
          response: '',
          conversationComplete: false
        }
      }
    }

    // Normalización del nombre: acepta primer nombre si no hay apellidos
    if (parsed.detectedClientName) {
      parsed.detectedClientName = extractCleanName(parsed.detectedClientName)
    }

    // Heurística adicional: si no vino nombre estructurado, intenta extraer primer nombre del mensaje del cliente
    if (!parsed.detectedClientName) {
      const raw = String(userMessage || '')
      const cleaned = extractCleanName(raw)
      const stop = ['hola','buenas','tardes','dias','días','noches','buenos','hey','qué','que','tal','mi','nombre','es','soy','me','llamo','para','por','de','la','el','un','una']
      let candidate = null
      try {
        const m = raw.match(/(?:me\s+llamo|mi\s+nombre\s+es|soy)\s+([A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]+)*)/i)
        if (m && m[1]) {
          candidate = extractCleanName(m[1])
        }
      } catch {}
      if (!candidate) {
        const tokens = cleaned.split(' ').filter(x => x.length >= 2 && /^[A-Za-zÁÉÍÓÚÑáéíóúñ]+$/.test(x))
        const tokensFiltered = tokens.filter(t => !stop.includes(t.toLowerCase()))
        if (tokensFiltered.length >= 1) {
          candidate = tokensFiltered.slice(0, 1).join(' ')
        }
      }
      if (candidate) parsed.detectedClientName = candidate
    }

    // No forzar redacciones ni plantillas cuando el programa no se reconoce; dejar que el agente conduzca

    // Completar conversación solo si ambos datos están presentes
    if (parsed.detectedClientName && parsed.detectedProgram) {
      parsed.conversationComplete = true
    }

    return parsed
  } catch (error) {
    addLog({ type: 'error', scope: 'gemini.api', error: error?.message || String(error) })
    const greeting = getTimeBasedGreeting()
    const isAudio = /nota de voz/i.test(String(userMessage || ''))
    // Si falla la API, usar una heurística para texto y un fallback claro para audio
    if (!isAudio) {
      const raw = String(userMessage || '')
      const cleaned = extractCleanName(raw)
      const stop = ['hola','buenas','tardes','dias','días','noches','buenos','hey','qué','que','tal','mi','nombre','es','soy','me','llamo','para','por','de','la','el','un','una']
      let detectedClientName = null
      try {
        const m = raw.match(/(?:me\s+llamo|mi\s+nombre\s+es|soy)\s+([A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]+)*)/i)
        if (m && m[1]) {
          const candidate = extractCleanName(m[1])
          detectedClientName = candidate
        }
      } catch {}
      if (!detectedClientName) {
        const tokens = cleaned.split(' ').filter(x => x.length >= 2 && /^[A-Za-zÁÉÍÓÚÑáéíóúñ]+$/.test(x))
        const tokensFiltered = tokens.filter(t => !stop.includes(t.toLowerCase()))
        if (tokensFiltered.length >= 1) {
          const candidate = tokensFiltered.slice(0, 1).join(' ')
          detectedClientName = candidate
        }
      }
      // Detección de programa por keywords; prioriza interestList si viene
      const s = raw.toLowerCase()
      let detectedProgram = null
      const interestNames = Array.isArray(interestList) ? interestList.map(x => String(x?.name || '').toLowerCase()) : []
      const interestKeywords = Array.isArray(interestList) ? interestList.flatMap(x => Array.isArray(x?.keywords) ? x.keywords.map(k => String(k).toLowerCase()) : []) : []
      const candidates = [
        { name: 'Bachillerato Virtual', kw: ['virtual'] },
        { name: 'Bachillerato por ciclos', kw: ['ciclo','ciclos'] },
        { name: 'Técnico en motos', kw: ['moto','motos'] },
        { name: 'Cursos de Conducción', kw: ['conducci','licenc'] },
      ]
      // Si interestList especifica nombres/keywords, utilizarlos primero
      if (interestNames.length || interestKeywords.length) {
        if (interestKeywords.some(k => s.includes(k))) {
          const matchName = interestNames.find(n => s.includes(n)) || null
          detectedProgram = matchName || 'Programa de interés'
        }
      }
      if (!detectedProgram) {
        for (const c of candidates) {
          if (c.kw.some(k => s.includes(k))) { detectedProgram = c.name; break }
        }
      }

      // No enviar mensajes prediseñados en heurística de fallback.
      // Deja que el agente recepcionista lleve la conversación.
      let response = ''
      let conversationComplete = false
      // Solo marcar la conversación como completada si ambos datos están presentes.
      if (detectedClientName && detectedProgram) {
        conversationComplete = true
      }
      addLog({ type: 'info', scope: 'gemini.fallback.heuristic', name: detectedClientName, program: detectedProgram })
      return { detectedClientName, detectedProgram, response, conversationComplete }
    }
    // Fallback para audio si falla la API
    return {
      detectedClientName: null,
      detectedProgram: null,
      // No enviar texto prediseñado en fallbacks de audio
      response: '',
      conversationComplete: false
    }
  }
}

// Fallback libre: genera una respuesta natural sin JSON cuando la estructurada está vacía
async function callGeminiFreeAPI(userMessage, conversationHistory, knowledgeBase, agentName = 'Recepcionita', state = {}) {
  try {
    // Construir systemInstruction idéntico al de "Probar Agente"
    const dateContext = new Date().toLocaleString('es-CO', { hour12: false })
    const greetLine = state && state.forceGreeting === true
      ? 'Primer intercambio: incluye un saludo cordial breve y ofrece ayuda en una sola frase.'
      : null
    const systemInstructionText = [
      `Eres ${agentName}, recepcionista del Colegio LASIT. Conversas en español (Colombia) con tono cordial, humano y profesional.`,
      `Tu nombre del agente es exactamente: "${agentName}". Nunca te identifiques con otro nombre ni variantes. No digas que eres un modelo de lenguaje.`,
      `Contexto temporal:\n- ${dateContext}\n- No inventes fechas ni horas. Si el usuario te pregunta la fecha u hora actual, responde usando este contexto.`,
      ...(greetLine ? [greetLine] : []),
      `Comportamiento humano: si el usuario repite un saludo corto en mensajes posteriores, responde con cortesía sin repetir toda la presentación.`,
      `REGLAS:\n- Revisa primero la información general si aplica; no digas que no sabes sin revisar.\n- No copies literalmente ni imites formatos del contexto (listas/negrillas). Responde en texto natural, claro y breve.\n- Si la pregunta es amplia y hay múltiples opciones, usa una pregunta de seguimiento en vez de listar.\n- Si el contexto menciona recursos (PDFs, imágenes, ubicaciones), ofrécelos proactivamente en un segundo paso; no los adjuntes, ofrece enviarlos si el cliente confirma.\n- No te refieras a la existencia de una "base de conocimiento"; habla como humano.\n- Preguntas personales: indica que el chat es monitoreado y solo puedes resolver temas del complejo LASIT.\n- No inventes información; si falta en el contexto, dilo amablemente.`,
      `Captura de datos:\n- Si el cliente solo da su primer nombre y no proporciona apellidos, pídelos con cortesía una sola vez. Si después de pedirlos no los brinda, continúa usando solo el primer nombre.\n- Cuando entregue nombres reales, confirma con una sola frase y continúa.\n- Nunca inventes datos.\n- Estado actual detected-client-name = ${String(state?.detectedClientName || '').trim() || '(no)'}. Si ya tiene valor, NO vuelvas a solicitar ni a reconfirmar el nombre; continúa directamente con la atención.\n- Tras obtener el nombre, pregunta brevemente por el programa de interés (bachillerato por ciclos/virtual, técnico en motos, cursos de conducción).`,
      `Contexto (usar solo si ayuda y sin citarlo):\n${String(knowledgeBase || '').trim() || '(sin conocimiento adicional)'}`
    ].join('\n\n')

    // Historial: mapear a formato contents (similar al frontend)
    const contents = []
    const hist = Array.isArray(conversationHistory) ? conversationHistory.slice(-6) : []
    for (const item of hist) {
      const r = String(item?.role || 'user').trim().toLowerCase()
      const role = (r === 'model' || r === 'agent' || r === 'assistant') ? 'model' : 'user'
      const text = String(item?.message || item?.text || '').trim()
      if (!text) continue
      contents.push({ role, parts: [{ text }] })
    }
    contents.push({ role: 'user', parts: [{ text: String(userMessage || '').trim() }] })

    // Hacer la llamada a la API de Gemini con el mismo formato del proxy
    const https = require('https')
    const key = process.env.GEMINI_API_KEY || ''
    if (!key) throw new Error('GEMINI_API_KEY no configurada')
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
    const payload = {
      contents,
      systemInstruction: { parts: [{ text: systemInstructionText }] },
      generationConfig: { temperature: 0.7, topP: 0.9 }
    }
    const body = JSON.stringify(payload)
    const pathUrl = `/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: pathUrl,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }
    const text = await new Promise((resolve, reject) => {
      const reqG = https.request(options, (resp) => {
        let data = ''
        resp.on('data', (chunk) => { data += chunk })
        resp.on('end', () => {
          try {
            const j = JSON.parse(data)
            if (j && j.error) return reject(new Error(j.error.message || 'Error al llamar a Gemini'))
            const t = j?.candidates?.[0]?.content?.parts?.[0]?.text || ''
            resolve(String(t || '').trim())
          } catch (e) { reject(e) }
        })
      })
      reqG.on('error', (err) => reject(err))
      reqG.write(body)
      reqG.end()
    })
    return text
  } catch (e) {
    addLog({ type: 'error', scope: 'gemini.free.fallback', error: e?.message || String(e) })
    return ''
  }
}

// Sanitización básica para respuestas del agente antes de enviarlas por WhatsApp
function stripEcho(original, reply) {
  try {
    const a = String(original || '').trim()
    let r = String(reply || '').trim()
    if (!a || !r) return r
    const norm = (s) => String(s || '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .trim()
    const na = norm(a)
    const nr = norm(r)
    if (nr.startsWith(na)) {
      r = r.slice(a.length).trim()
    } else {
      const lines = r.split(/\r?\n+/)
      const filtered = lines.filter(line => norm(line) !== na)
      r = filtered.join('\n').trim()
    }
    return r
  } catch { return String(reply || '').trim() }
}

function sanitizeAgentText(text, originalUserText = '', opts = {}) {
  try {
    let t = String(text || '').trim()
    if (!t) return t
    // Normalización de saludo al inicio: reemplazar abreviaturas por saludo canónico
    try {
      const exactGreeting = getTimeBasedGreeting()
      const leadingVar = /^\s*(?:¡)?\s*(?:muy\s+)?(?:buen(?:os|as))\b\s*[,;:!\.]?\s*/i
      if (leadingVar.test(t)) {
        t = t.replace(leadingVar, `${exactGreeting}. `)
        t = t.replace(/\s{2,}/g, ' ').trim()
      }
      t = t.replace(/^\s*(buen(?:os|as))\s*\.(\s|$)/i, `${exactGreeting}. `)
    } catch {}
    // Si NO es el primer turno, eliminar cualquier re-presentación del agente ("soy/mi nombre es...") al inicio
    try {
      const isFirstTurn = !!opts?.isFirstTurn
      if (!isFirstTurn) {
        const introPatterns = [
          /^\s*(?:hola|buen(?:os|as)\s+dias|muy\s+buenos\s+dias|buenas)\b[^\n.!]*[.!]?\s*(?:soy|mi\s+nombre\s+es)\s+[^,!.\n]+(?:,\s*(?:recepcionista|secretaria)[^.!\n]*)?\s*[.!]?/i,
          /^\s*(?:soy|mi\s+nombre\s+es)\s+[^,!.\n]+(?:,\s*(?:recepcionista|secretaria)[^.!\n]*)?\s*[.!]?/i
        ]
        for (const re of introPatterns) {
          if (re.test(t)) { t = t.replace(re, '').trim(); break }
        }
      }
    } catch {}
    // Quitar metadatos internos si el modelo los añade
    t = t.replace(/\b(?:detect(?:ed)?-client-name|detect(?:ed)?ClientName)\s*:\s*[^\n\.]+[\.]?/gi, '').trim()
    t = t.replace(/\b(?:detect(?:ed)?-program|detect(?:ed)?Program)\s*:\s*[^\n\.]+[\.]?/gi, '').trim()
    t = t.replace(/\b(?:conversationComplete|conversation-complete)\s*:\s*[^\n\.]+[\.]?/gi, '').trim()
    // Quitar formato markdown simple
    t = t.replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, ' ')).replace(/`+/g, '')
    t = t.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/__([^_]+)__/g, '$1')
    // Evitar eco del texto del cliente
    t = stripEcho(originalUserText, t)
    t = t.replace(/\s{2,}/g, ' ').trim()
    if (t && !(/[.!?…]$/.test(t))) t += '.'
    return t
  } catch { return String(text || '').trim() }
}

// Extrae un posible número de teléfono del texto del cliente.
// Regla simple: prioriza formato Colombia (prefijo 57 + 10 dígitos) o 10 dígitos locales.
function extractPhoneFromText(text, defaultCc = '57') {
  try {
    const s = String(text || '').replace(/[()\-\.\s]/g, ' ').trim()
    if (!s) return null
    // Buscar +57XXXXXXXXXX o 57XXXXXXXXXX
    const reCc = /\+?57\s*\d{10}/g
    const ccMatches = Array.from(s.matchAll(reCc)).map(m => m[0].replace(/\D/g, ''))
    if (ccMatches.length) return ccMatches[0]
    // Buscar 10 dígitos seguidos (local) y anteponer CC
    const reLocal10 = /(?<!\d)\d{10}(?!\d)/g
    const localMatches = Array.from(s.matchAll(reLocal10)).map(m => m[0])
    if (localMatches.length) return (String(defaultCc).replace(/\D/g, '') || '57') + localMatches[0]
    // Fallback: primera secuencia de 8–15 dígitos que no parezca un ID largo
    const reGeneric = /(?<!\d)\d{8,15}(?!\d)/g
    const gen = Array.from(s.matchAll(reGeneric)).map(m => m[0])
    if (gen.length) return gen[0]
    return null
  } catch { return null }
}

// Obtiene un candidato de teléfono a partir del JID.
// - @s.whatsapp.net: usa la parte de usuario (quitando :device si viene)
// - @lid: si la parte de usuario es SOLO dígitos y NO tiene ":", toma esos dígitos.
//   si son 10 dígitos, antepone CC detectado; si son 8–15 dígitos, los usa tal cual.
function phoneFromJid(jid, defaultCc = '57') {
  try {
    const s = String(jid || '')
    if (!s) return null
    if (/@s\.whatsapp\.net$/.test(s)) {
      const base = s.includes(':') ? s.replace(/:\d+(?=@s\.whatsapp\.net)/, '') : s
      return base.replace(/@.+$/, '')
    }
    if (/@lid$/.test(s)) {
      const rawUser = s.split('@')[0]
      // Tomar la parte antes de ':' si existe (multi-dispositivo)
      const userPart = rawUser.split(':')[0]
      const digits = userPart.replace(/\D/g, '')
      if (digits.length >= 8 && digits.length <= 15) return digits
      return null
    }
    return null
  } catch { return null }
}

async function handleCapatazInbound(sock, { sender, text }) {
  // Gating global: solo responder desde backend si WA_AUTOREPLY_SOURCE=backend
  const autoSrc = String(process.env.WA_AUTOREPLY_SOURCE || '').toLowerCase()
  if (autoSrc !== 'backend') {
    addLog({ type: 'info', scope: 'capataz.skip', note: 'Auto-reply delegado al frontend o desactivado', sender })
    return false
  }
  const cfg = await getActiveCapatazConfig()
  if (!cfg?.enabled) return false
  // Obtener identidad y base de conocimiento del Recepcionista
  const rcfg = await getActiveRecepcionistaConfig()
  
  const jid = String(sender)
  // Rehidratar estado desde persistencia si no existe en memoria
  let session = capatazSessions.get(jid) || { 
    stage: 'conversation', 
    createdAt: Date.now(), 
    conversationHistory: [],
    detectedClientName: null,
    detectedProgram: null
  }
  try {
    if (!capatazSessions.has(jid)) {
      const mem = await getAgentMemoryByJid(jid)
      if (mem) {
        session.stage = mem.stage || session.stage
        session.detectedClientName = mem.clientName || session.detectedClientName
        session.detectedProgram = mem.program || session.detectedProgram
      }
    }
  } catch (_) {}

  // Si ya está completado, no procesar más
  if (session.stage === 'completed') {
    return false
  }

  // Detectar si es el primer turno ANTES de agregar el mensaje
  const isFirstTurn = session.conversationHistory.length === 0
  // Agregar mensaje del usuario al historial
  session.conversationHistory.push({
    role: 'user',
    message: text,
    timestamp: Date.now()
  })

  try {
    // Base de conocimiento: usar la KB del Recepcionista si está configurada, con fallback neutral
    const knowledgeBase = (rcfg?.kbText && String(rcfg.kbText).trim())
      ? String(rcfg.kbText)
      : `LASÏT: institución educativa. Programas: bachillerato por ciclos, bachillerato virtual, técnico en motos, cursos de conducción.`

    // Llamar a Gemini API
    const geminiResponse = await callGeminiAPI(
      text,
      session.conversationHistory,
      knowledgeBase,
      cfg?.interestRoutes || [],
      rcfg?.agentName || 'Recepcionita',
      { detectedClientName: session.detectedClientName }
    )
    
    // Procesar respuesta de Gemini
    if (geminiResponse.detectedClientName && !session.detectedClientName) {
      session.detectedClientName = geminiResponse.detectedClientName
      // Eliminado: no crear/actualizar contacto ni campos al detectar nombre en mensajes entrantes
      addLog({ type: 'info', scope: 'recepcionista.client_detected.skip_save', client: geminiResponse.detectedClientName })
      // Persistir en memoria
      try { await upsertAgentMemoryByJid({ jid, clientName: session.detectedClientName }) } catch {}
    }

    if (geminiResponse.detectedProgram && !session.detectedProgram) {
      session.detectedProgram = geminiResponse.detectedProgram
      
      // Eliminado: no guardar campos de programa/interés en mensajes entrantes
      addLog({ type: 'info', scope: 'recepcionista.program_detected.skip_save', program: geminiResponse.detectedProgram })
      try { await upsertAgentMemoryByJid({ jid, program: session.detectedProgram }) } catch {}
    }

    // Unificar comportamiento: usar SIEMPRE la respuesta libre de Gemini como texto a enviar
    let replyText = ''
    try {
      const freeText = await callGeminiFreeAPI(
        text,
        session.conversationHistory,
        knowledgeBase,
        rcfg?.agentName || 'Recepcionita',
        { detectedClientName: session.detectedClientName, forceGreeting: isFirstTurn }
      )
      if (freeText && freeText.trim()) replyText = sanitizeAgentText(freeText.trim(), text, { isFirstTurn })
    } catch (e) {
      addLog({ type: 'error', scope: 'recepcionista.free_reply', error: e?.message || String(e) })
    }
    if (replyText) {
      // Enviar respuesta
      await sendWaText(sock, jid, replyText)
      // Agregar respuesta del agente al historial
      session.conversationHistory.push({
        role: 'agent',
        message: replyText,
        timestamp: Date.now()
      })
      try { await upsertAgentMemoryByJid({ jid, lastMessageTs: Date.now() }) } catch {}
    }

    // Si la conversación está completa, marcar como completada
    if (geminiResponse.conversationComplete) {
      session.stage = 'completed'
      try { await upsertAgentMemoryByJid({ jid, stage: 'completed' }) } catch {}
      
      // Eliminado: no asignar etiquetas automáticas al completar conversación desde mensajes entrantes
      
      addLog({ type: 'info', scope: 'recepcionista.conversation_completed', 
               client: session.detectedClientName, 
               program: session.detectedProgram })
    }

    // Actualizar sesión
    capatazSessions.set(jid, session)
    return true

  } catch (error) {
    addLog({ type: 'error', scope: 'recepcionista.handle', error: error?.message || String(error) })
    
    // Respuesta de fallback en caso de error
    await sendWaText(sock, jid, 'Disculpa, tengo problemas técnicos en este momento. ¿Podrías intentar de nuevo en unos minutos?')
    return true
  }
}

// Nuevo: manejar entrada de audio con respuesta por voz
async function handleCapatazInboundAudio(sock, { sender }) {
  // Gating global: solo responder desde backend si WA_AUTOREPLY_SOURCE=backend
  const autoSrc = String(process.env.WA_AUTOREPLY_SOURCE || '').toLowerCase()
  if (autoSrc !== 'backend') {
    addLog({ type: 'info', scope: 'capataz.skip_audio', note: 'Auto-reply por audio delegado al frontend o desactivado', sender })
    return false
  }
  const cfg = await getActiveCapatazConfig()
  if (!cfg?.enabled) return false
  // Config de recepcionista (identidad/voz/KB)
  const rcfg = await getActiveRecepcionistaConfig()

  const jid = String(sender)
  const session = capatazSessions.get(jid) || { 
    stage: 'conversation', 
    createdAt: Date.now(), 
    conversationHistory: [],
    detectedClientName: null,
    detectedProgram: null
  }

  if (session.stage === 'completed') return false

  // Detectar si es el primer turno ANTES de registrar el evento de audio
  const isFirstTurn = session.conversationHistory.length === 0

  // Agregar indicador de audio al historial
  session.conversationHistory.push({ role: 'user', message: '[nota de voz]', timestamp: Date.now() })

  try {
    const knowledgeBase = (rcfg?.kbText && String(rcfg.kbText).trim())
      ? String(rcfg.kbText)
      : `LASÏT: institución educativa. Programas: bachillerato por ciclos, bachillerato virtual, técnico en motos, cursos de conducción.`

    // Pedir a Gemini la respuesta textual según las reglas del Recepcionista
    const geminiResponse = await callGeminiAPI(
      '[nota de voz]',
      session.conversationHistory,
      knowledgeBase,
      cfg?.interestRoutes || [],
      rcfg?.agentName || 'Recepcionita',
      { detectedClientName: session.detectedClientName }
    )

    // Guardar detecciones si aplica
    if (geminiResponse.detectedClientName && !session.detectedClientName) {
      session.detectedClientName = geminiResponse.detectedClientName
      // Eliminado: no crear/actualizar contacto ni campos en audio entrante
      addLog({ type: 'info', scope: 'recepcionista.client_detected_audio.skip_save', client: geminiResponse.detectedClientName })
    }

    if (geminiResponse.detectedProgram && !session.detectedProgram) {
      session.detectedProgram = geminiResponse.detectedProgram
      // Eliminado: no guardar campos de programa/interés en audio entrante
    }

    // Responder por VOZ solo si hay texto; si falla, enviar texto válido
    let replyAudioText = ''
    try {
      const freeText = await callGeminiFreeAPI(
        '[nota de voz]',
        session.conversationHistory,
        knowledgeBase,
        rcfg?.agentName || 'Recepcionita',
        { detectedClientName: session.detectedClientName }
      )
      replyAudioText = sanitizeAgentText(String(freeText || '').trim(), '[nota de voz]', { isFirstTurn })
    } catch (_) { replyAudioText = String(geminiResponse.response || '').trim() }
    if (replyAudioText) {
      const okAudio = await sendWaAudioFromText(sock, jid, replyAudioText, rcfg?.voiceId || 'Zephyr')
      if (!okAudio) {
        // Fallback: enviar texto si no se pudo sintetizar audio
        await sendWaText(sock, jid, replyAudioText)
      }
      // Añadir respuesta del agente al historial
      session.conversationHistory.push({ role: 'agent', message: replyAudioText, timestamp: Date.now() })
    }

    if (geminiResponse.conversationComplete) {
      session.stage = 'completed'
      try {
        const autoLabelIds = Array.isArray(cfg.autoLabels) ? cfg.autoLabels.map(x => Number(x)).filter(x => x > 0) : []
        if (autoLabelIds.length) {
          const [urows] = await pool.query(`SELECT id FROM users WHERE jid = ?`, [jid])
          const userId = urows[0]?.id || null
          if (userId) {
            for (const lid of autoLabelIds) {
              try { await pool.query(`INSERT INTO user_labels (user_id, label_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE label_id = label_id`, [userId, lid]) } catch {}
            }
          }
        }
      } catch (e) {
        addLog({ type: 'error', scope: 'recepcionista.auto_labels_audio', error: e?.message || String(e) })
      }
    }

    capatazSessions.set(jid, session)
    return true
  } catch (error) {
    addLog({ type: 'error', scope: 'recepcionista.handle_audio', error: error?.message || String(error) })
    await sendWaText(sock, jid, 'Disculpa, tuve un problema técnico procesando tu nota de voz. ¿Podrías intentarlo de nuevo en unos minutos?')
    return true
  }
}

// Implementación con whatsapp-web.js
async function startWhatsAppWweb(force = false) {
  await initSchema().catch(() => {})

  if (sock) {
    if (!force) {
      addLog({ type: 'wweb:reuse', note: 'Socket existente, no se reinicia' })
      return
    } else {
      try { await sock.logout?.() } catch {}
      try { await sock.destroy?.() } catch {}
      sock = null
    }
  }

  waStatus = 'idle'
  lastQrString = null
  connectedUser = null

  const { Client, LocalAuth, MessageMedia } = WWebJS || {}
  // Cuando se fuerza la reconexión, usar un dataPath único para evitar reutilizar sesiones corruptas
  const authDataPath = force ? `wweb_auth_${Date.now()}` : 'wweb_auth'
  addLog({ type: 'wweb:init', authDataPath, force })
  sock = new Client({
    authStrategy: new LocalAuth({ 
      dataPath: authDataPath,
      clientId: 'wwebjs-client'
    }),
    puppeteer: { 
      headless: true, 
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection'
      ],
      timeout: 60000,
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false
    },
    session: authDataPath,
    restartOnAuthFail: true,
    takeoverOnConflict: true,
    takeoverTimeoutMs: 60000,
    qrMaxRetries: 5,
    authTimeoutMs: 60000,
    ffmpegPath: null,
    bypassCSP: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  })

  sock.on('qr', (qr) => {
    waStatus = 'qr'
    lastQrString = qr
    io.emit('wa:status', { status: waStatus, user: connectedUser })
    addLog({ type: 'status', status: 'qr' })
  })

  sock.on('ready', async () => {
    waStatus = 'connected'
    lastQrString = null
    try {
      const jidRaw = sock.info?.wid?._serialized || null
      const phoneNumber = jidRaw ? String(jidRaw).replace(/@.+$/, '') : null
      connectedUser = { id: toSWhatsApp(jidRaw), name: sock.info?.pushname || phoneNumber || 'Desconocido', phoneNumber }
      await upsertUser({ jid: connectedUser.id, phone: connectedUser.phoneNumber, name: connectedUser.name })
    } catch {}
    resetInbox()
    io.emit('wa:status', { status: waStatus, user: connectedUser })
    io.emit('wa:inbox', { messages: inbox })
    addLog({ type: 'status', status: 'connected', user: connectedUser })
    
    // Iniciar keepalive cuando se conecta
    startKeepalive()
  })

  sock.on('disconnected', (reason) => {
    waStatus = 'disconnected'
    connectedUser = null
    lastQrString = null
    
    // Limpiar intervalos
    if (keepaliveInterval) {
      clearInterval(keepaliveInterval)
      keepaliveInterval = null
    }
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout)
      reconnectTimeout = null
    }
    
    io.emit('wa:status', { status: waStatus, user: connectedUser })
    addLog({ type: 'status', status: 'disconnected', reason })
    
    // Programar reconexión automática si no fue desconexión manual
    if (reason !== 'LOGOUT' && reason !== 'MANUAL') {
      scheduleReconnect()
    }
  })

  sock.on('auth_failure', (msg) => {
    addLog({ type: 'error', scope: 'wweb.auth_failure', error: msg || 'Auth failure' })
  })

  sock.on('change_state', (state) => {
    addLog({ type: 'wweb:state', state })
  })

  // Manejo de errores y reconexión
  sock.on('loading_screen', (percent, message) => {
    addLog({ type: 'wweb:loading', percent, message })
  })

  sock.on('remote_session_saved', () => {
    addLog({ type: 'wweb:session_saved' })
  })

  // Funciones de keepalive y reconexión
  const startKeepalive = () => {
    if (keepaliveInterval) clearInterval(keepaliveInterval)
    keepaliveInterval = setInterval(async () => {
      try {
        if (sock && waStatus === 'connected') {
          await sock.getState()
          addLog({ type: 'wweb:keepalive', status: 'ok' })
        }
      } catch (error) {
        addLog({ type: 'wweb:keepalive', status: 'error', error: error.message })
        if (waStatus === 'connected') {
          waStatus = 'disconnected'
          io.emit('wa:status', { status: waStatus, user: null })
          scheduleReconnect()
        }
      }
    }, 30000) // Keepalive cada 30 segundos
  }

  const scheduleReconnect = () => {
    if (reconnectTimeout) clearTimeout(reconnectTimeout)
    reconnectTimeout = setTimeout(async () => {
      try {
        addLog({ type: 'wweb:auto_reconnect', attempt: true })
        // Forzar reinicio del cliente para evitar reutilizar un socket desconectado
        await startWhatsAppWweb(true)
      } catch (error) {
        addLog({ type: 'wweb:auto_reconnect', attempt: false, error: error.message })
      }
    }, 5000) // Reconectar después de 5 segundos
  }

  sock.on('message', async (msg) => {
    try {
      const ts = (msg.timestamp || Date.now()) * 1000
      const id = msg.id?._serialized || `in-${ts}`
      const fromMe = !!msg.fromMe
      // Determinar correctamente el remitente del mensaje:
      // - Si es entrante (fromMe=false): priorizar author (grupos) y luego from.
      // - Si es saliente (fromMe=true): usar to (destinatario) y como fallback from.
      let senderC
      if (fromMe) {
        senderC = msg.to || msg.from || msg.author
      } else {
        senderC = msg.author || msg.from || msg.to
      }
      const sender = toSWhatsApp(senderC)
      const text = msg.body || null
      if (!fromMe) { unreadCount += 1; lastMessage = { sender, text: text || '[no-text]', ts } }
      const item = { id, sender, text: text || '[no-text]', ts, fromMe }
      inbox.push(item); if (inbox.length > 100) inbox.shift()
      await insertMessage({ id, sender, text, ts, fromMe, status: null })
      // Eliminado: no guardar/crear contactos automáticamente en mensajes entrantes (WWebJS)
      io.emit('wa:message', item)
      addLog({ type: 'message', ...item })
      // Auto-respuesta backend para texto: procesar si está habilitado
      if (!fromMe && text && String(text).trim().length > 0) {
        try {
          const ok = await handleCapatazInbound(sock, { sender, text })
          if (!ok) {
            addLog({ type: 'info', scope: 'wa.autoreply.wweb', note: 'Auto-reply no aplicado (delegado o deshabilitado)', sender })
          }
        } catch (e) {
          addLog({ type: 'error', scope: 'wa.autoreply.wweb.handle', error: e?.message || String(e), sender })
        }
      }

      if (msg.hasMedia) {
        const media = await msg.downloadMedia()
        if (media && media.data) {
          const mime = media.mimetype || 'application/octet-stream'
          const mediaType = mime.startsWith('image/') ? 'image' : mime.startsWith('audio/') ? 'audio' : mime.startsWith('video/') ? 'video' : 'document'
          const userDigits = String(sender).replace(/@.+$/, '')
          const d = new Date(ts)
          const baseDir = path.resolve(process.env.STORAGE_DIR || 'storage', userDigits, String(d.getFullYear()), String(d.getMonth()+1))
          fs.mkdirSync(baseDir, { recursive: true })
          const filename = `${id}.${(mime.split('/')[1] || 'bin').toLowerCase()}`
          const outPath = path.join(baseDir, filename)
          const buf = Buffer.from(media.data, 'base64')
          fs.writeFileSync(outPath, buf)
          await insertMedia({ messageId: id, userJid: sender, type: mediaType, mime, filename, path: outPath, size: buf.length })
          const publicPath = `/storage/${userDigits}/${d.getFullYear()}/${d.getMonth()+1}/${filename}`
          const existing = inbox.find(x => x.id === id)
          if (existing) { existing.media = { type: mediaType, mime, path: publicPath, filename }; io.emit('wa:message', existing) }
          // Nota de voz entrante: procesar si backend está habilitado
          if (mediaType === 'audio' && !fromMe) {
            try {
              const okA = await handleCapatazInboundAudio(sock, { sender })
              if (!okA) {
                addLog({ type: 'info', scope: 'wa.autoreply.audio_wweb', note: 'Auto-reply audio no aplicado (delegado o deshabilitado)', sender })
              }
            } catch (e) {
              addLog({ type: 'error', scope: 'wa.autoreply.audio_wweb.handle', error: e?.message || String(e), sender })
            }
          }
        }
      }
    } catch (e) {
      console.error('Error al procesar mensaje wwebjs', e)
      addLog({ type: 'error', scope: 'wweb.message', error: e.message })
    }
  })

  sock.on('message_ack', async (msg, ack) => {
    try {
      const id = msg.id?._serialized
      const status = ack >= 3 ? 'read' : 'sent'
      io.emit('wa:message:update', { id, status })
      const existing = inbox.find(m => m.id === id)
      if (existing) {
        existing.status = status
        await insertMessage({ id, sender: existing.sender, text: existing.text, ts: existing.ts, fromMe: 1, status })
      }
    } catch (e) {}
  })

  sock.initialize()
}

app.get('/api/wa/status', (req, res) => {
  res.json({ ok: true, status: waStatus, user: connectedUser })
})

app.get('/api/wa/qr', async (req, res) => {
  try {
    if (waStatus === 'qr' && lastQrString) {
      const dataUrl = await qrcode.toDataURL(lastQrString)
      return res.json({ ok: true, status: waStatus, qr: dataUrl })
    }
    res.json({ ok: true, status: waStatus, qr: null })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.get('/api/wa/me', (req, res) => {
  res.json({ ok: true, user: connectedUser, phoneNumber: connectedUser?.phoneNumber || null })
})

app.get('/api/logs/latest', (req, res) => {
  const count = Math.max(1, Math.min(100, Number(req.query.count) || 5))
  const out = logs.slice(Math.max(0, logs.length - count))
  res.json({ ok: true, logs: out })
})

// ==== Settings: Gemini API Key (secure status + save) ====
app.get('/api/settings/gemini/apikey/status', (req, res) => {
  try {
    const key = process.env.GEMINI_API_KEY || ''
    const configured = !!key
    const masked = configured ? maskKey(key) : ''
    const https = require('https')
    if (!configured) return res.json({ ok: true, configured, masked, connected: false, reason: 'API Key no configurada' })
    const started = Date.now()
    const pathUrl = `/v1beta/models?key=${encodeURIComponent(key)}`
    const options = { hostname: 'generativelanguage.googleapis.com', port: 443, path: pathUrl, method: 'GET', headers: { 'Accept': 'application/json' } }
    const rq = https.request(options, (resp) => {
      let data = ''
      resp.on('data', (c) => { data += c })
      resp.on('end', () => {
        try {
          const j = JSON.parse(data || '{}')
          const connected = !j?.error
          const reason = connected ? '' : (j?.error?.message || 'Error de autenticación o permisos')
          const latencyMs = Date.now() - started
          res.json({ ok: true, configured, masked, connected, reason, latencyMs })
        } catch {
          res.json({ ok: true, configured, masked, connected: false, reason: 'Respuesta inválida del servidor' })
        }
      })
    })
    rq.on('error', () => res.json({ ok: true, configured, masked, connected: false, reason: 'Error de red' }))
    rq.end()
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.post('/api/settings/gemini/apikey', (req, res) => {
  try {
    const apiKey = String(req.body?.apiKey || '').trim()
    if (!apiKey || apiKey.length < 20) {
      return res.status(400).json({ ok: false, error: 'API Key inválida' })
    }
    const envPath = path.resolve(__dirname, '.env')
    const ok = setEnvVar(envPath, 'GEMINI_API_KEY', apiKey)
    if (!ok) return res.status(500).json({ ok: false, error: 'No se pudo escribir .env' })
    res.json({ ok: true, configured: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.post('/api/wa/start', async (req, res) => {
  try {
    await startWhatsApp(waStatus !== 'connected')
    res.json({ ok: true, status: waStatus })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})
app.get('/api/wa/start', async (req, res) => {
  try {
    await startWhatsApp(waStatus !== 'connected')
    res.json({ ok: true, status: waStatus })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.post('/api/wa/reconnect', async (req, res) => {
  try {
    await startWhatsApp(true)
    res.json({ ok: true, status: waStatus })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.post('/api/wa/disconnect', async (req, res) => {
  try {
    if (USE_WWEBJS && sock) {
      try { await sock.logout?.() } catch {}
      try { await sock.destroy?.() } catch {}
      sock = null
    } else {
      if (sock) { await sock.ws.close(); sock = null }
    }
    waStatus = 'disconnected'
    connectedUser = null
    lastQrString = null
    res.json({ ok: true, status: waStatus })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.get('/api/wa/activity', (req, res) => {
  res.json({ ok: true, unreadCount, lastMessage })
})

app.post('/api/wa/activity/reset', (req, res) => {
  unreadCount = 0
  res.json({ ok: true, unreadCount })
})

app.get('/api/wa/inbox', (req, res) => {
  res.json({ ok: true, messages: inbox, unreadCount })
})

app.post('/api/wa/inbox/clear', (req, res) => {
  resetInbox()
  res.json({ ok: true, unreadCount })
})

// Limpieza de almacenamiento y DB
app.post('/api/storage/cleanup', async (req, res) => {
  try {
    const { userJid, days, type } = req.body || {}
    const result = await cleanup({ userJid: userJid || null, olderThanDays: Number(days || 30), type: type || null })
    res.json({ ok: true, ...result })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.post('/api/wa/reset-auth', async (req, res) => {
  try {
    const fs = require('fs')
    const path = require('path')
    // Intentar detener cliente activo para liberar locks de credenciales
    try {
      if (USE_WWEBJS && sock) { try { await sock.logout?.() } catch {}; try { await sock.destroy?.() } catch {}; sock = null }
      else { if (sock) { try { await sock.ws.close() } catch {}; sock = null } }
    } catch {}
    // Limpiar credenciales de Baileys
    const dirBaileys = path.resolve('wa_auth')
    if (fs.existsSync(dirBaileys)) {
      for (const f of fs.readdirSync(dirBaileys)) { fs.unlinkSync(path.join(dirBaileys, f)) }
    }
    // Limpiar credenciales de whatsapp-web.js
    const dirWweb = path.resolve('wweb_auth')
    if (fs.existsSync(dirWweb)) {
      try {
        for (const f of fs.readdirSync(dirWweb)) { try { fs.unlinkSync(path.join(dirWweb, f)) } catch {} }
      } catch {
        // Si no se puede borrar archivos por lock, renombrar el directorio
        try {
          const bak = path.resolve(`wweb_auth.bak.${Date.now()}`)
          fs.renameSync(dirWweb, bak)
        } catch {}
      }
    }
    await startWhatsApp(true)
    res.json({ ok: true, status: waStatus })
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

app.post('/api/wa/pairing-code', async (req, res) => {
  try {
    const { phoneNumber } = req.body || {}
    if (!phoneNumber) return res.status(400).json({ ok: false, error: 'Falta phoneNumber' })
    if (!sock) await startWhatsApp(true)
    const digits = String(phoneNumber).replace(/\D/g, '')
    if (!digits) return res.status(400).json({ ok: false, error: 'Número inválido' })
    const code = await sock.requestPairingCode(digits)
    res.json({ ok: true, code })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.post('/api/wa/send', async (req, res) => {
  try {
    const { to, jid, message, quotedId, simulateTyping } = req.body || {}
    if (!message) return res.status(400).json({ ok: false, error: 'Falta mensaje' })
    if (!sock) return res.status(400).json({ ok: false, error: 'Socket no iniciado' })

    let targetJid = null
    const rawTo = String(jid || to || '')
    if (rawTo.includes('@')) {
      let candidate = rawTo
      // En Baileys, los JID de usuario pueden venir como 573XXXXXXX:device@s.whatsapp.net.
      // Para enviar mensajes, se debe usar el JID base sin sufijo :device.
      if (/@s\.whatsapp\.net$/.test(candidate) && candidate.includes(':')) {
        candidate = candidate.replace(/:\d+(?=@s\.whatsapp\.net)/, '')
      }
      targetJid = candidate
    } else {
      const digits = rawTo.replace(/\D/g, '')
      if (!digits) return res.status(400).json({ ok: false, error: 'Falta número' })
      const myPhone = (connectedUser?.phoneNumber || '').replace(/\D/g, '')
      let normalized = digits
      if (/^\d{10}$/.test(digits) && myPhone.startsWith('57')) {
        normalized = '57' + digits
      }
      targetJid = normalized + '@s.whatsapp.net'
    }

    // Resolver JIDs @lid a @s.whatsapp.net cuando sea posible
    let resolvedFromLid = false
    if (/@lid$/.test(targetJid)) {
      try {
        const core = String(targetJid).split('@')[0]
        const base = core.includes(':') ? core.split(':')[0] : core
        const digits = base.replace(/\D/g, '')
        if (digits && sock?.onWhatsApp) {
          const existsInfo = await sock.onWhatsApp(digits)
          if (Array.isArray(existsInfo) && existsInfo[0]?.exists && existsInfo[0]?.jid && /@s\.whatsapp\.net$/.test(existsInfo[0].jid)) {
            targetJid = existsInfo[0].jid.replace(/:\d+(?=@s\.whatsapp\.net)/, '')
            resolvedFromLid = true
          }
        }
      } catch {}
    }

    // Validar dominios permitidos: @s.whatsapp.net o @lid (cuando no se pudo resolver)
    if (!/@s\.whatsapp\.net$/.test(targetJid) && !/@lid$/.test(targetJid)) {
      return res.status(400).json({ ok: false, error: `JID inválido para enviar: ${targetJid}` })
    }

    // Construir quoted si viene quotedId y existe en inbox
    let sendOpts = {}
    if (quotedId) {
      const q = inbox.find(m => m.id === quotedId)
      if (q) {
        // Baileys requiere objeto quoted; wwebjs usa quotedMessageId
        if (USE_WWEBJS && WWebJS) {
          sendOpts.quotedMessageId = quotedId
        } else {
          sendOpts.quoted = {
            key: { id: q.id, remoteJid: q.sender, fromMe: !!q.fromMe },
            message: q.text ? { conversation: q.text } : { conversation: String(message) }
          }
        }
      }
    }

    console.log('[WA SEND]', { targetJid, message: String(message), quotedId, source: 'frontend', resolvedFromLid })
    addLog({ type: 'send', targetJid, message: String(message), quotedId, source: 'frontend', resolvedFromLid })

    // Simular "escribiendo" para dar sensación humana: retraso por palabra
    {
    const shouldType = simulateTyping === true // por defecto deshabilitado; solo si se pide explícitamente
      if (shouldType) {
        const wordCount = String(message).trim().split(/\s+/).filter(Boolean).length
        const PER_WORD_MS = Number(process.env.WA_TYPING_PER_WORD_MS || 500)
        const MAX_MS = Number(process.env.WA_TYPING_DELAY_MAX_MS || 120000)
        let keepAliveMs = Math.max(1000, wordCount * PER_WORD_MS)
        if (isFinite(MAX_MS) && MAX_MS > 0) keepAliveMs = Math.min(keepAliveMs, MAX_MS)
        const started = Date.now()
        addLog({ type: 'typing.sim', jid: targetJid, ms: keepAliveMs, wordCount })
        if (String(waStatus) !== 'connected') {
          await sleep(Math.min(keepAliveMs, 2000))
        } else if (USE_WWEBJS && WWebJS) {
          // wwebjs: intentar mostrar "escribiendo" sin interrumpir el retraso si falla
          try {
            const chat = await sock.getChatById(toCUs(targetJid))
            try { await chat.sendStateTyping() } catch {}
            while (Date.now() - started < keepAliveMs) {
              await sleep(1000)
              try { await chat.sendStateTyping() } catch {}
            }
            try { await chat.clearState() } catch {}
          } catch (e) {
            addLog({ type: 'warn', scope: 'typing.wweb', error: e?.message || String(e) })
            // Fallback: solo esperar el tiempo calculado
            while (Date.now() - started < keepAliveMs) { await sleep(250) }
          }
        } else {
          // Baileys: presence updates en bucle, pero siempre respetar el retraso
          try { await sock.presenceSubscribe(targetJid) } catch {}
          try { await sock.sendPresenceUpdate('composing', targetJid) } catch {}
          while (Date.now() - started < keepAliveMs) {
            await sleep(1000)
            try { await sock.sendPresenceUpdate('composing', targetJid) } catch {}
          }
          try { await sock.sendPresenceUpdate('paused', targetJid) } catch {}
        }
      }
    }
    // Para wwebjs enviar al chatId @c.us; para Baileys, @s.whatsapp.net
    const wjid = (USE_WWEBJS && WWebJS) ? toCUs(targetJid) : targetJid
    const MAX_RETRIES = 3
    let result = null
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        result = (USE_WWEBJS && WWebJS)
          ? await sock.sendMessage(wjid, String(message), sendOpts)
          : await sock.sendMessage(targetJid, { text: String(message) }, sendOpts)
        if (result) break
      } catch (e) {
        addLog({ type: 'error', scope: 'send.retry', attempt, targetJid, error: e?.message || String(e) })
        // Espera incremental ante fallos transitorios de conexión/sincronización
        await sleep(Math.min(1000 * attempt, 3000))
      }
    }
    if (!result) {
      return res.status(500).json({ ok: false, error: 'Falló el envío por WhatsApp tras reintentos' })
    }
    const ts = Date.now()
    const id = result?.key?.id || result?.id?._serialized || result?.id || `out-${ts}`
    const item = { id, sender: targetJid, text: String(message), ts, fromMe: true, status: 'sent' }
    inbox.push(item)
    if (inbox.length > 100) inbox.shift()
    io.emit('wa:message', item)
    addLog({ type: 'message', ...item })
    res.json({ ok: true, id, jid: targetJid })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
    addLog({ type: 'error', scope: 'send', error: e.message })
  }
})

app.post('/api/wa/send-media', upload.single('file'), async (req, res) => {
  try {
    const { to, jid, type, caption, ptt } = req.body || {}
    if (!sock) return res.status(400).json({ ok: false, error: 'Socket no iniciado' })
    if (!req.file) return res.status(400).json({ ok: false, error: 'Falta archivo' })
    const rawTo = String(jid || to || '')
    let targetJid = null
    if (rawTo.includes('@')) {
      let candidate = rawTo
      if (/@s\.whatsapp\.net$/.test(candidate) && candidate.includes(':')) {
        candidate = candidate.replace(/:\d+(?=@s\.whatsapp\.net)/, '')
      }
      targetJid = candidate
    } else {
      const digits = rawTo.replace(/\D/g, '')
      if (!digits) return res.status(400).json({ ok: false, error: 'Falta número' })
      const myPhone = (connectedUser?.phoneNumber || '').replace(/\D/g, '')
      let normalized = digits
      if (/^\d{10}$/.test(digits) && myPhone.startsWith('57')) normalized = '57' + digits
      targetJid = normalized + '@s.whatsapp.net'
    }

    const mime = req.file.mimetype || 'application/octet-stream'
    const original = req.file.originalname || 'file'
    const buf = req.file.buffer

    let content = {}
    if (type === 'image' || mime.startsWith('image/')) {
      content = { image: buf, caption: caption || undefined }
    } else if (type === 'video' || mime.startsWith('video/')) {
      content = { video: buf, caption: caption || undefined, mimetype: mime }
    } else if (type === 'audio' || mime.startsWith('audio/')) {
      content = { audio: buf, mimetype: mime, ptt: String(ptt) === 'true' }
    } else {
      content = { document: buf, mimetype: mime, fileName: original }
    }

    // Enviar al JID correcto según cliente
    const wjid = (USE_WWEBJS && WWebJS) ? toCUs(targetJid) : targetJid
    const result = await sock.sendMessage(wjid, content)
    const ts = Date.now()
    const id = result?.key?.id || result?.id?._serialized || result?.id || `out-${ts}`
    const item = { id, sender: targetJid, text: caption || (type || ''), ts, fromMe: true, status: 'sent' }

    // Persistir archivo en storage con esquema
    const userDigits = String(targetJid).replace(/@.+$/, '')
    const d = new Date(ts)
    const baseDir = path.resolve(process.env.STORAGE_DIR || 'storage', userDigits, String(d.getFullYear()), String(d.getMonth()+1))
    fs.mkdirSync(baseDir, { recursive: true })
    const extFromMime = (mime.split('/')[1] || 'bin').toLowerCase()
    const filename = `${id}.${extFromMime}`
    const outPath = path.join(baseDir, filename)
    fs.writeFileSync(outPath, buf)
    await insertMessage({ id, sender: targetJid, text: item.text || null, ts, fromMe: 1, status: 'sent' })
    await insertMedia({ messageId: id, userJid: targetJid, type: (type || (mime.startsWith('image/')?'image':mime.startsWith('audio/')?'audio':mime.startsWith('video/')?'video':'document')), mime, filename, path: outPath, size: buf.length })

    const publicPath = `/storage/${userDigits}/${d.getFullYear()}/${d.getMonth()+1}/${filename}`
    item.media = { type: (type || (mime.startsWith('image/')?'image':mime.startsWith('audio/')?'audio':mime.startsWith('video/')?'video':'document')), mime, path: publicPath, filename }

    inbox.push(item)
    if (inbox.length > 100) inbox.shift()
    io.emit('wa:message', item)
    addLog({ type: 'message', ...item })
    res.json({ ok: true, id, jid: targetJid })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
    addLog({ type: 'error', scope: 'send-media', error: e.message })
  }
})

// Enviar tarjeta de contacto (vCard)
app.post('/api/wa/send-contact', async (req, res) => {
  try {
    if (!sock) return res.status(400).json({ ok: false, error: 'Socket no iniciado' })
    const { to, jid, name, phone, org, vcard } = req.body || {}
    const rawTo = String(jid || to || '')
    let targetJid = null
    if (rawTo.includes('@')) {
      let candidate = rawTo
      // Normalizar JID de usuario: remover sufijo :device si viene presente
      if (/@s\.whatsapp\.net$/.test(candidate) && candidate.includes(':')) {
        candidate = candidate.replace(/:\d+(?=@s\.whatsapp\.net)/, '')
      }
      targetJid = candidate
    } else {
      const digits = rawTo.replace(/\D/g, '')
      if (!digits) return res.status(400).json({ ok: false, error: 'Falta número' })
      const myPhone = (connectedUser?.phoneNumber || '').replace(/\D/g, '')
      let normalized = digits
      if (/^\d{10}$/.test(digits) && myPhone.startsWith('57')) normalized = '57' + digits
      targetJid = normalized + '@s.whatsapp.net'
    }

    const rawPhone = String(phone || '').trim()
    const myDigits = (connectedUser?.phoneNumber || '').replace(/\D/g, '')
    const ccDefault = myDigits && myDigits.length > 10 ? myDigits.slice(0, myDigits.length - 10) : '57'
    const onlyDigits = rawPhone.replace(/\D/g, '')
    const candidate = onlyDigits.length === 10 ? (ccDefault + onlyDigits) : onlyDigits
    let digits = candidate
    // Verificar existencia en WhatsApp y usar JID real si está disponible
    try {
      const existsInfo = await sock.onWhatsApp(digits)
      if (Array.isArray(existsInfo) && existsInfo[0]?.exists && existsInfo[0]?.jid) {
        const userPart = String(existsInfo[0].jid).split('@')[0]
        if (userPart) digits = userPart
      }
    } catch {}
    const fullPhone = `+${digits}`
    const displayName = String(name || fullPhone || 'Contacto').trim() || 'Contacto'
    // Construir vCard si no viene una explícita. Uso de "N:" mejora compatibilidad en clientes.
    const makeVcard = () => {
      const partsName = String(name || '').trim().split(' ')
      const lastName = partsName.length > 1 ? partsName.slice(1).join(' ') : ''
      const firstName = partsName[0] || ''
      const telPretty = `+${digits}`
      const orgLine = String(org || '').trim() ? `ORG:${String(org || '').trim()}\n` : ''
      // Incluir FN y dos líneas TEL: con y sin waid para mayor compatibilidad
      return `BEGIN:VCARD\nVERSION:3.0\nFN:${String(name || '').trim()}\nN:${lastName};${firstName};;;\n${orgLine}TEL;type=CELL;type=VOICE;waid=${digits}:${telPretty}\nTEL;type=CELL:${telPretty}\nEND:VCARD`
    }
    const vcardOut = makeVcard()

    const content = { contacts: { displayName, contacts: [{ vcard: vcardOut }] } }
    const wjid = (USE_WWEBJS && WWebJS) ? toCUs(targetJid) : targetJid
    const result = await sock.sendMessage(wjid, content)
    const ts = Date.now()
    const id = result?.key?.id || result?.id?._serialized || result?.id || `out-${ts}`
    const item = { id, sender: targetJid, text: `[CONTACT:${displayName}]`, ts, fromMe: true, status: 'sent' }
    inbox.push(item)
    if (inbox.length > 100) inbox.shift()
    io.emit('wa:message', item)
    addLog({ type: 'message', ...item })
    await insertMessage({ id, sender: targetJid, text: item.text || null, ts, fromMe: 1, status: 'sent' })
    res.json({ ok: true, id, jid: targetJid })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
    addLog({ type: 'error', scope: 'send-contact', error: e.message })
  }
})

// Enviar ubicación (lat/lng) igual que WhatsApp
app.post('/api/wa/send-location', async (req, res) => {
  try {
    if (!sock) return res.status(400).json({ ok: false, error: 'Socket no iniciado' })
    const { to, jid, lat, lng, latitude, longitude, name, label, address } = req.body || {}

    // Construir JID destino
    const rawTo = String(jid || to || '')
    let targetJid = null
    if (rawTo.includes('@')) {
      targetJid = rawTo
    } else {
      const digits = rawTo.replace(/\D/g, '')
      if (!digits) return res.status(400).json({ ok: false, error: 'Falta número' })
      const myPhone = (connectedUser?.phoneNumber || '').replace(/\D/g, '')
      let normalized = digits
      if (/^\d{10}$/.test(digits) && myPhone.startsWith('57')) normalized = '57' + digits
      targetJid = normalized + '@s.whatsapp.net'
    }

    const la = Number(latitude ?? lat)
    const lo = Number(longitude ?? lng)
    if (!isFinite(la) || !isFinite(lo)) return res.status(400).json({ ok: false, error: 'Lat/Lng inválidos' })
    const title = String(name || label || '').trim()
    const addr = String(address || '').trim()

    // Enviar usando el cliente activo (wwebjs o Baileys)
    let result
    if (USE_WWEBJS && WWebJS) {
      try {
        const Location = WWebJS.Location
        const wjid = toCUs(targetJid)
        if (Location) {
          const content = new Location(la, lo, title || addr || 'Ubicación')
          result = await sock.sendMessage(wjid, content)
        } else {
          // Fallback: algunos builds aceptan objeto simple
          result = await sock.sendMessage(wjid, { location: { latitude: la, longitude: lo, name: title || undefined, address: addr || undefined } })
        }
      } catch (e) {
        // Si falla el modo Location, intentar payload alterno
        try {
          result = await sock.sendMessage(toCUs(targetJid), { location: { latitude: la, longitude: lo, name: title || undefined, address: addr || undefined } })
        } catch (e2) {
          throw e2
        }
      }
    } else {
      // Baileys
      const content = { location: { degreesLatitude: la, degreesLongitude: lo, name: title || undefined, address: addr || undefined } }
      result = await sock.sendMessage(targetJid, content)
    }

    const ts = Date.now()
    const id = result?.key?.id || result?.id?._serialized || `out-${ts}`
    const itemText = `[LOCATION:${title || `${la},${lo}`}]`
    const item = { id, sender: targetJid, text: itemText, ts, fromMe: true, status: 'sent', location: { lat: la, lng: lo, name: title || null, address: addr || null } }
    inbox.push(item)
    if (inbox.length > 100) inbox.shift()
    io.emit('wa:message', item)
    addLog({ type: 'message', ...item })
    try { await insertMessage({ id, sender: targetJid, text: itemText, ts, fromMe: 1, status: 'sent' }) } catch {}
    res.json({ ok: true, id, jid: targetJid })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
    addLog({ type: 'error', scope: 'send-location', error: e.message })
  }
})

// Gestión de contactos: crear/upsert solo con nombre y teléfono (CC + 10 dígitos)
app.post('/api/contacts', async (req, res) => {
  try {
    const { name, phone, countryCode, createOnly } = req.body || {}
    const cc = String(countryCode || '57').replace(/\D/g, '') || '57'
    const raw = String(phone || '').replace(/\D/g, '')
    if (!raw) return res.status(400).json({ ok: false, error: 'Falta teléfono' })

    // Reglas: exactamente 10 dígitos locales
    let normalized = null
    if (raw.length === 10) {
      normalized = cc + raw
    } else if (raw.length === (cc.length + 10) && raw.startsWith(cc)) {
      normalized = raw
    } else {
      return res.status(400).json({ ok: false, error: 'El teléfono debe tener exactamente 10 dígitos (local) con código de país' })
    }

    const jid = normalized + '@s.whatsapp.net'

    // Verificar duplicado por teléfono/jid
    try {
      const [existsRows] = await pool.query(`SELECT id FROM users WHERE jid = ? OR phone = ? LIMIT 1`, [jid, normalized])
      const exists = !!(existsRows && existsRows[0] && existsRows[0].id)
      if (exists && (createOnly === true || String(createOnly).toLowerCase() === 'true')) {
        return res.status(409).json({ ok: false, error: 'El contacto ya existe en la base de datos' })
      }
    } catch {}

    await upsertUser({ jid, phone: normalized, name: (name || '').trim() || null })
    res.json({ ok: true, jid, phone: normalized })
  } catch (e) {
    addLog({ type: 'error', scope: 'contacts.create', error: e?.message || String(e), code: e?.code || null })
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error desconocido' })
  }
})

// Listar contactos
app.get('/api/contacts', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    const labelId = req.query.labelId ? Number(req.query.labelId) : null
    const labelName = req.query.label ? String(req.query.label).trim() : null
    const labelNot = ['1','true','yes'].includes(String(req.query.labelNot || '').toLowerCase())
    const platform = String(req.query.platform || '').trim().toLowerCase() // 'whatsapp' | 'none'
    let sql = `SELECT u.id, u.jid, u.phone, u.name, u.platforms, u.created_at
      FROM users u`
    const params = []
    const where = []

    if (labelId || labelName) {
      if (labelNot) {
        // Exclusión: usuarios que NO tienen la etiqueta indicada
        if (labelId) {
          where.push(`NOT EXISTS (SELECT 1 FROM user_labels ul WHERE ul.user_id = u.id AND ul.label_id = ?)`)
          params.push(Number(labelId))
        } else {
          where.push(`NOT EXISTS (SELECT 1 FROM user_labels ul JOIN labels l ON l.id = ul.label_id WHERE ul.user_id = u.id AND l.name = ?)`)
          params.push(labelName)
        }
      } else {
        // Inclusión: usuarios que SÍ tienen la etiqueta indicada
        sql += ` INNER JOIN user_labels ul ON ul.user_id = u.id`
        if (labelName) {
          sql += ` INNER JOIN labels l ON l.id = ul.label_id`
          where.push(`l.name = ?`); params.push(labelName)
        } else {
          where.push(`ul.label_id = ?`); params.push(Number(labelId))
        }
      }
    }

    if (platform) {
      if (platform === 'none') {
        where.push(`(u.platforms IS NULL OR u.platforms = '')`)
      } else if (['whatsapp'].includes(platform)) {
        where.push(`u.platforms = ?`); params.push(platform)
      }
    }

    if (q) { where.push(`(u.name LIKE ? OR u.phone LIKE ?)`); params.push(`%${q}%`, `%${q}%`) }
    if (where.length) sql += ` WHERE ` + where.join(' AND ')
    sql += ' ORDER BY u.created_at DESC LIMIT 500'
    const [rows] = await pool.query(sql, params)
    res.json({ ok: true, contacts: rows })
  } catch (e) {
    addLog({ type: 'error', scope: 'contacts.list', error: e?.message || String(e), code: e?.code || null })
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error desconocido' })
  }
})

// Override de teléfono para un JID específico
// Útil cuando WhatsApp entrega JIDs en formato @lid o no estándar y se desea mostrar el número real
app.post('/api/contacts/override-phone', async (req, res) => {
  try {
    const { jid, phone, countryCode } = req.body || {}
    const rawJid = String(jid || '').trim()
    if (!rawJid || !/@/.test(rawJid)) {
      return res.status(400).json({ ok: false, error: 'JID inválido' })
    }
    const cc = String(countryCode || '57').replace(/\D/g, '') || '57'
    const digitsRaw = String(phone || '').replace(/\D/g, '')
    if (!digitsRaw) return res.status(400).json({ ok: false, error: 'Falta teléfono' })
    let normalized = null
    if (digitsRaw.length === 10) normalized = cc + digitsRaw
    else if (digitsRaw.length >= 11 && digitsRaw.length <= 15) normalized = digitsRaw
    else return res.status(400).json({ ok: false, error: 'Teléfono debe ser 10 dígitos (local) o CC+10' })

    await upsertUser({ jid: rawJid, phone: normalized, name: null })
    addLog({ type: 'contacts.override_phone', jid: rawJid, phone: normalized })
    res.json({ ok: true, jid: rawJid, phone: normalized })
  } catch (e) {
    addLog({ type: 'error', scope: 'contacts.override_phone', error: e?.message || String(e) })
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error desconocido' })
  }
})

// Importar contactos en lote (JSON). Cada item: { name, phone, countryCode, labels?: string[] }
// Opcional: applyLabelId / applyLabelName para aplicar una etiqueta a todos
app.post('/api/contacts/import', async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : []
    const applyLabelId = req.body?.applyLabelId ? Number(req.body.applyLabelId) : null
    const applyLabelName = req.body?.applyLabelName ? String(req.body.applyLabelName).trim() : null
    const applyPlatform = String(req.body?.applyPlatform || '').trim().toLowerCase() // 'whatsapp'
    if (items.length === 0) return res.status(400).json({ ok: false, error: 'Sin elementos para importar' })
    if (!['whatsapp'].includes(applyPlatform)) {
      return res.status(400).json({ ok: false, error: 'Debe seleccionar plataforma válida (WhatsApp)' })
    }

    let globalLabelId = null
    if (applyLabelId && applyLabelId > 0) {
      globalLabelId = applyLabelId
    } else if (applyLabelName) {
      await upsertLabel({ name: applyLabelName, description: null })
      const [rows] = await pool.query(`SELECT id FROM labels WHERE name = ?`, [applyLabelName])
      globalLabelId = rows[0]?.id || null
    }

    // Cache de etiquetas por nombre
    const labelCache = new Map()
    const getLabelIdByName = async (name) => {
      const n = String(name || '').trim()
      if (!n) return null
      if (labelCache.has(n)) return labelCache.get(n)
      await upsertLabel({ name: n, description: null })
      const [rows] = await pool.query(`SELECT id FROM labels WHERE name = ?`, [n])
      const id = rows[0]?.id || null
      if (id) labelCache.set(n, id)
      return id
    }

    let processed = 0
    let created = 0
    let updated = 0
    let labelLinks = 0
    let duplicatesCount = 0
    const errors = []

    for (let i = 0; i < items.length; i++) {
      const it = items[i] || {}
      try {
        const name = String(it.name || '').trim() || null
        const cc = String(it.countryCode || '57').replace(/\D/g, '') || '57'
        const raw = String(it.phone || '').replace(/\D/g, '')
        if (!raw) { errors.push({ index: i, error: 'Falta teléfono' }); continue }

        // Normalización: 10 dígitos locales + código país
        let normalized = null
        if (raw.length === 10) {
          normalized = cc + raw
        } else if (raw.length === (cc.length + 10) && raw.startsWith(cc)) {
          normalized = raw
        } else {
          errors.push({ index: i, error: 'Teléfono inválido (debe ser 10 dígitos locales con código país)' }); continue
        }

        // JID: solo WhatsApp
        const jid = (normalized + '@s.whatsapp.net')

        // Verificar existencia por teléfono/JID y saltar si ya existe
        let alreadyExists = false
        try {
          const [existsRows] = await pool.query(`SELECT id FROM users WHERE jid = ? OR phone = ? LIMIT 1`, [jid, normalized])
          alreadyExists = !!(existsRows && existsRows[0] && existsRows[0].id)
        } catch {}

        if (alreadyExists) {
          // No cargar/crear contactos que ya estén
          processed += 1
          duplicatesCount += 1
          continue
        }

        // Crear usuario nuevo con plataformas
        await upsertUser({ jid, phone: normalized, name, platforms: applyPlatform })
        processed += 1
        created += 1
        
        // Obtener id del usuario
        const [urows] = await pool.query(`SELECT id, name FROM users WHERE jid = ?`, [jid])
        const userId = urows[0]?.id || null
        if (!userId) { errors.push({ index: i, error: 'Usuario no localizado tras crear' }); continue }

        // Etiquetas por item
        const labelNames = Array.isArray(it.labels) ? it.labels : []
        const labelIds = []
        for (const ln of labelNames) {
          const lid = await getLabelIdByName(ln)
          if (lid) labelIds.push(lid)
        }
        // Etiqueta global
        if (globalLabelId) labelIds.push(globalLabelId)

        // Insertar vínculos user_labels, evitando duplicados
        for (const lid of labelIds) {
          try {
            await pool.query(`INSERT INTO user_labels (user_id, label_id) VALUES (?,?) ON DUPLICATE KEY UPDATE label_id = label_id`, [userId, lid])
            labelLinks += 1
          } catch {}
        }
      } catch (e) {
        errors.push({ index: i, error: e?.message || String(e) })
      }
    }

    res.json({ ok: true, summary: { processed, created, updated, labelLinks, duplicates: duplicatesCount, errorsCount: errors.length }, errors })
  } catch (e) {
    addLog({ type: 'error', scope: 'contacts.import', error: e?.message || String(e), code: e?.code || null })
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al importar contactos' })
  }
})

// Etiquetas por contacto
app.get('/api/contacts/:jid/labels', async (req, res) => {
  try {
    const jid = String(req.params.jid)
    const [urows] = await pool.query(`SELECT id FROM users WHERE jid = ?`, [jid])
    const userId = urows[0]?.id || null
    if (!userId) return res.status(404).json({ ok: false, error: 'Contacto no encontrado' })
    const [rows] = await pool.query(`SELECT l.id, l.name, l.description FROM user_labels ul INNER JOIN labels l ON l.id = ul.label_id WHERE ul.user_id = ? ORDER BY l.created_at DESC`, [userId])
    res.json({ ok: true, items: rows })
  } catch (e) {
    addLog({ type: 'error', scope: 'contacts.labels.list', error: e?.message || String(e), code: e?.code || null })
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error desconocido' })
  }
})

app.post('/api/contacts/:jid/labels', async (req, res) => {
  try {
    const jid = String(req.params.jid)
    const labelId = Number(req.body?.labelId)
    if (!labelId || labelId <= 0) return res.status(400).json({ ok: false, error: 'labelId inválido' })
    const [urows] = await pool.query(`SELECT id FROM users WHERE jid = ?`, [jid])
    const userId = urows[0]?.id || null
    if (!userId) return res.status(404).json({ ok: false, error: 'Contacto no encontrado' })
    await pool.query(`INSERT INTO user_labels (user_id, label_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE label_id = label_id`, [userId, labelId])
    res.json({ ok: true })
  } catch (e) {
    addLog({ type: 'error', scope: 'contacts.labels.assign', error: e?.message || String(e), code: e?.code || null })
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error desconocido' })
  }
})

app.delete('/api/contacts/:jid/labels/:labelId', async (req, res) => {
  try {
    const jid = String(req.params.jid)
    const labelId = Number(req.params.labelId)
    const [urows] = await pool.query(`SELECT id FROM users WHERE jid = ?`, [jid])
    const userId = urows[0]?.id || null
    if (!userId) return res.status(404).json({ ok: false, error: 'Contacto no encontrado' })
    await pool.query(`DELETE FROM user_labels WHERE user_id = ? AND label_id = ?`, [userId, labelId])
    res.json({ ok: true })
  } catch (e) {
    addLog({ type: 'error', scope: 'contacts.labels.delete', error: e?.message || String(e), code: e?.code || null })
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error desconocido' })
  }
})

// Campos personalizados por contacto
app.get('/api/contacts/:jid/fields', async (req, res) => {
  try {
    const jid = String(req.params.jid)
    const [urows] = await pool.query(`SELECT id FROM users WHERE jid = ?`, [jid])
    const userId = urows[0]?.id || null
    if (!userId) return res.status(404).json({ ok: false, error: 'Contacto no encontrado' })
    const [rows] = await pool.query(`
      SELECT f.id, f.name, f.description, f.type, ufv.value
      FROM fields f
      LEFT JOIN user_field_values ufv ON ufv.field_id = f.id AND ufv.user_id = ?
      ORDER BY f.created_at DESC
    `, [userId])
    res.json({ ok: true, items: rows })
  } catch (e) {
    addLog({ type: 'error', scope: 'contacts.fields.list', error: e?.message || String(e), code: e?.code || null })
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error desconocido' })
  }
})

app.post('/api/contacts/:jid/fields', async (req, res) => {
  try {
    const jid = String(req.params.jid)
    const fieldId = Number(req.body?.fieldId)
    const value = req.body?.value != null ? String(req.body.value) : null
    if (!fieldId || fieldId <= 0) return res.status(400).json({ ok: false, error: 'fieldId inválido' })
    const [urows] = await pool.query(`SELECT id FROM users WHERE jid = ?`, [jid])
    const userId = urows[0]?.id || null
    if (!userId) return res.status(404).json({ ok: false, error: 'Contacto no encontrado' })
    await pool.query(`INSERT INTO user_field_values (user_id, field_id, value) VALUES (?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)`, [userId, fieldId, value])
    res.json({ ok: true })
  } catch (e) {
    addLog({ type: 'error', scope: 'contacts.fields.assign', error: e?.message || String(e), code: e?.code || null })
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error desconocido' })
  }
})

app.delete('/api/contacts/:jid/fields/:fieldId', async (req, res) => {
  try {
    const jid = String(req.params.jid)
    const fieldId = Number(req.params.fieldId)
    const [urows] = await pool.query(`SELECT id FROM users WHERE jid = ?`, [jid])
    const userId = urows[0]?.id || null
    if (!userId) return res.status(404).json({ ok: false, error: 'Contacto no encontrado' })
    await pool.query(`DELETE FROM user_field_values WHERE user_id = ? AND field_id = ?`, [userId, fieldId])
    res.json({ ok: true })
  } catch (e) {
    addLog({ type: 'error', scope: 'contacts.fields.delete', error: e?.message || String(e), code: e?.code || null })
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error desconocido' })
  }
})

// Asignar plataforma a un contacto (solo whatsapp)
app.post('/api/contacts/:jid/platform', async (req, res) => {
  try {
    const jid = String(req.params.jid)
    const platform = String(req.body?.platform || '').trim().toLowerCase()
    if (!['whatsapp'].includes(platform)) {
      return res.status(400).json({ ok: false, error: 'Plataforma inválida (solo WhatsApp soportado)' })
    }
    const [urows] = await pool.query(`SELECT id FROM users WHERE jid = ?`, [jid])
    const userId = urows[0]?.id || null
    if (!userId) return res.status(404).json({ ok: false, error: 'Contacto no encontrado' })
    await pool.query(`UPDATE users SET platforms = ? WHERE id = ?`, [platform, userId])
    res.json({ ok: true, platform })
  } catch (e) {
    addLog({ type: 'error', scope: 'contacts.platform.assign', error: e?.message || String(e), code: e?.code || null })
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error desconocido' })
  }
})

// Eliminar contactos en lote
app.delete('/api/contacts', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(x => Number(x) > 0).map(x => Number(x)) : []
    const jids = Array.isArray(req.body?.jids) ? req.body.jids.filter(j => typeof j === 'string' && j.trim()).map(j => String(j).trim()) : []
    if (ids.length === 0 && jids.length === 0) return res.status(400).json({ ok: false, error: 'Debe proporcionar ids o jids' })

    let deleted = 0
    if (ids.length > 0) {
      const [result] = await pool.query(`DELETE FROM users WHERE id IN (${ids.map(() => '?').join(',')})`, ids)
      deleted += result?.affectedRows || 0
    }
    if (jids.length > 0) {
      const [result2] = await pool.query(`DELETE FROM users WHERE jid IN (${jids.map(() => '?').join(',')})`, jids)
      deleted += result2?.affectedRows || 0
    }
    addLog({ type: 'contacts.delete.bulk', count: deleted })
    res.json({ ok: true, deleted })
  } catch (e) {
    addLog({ type: 'error', scope: 'contacts.delete.bulk', error: e?.message || String(e), code: e?.code || null })
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al eliminar contactos' })
  }
})

// Descargar plantilla .xlsx para importación de contactos
// (removido duplicado) La definición de /api/contacts/template se encuentra más arriba.

// Etiquetas: listar y crear
app.get('/api/labels', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    const items = await listLabels({ q })
    res.json({ ok: true, items })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al listar etiquetas' })
  }
})

app.post('/api/labels', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim()
    const description = String(req.body?.description || '').trim() || null
    if (!name) return res.status(400).json({ ok: false, error: 'Nombre requerido' })
    if (name.length > 128) return res.status(400).json({ ok: false, error: 'Nombre demasiado largo' })
    await upsertLabel({ name, description })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al crear etiqueta' })
  }
})

app.put('/api/labels/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const name = String(req.body?.name || '').trim()
    const description = String(req.body?.description || '').trim() || null
    if (!id || id <= 0) return res.status(400).json({ ok: false, error: 'ID inválido' })
    if (!name) return res.status(400).json({ ok: false, error: 'Nombre requerido' })
    if (name.length > 128) return res.status(400).json({ ok: false, error: 'Nombre demasiado largo' })
    await updateLabel({ id, name, description })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al actualizar etiqueta' })
  }
})

app.delete('/api/labels/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id || id <= 0) return res.status(400).json({ ok: false, error: 'ID inválido' })
    await deleteLabel({ id })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al eliminar etiqueta' })
  }
})

// Campos: listar, crear, actualizar y eliminar
app.get('/api/fields', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    const folderId = req.query.folderId ? Number(req.query.folderId) : null
    const items = await listFields({ q, folderId })
    res.json({ ok: true, items })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al listar campos' })
  }
})

app.post('/api/fields', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim()
    const description = String(req.body?.description || '').trim() || null
    const folderId = req.body?.folderId ? Number(req.body.folderId) : null
    let type = String(req.body?.type || 'text')
    const allowed = ['text','number','date','datetime']
    if (!allowed.includes(type)) type = 'text'
    if (!name) return res.status(400).json({ ok: false, error: 'Nombre requerido' })
    if (name.length > 128) return res.status(400).json({ ok: false, error: 'Nombre demasiado largo' })
    await upsertField({ name, description, folderId, type })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al crear campo' })
  }
})

app.put('/api/fields/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const name = String(req.body?.name || '').trim()
    const description = String(req.body?.description || '').trim() || null
    const folderId = req.body?.folderId ? Number(req.body.folderId) : null
    let type = String(req.body?.type || 'text')
    const allowed = ['text','number','date','datetime']
    if (!allowed.includes(type)) type = 'text'
    if (!id || id <= 0) return res.status(400).json({ ok: false, error: 'ID inválido' })
    if (!name) return res.status(400).json({ ok: false, error: 'Nombre requerido' })
    if (name.length > 128) return res.status(400).json({ ok: false, error: 'Nombre demasiado largo' })
    await updateField({ id, name, description, folderId, type })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al actualizar campo' })
  }
})

app.delete('/api/fields/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id || id <= 0) return res.status(400).json({ ok: false, error: 'ID inválido' })
    await deleteField({ id })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al eliminar campo' })
  }
})

// CRUD carpetas de campos
app.get('/api/field-folders', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    const items = await listFolders({ q })
    res.json({ ok: true, items })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al listar carpetas' })
  }
})

app.post('/api/field-folders', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim()
    if (!name) return res.status(400).json({ ok: false, error: 'Nombre requerido' })
    if (name.length > 128) return res.status(400).json({ ok: false, error: 'Nombre demasiado largo' })
    await createFolder({ name })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al crear carpeta' })
  }
})

app.put('/api/field-folders/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const name = String(req.body?.name || '').trim()
    if (!id || id <= 0) return res.status(400).json({ ok: false, error: 'ID inválido' })
    if (!name) return res.status(400).json({ ok: false, error: 'Nombre requerido' })
    if (name.length > 128) return res.status(400).json({ ok: false, error: 'Nombre demasiado largo' })
    await updateFolder({ id, name })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al actualizar carpeta' })
  }
})

app.delete('/api/field-folders/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id || id <= 0) return res.status(400).json({ ok: false, error: 'ID inválido' })
    await deleteFolder({ id })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al eliminar carpeta' })
  }
})

// CRUD carpetas de flujos de campañas
app.get('/api/campaigns/flow-folders', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    // Por ahora solo listado sin filtro por q para carpetas
    const items = await listCampaignFolders()
    res.json({ ok: true, items })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al listar carpetas de flujos' })
  }
})

app.post('/api/campaigns/flow-folders', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim()
    const color = String(req.body?.color || '').trim()
    if (!name) return res.status(400).json({ ok: false, error: 'Nombre requerido' })
    if (name.length > 128) return res.status(400).json({ ok: false, error: 'Nombre demasiado largo' })
    const isHex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)
    const created = await createCampaignFolder({ name, color: isHex ? color.toLowerCase() : null })
    res.json({ ok: true, id: created?.id })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al crear carpeta de flujos' })
  }
})

app.put('/api/campaigns/flow-folders/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const name = String(req.body?.name || '').trim()
    const color = req.body?.color
    if (!id || id <= 0) return res.status(400).json({ ok: false, error: 'ID inválido' })
    if (!name) return res.status(400).json({ ok: false, error: 'Nombre requerido' })
    if (name.length > 128) return res.status(400).json({ ok: false, error: 'Nombre demasiado largo' })
    if (typeof color === 'undefined') {
      await updateCampaignFolder({ id, name })
    } else {
      const c = String(color || '').trim()
      const isHex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c)
      await updateCampaignFolder({ id, name, color: isHex ? c.toLowerCase() : null })
    }
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al actualizar carpeta de flujos' })
  }
})

app.delete('/api/campaigns/flow-folders/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id || id <= 0) return res.status(400).json({ ok: false, error: 'ID inválido' })
    await deleteCampaignFolder({ id })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al eliminar carpeta de flujos' })
  }
})

// CRUD flujos de campañas
app.get('/api/campaigns/flows', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    const folderId = req.query.folderId ? Number(req.query.folderId) : null
    const items = await listCampaignFlows({ q, folderId })
    res.json({ ok: true, items })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al listar flujos' })
  }
})

app.get('/api/campaigns/flows/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id || id <= 0) return res.status(400).json({ ok: false, error: 'ID inválido' })
    const item = await getCampaignFlow({ id })
    if (!item) return res.status(404).json({ ok: false, error: 'Flujo no encontrado' })
    res.json({ ok: true, item })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al obtener flujo' })
  }
})

app.post('/api/campaigns/flows', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim()
    const folderId = req.body?.folderId ? Number(req.body.folderId) : null
    if (!name) return res.status(400).json({ ok: false, error: 'Nombre requerido' })
    if (name.length > 128) return res.status(400).json({ ok: false, error: 'Nombre demasiado largo' })
    const flow = await createCampaignFlow({ name, folderId })
    // Crear carpeta dedicada para el flujo (Paso 1)
    try {
      const dir = getFlowUploadDir(flow)
      ensureDir(dir)
    } catch (e) {
      // No bloquear la creación del flujo si falló la carpeta
      addLog({ type: 'error', source: 'flow:create:mkdir', error: e?.message || String(e), flow })
    }
    res.json({ ok: true, item: flow })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al crear flujo' })
  }
})

app.put('/api/campaigns/flows/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const nameRaw = req.body?.name
    const folderIdRaw = req.body?.folderId
    const connectionsRaw = req.body?.connections
    if (!id || id <= 0) return res.status(400).json({ ok: false, error: 'ID inválido' })
    let name = null
    if (typeof nameRaw === 'string') {
      name = String(nameRaw).trim()
      if (name.length > 128) return res.status(400).json({ ok: false, error: 'Nombre demasiado largo' })
    }
    const before = await getCampaignFlow({ id })
    // Preparar conexiones: si cambió el nombre del flujo, reescribir prefijos de URLs
    let connectionsToSave = connectionsRaw
    try {
      if (connectionsRaw !== undefined && before && typeof name === 'string' && name && before.name !== name) {
        const oldFolder = path.basename(getFlowUploadDir(before))
        const after = { ...before, name }
        const newFolder = path.basename(getFlowUploadDir(after))
        if (oldFolder && newFolder && oldFolder !== newFolder) {
          const oldPrefix = `/storage/uploads/flows/${oldFolder}`
          const newPrefix = `/storage/uploads/flows/${newFolder}`
          const rewrite = (val) => {
            if (typeof val === 'string') return val.replaceAll(oldPrefix, newPrefix)
            if (Array.isArray(val)) return val.map(rewrite)
            if (val && typeof val === 'object') {
              const out = {}
              for (const k of Object.keys(val)) out[k] = rewrite(val[k])
              return out
            }
            return val
          }
          const obj = typeof connectionsRaw === 'string' ? JSON.parse(connectionsRaw) : connectionsRaw
          connectionsToSave = rewrite(obj)
        }
      }
    } catch (e) {
      addLog({ type: 'warn', source: 'flow:update:rewrite', error: e?.message || String(e), id, name })
    }
    await updateCampaignFlow({ id, name, folderId: folderIdRaw, connections: connectionsToSave })
    // Renombrar carpeta si cambió el nombre del flujo
    try {
      if (before && typeof name === 'string' && name && before.name !== name) {
        const oldDir = getFlowUploadDir(before)
        const after = { ...before, name }
        const newDir = getFlowUploadDir(after)
        if (oldDir !== newDir) {
          ensureDir(path.dirname(newDir))
          try { fs.renameSync(oldDir, newDir) } catch (err) {
            // Si no existe, crear la nueva
            ensureDir(newDir)
          }
        }
      }
    } catch (e) {
      addLog({ type: 'error', source: 'flow:update:rename', error: e?.message || String(e), id, name })
    }
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al actualizar flujo' })
  }
})

app.delete('/api/campaigns/flows/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id || id <= 0) return res.status(400).json({ ok: false, error: 'ID inválido' })
    // Borrar carpeta y archivos asociados al flujo
    try {
      const flow = await getCampaignFlow({ id })
      if (flow) {
        const dir = getFlowUploadDir(flow)
        try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
      }
    } catch (e) {
      addLog({ type: 'error', source: 'flow:delete:rm', error: e?.message || String(e), id })
    }
    await deleteCampaignFlow({ id })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al eliminar flujo' })
  }
})

// CRUD carpetas de flujos de Mensajes Masivos
app.get('/api/bulk/flow-folders', async (req, res) => {
  try {
    const items = await listBulkFolders()
    res.json({ ok: true, items })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al listar carpetas de mensajes masivos' })
  }
})

app.post('/api/bulk/flow-folders', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim()
    const color = String(req.body?.color || '').trim()
    if (!name) return res.status(400).json({ ok: false, error: 'Nombre requerido' })
    if (name.length > 128) return res.status(400).json({ ok: false, error: 'Nombre demasiado largo' })
    const isHex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)
    const created = await createBulkFolder({ name, color: isHex ? color.toLowerCase() : null })
    res.json({ ok: true, id: created?.id })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al crear carpeta de mensajes masivos' })
  }
})

app.put('/api/bulk/flow-folders/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const name = String(req.body?.name || '').trim()
    const color = req.body?.color
    if (!id || id <= 0) return res.status(400).json({ ok: false, error: 'ID inválido' })
    if (!name) return res.status(400).json({ ok: false, error: 'Nombre requerido' })
    if (name.length > 128) return res.status(400).json({ ok: false, error: 'Nombre demasiado largo' })
    if (typeof color === 'undefined') {
      await updateBulkFolder({ id, name })
    } else {
      const c = String(color || '').trim()
      const isHex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c)
      await updateBulkFolder({ id, name, color: isHex ? c.toLowerCase() : null })
    }
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al actualizar carpeta de mensajes masivos' })
  }
})

app.delete('/api/bulk/flow-folders/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id || id <= 0) return res.status(400).json({ ok: false, error: 'ID inválido' })
    await deleteBulkFolder({ id })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al eliminar carpeta de mensajes masivos' })
  }
})

// CRUD flujos de Mensajes Masivos
app.get('/api/bulk/flows', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    const folderId = req.query.folderId ? Number(req.query.folderId) : null
    const items = await listBulkFlows({ q, folderId })
    res.json({ ok: true, items })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al listar flujos de mensajes masivos' })
  }
})

app.get('/api/bulk/flows/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id || id <= 0) return res.status(400).json({ ok: false, error: 'ID inválido' })
    const item = await getBulkFlow({ id })
    if (!item) return res.status(404).json({ ok: false, error: 'Flujo no encontrado' })
    res.json({ ok: true, item })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al obtener flujo de mensajes masivos' })
  }
})

app.post('/api/bulk/flows', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim()
    const folderId = req.body?.folderId ? Number(req.body.folderId) : null
    if (!name) return res.status(400).json({ ok: false, error: 'Nombre requerido' })
    if (name.length > 128) return res.status(400).json({ ok: false, error: 'Nombre demasiado largo' })
    const flow = await createBulkFlow({ name, folderId })
    // Crear carpeta dedicada para el flujo
    try {
      const dir = getFlowUploadDir(flow)
      ensureDir(dir)
    } catch (e) {
      addLog({ type: 'error', source: 'bulk:flow:create:mkdir', error: e?.message || String(e), flow })
    }
    res.json({ ok: true, item: flow })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al crear flujo de mensajes masivos' })
  }
})

app.put('/api/bulk/flows/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const nameRaw = req.body?.name
    const folderIdRaw = req.body?.folderId
    const connectionsRaw = req.body?.connections
    if (!id || id <= 0) return res.status(400).json({ ok: false, error: 'ID inválido' })
    let name = null
    if (typeof nameRaw === 'string') {
      name = String(nameRaw).trim()
      if (name.length > 128) return res.status(400).json({ ok: false, error: 'Nombre demasiado largo' })
    }
    const before = await getBulkFlow({ id })
    let connectionsToSave = connectionsRaw
    try {
      if (connectionsRaw !== undefined && before && typeof name === 'string' && name && before.name !== name) {
        const oldFolder = path.basename(getFlowUploadDir(before))
        const after = { ...before, name }
        const newFolder = path.basename(getFlowUploadDir(after))
        if (oldFolder && newFolder && oldFolder !== newFolder) {
          const oldPrefix = `/storage/uploads/flows/${oldFolder}`
          const newPrefix = `/storage/uploads/flows/${newFolder}`
          const rewrite = (val) => {
            if (typeof val === 'string') return val.replaceAll(oldPrefix, newPrefix)
            if (Array.isArray(val)) return val.map(rewrite)
            if (val && typeof val === 'object') {
              const out = {}
              for (const k of Object.keys(val)) out[k] = rewrite(val[k])
              return out
            }
            return val
          }
          const obj = typeof connectionsRaw === 'string' ? JSON.parse(connectionsRaw) : connectionsRaw
          connectionsToSave = rewrite(obj)
        }
      }
    } catch (e) {
      addLog({ type: 'warn', source: 'bulk:flow:update:rewrite', error: e?.message || String(e), id, name })
    }
    await updateBulkFlow({ id, name, folderId: folderIdRaw, connections: connectionsToSave })
    try {
      if (before && typeof name === 'string' && name && before.name !== name) {
        const oldDir = getFlowUploadDir(before)
        const after = { ...before, name }
        const newDir = getFlowUploadDir(after)
        if (oldDir !== newDir) {
          ensureDir(path.dirname(newDir))
          try { fs.renameSync(oldDir, newDir) } catch (err) {
            ensureDir(newDir)
          }
        }
      }
    } catch (e) {
      addLog({ type: 'error', source: 'bulk:flow:update:rename', error: e?.message || String(e), id, name })
    }
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al actualizar flujo de mensajes masivos' })
  }
})

app.delete('/api/bulk/flows/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!id || id <= 0) return res.status(400).json({ ok: false, error: 'ID inválido' })
    try {
      const flow = await getBulkFlow({ id })
      if (flow) {
        const dir = getFlowUploadDir(flow)
        try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
      }
    } catch (e) {
      addLog({ type: 'error', source: 'bulk:flow:delete:rm', error: e?.message || String(e), id })
    }
    await deleteBulkFlow({ id })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al eliminar flujo de mensajes masivos' })
  }
})
// ======== Flujos de prueba y transmisiones masivas (demo) ========
// Helper para construir audiencia desde filtros sencillos (etiqueta incluir/excluir y búsqueda q)
async function buildAudience({ labelName = null, labelNot = false, q = '' } = {}) {
  try {
    let sql = `SELECT u.id, u.jid, u.phone, u.name, u.created_at FROM users u`
    const params = []
    const where = []
    if (labelName) {
      if (labelNot) {
        where.push(`NOT EXISTS (SELECT 1 FROM user_labels ul JOIN labels l ON l.id = ul.label_id WHERE ul.user_id = u.id AND l.name = ?)`)
        params.push(String(labelName).trim())
      } else {
        sql += ` INNER JOIN user_labels ul ON ul.user_id = u.id`
        sql += ` INNER JOIN labels l ON l.id = ul.label_id`
        where.push(`l.name = ?`)
        params.push(String(labelName).trim())
      }
    }
    if (q) { where.push(`(u.name LIKE ? OR u.phone LIKE ?)`); params.push(`%${q}%`, `%${q}%`) }
    if (where.length) sql += ` WHERE ` + where.join(' AND ')
    sql += ' ORDER BY u.created_at DESC LIMIT 1000'
    const [rows] = await pool.query(sql, params)
    return rows
  } catch (e) {
    addLog({ type: 'error', scope: 'audience.build', error: e?.message || String(e) })
    return []
  }
}

// ==== Programador simple de recurrencias (memoria) ====
// Nota: este planificador es en memoria. Si el servidor reinicia, las tareas se pierden.
// Para producción, se recomienda persistir reglas en DB y rehidratarlas al iniciar.
const recurringTasks = new Map() // id -> { cancel: fn, nextAt, recurrence }

function parseTimeHHMM(timeStr) {
  const s = String(timeStr || '').trim()
  const m = s.match(/^(\d{1,2}):(\d{2})/)
  const hh = m ? Math.max(0, Math.min(23, Number(m[1]))) : 0
  const mm = m ? Math.max(0, Math.min(59, Number(m[2]))) : 0
  return { hh, mm }
}

function clampDayOfMonth(year, monthIndex, day) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  return Math.max(1, Math.min(lastDay, Number(day) || 1))
}

function normalizeDow(day) {
  if (typeof day === 'number') return ((day % 7) + 7) % 7
  const s = String(day || '').toLowerCase().slice(0,3)
  const map = { sun:0, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6, dom:0, lun:1, mar:2, mie:3, mié:3, jue:4, vie:5, sab:6, sáb:6 }
  return map[s] ?? 0
}

function computeNextDaily({ time, startDate }, fromDate = new Date()) {
  const base = new Date(fromDate.getTime())
  const { hh, mm } = parseTimeHHMM(time)
  let candidate = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hh, mm, 0, 0)
  const nowMs = Date.now()
  if (startDate) {
    const sd = new Date(startDate)
    const sdCandidate = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate(), hh, mm, 0, 0)
    if (candidate.getTime() < sdCandidate.getTime()) candidate = sdCandidate
  }
  if (candidate.getTime() <= nowMs) candidate.setDate(candidate.getDate() + 1)
  return candidate
}

function computeNextWeekly({ time, startDate, daysOfWeek }, fromDate = new Date()) {
  const base = new Date(fromDate.getTime())
  const { hh, mm } = parseTimeHHMM(time)
  const selected = Array.isArray(daysOfWeek) ? Array.from(new Set(daysOfWeek.map(normalizeDow))).sort() : []
  if (!selected.length) return computeNextDaily({ time, startDate }, fromDate) // fallback: diario
  const nowMs = Date.now()
  const sd = startDate ? new Date(startDate) : null
  for (let i = 0; i < 14; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    if (selected.includes(d.getDay())) {
      d.setHours(hh, mm, 0, 0)
      if (sd) {
        const sdc = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate(), hh, mm, 0, 0)
        if (d.getTime() < sdc.getTime()) continue
      }
      if (d.getTime() > nowMs) return d
    }
  }
  // Fallback: siguiente semana en el primer día seleccionado
  const d = new Date(base)
  d.setDate(base.getDate() + 7)
  // Buscar el próximo día seleccionado a partir de +7
  for (let i = 0; i < 7; i++) {
    const x = new Date(d)
    x.setDate(d.getDate() + i)
    if (selected.includes(x.getDay())) { x.setHours(hh, mm, 0, 0); return x }
  }
  d.setHours(hh, mm, 0, 0)
  return d
}

function computeNextMonthly({ time, startDate, dayOfMonth, monthsOfYear }, fromDate = new Date()) {
  const base = new Date(fromDate.getTime())
  const { hh, mm } = parseTimeHHMM(time)
  let year = base.getFullYear()
  let month = base.getMonth()
  const selectedMonths = Array.isArray(monthsOfYear) ? Array.from(new Set(monthsOfYear.map(m => {
    const n = Number(m)
    return (n >= 1 && n <= 12) ? (n - 1) : ((n % 12 + 12) % 12)
  }))).sort((a,b)=>a-b) : []
  let day = clampDayOfMonth(year, month, dayOfMonth)
  let candidate = new Date(year, month, day, hh, mm, 0, 0)
  const nowMs = Date.now()
  if (startDate) {
    const sd = new Date(startDate)
    const sdc = new Date(sd.getFullYear(), sd.getMonth(), clampDayOfMonth(sd.getFullYear(), sd.getMonth(), dayOfMonth), hh, mm, 0, 0)
    if (candidate.getTime() < sdc.getTime()) candidate = sdc
  }
  // Buscar el siguiente mes válido considerando monthsOfYear (si se indicó)
  const sd = startDate ? new Date(startDate) : null
  for (let i = 0; i < 24; i++) {
    const m = (month + i) % 12
    const y = year + Math.floor((month + i) / 12)
    if (selectedMonths.length && !selectedMonths.includes(m)) continue
    const d = clampDayOfMonth(y, m, dayOfMonth)
    const cand = new Date(y, m, d, hh, mm, 0, 0)
    if (sd) {
      const sdc = new Date(sd.getFullYear(), sd.getMonth(), clampDayOfMonth(sd.getFullYear(), sd.getMonth(), dayOfMonth), hh, mm, 0, 0)
      if (cand.getTime() < sdc.getTime()) continue
    }
    if (cand.getTime() > nowMs) return cand
  }
  // Fallback: siguiente año en el primer mes válido (o el mes siguiente si no hay lista)
  const m2 = selectedMonths.length ? selectedMonths[0] : ((month + 1) % 12)
  const y2 = year + (selectedMonths.length ? (month > m2 ? 1 : 0) : Math.floor((month + 1) / 12))
  const d2 = clampDayOfMonth(y2, m2, dayOfMonth)
  return new Date(y2, m2, d2, hh, mm, 0, 0)
}

function scheduleRecurrence({ id, recurrence, doSend }) {
  if (!BACKEND_SENDING_ENABLED) {
    addLog({ type: 'warn', scope: 'bulk.recurring.disabled', id })
    return { cancel: () => {}, nextAt: null }
  }
  const type = String(recurrence?.type || 'none')
  const time = recurrence?.time || '09:00'
  const startDate = recurrence?.startDate || null
  const daysOfWeek = recurrence?.daysOfWeek || []
  const dayOfMonth = recurrence?.dayOfMonth || 1
  const monthsOfYear = recurrence?.monthsOfYear || null

  const computeNext = (fromDate) => {
    const payload = { time, startDate, daysOfWeek, dayOfMonth, monthsOfYear }
    if (type === 'daily') return computeNextDaily(payload, fromDate)
    if (type === 'weekly') return computeNextWeekly(payload, fromDate)
    if (type === 'monthly') return computeNextMonthly(payload, fromDate)
    // none: ejecutar una sola vez usando daily como fallback
    return computeNextDaily(payload, fromDate)
  }

  let timer = null
  const scheduleNext = (fromDate = new Date()) => {
    const nextDate = computeNext(fromDate)
    const delay = Math.max(0, nextDate.getTime() - Date.now())
    try { if (timer) clearTimeout(timer) } catch {}
    timer = setTimeout(async () => {
      try {
        const res = await doSend()
        addLog({ type: 'bulk.recurring.run', id, nextAt: nextDate.getTime(), result: res?.ok ? 'ok' : 'fail' })
      } catch (err) {
        addLog({ type: 'error', scope: 'bulk.recurring.run', id, error: err?.message || String(err) })
      } finally {
        scheduleNext(new Date(nextDate.getTime() + 60000)) // reprogramar desde 1 min después del último run
      }
    }, delay)
    recurringTasks.set(id, { cancel: () => { try { clearTimeout(timer) } catch {} }, nextAt: nextDate.getTime(), recurrence })
    addLog({ type: 'bulk.recurring.scheduled', id, nextAt: nextDate.getTime(), recurrence })
    return nextDate
  }

  const next = scheduleNext()
  return { cancel: () => { try { clearTimeout(timer) } catch {} }, nextAt: next.getTime() }
}

// Flujos de ejemplo para pruebas rápidas
const demoFlows = [
  { id: 'bienvenida', name: 'Bienvenida', message: 'Hola! 🎉 Bienvenido/a a nuestra comunidad.' },
  { id: 'recordatorio', name: 'Recordatorio', message: 'Recordatorio amistoso: no olvides nuestra actividad de hoy.' },
  { id: 'promocion', name: 'Promoción', message: 'Promo especial por tiempo limitado. ¡Escríbenos para más info!' },
]

app.get('/api/flows', async (req, res) => {
  try {
    res.json({ ok: true, items: demoFlows })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'Error al listar flujos' })
  }
})

// Iniciar transmisión masiva inmediata (demo). Solo WhatsApp por ahora.
app.post('/api/transmissions/start', async (req, res) => {
  try {
    if (!BACKEND_SENDING_ENABLED) {
      addLog({ type: 'warn', scope: 'bulk.start', note: 'Backend sending disabled, aborting transmission' })
      return res.status(403).json({ ok: false, error: 'Envío desde backend deshabilitado' })
    }
    const {
      name,
      platform = 'whatsapp',
      flowId,
      moduleType = '',
      filters = [],
      scheduleAt,
      scheduleMode = 'now', // 'now' | 'later'
      recurrence = { type: 'none' }, // { type: 'none'|'daily'|'weekly'|'monthly', daysOfWeek?, dayOfMonth?, time?, startDate? }
      delayMode = 'smart',
      smartDelayLevel = 'very_short',
      manualDelaySeconds = null,
    } = req.body || {}

    if (!name || !String(name).trim()) return res.status(400).json({ ok: false, error: 'Nombre requerido' })
    if (!flowId) return res.status(400).json({ ok: false, error: 'Seleccione un flujo' })

    // Cargar flujo real desde DB según el módulo
    let flow = null
    try {
      const flowIdNum = Number(flowId)
      if (String(moduleType) === 'campaigns') {
        flow = await getCampaignFlow({ id: flowIdNum })
      } else if (String(moduleType) === 'bulk') {
        flow = await getBulkFlow({ id: flowIdNum })
      } else {
        // Fallback: si no se indica módulo, intentar bulk y luego campañas
        flow = await getBulkFlow({ id: flowIdNum })
        if (!flow) flow = await getCampaignFlow({ id: flowIdNum })
      }
    } catch {}
    if (!flow) return res.status(400).json({ ok: false, error: 'Flujo inválido' })

    // Parsear steps del flujo y helpers de envío/renderizado
    const parseFlowSteps = (fl) => {
      try {
        const raw = fl?.connections
        const obj = typeof raw === 'string' ? JSON.parse(raw) : raw
        const steps = Array.isArray(obj?.steps) ? obj.steps : []
        return steps
      } catch { return [] }
    }
    const steps = parseFlowSteps(flow)

    // Helpers para sustitución de llaves con datos del contacto
    const stripAccents = (s) => s?.normalize ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : s
    const normKey = (s) => String(stripAccents(s || '')).toLowerCase().trim()
    const formatSpanishDate = (d = new Date()) => {
      try {
        const weekday = d.toLocaleDateString('es-ES', { weekday: 'long' })
        const day = d.getDate()
        const month = d.toLocaleDateString('es-ES', { month: 'long' })
        const year = d.getFullYear()
        const cap = (s) => (s && s[0]) ? (s[0].toUpperCase() + s.slice(1)) : s
        return `${cap(weekday)} ${day} de ${month} de ${year}`
      } catch {
        const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
        const wd = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado']
        const now = new Date()
        const weekday = wd[now.getDay()] || 'lunes'
        const day = now.getDate()
        const month = months[now.getMonth()] || 'enero'
        const year = now.getFullYear()
        const cap = (s) => (s && s[0]) ? (s[0].toUpperCase() + s.slice(1)) : s
        return `${cap(weekday)} ${day} de ${month} de ${year}`
      }
    }
    const getFieldsForUserId = async (userId) => {
      try {
        const [rows] = await pool.query(`
          SELECT f.name, ufv.value
          FROM fields f
          LEFT JOIN user_field_values ufv ON ufv.field_id = f.id AND ufv.user_id = ?
          ORDER BY f.created_at DESC
        `, [userId])
        return rows || []
      } catch { return [] }
    }
    const renderWithContact = (text, contact, fields) => {
      if (!text) return ''
      const map = new Map()
      if (Array.isArray(fields)) {
        for (const f of fields) {
          const key = normKey(f?.name)
          if (key) map.set(key, f?.value != null ? String(f.value) : '')
        }
      }
      const cName = contact?.name || ''
      const cPhone = contact?.phone || ''
      const cJid = contact?.jid || ''
      const fechaHoy = formatSpanishDate(new Date())
      const specialPairs = [
        ['nombre', cName],
        ['nombre cliente', cName],
        ['nombre del cliente', cName],
        ['cliente', cName],
        ['contacto', cName],
        ['telefono', cPhone],
        ['teléfono', cPhone],
        ['numero', cPhone],
        ['número', cPhone],
        ['jid', cJid],
        ['fecha', fechaHoy],
        ['fecha actual', fechaHoy],
        ['hoy', fechaHoy],
      ]
      for (const [k, v] of specialPairs) map.set(k, v || '')
      const getVal = (rawKey) => {
        const nk = normKey(rawKey)
        return map.has(nk) ? map.get(nk) : undefined
      }
      let out = String(text)
      out = out.replace(/\{\{\s*([^}]+?)\s*\}\}/gi, (m, p1) => {
        const val = getVal(p1)
        return val != null ? String(val) : m
      })
      out = out.replace(/\{\s*([^}]+?)\s*\}/gi, (m, p1) => {
        const val = getVal(p1)
        return val != null ? String(val) : m
      })
      return out
    }
    const guessMimeFromExt = (ext) => {
      const e = String(ext || '').toLowerCase()
      if (['jpg','jpeg','png','webp'].includes(e)) return `image/${e === 'jpg' ? 'jpeg' : e}`
      if (e === 'mp4') return 'video/mp4'
      if (e === 'mp3') return 'audio/mpeg'
      if (['pdf','json','xml','csv','txt','htm','html'].includes(e)) {
        const map = { pdf:'application/pdf', json:'application/json', xml:'application/xml', csv:'text/csv', txt:'text/plain', htm:'text/html', html:'text/html' }
        return map[e]
      }
      if (['doc','docx'].includes(e)) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      if (['xls','xlsx'].includes(e)) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      if (['ppt','pptx'].includes(e)) return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      if (['zip','7z'].includes(e)) return 'application/zip'
      return 'application/octet-stream'
    }
    const readStorageFile = (url) => {
      try {
        const s = String(url || '')
        if (!s.startsWith('/storage/')) return null
        const rel = s.replace(/^\/storage\//, '').replace(/\//g, path.sep)
        const base = path.resolve(process.env.STORAGE_DIR || 'storage')
        const abs = path.resolve(base, rel)
        const buf = fs.readFileSync(abs)
        const ext = path.extname(abs).replace('.', '')
        const mime = guessMimeFromExt(ext)
        return { buf, abs, mime, filename: path.basename(abs) }
      } catch { return null }
    }

    // Parseo simple de filtros: etiqueta incluye/excluye y q
    let labelName = null
    let labelNot = false
    let q = ''
    for (const f of Array.isArray(filters) ? filters : []) {
      const field = String(f.field || '').toLowerCase()
      const op = String(f.op || '').toLowerCase()
      const val = String(f.value || '').trim()
      if (field.includes('etiqueta') && val) {
        labelName = val
        labelNot = op.includes('no') || op.includes('excluye')
      }
      if (field.includes('buscar') && val) {
        q = val
      }
    }

    const audience = await buildAudience({ labelName, labelNot, q })
    const count = audience.length
    if (count === 0) return res.status(400).json({ ok: false, error: 'Audiencia vacía' })

    const id = `tx-${Date.now()}`
    const now = Date.now()
    const when = scheduleAt ? new Date(scheduleAt).getTime() : now

    // Registrar transmisión para control desde el panel
    transmissions.set(id, {
      id,
      status: 'running',
      total: count,
      sent: 0,
      failed: 0,
      failReasons: {},
      paused: false,
      stopped: false,
      createdAt: now,
      nextAt: null,
      name,
      platform,
      moduleType,
      flowId,
      // extra fields to show more info in UI
      delayMode,
      smartDelayLevel,
      manualDelaySeconds,
      filters,
    })

    // Configurar intervalos por segundos para reducir riesgo de bloqueo
    // smartDelayLevel: very_short(1–5s), short(5–20s), medium(20–50s), long(50–120s), very_long(120–300s)
    let manualCurrentSeconds = manualDelaySeconds
    const computeDelayMs = () => {
      if (String(delayMode) === 'smart') {
        let min = 1000, max = 5000
        switch (String(smartDelayLevel)) {
          case 'very_short':
            min = 1000; max = 5000; break
          case 'short':
            min = 5000; max = 20000; break
          case 'medium':
            min = 20000; max = 50000; break
          case 'long':
            min = 50000; max = 120000; break
          case 'very_long':
            min = 120000; max = 300000; break
          default:
            min = 1000; max = 5000; break
        }
        return Math.floor(min + Math.random() * (max - min))
      } else {
        // Jitter ±20% para evitar patrones constantes
        const secs = Number(manualCurrentSeconds)
        const base = (secs && secs > 0 ? secs : 2)
        const factor = 0.8 + Math.random() * 0.4 // 0.8–1.2
        const ms = Math.max(1000, Math.floor(base * factor * 1000))
        return ms
      }
    }

    const doSend = async () => {
      if (!BACKEND_SENDING_ENABLED) {
        addLog({ type: 'warn', scope: 'bulk.doSend', note: 'Backend sending disabled' })
        return { ok: false, error: 'Envío desde backend deshabilitado' }
      }
      let contactsSent = 0
      let messagesSent = 0
      if (platform === 'whatsapp') {
        if (!sock) { addLog({ type: 'error', scope: 'bulk.send', error: 'Socket no iniciado' }); return { ok: false, error: 'Socket no iniciado' } }
        // Límites por minuto y pausas por lotes según nivel
        const LIMITS = {
          very_short: { perMinute: 12, batchSize: 50, restMin: 60000, restMax: 180000 },
          short: { perMinute: 6, batchSize: 40, restMin: 90000, restMax: 240000 },
          medium: { perMinute: 3, batchSize: 30, restMin: 120000, restMax: 300000 },
          long: { perMinute: 2, batchSize: 20, restMin: 180000, restMax: 360000 },
          very_long: { perMinute: 1, batchSize: 15, restMin: 240000, restMax: 480000 },
        }
        const getLimits = (lvl) => LIMITS[String(lvl)] || LIMITS.very_short
        let currentSmartLevel = String(smartDelayLevel)
        let limits = getLimits(currentSmartLevel)
        let minuteStart = Date.now()
        let sentThisMinute = 0
        const sleep = (ms) => new Promise(r => setTimeout(r, ms))
        // Modo adaptativo: elevar nivel ante errores frecuentes
        let errorCount = 0
        let strictErrorCount = 0 // rate/flood patterns
        const escalateSmartLevel = () => {
          const order = ['very_short','short','medium','long','very_long']
          const idx = order.indexOf(currentSmartLevel)
          if (idx >= 0 && idx < order.length - 1) {
            currentSmartLevel = order[idx + 1]
            limits = getLimits(currentSmartLevel)
            addLog({ type: 'bulk.adapt.level', id, level: currentSmartLevel })
          }
        }
        const restAfterMs = 25 * 60 * 1000 // descanso tras 25 minutos continuos
        let continuousStart = Date.now()
        for (const u of audience) {
          const tx = transmissions.get(id)
          if (!tx) { addLog({ type: 'bulk.interrupted', id, reason: 'missing-transmission' }); break }
          if (tx.stopped) { addLog({ type: 'bulk.stopped', id }); break }
          while (tx.paused) { await sleep(500) }
          // Ventana por minuto: si alcanzamos el límite, esperar hasta que cambie la ventana
          const nowMs = Date.now()
          if (nowMs - minuteStart >= 60000) { minuteStart = nowMs; sentThisMinute = 0 }
          const cap = String(delayMode) === 'smart' ? limits.perMinute : 12
          while (sentThisMinute >= cap) {
            const remaining = Math.max(500, 60000 - (Date.now() - minuteStart))
            await sleep(remaining)
            const _now = Date.now()
            if (_now - minuteStart >= 60000) { minuteStart = _now; sentThisMinute = 0 }
          }
          // Descanso programado tras envío continuo
          if (Date.now() - continuousStart >= restAfterMs) {
        const rest = Math.floor(limits.restMin + Math.random() * (limits.restMax - limits.restMin))
        addLog({ type: 'bulk.rest', id, restMs: rest, afterMs: Date.now() - continuousStart })
        await sleep(rest)
        continuousStart = Date.now()
      }
      let jid = u.jid || (String(u.phone || '').replace(/\D/g, '') + '@s.whatsapp.net')
      // Normalizar JID de usuario: remover sufijo :device si viene presente
      if (/@s\.whatsapp\.net$/.test(jid) && jid.includes(':')) {
        jid = jid.replace(/:\d+(?=@s\.whatsapp\.net)/, '')
      }
      try {
        // Obtener campos personalizados una sola vez por contacto
        const fields = await getFieldsForUserId(u.id)
            let userHadSuccess = false
            for (const s of steps) {
              const type = String(s?.type || '').toLowerCase()
              const payload = s?.payload || {}
              if (type === 'texto') {
                const raw = payload?.text || ''
                const text = renderWithContact(raw, u, fields)
                if (text) {
                  await sock.sendMessage(jid, { text })
                  messagesSent += 1; sentThisMinute += 1
                  userHadSuccess = true
                }
              } else if (['imagen','video','archivo','audio'].includes(type) && payload?.url) {
                const info = readStorageFile(payload.url)
                if (!info) throw new Error('Archivo no disponible en almacenamiento')
                let content = {}
                const caption = payload?.caption ? renderWithContact(payload.caption, u, fields) : undefined
                if (type === 'imagen') {
                  content = { image: info.buf, caption }
                } else if (type === 'video') {
                  content = { video: info.buf, caption, mimetype: info.mime }
                } else if (type === 'audio') {
                  content = { audio: info.buf, mimetype: info.mime }
                } else {
                  content = { document: info.buf, mimetype: info.mime, fileName: info.filename }
                }
                await sock.sendMessage(jid, content)
                messagesSent += 1; sentThisMinute += 1
                userHadSuccess = true
              } else if (type === 'contacto') {
                const rawPhone = String(payload?.phone || '').trim()
                const myDigits = (connectedUser?.phoneNumber || '').replace(/\D/g, '')
                const ccDefault = myDigits && myDigits.length > 10 ? myDigits.slice(0, myDigits.length - 10) : '57'
                const onlyDigits = rawPhone.replace(/\D/g, '')
                const candidate = onlyDigits.length === 10 ? (ccDefault + onlyDigits) : onlyDigits
                let digits = candidate
                try {
                  const existsInfo = await sock.onWhatsApp(digits)
                  if (Array.isArray(existsInfo) && existsInfo[0]?.exists && existsInfo[0]?.jid) {
                    const userPart = String(existsInfo[0].jid).split('@')[0]
                    if (userPart) digits = userPart
                  }
                } catch {}
                const displayNameRaw = String(payload?.name || '').trim()
                const displayName = renderWithContact(displayNameRaw || `+${digits}`, u, fields)
                const orgLineRaw = String(payload?.org || '').trim()
                const orgLine = orgLineRaw ? `ORG:${renderWithContact(orgLineRaw, u, fields)}\n` : ''
                const partsName = displayName.split(' ')
                const lastName = partsName.length > 1 ? partsName.slice(1).join(' ') : ''
                const firstName = partsName[0] || ''
                const telPretty = `+${digits}`
                const vcardOut = `BEGIN:VCARD\nVERSION:3.0\nFN:${displayName}\nN:${lastName};${firstName};;;\n${orgLine}TEL;type=CELL;type=VOICE;waid=${digits}:${telPretty}\nTEL;type=CELL:${telPretty}\nEND:VCARD`
                const content = { contacts: { displayName, contacts: [{ vcard: vcardOut }] } }
                await sock.sendMessage(jid, content)
                messagesSent += 1; sentThisMinute += 1
                userHadSuccess = true
              } else if (type === 'retraso') {
                const seconds = Number(payload?.seconds || 0)
                if (seconds > 0) await sleep(seconds * 1000)
              }
              // Pausa breve entre pasos y control de lotes (sin demora principal por paso)
              await sleep(500)
              if (String(delayMode) === 'smart' && limits.batchSize && messagesSent % limits.batchSize === 0) {
                const rest = Math.floor(limits.restMin + Math.random() * (limits.restMax - limits.restMin))
                await sleep(rest)
              }
            }
            // incrementar enviados por contacto al finalizar sus pasos si se envió algo
            if (userHadSuccess) {
              contactsSent += 1
              const t = transmissions.get(id); if (t) { t.sent = contactsSent }
              // Demora principal entre contactos (smart/manual)
              await new Promise(r => setTimeout(r, computeDelayMs()))
            }
          } catch (e) {
            addLog({ type: 'error', scope: 'bulk.wa.send', error: e?.message || String(e), jid })
            errorCount += 1
            const msg = String(e?.message || '').toLowerCase()
            if (msg.includes('flood') || msg.includes('rate') || msg.includes('retry') || msg.includes('too many') || msg.includes('limit')) {
              strictErrorCount += 1
            }
            if (String(delayMode) === 'smart') {
              if (strictErrorCount >= 1 || errorCount % 3 === 0) { escalateSmartLevel() }
            } else {
              if (strictErrorCount >= 1 || errorCount % 3 === 0) {
                const base = Number(manualCurrentSeconds) || 2
                manualCurrentSeconds = Math.min(base * 1.5, base + 60)
                addLog({ type: 'bulk.adapt.manual', id, seconds: manualCurrentSeconds })
              }
            }
            const t = transmissions.get(id)
            if (t) {
              t.failed += 1
              const reason = (msg.includes('not') && msg.includes('whatsapp')) ? 'no-whatsapp'
                : (msg.includes('invalid') ? 'invalid-number' : 'send-error')
              t.failReasons[reason] = (t.failReasons[reason] || 0) + 1
            }
          }
        }
        addLog({ type: 'bulk.completed', id, platform, count, sent: contactsSent })
        const t = transmissions.get(id); if (t) { t.status = 'completed'; t.sent = contactsSent }
        return { ok: true, id, platform, count, sent: contactsSent }
      } else {
        return { ok: false, error: 'Plataforma no soportada' }
      }
    }

    const recType = String(recurrence?.type || 'none')
    if (String(scheduleMode) !== 'later' || !scheduleAt || when <= now) {
      const t = transmissions.get(id); if (t) { t.status = 'running' }
      const result = await doSend()
      if (!result.ok) return res.status(400).json(result)
      return res.json(result)
    } else {
      if (recType === 'none') {
        const delay = Math.max(0, when - now)
        const handle = setTimeout(async () => { await doSend() }, delay)
        scheduledTimers.set(id, handle)
        const t = transmissions.get(id); if (t) { t.status = 'scheduled'; t.nextAt = when }
        addLog({ type: 'bulk.scheduled', id, at: when, count, delayMode, smartDelayLevel, manualDelaySeconds })
        return res.json({ ok: true, id, scheduledAt: when, count })
      } else {
        const { nextAt } = scheduleRecurrence({ id, recurrence, doSend })
        const t = transmissions.get(id); if (t) { t.status = 'recurring'; t.nextAt = nextAt }
        addLog({ type: 'bulk.recurring.enabled', id, count, recurrence })
        return res.json({ ok: true, id, recurring: true, nextAt, count, recurrence })
      }
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'Error al iniciar transmisión' })
  }
})

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000
httpServer.listen(PORT, () => { console.log('WhatsApp API on port', PORT); addLog({ type: 'server', message: `WhatsApp API on port ${PORT}` }) }) // nodemon touch

// Healthcheck mínimo para diagnósticos rápidos
app.get('/api/health', (req, res) => {
  try {
    res.json({ ok: true, status: 'up', port: PORT })
  } catch (_) {
    res.status(500).json({ ok: false })
  }
})

// Descargar plantilla .xlsx para importación de contactos
app.get('/api/contacts/template', async (req, res) => {
  try {
    const tplPath = path.resolve(__dirname, '../Ejemplo.xlsx')
    if (!fs.existsSync(tplPath)) {
      return res.status(404).json({ ok: false, error: 'Plantilla no encontrada' })
    }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="PlantillaContactos.xlsx"')
    const stream = fs.createReadStream(tplPath)
    stream.on('error', (err) => {
      res.status(500).json({ ok: false, error: err?.message || String(err) || 'Error al enviar plantilla' })
    })
    stream.pipe(res)
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al generar plantilla' })
  }
})

// Logs ante eventos del servidor HTTP
httpServer.on('error', (err) => {
  addLog({ type: 'server.error', message: err?.message || String(err) })
})
httpServer.on('close', () => {
  addLog({ type: 'server', message: 'HTTP server closed' })
})

// Eliminado: integración de Telegram (bot y MTProto)

// Subida genérica de imágenes para campañas (hasta 2MB por archivo, jpg/png/webp)
// Subida de imágenes: soporta flowId de campañas o masivos
app.post('/api/upload/images', upload.array('files', 10), async (req, res) => {
  try {
    const files = Array.isArray(req.files) ? req.files : []
    if (files.length === 0) return res.status(400).json({ ok: false, error: 'Faltan archivos' })
    const allowed = ['image/jpeg','image/png','image/webp']
    const out = []
    // Usar carpeta por flujo si viene flowId
    const flowId = req.body?.flowId ? Number(req.body.flowId) : null
    let baseDir = null
    let publicBase = null
    if (flowId && flowId > 0) {
      let flow = await getCampaignFlow({ id: flowId })
      if (!flow) flow = await getBulkFlow({ id: flowId })
      if (!flow) return res.status(400).json({ ok: false, error: 'Flujo inválido' })
      baseDir = getFlowUploadDir(flow)
      fs.mkdirSync(baseDir, { recursive: true })
      const folderName = path.basename(baseDir)
      publicBase = `/storage/uploads/flows/${folderName}`
    } else {
      // Fallback: año/mes
      const now = new Date()
      baseDir = path.resolve(process.env.STORAGE_DIR || 'storage', 'uploads', String(now.getFullYear()), String(now.getMonth()+1))
      fs.mkdirSync(baseDir, { recursive: true })
      publicBase = `/storage/uploads/${now.getFullYear()}/${now.getMonth()+1}`
    }
    for (const f of files) {
      const mime = f.mimetype || 'application/octet-stream'
      if (!allowed.includes(mime)) return res.status(400).json({ ok: false, error: 'Tipo de archivo no permitido' })
      if ((f.size || 0) > 2 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'Archivo demasiado grande (máx 2MB)' })
      const ext = (mime.split('/')[1] || 'bin').toLowerCase()
      const filename = `${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`
      const outPath = path.join(baseDir, filename)
      fs.writeFileSync(outPath, f.buffer)
      const url = `${publicBase}/${filename}`
      const original = String(f.originalname || '')
      out.push({ url, filename, mime, size: f.size || 0, original })
    }
    return res.json({ ok: true, files: out })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'Error al subir imágenes' })
  }
})

// Subida genérica de videos para campañas (hasta 15MB por archivo, mp4)
// Subida de videos: soporta flowId de campañas o masivos
app.post('/api/upload/videos', upload.array('files', 4), async (req, res) => {
  try {
    const files = Array.isArray(req.files) ? req.files : []
    if (files.length === 0) return res.status(400).json({ ok: false, error: 'Faltan archivos' })
    const allowed = ['video/mp4']
    const out = []
    // Usar carpeta por flujo si viene flowId
    const flowId = req.body?.flowId ? Number(req.body.flowId) : null
    let baseDir = null
    let publicBase = null
    if (flowId && flowId > 0) {
      let flow = await getCampaignFlow({ id: flowId })
      if (!flow) flow = await getBulkFlow({ id: flowId })
      if (!flow) return res.status(400).json({ ok: false, error: 'Flujo inválido' })
      baseDir = getFlowUploadDir(flow)
      fs.mkdirSync(baseDir, { recursive: true })
      const folderName = path.basename(baseDir)
      publicBase = `/storage/uploads/flows/${folderName}`
    } else {
      // Fallback: año/mes
      const now = new Date()
      baseDir = path.resolve(process.env.STORAGE_DIR || 'storage', 'uploads', String(now.getFullYear()), String(now.getMonth()+1))
      fs.mkdirSync(baseDir, { recursive: true })
      publicBase = `/storage/uploads/${now.getFullYear()}/${now.getMonth()+1}`
    }
    for (const f of files) {
      const mime = f.mimetype || 'application/octet-stream'
      if (!allowed.includes(mime)) return res.status(400).json({ ok: false, error: 'Tipo de archivo no permitido (solo .mp4)' })
      if ((f.size || 0) > 15 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'Archivo demasiado grande (máx 15MB)' })
      const ext = 'mp4'
      const filename = `${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`
      const outPath = path.join(baseDir, filename)
      fs.writeFileSync(outPath, f.buffer)
      const url = `${publicBase}/${filename}`
      const original = String(f.originalname || '')
      out.push({ url, filename, mime, size: f.size || 0, original })
    }
    return res.json({ ok: true, files: out })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'Error al subir videos' })
  }
})

// Subida genérica de archivos para campañas (hasta 15MB por archivo)
// Tipos admitidos: pdf, doc, docx, htm, html, json, xml, txt, csv, zip, 7z, xls, xlsx, ppt, pptx
// Subida de archivos: soporta flowId de campañas o masivos
app.post('/api/upload/files', upload.array('files', 10), async (req, res) => {
  try {
    const files = Array.isArray(req.files) ? req.files : []
    if (files.length === 0) return res.status(400).json({ ok: false, error: 'Faltan archivos' })
    const allowedExt = new Set(['pdf','doc','docx','htm','html','json','xml','txt','csv','zip','7z','xls','xlsx','ppt','pptx'])
    const out = []
    // Usar carpeta por flujo si viene flowId
    const flowId = req.body?.flowId ? Number(req.body.flowId) : null
    let baseDir = null
    let publicBase = null
    if (flowId && flowId > 0) {
      let flow = await getCampaignFlow({ id: flowId })
      if (!flow) flow = await getBulkFlow({ id: flowId })
      if (!flow) return res.status(400).json({ ok: false, error: 'Flujo inválido' })
      baseDir = getFlowUploadDir(flow)
      fs.mkdirSync(baseDir, { recursive: true })
      const folderName = path.basename(baseDir)
      publicBase = `/storage/uploads/flows/${folderName}`
    } else {
      // Fallback: año/mes
      const now = new Date()
      baseDir = path.resolve(process.env.STORAGE_DIR || 'storage', 'uploads', String(now.getFullYear()), String(now.getMonth()+1))
      fs.mkdirSync(baseDir, { recursive: true })
      publicBase = `/storage/uploads/${now.getFullYear()}/${now.getMonth()+1}`
    }
    for (const f of files) {
      const size = f.size || 0
      if (size > 15 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'Archivo demasiado grande (máx 15MB)' })
      const original = String(f.originalname || '')
      const ext = (path.extname(original) || '').toLowerCase().replace('.', '') || 'bin'
      if (!allowedExt.has(ext)) return res.status(400).json({ ok: false, error: 'Tipo de archivo no permitido' })
      const filename = `${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`
      const outPath = path.join(baseDir, filename)
      fs.writeFileSync(outPath, f.buffer)
      const url = `${publicBase}/${filename}`
      const mime = f.mimetype || 'application/octet-stream'
      out.push({ url, filename, mime, size, original })
    }
    return res.json({ ok: true, files: out })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'Error al subir archivos' })
  }
})

// Subida genérica de audios para campañas (hasta 15MB por archivo, mp3)
// Subida de audios: soporta flowId de campañas o masivos
app.post('/api/upload/audios', upload.array('files', 6), async (req, res) => {
  try {
    const files = Array.isArray(req.files) ? req.files : []
    if (files.length === 0) return res.status(400).json({ ok: false, error: 'Faltan archivos' })
    const allowedMime = new Set(['audio/mpeg']) // mp3
    const out = []
    const flowId = req.body?.flowId ? Number(req.body.flowId) : null
    let baseDir = null
    let publicBase = null
    if (flowId && flowId > 0) {
      let flow = await getCampaignFlow({ id: flowId })
      if (!flow) flow = await getBulkFlow({ id: flowId })
      if (!flow) return res.status(400).json({ ok: false, error: 'Flujo inválido' })
      baseDir = getFlowUploadDir(flow)
      fs.mkdirSync(baseDir, { recursive: true })
      const folderName = path.basename(baseDir)
      publicBase = `/storage/uploads/flows/${folderName}`
    } else {
      const now = new Date()
      baseDir = path.resolve(process.env.STORAGE_DIR || 'storage', 'uploads', String(now.getFullYear()), String(now.getMonth()+1))
      fs.mkdirSync(baseDir, { recursive: true })
      publicBase = `/storage/uploads/${now.getFullYear()}/${now.getMonth()+1}`
    }
    for (const f of files) {
      const size = f.size || 0
      if (size > 15 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'Archivo demasiado grande (máx 15MB)' })
      const mime = f.mimetype || 'application/octet-stream'
      if (!allowedMime.has(mime)) return res.status(400).json({ ok: false, error: 'Tipo de archivo no permitido (solo .mp3)' })
      const filename = `${Date.now()}_${Math.random().toString(36).slice(2,8)}.mp3`
      const outPath = path.join(baseDir, filename)
      fs.writeFileSync(outPath, f.buffer)
      const url = `${publicBase}/${filename}`
      out.push({ url, filename, mime, size })
    }
    return res.json({ ok: true, files: out })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'Error al subir audios' })
  }
})

// Listar transmisiones
app.get('/api/transmissions', (req, res) => {
  try {
    const items = Array.from(transmissions.values()).map(getTransmissionSnapshot)
    res.json({ ok: true, items })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'Error al listar transmisiones' })
  }
})

// Detalle de una transmisión
app.get('/api/transmissions/:id', (req, res) => {
  try {
    const id = String(req.params.id || '')
    const t = transmissions.get(id)
    if (!t) return res.status(404).json({ ok: false, error: 'Transmisión no encontrada' })
    res.json({ ok: true, item: getTransmissionSnapshot(t) })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'Error al obtener transmisión' })
  }
})

// Pausar
app.post('/api/transmissions/:id/pause', (req, res) => {
  try {
    const id = String(req.params.id || '')
    const t = transmissions.get(id)
    if (!t) return res.status(404).json({ ok: false, error: 'Transmisión no encontrada' })
    t.paused = true
    t.status = 'paused'
    res.json({ ok: true, item: getTransmissionSnapshot(t) })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'Error al pausar transmisión' })
  }
})

// Reanudar
app.post('/api/transmissions/:id/resume', (req, res) => {
  try {
    const id = String(req.params.id || '')
    const t = transmissions.get(id)
    if (!t) return res.status(404).json({ ok: false, error: 'Transmisión no encontrada' })
    t.paused = false
    t.status = 'running'
    res.json({ ok: true, item: getTransmissionSnapshot(t) })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'Error al reanudar transmisión' })
  }
})

// Parar
app.post('/api/transmissions/:id/stop', (req, res) => {
  try {
    const id = String(req.params.id || '')
    const t = transmissions.get(id)
    if (!t) return res.status(404).json({ ok: false, error: 'Transmisión no encontrada' })
    t.stopped = true
    t.paused = false
    t.status = 'stopped'
    // Cancelar programaciones si existen
    const handle = scheduledTimers.get(id)
    if (handle) { try { clearTimeout(handle) } catch {} ; scheduledTimers.delete(id) }
    const rec = recurringTasks.get(id)
    if (rec && rec.cancel) { try { rec.cancel() } catch {} ; recurringTasks.delete(id) }
    res.json({ ok: true, item: getTransmissionSnapshot(t) })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'Error al parar transmisión' })
  }
})

// Eliminar
app.delete('/api/transmissions/:id', (req, res) => {
  try {
    const id = String(req.params.id || '')
    const t = transmissions.get(id)
    if (!t) return res.status(404).json({ ok: false, error: 'Transmisión no encontrada' })
    // Si está activa, detenerla
    t.stopped = true
    const handle = scheduledTimers.get(id)
    if (handle) { try { clearTimeout(handle) } catch {} ; scheduledTimers.delete(id) }
    const rec = recurringTasks.get(id)
    if (rec && rec.cancel) { try { rec.cancel() } catch {} ; recurringTasks.delete(id) }
    transmissions.delete(id)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'Error al eliminar transmisión' })
  }
})

// Exportar contactos a Excel (xlsx) con filtros
app.get('/api/contacts/export', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    const labelId = req.query.labelId ? Number(req.query.labelId) : null
    const labelName = req.query.label ? String(req.query.label).trim() : null
    const platform = String(req.query.platform || '').trim().toLowerCase() // 'whatsapp' | 'none'

    let sql = `SELECT u.id, u.jid, u.phone, u.name, u.platforms, u.created_at FROM users u`
    const params = []
    const where = []

    if (labelId || labelName) {
      sql += ` INNER JOIN user_labels ul ON ul.user_id = u.id`
      if (labelName) {
        sql += ` INNER JOIN labels l ON l.id = ul.label_id`
        where.push(`l.name = ?`); params.push(labelName)
      } else {
        where.push(`ul.label_id = ?`); params.push(Number(labelId))
      }
    }

    if (platform) {
      if (platform === 'none') {
        where.push(`(u.platforms IS NULL OR u.platforms = '')`)
      } else if (['whatsapp'].includes(platform)) {
        where.push(`u.platforms = ?`); params.push(platform)
      }
    }

    if (q) { where.push(`(u.name LIKE ? OR u.phone LIKE ?)`); params.push(`%${q}%`, `%${q}%`) }
    if (where.length) sql += ` WHERE ` + where.join(' AND ')
    sql += ' ORDER BY u.created_at DESC LIMIT 2000'
    const [rows] = await pool.query(sql, params)

    const data = rows.map(r => ({
      Nombre: r.name || '',
      Telefono: r.phone || '',
      JID: r.jid || '',
      Plataforma: r.platforms || '',
      Creado: new Date(r.created_at).toISOString().slice(0,19).replace('T',' ')
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Contactos')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const fname = `contactos_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}.xlsx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`)
    res.send(buf)
  } catch (e) {
    addLog({ type: 'error', scope: 'contacts.export', error: e?.message || String(e), code: e?.code || null })
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al exportar contactos' })
  }
})

// Etiquetas masivas para múltiples contactos
// Body: { jids: string[], labelIds: number[], mode?: 'add' | 'replace' }
app.post('/api/contacts/labels/bulk', async (req, res) => {
  try {
    const jids = Array.isArray(req.body?.jids) ? req.body.jids.filter(j => typeof j === 'string' && j.trim()).map(j => String(j).trim()) : []
    const labelIds = Array.isArray(req.body?.labelIds) ? req.body.labelIds.map(x => Number(x)).filter(n => n > 0) : []
    const mode = String(req.body?.mode || 'add').toLowerCase() === 'replace' ? 'replace' : 'add'
    if (jids.length === 0) return res.status(400).json({ ok: false, error: 'Debe proporcionar jids' })
    if (labelIds.length === 0) return res.status(400).json({ ok: false, error: 'Debe seleccionar al menos una etiqueta' })

    let affectedUsers = 0
    let linksCreated = 0
    for (const jid of jids) {
      const [urows] = await pool.query(`SELECT id FROM users WHERE jid = ?`, [jid])
      const userId = urows[0]?.id || null
      if (!userId) continue
      affectedUsers += 1
      if (mode === 'replace') {
        try { await pool.query(`DELETE FROM user_labels WHERE user_id = ?`, [userId]) } catch {}
      }
      for (const lid of labelIds) {
        try {
          await pool.query(`INSERT INTO user_labels (user_id, label_id) VALUES (?,?) ON DUPLICATE KEY UPDATE label_id = label_id`, [userId, lid])
          linksCreated += 1
        } catch {}
      }
    }
    addLog({ type: 'contacts.labels.bulk', users: affectedUsers, labels: labelIds.length, mode })
    res.json({ ok: true, summary: { users: affectedUsers, labelsApplied: labelIds.length, mode, linksCreated } })
  } catch (e) {
    addLog({ type: 'error', scope: 'contacts.labels.bulk', error: e?.message || String(e), code: e?.code || null })
    res.status(500).json({ ok: false, error: e?.message || String(e) || 'Error al aplicar etiquetas masivas' })
  }
})

// ==== Gemini Super Agent: config, knowledge, and socratic ask ====
app.get('/api/gemini/super/config', async (req, res) => {
  try {
    const agent = await getGeminiAgent({ agentType: 'super' })
    res.json({ ok: true, agent: agent || null })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.post('/api/gemini/super/config', async (req, res) => {
  try {
    const { name, domain, basePrompt, active } = req.body || {}
    const agent = await upsertGeminiAgent({ name, agentType: 'super', domain, basePrompt, active: active ? 1 : 0 })
    res.json({ ok: true, agent })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ==== Capataz: configuración visual ====
app.get('/api/capataz/config', async (req, res) => {
  try {
    const cfg = await getCapatazConfig()
    res.json({ ok: true, config: cfg || null })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'Error obteniendo configuración' })
  }
})

app.put('/api/capataz/config', async (req, res) => {
  try {
    const { enabled, greetingText, requireFullName, autoLabels, interestRoutes, kbText, agentName } = req.body || {}
    // Saneamiento ligero
    const labels = Array.isArray(autoLabels) ? autoLabels.map(x => Number(x)).filter(x => x > 0) : []
    const routes = Array.isArray(interestRoutes) ? interestRoutes.map((r) => ({
      name: String(r?.name || '').trim(),
      keywords: Array.isArray(r?.keywords) ? r.keywords.map(k => String(k).trim()).filter(k => k) : [],
      agentId: r?.agentId ? Number(r.agentId) : null,
    })).filter(r => r.name && r.keywords.length) : []
    const cfg = await upsertCapatazConfig({
      enabled: enabled ? 1 : 0,
      greetingText: String(greetingText || '').trim() || null,
      requireFullName: requireFullName ? 1 : 0,
      autoLabels: labels,
      interestRoutes: routes,
      kbText: typeof kbText === 'string' ? kbText : null,
      agentName: String(agentName || '').trim() || null,
    })
    setCapatazConfigCache(cfg)
    res.json({ ok: true, config: cfg })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'Error actualizando configuración' })
  }
})

// ==== Recepcionista: configuración independiente ====
app.get('/api/recepcionista/config', async (req, res) => {
  try {
    const cfg = await getRecepcionistaConfig()
    setRecepcionistaConfigCache(cfg)
    res.json({ ok: true, config: cfg || null })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'Error obteniendo configuración de recepcionista' })
  }
})

app.put('/api/recepcionista/config', async (req, res) => {
  try {
    const { agentName, kbText, voiceId } = req.body || {}
    const cfg = await upsertRecepcionistaConfig({
      agentName: typeof agentName === 'string' ? agentName : null,
      kbText: typeof kbText === 'string' ? kbText : null,
      voiceId: typeof voiceId === 'string' ? voiceId : null,
    })
    setRecepcionistaConfigCache(cfg)
    res.json({ ok: true, config: cfg })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'Error actualizando configuración de recepcionista' })
  }
})

// Recepcionista: CRUD de tarjetas de asignación
app.get('/api/recepcionista/assignments', async (req, res) => {
  try {
    const list = await listRecepcionistaAssignments()
    res.json({ ok: true, items: list })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'Error listando tarjetas' })
  }
})

app.get('/api/recepcionista/assignments/:id', async (req, res) => {
  try {
    const item = await getRecepcionistaAssignment({ id: req.params.id })
    if (!item) return res.status(404).json({ ok: false, error: 'No encontrado' })
    res.json({ ok: true, item })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'Error obteniendo tarjeta' })
  }
})

app.post('/api/recepcionista/assignments', async (req, res) => {
  try {
    const { id, title, program, agentId, tagId } = req.body || {}
    if (!title || !String(title).trim()) return res.status(400).json({ ok: false, error: 'Falta título' })
    const item = await upsertRecepcionistaAssignment({ id, title, program, agentId, tagId })
    res.json({ ok: true, item })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'Error creando/actualizando tarjeta' })
  }
})

app.delete('/api/recepcionista/assignments/:id', async (req, res) => {
  try {
    const r = await deleteRecepcionistaAssignment({ id: req.params.id })
    if (!r?.ok) return res.status(400).json({ ok: false, error: r?.error || 'No se pudo eliminar' })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'Error eliminando tarjeta' })
  }
})

app.post('/api/gemini/super/knowledge', async (req, res) => {
  try {
    const agent = await getGeminiAgent({ agentType: 'super' })
    if (!agent) {
      return res.status(400).json({ ok: false, error: 'Super Agente no configurado' })
    }
    const { author, content, tags } = req.body || {}
    if (!content || String(content).trim().length < 5) {
      return res.status(400).json({ ok: false, error: 'Contenido insuficiente' })
    }
    const ins = await insertGeminiKnowledge({ agentId: agent.id, author, content, tags })
    res.json({ ok: true, id: ins.id })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.get('/api/gemini/super/knowledge', async (req, res) => {
  try {
    const agent = await getGeminiAgent({ agentType: 'super' })
    if (!agent) {
      return res.json({ ok: true, items: [] })
    }
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50))
    const items = await listGeminiKnowledge({ agentId: agent.id, limit })
    res.json({ ok: true, items })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

async function callGeminiGenerateText({ prompt }) {
  const key = process.env.GEMINI_API_KEY || ''
  if (!key) throw new Error('GEMINI_API_KEY no configurada')
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  const https = require('https')
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }]}]
  })
  const urlPath = `/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`
  const options = {
    hostname: 'generativelanguage.googleapis.com',
    port: 443,
    path: urlPath,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  }
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          const j = JSON.parse(data)
          // Propagar errores claros desde la API de Gemini si existen
          if (j && j.error) {
            const msg = j.error.message || 'Error al llamar a Gemini'
            return reject(new Error(msg))
          }
          const text = j?.candidates?.[0]?.content?.parts?.[0]?.text || ''
          if (!text) return reject(new Error('Respuesta vacía de Gemini'))
          resolve(text)
        } catch (e) {
          reject(e)
        }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

app.post('/api/gemini/super/ask', async (req, res) => {
  try {
    const agent = await getGeminiAgent({ agentType: 'super' })
    if (!agent) {
      return res.status(400).json({ ok: false, error: 'Super Agente no configurado' })
    }
    const { context = '', goal = 'Perfeccionar el canal de ventas' } = req.body || {}
    const items = await listGeminiKnowledge({ agentId: agent.id, limit: 25 })
    const knowledgeText = items.map(i => `- ${i.content}`).join('\n')
    const base = agent.base_prompt || ''
    const prompt = [
      'Eres un agente socrático de ventas. Tu objetivo es guiar al equipo haciendo preguntas específicas y accionables para perfeccionar el canal de ventas.',
      base ? `Instrucciones del Super Agente: ${base}` : '',
      `Conocimiento recopilado hasta ahora:\n${knowledgeText || '(sin conocimiento aún)'}`,
      context ? `Contexto adicional del equipo:\n${String(context).trim()}` : '',
      'Genera UNA pregunta concreta, clara y breve, que haga avanzar la calidad del material de ventas. No incluyas respuestas, solo la pregunta.'
    ].filter(Boolean).join('\n\n')
    let question
    try {
      question = await callGeminiGenerateText({ prompt })
    } catch (e) {
      // Fallback simple si falla Gemini
      question = '¿Cuál es la propuesta de valor específica para nuestro segmento prioritario y cómo la comunicamos en el primer contacto?'
  }
  res.json({ ok: true, question })
} catch (e) {
  res.status(500).json({ ok: false, error: e.message })
}
})

// ==== Gemini: proxy de chat (generateContent) ====
app.post('/api/gemini/chat/generate', async (req, res) => {
  try {
    const key = process.env.GEMINI_API_KEY || ''
    if (!key) return res.status(400).json({ ok: false, error: 'GEMINI_API_KEY no configurada' })
    const { contents = [], systemInstruction = undefined, generationConfig = { temperature: 0.5, maxOutputTokens: 2048 } } = req.body || {}
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
    const https = require('https')
    const payload = { contents }
    if (systemInstruction !== undefined && systemInstruction !== null) payload.systemInstruction = systemInstruction
    if (generationConfig !== undefined && generationConfig !== null) payload.generationConfig = generationConfig
    const body = JSON.stringify(payload)
    const pathUrl = `/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: pathUrl,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }
    const reqG = https.request(options, (resp) => {
      let data = ''
      resp.on('data', (chunk) => { data += chunk })
      resp.on('end', () => {
        try {
          const j = JSON.parse(data)
          // Si la API devolvió un error, propagarlo al cliente
          if (j && j.error) {
            const code = j.error.code || 400
            const msg = j.error.message || 'Error al llamar a Gemini'
            return res.status(code >= 400 && code < 600 ? code : 400).json({ ok: false, error: msg, details: j.error })
          }
          const text = j?.candidates?.[0]?.content?.parts?.[0]?.text || ''
          const promptFeedback = j?.promptFeedback || null
          if (!text && promptFeedback) return res.json({ ok: true, text: '', promptFeedback })
          if (!text) return res.status(500).json({ ok: false, error: 'Respuesta vacía de Gemini' })
          res.json({ ok: true, text, promptFeedback: promptFeedback || null })
        } catch (e) {
          res.status(500).json({ ok: false, error: e.message || String(e) })
        }
      })
    })
    reqG.on('error', (err) => {
      res.status(500).json({ ok: false, error: err?.message || String(err) })
    })
    reqG.write(body)
    reqG.end()
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) })
  }
})

// ==== Gemini: listar modelos disponibles (diagnóstico) ====
app.get('/api/gemini/models', async (req, res) => {
  try {
    const key = process.env.GEMINI_API_KEY || ''
    if (!key) return res.status(400).json({ ok: false, error: 'GEMINI_API_KEY no configurada' })
    const https = require('https')
    const pathUrl = `/v1beta/models?key=${encodeURIComponent(key)}`
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: pathUrl,
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    }
    const reqG = https.request(options, (resp) => {
      let data = ''
      resp.on('data', (chunk) => { data += chunk })
      resp.on('end', () => {
        try {
          const j = JSON.parse(data)
          if (j && j.error) {
            const code = j.error.code || 400
            const msg = j.error.message || 'Error al listar modelos'
            return res.status(code >= 400 && code < 600 ? code : 400).json({ ok: false, error: msg, details: j.error })
          }
          const models = Array.isArray(j?.models) ? j.models.map(m => ({ name: m.name, displayName: m.displayName, supportedGenerationMethods: m.supportedGenerationMethods })) : []
          res.json({ ok: true, models })
        } catch (e) {
          res.status(500).json({ ok: false, error: e.message || String(e) })
        }
      })
    })
    reqG.on('error', (err) => {
      res.status(500).json({ ok: false, error: err?.message || String(err) })
    })
    reqG.end()
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) })
  }
})

// ==== LLM unificado: chat/generate para múltiples proveedores ====
function mapGeminiContentsToTextArray(contents = []) {
  const arr = []
  for (const m of Array.isArray(contents) ? contents : []) {
    const role = m?.role || 'user'
    const text = (m?.parts || []).map(p => p?.text || '').join('\n')
    arr.push({ role, text })
  }
  return arr
}

async function callOpenAIChat({ messages = [], system = undefined, temperature = 0.5, maxTokens = 2048 }) {
  const key = process.env.OPENAI_API_KEY || ''
  if (!key) throw new Error('OPENAI_API_KEY no configurada')
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const https = require('https')
  const oaiMsgs = []
  if (system) oaiMsgs.push({ role: 'system', content: system })
  for (const m of messages) {
    const role = m.role === 'model' ? 'assistant' : (m.role === 'user' ? 'user' : 'user')
    oaiMsgs.push({ role, content: m.text })
  }
  const body = JSON.stringify({ model, messages: oaiMsgs, temperature, max_tokens: maxTokens })
  const options = {
    hostname: 'api.openai.com', port: 443, path: '/v1/chat/completions', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, 'Content-Length': Buffer.byteLength(body) }
  }
  return new Promise((resolve, reject) => {
    const rq = https.request(options, (resp) => {
      let data = ''
      resp.on('data', (c) => { data += c })
      resp.on('end', () => {
        try {
          const j = JSON.parse(data)
          if (j.error) return reject(new Error(j.error.message || 'Error OpenAI'))
          const text = j?.choices?.[0]?.message?.content || ''
          if (!text) return reject(new Error('Respuesta vacía de OpenAI'))
          resolve({ text })
        } catch (e) { reject(e) }
      })
    })
    rq.on('error', reject)
    rq.write(body)
    rq.end()
  })
}

async function callAnthropicChat({ messages = [], system = undefined, temperature = 0.5, maxTokens = 2048 }) {
  const key = process.env.ANTHROPIC_API_KEY || ''
  if (!key) throw new Error('ANTHROPIC_API_KEY no configurada')
  const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest'
  const https = require('https')
  const antMsgs = []
  for (const m of messages) {
    const role = m.role === 'model' ? 'assistant' : (m.role === 'user' ? 'user' : 'user')
    antMsgs.push({ role, content: m.text })
  }
  const payload = { model, messages: antMsgs, max_tokens: maxTokens, temperature }
  if (system) payload.system = system
  const body = JSON.stringify(payload)
  const options = {
    hostname: 'api.anthropic.com', port: 443, path: '/v1/messages', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body) }
  }
  return new Promise((resolve, reject) => {
    const rq = https.request(options, (resp) => {
      let data = ''
      resp.on('data', (c) => { data += c })
      resp.on('end', () => {
        try {
          const j = JSON.parse(data)
          if (j.error) return reject(new Error(j.error?.message || 'Error Anthropic'))
          const text = j?.content?.[0]?.text || j?.content?.[0]?.content?.[0]?.text || ''
          if (!text) return reject(new Error('Respuesta vacía de Anthropic'))
          resolve({ text })
        } catch (e) { reject(e) }
      })
    })
    rq.on('error', reject)
    rq.write(body)
    rq.end()
  })
}

async function callGeminiUnified({ contents = [], systemInstruction = undefined, temperature = 0.5, maxTokens = 2048 }) {
  const key = process.env.GEMINI_API_KEY || ''
  if (!key) throw new Error('GEMINI_API_KEY no configurada')
  const primaryModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || 'gemini-1.5-flash'
  const https = require('https')

  // Normaliza: Gemini exige que la última entrada (single-turn) sea de rol 'user'.
  let normalized = Array.isArray(contents) ? contents.slice() : []
  if (normalized.length === 1 && String(normalized[0]?.role || '') !== 'user') {
    normalized = [{ role: 'user', parts: Array.isArray(normalized[0]?.parts) ? normalized[0].parts : [] }]
  } else if (normalized.length > 1 && String(normalized[normalized.length - 1]?.role || '') !== 'user') {
    // Agrega un mensaje de usuario vacío para cumplir el requisito sin alterar el contexto.
    normalized.push({ role: 'user', parts: [{ text: '' }] })
  }

  const buildBody = () => {
    const payload = { contents: normalized }
    if (systemInstruction !== undefined && systemInstruction !== null) payload.systemInstruction = systemInstruction
    payload.generationConfig = { temperature, maxOutputTokens: maxTokens }
    return JSON.stringify(payload)
  }

  function requestModel(model) {
    const body = buildBody()
    const pathUrl = `/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`
    const options = { hostname: 'generativelanguage.googleapis.com', port: 443, path: pathUrl, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }
    return new Promise((resolve, reject) => {
      const reqG = https.request(options, (resp) => {
        let data = ''
        resp.on('data', (chunk) => { data += chunk })
        resp.on('end', () => {
          try {
            const j = JSON.parse(data)
            if (j && j.error) return reject(new Error(j.error.message || 'Error Gemini'))
            const candidate = j?.candidates?.[0] || {}
            const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []
            const mergedText = parts.map(p => (typeof p?.text === 'string' ? p.text : '')).filter(Boolean).join('\n').trim()
            const promptFeedback = j?.promptFeedback || null
            if (mergedText) return resolve({ text: mergedText, promptFeedback })
            if (!mergedText && promptFeedback) return resolve({ text: '', promptFeedback })
            const finishReason = candidate?.finishReason || null
            const safetyRatings = candidate?.safetyRatings || []
            if (!mergedText && (finishReason || (Array.isArray(safetyRatings) && safetyRatings.length))) {
              return resolve({ text: '', promptFeedback: { finishReason, safetyRatings } })
            }
            return reject(new Error('Respuesta vacía de Gemini'))
          } catch (e) { reject(e) }
        })
      })
      reqG.on('error', reject)
      reqG.write(body)
      reqG.end()
    })
  }

  try {
    return await requestModel(primaryModel)
  } catch (e) {
    if (String(e?.message || '').includes('Respuesta vacía de Gemini') && fallbackModel && fallbackModel !== primaryModel) {
      try {
        const out = await requestModel(fallbackModel)
        addLog({ type: 'warn', scope: 'gemini.fallback', message: `Respuesta vacía con ${primaryModel}. Usado fallback ${fallbackModel}` })
        return out
      } catch (e2) {
        throw e2
      }
    }
    throw e
  }
}

app.post('/api/llm/chat/generate', async (req, res) => {
  try {
    console.log('[API] /api/llm/chat/generate called', req.body?.contents?.length);
    const { provider = (process.env.DEFAULT_LLM_PROVIDER || 'gemini'), contents = [], systemInstruction = undefined, generationConfig = { temperature: 0.5, maxOutputTokens: 2048 } } = req.body || {}
    console.log('[API] Provider:', provider);
    const temperature = Number(generationConfig?.temperature ?? 0.5)
    const maxTokens = Number(generationConfig?.maxOutputTokens ?? 2048)

    if (String(provider) === 'openai') {
      const msgs = mapGeminiContentsToTextArray(contents)
      const system = systemInstruction?.parts?.map(p => p?.text || '').join('\n') || undefined
      const out = await callOpenAIChat({ messages: msgs, system, temperature, maxTokens })
      return res.json({ ok: true, text: out.text, promptFeedback: null })
    }
    if (String(provider) === 'anthropic') {
      const msgs = mapGeminiContentsToTextArray(contents)
      const system = systemInstruction?.parts?.map(p => p?.text || '').join('\n') || undefined
      const out = await callAnthropicChat({ messages: msgs, system, temperature, maxTokens })
      return res.json({ ok: true, text: out.text, promptFeedback: null })
    }
    // default gemini
    const out = await callGeminiUnified({ contents, systemInstruction, temperature, maxTokens })
    console.log('[API] Gemini response text length:', out.text?.length);
    return res.json({ ok: true, text: out.text || '', promptFeedback: out.promptFeedback || null })
  } catch (e) {
    console.error('[API] Error in generate:', e);
    res.status(500).json({ ok: false, error: e?.message || String(e) })
  }
})

// ==== Agentes: creación y listado ====
app.post('/api/agents', async (req, res) => {
  try {
    const { name, advisorName = null, sections = [] } = req.body || {}
    const { id } = await createAgent({ name, advisorName })
    await replaceAgentSections({ agentId: id, sections })
    const agent = await getAgentWithSections({ id })
    res.json({ ok: true, agent })
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message || 'No se pudo crear el agente' })
  }
})

app.get('/api/agents', async (req, res) => {
  try {
    const items = await listAgentsSummary()
    res.json({ ok: true, items })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.get('/api/agents/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const agent = await getAgentWithSections({ id })
    if (!agent) return res.status(404).json({ ok: false, error: 'Agente no encontrado' })
    res.json({ ok: true, agent })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ==== Agentes: creación y listado ====
app.post('/api/agents', async (req, res) => {
  try {
    const { name, advisorName = null, sections = [] } = req.body || {}
    const { id } = await createAgent({ name, advisorName })
    await replaceAgentSections({ agentId: id, sections })
    const agent = await getAgentWithSections({ id })
    res.json({ ok: true, agent })
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message || 'No se pudo crear el agente' })
  }
})

app.get('/api/agents', async (req, res) => {
  try {
    const items = await listAgentsSummary()
    res.json({ ok: true, items })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.get('/api/agents/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const agent = await getAgentWithSections({ id })
    if (!agent) return res.status(404).json({ ok: false, error: 'Agente no encontrado' })
    res.json({ ok: true, agent })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// Actualizar y eliminar agente
app.put('/api/agents/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const { name, advisorName = null, sections = [] } = req.body || {}
    await updateAgentName({ id, name, advisorName })
    await replaceAgentSections({ agentId: id, sections })
    const agent = await getAgentWithSections({ id })
    res.json({ ok: true, agent })
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message || 'No se pudo actualizar el agente' })
  }
})

app.delete('/api/agents/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    await deleteAgent({ id })
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message || 'No se pudo eliminar el agente' })
  }
})

// ==== Súper Agente: asignación de contenidos a secciones de otros agentes ====
app.post('/api/super-agent/assign', async (req, res) => {
  try {
    const { targetAgentId, sectionName = null, content = null, sections = null } = req.body || {}
    const agentId = Number(targetAgentId)
    if (!agentId) return res.status(400).json({ ok: false, error: 'targetAgentId requerido' })

    // Admite un único par (sectionName, content) o un arreglo sections: [{name, content}]
    const toApply = Array.isArray(sections) && sections.length > 0
      ? sections.map(s => ({ name: String(s?.name || '').trim(), content: s?.content ?? null }))
      : [{ name: String(sectionName || '').trim(), content }]

    // Regla: si se asigna "Bachillerato", también propagar a "Información general"
    const finalSections = []
    for (const s of toApply) {
      if (!s.name) continue
      finalSections.push(s)
      if (/^bachillerato$/i.test(s.name)) {
        finalSections.push({ name: 'Información general', content: s.content })
      }
    }

    for (const s of finalSections) {
      await upsertAgentSection({ agentId, name: s.name, content: s.content })
    }

    const agent = await getAgentWithSections({ id: agentId })
    res.json({ ok: true, agent })
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message || 'No se pudo asignar contenido' })
  }
})

// ==== Manuales Guardados (CRUD mínimo) ====
app.get('/api/manuals/saved', async (req, res) => {
  try {
    const limit = Number(req.query.limit || 100)
    const items = await listSavedManuals({ limit })
    res.json({ ok: true, items })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.get('/api/manuals/saved/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const manual = await getSavedManual({ id })
    if (!manual) return res.status(404).json({ ok: false, error: 'Manual no encontrado' })
    res.json({ ok: true, manual })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.post('/api/manuals/saved', async (req, res) => {
  try {
    const { title = null, content, agentName = null, sectionName = null, voiceId = null } = req.body || {}
    const result = await insertSavedManual({ title, content, agentName, sectionName, voiceId })
    res.json({ ok: true, id: result.id })
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message || 'No se pudo guardar el manual' })
  }
})

app.put('/api/manuals/saved/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const { title = null, content, agentName = null, sectionName = null, voiceId = null } = req.body || {}
    const result = await updateSavedManual({ id, title, content, agentName, sectionName, voiceId })
    res.json({ ok: true, id: result.id })
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message || 'No se pudo actualizar el manual' })
  }
})

app.delete('/api/manuals/saved/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    await deleteSavedManual({ id })
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message || 'No se pudo eliminar' })
  }
})

// ==== Settings: OpenAI API Key ====
app.get('/api/settings/openai/apikey/status', (req, res) => {
  try {
    const key = process.env.OPENAI_API_KEY || ''
    const configured = !!key
    const masked = configured ? maskKey(key) : ''
    const https = require('https')
    if (!configured) return res.json({ ok: true, configured, masked, connected: false, reason: 'API Key no configurada' })
    const started = Date.now()
    const options = {
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/models',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Accept': 'application/json'
      }
    }
    const rq = https.request(options, (resp) => {
      let data = ''
      resp.on('data', (c) => { data += c })
      resp.on('end', () => {
        try {
          const j = JSON.parse(data || '{}')
          const connected = !j?.error
          const reason = connected ? '' : (j?.error?.message || 'Error de autenticación o permisos')
          const latencyMs = Date.now() - started
          res.json({ ok: true, configured, masked, connected, reason, latencyMs })
        } catch {
          res.json({ ok: true, configured, masked, connected: false, reason: 'Respuesta inválida del servidor' })
        }
      })
    })
    rq.on('error', () => res.json({ ok: true, configured, masked, connected: false, reason: 'Error de red' }))
    rq.end()
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.post('/api/settings/openai/apikey', (req, res) => {
  try {
    const apiKey = String(req.body?.apiKey || '').trim()
    if (!apiKey || apiKey.length < 20) {
      return res.status(400).json({ ok: false, error: 'API Key inválida' })
    }
    const envPath = path.resolve(__dirname, '.env')
    const ok = setEnvVar(envPath, 'OPENAI_API_KEY', apiKey)
    if (!ok) return res.status(500).json({ ok: false, error: 'No se pudo escribir .env' })
    res.json({ ok: true, configured: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ==== Settings: Anthropic API Key ====
app.get('/api/settings/anthropic/apikey/status', (req, res) => {
  try {
    const key = process.env.ANTHROPIC_API_KEY || ''
    const configured = !!key
    const masked = configured ? maskKey(key) : ''
    const https = require('https')
    if (!configured) return res.json({ ok: true, configured, masked, connected: false, reason: 'API Key no configurada' })
    const started = Date.now()
    const options = {
      hostname: 'api.anthropic.com',
      port: 443,
      path: '/v1/models',
      method: 'GET',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Accept': 'application/json'
      }
    }
    const rq = https.request(options, (resp) => {
      let data = ''
      resp.on('data', (c) => { data += c })
      resp.on('end', () => {
        try {
          const j = JSON.parse(data || '{}')
          const connected = !j?.error
          const reason = connected ? '' : (j?.error?.message || 'Error de autenticación o permisos')
          const latencyMs = Date.now() - started
          res.json({ ok: true, configured, masked, connected, reason, latencyMs })
        } catch {
          res.json({ ok: true, configured, masked, connected: false, reason: 'Respuesta inválida del servidor' })
        }
      })
    })
    rq.on('error', () => res.json({ ok: true, configured, masked, connected: false, reason: 'Error de red' }))
    rq.end()
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.post('/api/settings/anthropic/apikey', (req, res) => {
  try {
    const apiKey = String(req.body?.apiKey || '').trim()
    if (!apiKey || apiKey.length < 20) {
      return res.status(400).json({ ok: false, error: 'API Key inválida' })
    }
    const envPath = path.resolve(__dirname, '.env')
    const ok = setEnvVar(envPath, 'ANTHROPIC_API_KEY', apiKey)
    if (!ok) return res.status(500).json({ ok: false, error: 'No se pudo escribir .env' })
    res.json({ ok: true, configured: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ==== TTS Preview (server-side, audio estable) ====
// Genera una frase corta (opcionalmente vía Gemini) y sintetiza audio en español (es-CO)
app.post('/api/tts/preview', async (req, res) => {
  try {
    const { presetId, text } = req.body || {}
    const preset = String(presetId || '').trim() || 'Zephyr'
    const labels = {
      Zephyr: 'Femenina 1 (Amable)',
      Kore: 'Femenina 2 (Profesional)',
      Leda: 'Femenina 3 (Joven)',
      Callirrhoe: 'Femenina 4 (Clara)',
      Puck: 'Masculina 1 (Amable)',
      Orus: 'Masculina 2 (Profesional)',
      Fenrir: 'Masculina 3 (Energético)',
      Algenib: 'Masculina 4 (Grave)'
    }
    const label = labels[preset] || preset

    let phrase = String(text || '').trim()
    if (!phrase) {
      // Si no se envía texto, pedimos a Gemini una línea breve con acento colombiano y el perfil seleccionado
      try {
        const systemInstruction = { parts: [{ text: 'Eres un generador de líneas de saludo para un asistente virtual. Responde SOLO con una línea breve y amable en español con acento colombiano.' }] }
        const out = await callGeminiUnified({
          contents: [{ role: 'user', parts: [{ text: `Genera una única frase corta (10-16 palabras) con acento colombiano amable y el siguiente perfil de voz: ${label}. Tema: saludo de presentación del agente.` }]}],
          systemInstruction,
          temperature: 0.6,
          maxTokens: 64
        })
        phrase = String(out?.text || '').trim()
        // Si Gemini responde vacío por seguridad/finishReason, usar fallback legible
        if (!phrase) {
          phrase = `Hola, esta es la previsualización de ${label}.`
        }
      } catch (e) {
        // Fallback si no hay API key o falla la petición
        phrase = `Hola, esta es la previsualización de ${label}.`
      }
    }

    if (!phrase) {
      return res.status(400).json({ ok: false, error: 'No se pudo generar texto para TTS' })
    }

    // Síntesis de audio: 1) Gemini TTS (mismas voces que Agente) -> WAV
    // 2) Google Cloud TTS (neural) -> MP3, 3) Fallback google-tts-api -> MP3
    const dir = getTtsPreviewDir()
    let filename = ''
    let filePath = ''
    let wrote = false

    // 1) Gemini TTS
    try {
      const gemBuf = await synthesizeWithGeminiTTS({ text: phrase, presetId: preset })
      if (gemBuf && gemBuf.length > 0) {
        filename = `tts-preview-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`
        filePath = path.join(dir, filename)
        fs.writeFileSync(filePath, gemBuf)
        wrote = true
      }
    } catch (_) {}

    // 2) Google Cloud TTS
    if (!wrote) {
      try {
        const audioBuf = await synthesizeWithCloudTTS({ text: phrase, presetId: preset })
        if (audioBuf && audioBuf.length > 0) {
          filename = `tts-preview-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`
          filePath = path.join(dir, filename)
          fs.writeFileSync(filePath, audioBuf)
          wrote = true
        }
      } catch (_) {}
    }

    // Fallback: google-tts-api (voz única por idioma)
    if (!wrote) {
      const https = require('https')
      const lang = 'es-CO'
      filename = `tts-preview-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`
      filePath = path.join(dir, filename)
      const ttsUrl = googleTTS.getAudioUrl(phrase, { lang, slow: false, host: 'https://translate.google.com' })
      await new Promise((resolve, reject) => {
        const f = fs.createWriteStream(filePath)
        https.get(ttsUrl, (resp) => {
          if (resp.statusCode && resp.statusCode >= 400) {
            try { f.close(); fs.unlinkSync(filePath) } catch {}
            return reject(new Error(`Fallo al descargar audio TTS: ${resp.statusCode}`))
          }
          resp.pipe(f)
          f.on('finish', () => f.close(resolve))
        }).on('error', (err) => {
          try { f.close(); fs.unlinkSync(filePath) } catch {}
          reject(err)
        })
      })
    }

    // Limpieza diferida del archivo (10 minutos)
    setTimeout(() => { try { fs.unlinkSync(filePath) } catch {} }, 10 * 60 * 1000)

    const publicUrl = `/storage/tts/previews/${filename}`
    res.json({ ok: true, url: publicUrl, text: phrase, preset: preset })
  } catch (e) {
    addLog({ type: 'error', scope: 'tts.preview', error: e?.message || String(e) })
    res.status(500).json({ ok: false, error: e?.message || 'Error generando TTS' })
  }
})
