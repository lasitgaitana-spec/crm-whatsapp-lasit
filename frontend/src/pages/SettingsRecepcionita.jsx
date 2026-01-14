import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Typography, Button } from '@mui/material';
import { io } from 'socket.io-client'

// Integramos la sección "Probar Voces" en JSX, usando el mismo VOICE_PRESETS
// y el flujo POST /api/tts/preview de AgentsCreate.jsx

const VOICE_PRESETS = [
  { id: 'Zephyr', label: 'Marcela (Amable)' },
  { id: 'Kore', label: 'Elizabeth (Profesional)' },
  { id: 'Leda', label: 'Ingrid (Joven)' },
  { id: 'Callirrhoe', label: 'Leidy (Clara)' },
  { id: 'Puck', label: 'Julio (Amable)' },
  { id: 'Orus', label: 'Alejandro (Profesional)' },
  { id: 'Fenrir', label: 'Juan (Energético)' },
  { id: 'Algenib', label: 'Alexander (Grave)' },
];

const ALL_VOICES = VOICE_PRESETS.map(v => v.id);

export default function SettingsRecepcionita() {
  // Estados para el voice tester
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);

  // Estados de configuración se gestionan más abajo (config, labels, agents, loading, saving, error, success)

  // Estados para el agente conversacional
  const [chatHistory, setChatHistory] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  // Estados por JID para aislar conversaciones y evitar mezcla
  const [chatHistoryByJid, setChatHistoryByJid] = useState({}); // { [jid]: Array<turno> }
  const [chatMessagesByJid, setChatMessagesByJid] = useState({}); // { [jid]: Array<mensaje> }
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isConversationDone, setIsConversationDone] = useState(false);
  const [wasLastInputVoice, setWasLastInputVoice] = useState(false);
  const [currentClientName, setCurrentClientName] = useState('');
  const [currentProgramName, setCurrentProgramName] = useState('');
  const [contacts, setContacts] = useState([]);
  const [agentName, setAgentName] = useState('Sofía');
  const [knowledgeBase, setKnowledgeBase] = useState(`INFORMACIÓN INSTITUCIONAL LASÏT:

1.  **Bachillerato por Ciclos (CLEI):**
    * **Descripción:** Programa presencial para jóvenes y adultos (mayores de 15 años para CLEI 2-4, mayores de 18 para CLEI 5-6). Permite terminar el bachillerato validando dos grados por año.
    * **Ciclos (CLEI):**
        * CLEI 2: Grados 6° y 7°
        * CLEI 3: Grados 8° y 9°
        * CLEI 4: Grado 10°
        * CLEI 5: Grado 11°
    * **Requisitos:** Certificados de estudio del último año aprobado (originales), fotocopia del documento de identidad, foto 3x4, carnet EPS, recibo de servicios.
    * **Horarios:** Nocturno (Lunes a Viernes 6:00 PM - 9:00 PM) o Sabatino (7:00 AM - 5:00 PM).

2.  **Bachillerato Virtual:**
    * **Descripción:** Programa 100% virtual para jóvenes y adultos (mismas edades que presencial). Plataforma Moodle disponible 24/7.
    * **Metodología:** Clases online, tutorías personalizadas, trabajos, evaluaciones.
    * **Requisitos:** Mismos que el presencial.

3.  **Técnico en Mecánica y Electricidad de Motocicletas:**
    * **Descripción:** Programa técnico laboral. Aulas-taller especializadas.
    * **Enfoque:** Diagnóstico y reparación de sistemas de motocicletas (motor, chasis, electricidad).
    * **Requisitos:** Ser mayor de 16 años, haber aprobado 9° grado.
    * **Duración:** 3 semestres.

4.  **Cursos de Conducción (CEA):**
    * **Categorías:**
        * A2: Motocicletas
        * B1: Carros particulares (automóvil, campero, microbús)
    * **Incluye:** Clases teóricas (presenciales o virtuales), clases prácticas, exámenes médicos, inscripción RUNT.
    * **Requisitos:** Ser mayor de 16 años, saber leer y escribir, documento de identidad.`);
  const [assignedAgent, setAssignedAgent] = useState('');
  const [assignedTag, setAssignedTag] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [freeSystemPrompt, setFreeSystemPrompt] = useState('');
  // Estados del panel de prueba (tester) para reemplazar el chat
  const [testerQ, setTesterQ] = useState('');
  const [testerA, setTesterA] = useState('');
  const [testerAudioText, setTesterAudioText] = useState('');
  const [testerIsRecording, setTesterIsRecording] = useState(false);
  // Estados por JID para audio y grabación del tester
  const [testerAudioTextByJid, setTesterAudioTextByJid] = useState({});
  const [testerRecordingJid, setTesterRecordingJid] = useState(null);
  // Multi-sesión por JID (pestañas)
  const [openJids, setOpenJids] = useState([]);
  const [activeJid, setActiveJid] = useState(null);
  const [testerQByJid, setTesterQByJid] = useState({});
  const [testerAByJid, setTesterAByJid] = useState({});
  const [detectedByJid, setDetectedByJid] = useState({}); // { [jid]: { clientName, programName } }
  // Guardado manual por JID: nombres, teléfono y etiqueta para persistir contacto
  const [saveNameByJid, setSaveNameByJid] = useState({});
  const [savePhoneByJid, setSavePhoneByJid] = useState({});
  const [saveLabelByJid, setSaveLabelByJid] = useState({});
  const [savingContactByJid, setSavingContactByJid] = useState({});
  // Envío a WhatsApp siempre activo; se eliminó el toggle del tester
  const testerRecognitionRef = useRef(null);
  // Opciones dinámicas para selects
  const [agentsOptions, setAgentsOptions] = useState([]);
  const [labelsOptions, setLabelsOptions] = useState([]);
  // Pestañas superiores
  const [activeTab, setActiveTab] = useState('config'); // 'config' | 'recepcionita'

  // Se eliminó toda la interacción con WhatsApp (envío/recepción)

  // Guardado de Base de Conocimiento y Tarjetas de Asignación
  const [savedList, setSavedList] = useState([])
  const [loadingSaved, setLoadingSaved] = useState(false)
  const [kbSavedId, setKbSavedId] = useState(null)
  const [kbSavedContent, setKbSavedContent] = useState('')
  const [kbSavedAgentName, setKbSavedAgentName] = useState('')
  const [kbSavedVoiceId, setKbSavedVoiceId] = useState('')
  const [kbDirty, setKbDirty] = useState(false)
  const [assignTitle, setAssignTitle] = useState('')
  const [editingAssignId, setEditingAssignId] = useState(null)
  const [savingKB, setSavingKB] = useState(false)
  const [savingAssign, setSavingAssign] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Confirmación de eliminación de tarjeta
  const [deleteAssignOpen, setDeleteAssignOpen] = useState(false)
  const [deleteAssignId, setDeleteAssignId] = useState(null)
  const [deleteAssignLoading, setDeleteAssignLoading] = useState(false)

  // Modal de confirmación de actualización
  const [updateOpen, setUpdateOpen] = useState(false);

  // Referencias
  const chatContainerRef = useRef(null);
  const recognitionRef = useRef(null);
  const currentPlayingAudioRef = useRef(null);
  const lastSentAgentTextRef = useRef('');
  const testResponseBtnRef = useRef(null);
  const lastWaSenderRef = useRef(null);
  const shouldAutoSendRef = useRef(false);
  const handleTestResponseRef = useRef(null);

  // Estados para el probador de voces
  const [voiceOption, setVoiceOption] = React.useState(VOICE_PRESETS[0].id)
  const [voiceLoading, setVoiceLoading] = React.useState(false)

  // Socket para escuchar mensajes entrantes de WhatsApp y poblar "Pregunta del cliente"
  const waSocketRef = useRef(null)
  useEffect(() => {
    const socket = io('/', { path: '/socket.io', transports: ['websocket'] })
    waSocketRef.current = socket
    // Normaliza cualquier forma de JID que llegue del backend
    const normalizeJid = (raw) => {
      try {
        const s = String(raw || '').trim()
        if (!s) return ''
        // Convertir @c.us a @s.whatsapp.net
        if (/@c\.us$/.test(s)) return s.replace(/@c\.us$/, '@s.whatsapp.net')
        // Si ya trae dominio, usar tal cual
        if (s.includes('@')) return s
        // Si son sólo dígitos (posible número), convertir a JID completo
        const digits = s.replace(/\D/g, '')
        if (digits.length >= 8 && digits.length <= 15) return `${digits}@s.whatsapp.net`
        return s
      } catch { return String(raw || '') }
    }
    socket.on('wa:message', (item) => {
      console.log('[Recepcionista] Incoming socket message:', item);
      try {
        // Ignorar mensajes propios y sin texto
        if (!item || item.fromMe || !item.text) return
        // Guardar JID del último remitente para poder responderle
        const jid = normalizeJid(item.sender)
        console.log('[Recepcionista] Processing auto-response for:', jid, 'Text:', item.text);
        
        lastWaSenderRef.current = jid || null
        // Registrar el contacto de inmediato usando su JID (muestra el número)
        try { addContact({ name: '', program: '', jid }) } catch {}
        // Abrir/activar pestaña para este JID
        setOpenJids(prev => (jid && !prev.includes(jid)) ? [...prev, jid] : prev)
        setActiveJid(jid)
        // Marcar que, tras generar la respuesta, se envíe automáticamente
        shouldAutoSendRef.current = true
        // Escribir el texto recibido en el campo "Pregunta del cliente"
        setTesterQByJid(prev => ({ ...prev, [jid]: item.text || '' }))
        // Ejecutar la respuesta del agente directamente
        try {
          if (handleTestResponseRef.current) {
             handleTestResponseRef.current(jid, item.text || '')
               .catch(err => console.error('[Recepcionista] handleTestResponse error:', err));
          } else {
             console.warn('[Recepcionista] handleTestResponseRef is missing');
          }
        } catch (err) {
          console.error('[Recepcionista] auto-response error:', err)
        }
      } catch (e) {
        console.error('[Recepcionista] wa:message handler error:', e)
      }
    })
    return () => { try { socket.disconnect() } catch {}; waSocketRef.current = null }
  }, [])

  // Inicializar la voz desde localStorage si existe (para evitar "cambios sin guardar" tras refrescar)
  useEffect(() => {
    try {
      const storedVoice = localStorage.getItem('recepcionitaVoiceId') || localStorage.getItem('capatazVoiceId')
      if (storedVoice && typeof storedVoice === 'string') {
        setVoiceOption(storedVoice)
      }
    } catch {}
  }, [])

  // Funciones del agente conversacional
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "¡Muy buenos días!";
    else if (hour < 18) return "¡Muy buenas tardes!";
    else return "¡Muy buenas noches!";
  };

  // Fecha y hora actual en español (Colombia)
  const getCurrentDateContext = () => {
    try {
      const tz = 'America/Bogota'
      const now = new Date()
      const fechaLarga = now.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: tz })
      const horaCorta = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: tz })
      return { fechaLarga, horaCorta, tz }
    } catch {
      const now = new Date()
      const fechaLarga = now.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      const horaCorta = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
      return { fechaLarga, horaCorta, tz: 'local' }
    }
  }

  // Validación robusta de nombre completo (evita capturar saludos o frases)
  const isLikelyFullName = (s) => {
    let t = String(s || '').trim();
    if (!t) return false;
    // Permitir puntuación final típica y limpiarla
    t = t.replace(/[\s]*[\?\!\.;:,]+$/,'').trim();
    // Descartar si contiene números, emails, URLs
    if (/\d/.test(t)) return false;
    if (/@|http(s)?:\/\//i.test(t)) return false;
    // Stopwords comunes que no deberían iniciar un nombre
    const STOPWORDS = ['hola','buenas','buenos','dias','tardes','noches','gracias','por','favor','info','informacion','información','quisiera','saber','pregunta'];
    const CONNECTORS = ['de','del','la','las','los','y'];
    const parts = t.split(/\s+/).filter(Boolean);
    const tokens = parts.filter(p => /[A-Za-zÁÉÍÓÚÜáéíóúüÑñ\-]/.test(p));
    // Reglas: entre 2 y 4 tokens válidos, al menos 2 no conectores
    if (tokens.length < 2 || tokens.length > 4) return false;
    const nonConnectorCount = tokens.filter(p => !CONNECTORS.includes(p.toLowerCase())).length;
    if (nonConnectorCount < 2) return false;
    // Evitar que empiece con stopwords
    if (STOPWORDS.includes(tokens[0].toLowerCase())) return false;
    // Cada token debe ser predominantemente alfabético
    if (!tokens.every(p => /^[A-Za-zÁÉÍÓÚÜáéíóúüÑñ][A-Za-zÁÉÍÓÚÜáéíóúüÑñ\-]{1,}$/.test(p))) return false;
    return true;
  };

  // Validación flexible de nombre real (acepta solo primer nombre)
  const isLikelyRealName = (s) => {
    let t = String(s || '').trim();
    if (!t) return false;
    t = t.replace(/[\s]*[\?\!\.;:,]+$/, '').trim();
    if (/\d/.test(t)) return false;
    if (/@|http(s)?:\/\//i.test(t)) return false;
    const STOPWORDS = ['hola','buenas','buenos','dias','tardes','noches','gracias','por','favor','info','informacion','información','quisiera','saber','pregunta'];
    const CONNECTORS = ['de','del','la','las','los','y'];
    const parts = t.split(/\s+/).filter(Boolean);
    const tokens = parts.filter(p => /[A-Za-zÁÉÍÓÚÜáéíóúüÑñ\-]/.test(p));
    // Aceptar entre 1 y 4 tokens válidos; al menos 1 no conector
    if (tokens.length < 1 || tokens.length > 4) return false;
    const nonConnectorCount = tokens.filter(p => !CONNECTORS.includes(p.toLowerCase())).length;
    if (nonConnectorCount < 1) return false;
    if (STOPWORDS.includes(tokens[0].toLowerCase())) return false;
    if (!tokens.every(p => /^[A-Za-zÁÉÍÓÚÜáéíóúüÑñ][A-Za-zÁÉÍÓÚÜáéíóúüÑñ\-]{1,}$/.test(p))) return false;
    return true;
  };

  // Lista de programas permitidos para validación básica
  const ALLOWED_PROGRAMS = [
    'Bachillerato por Ciclos',
    'Bachillerato Virtual',
    'Técnico en Motocicletas',
    'Cursos de Conducción'
  ];

  const normalizeProgram = (p) => {
    const x = String(p || '').toLowerCase();
    if (!x) return '';
    if (x.includes('ciclo')) return 'Bachillerato por Ciclos';
    if (x.includes('virtual')) return 'Bachillerato Virtual';
    if (x.includes('moto')) return 'Técnico en Motocicletas';
    if (x.includes('conducción') || x.includes('conduc')) return 'Cursos de Conducción';
    return '';
  };

  // Extraer nombre desde frases típicas: "me llamo ...", "mi nombre es ...", "soy ..."
  const extractNameFromText = (raw) => {
    const t = String(raw || '').trim();
    if (!t) return '';
    const patterns = [
      /(?:mi\s+nombre\s+es|me\s+llamo|soy|nombres?\s+y\s+apellidos?:?)\s+([A-Za-zÁÉÍÓÚÜáéíóúüÑñ\-\s]{3,})$/i,
    ];
    for (const re of patterns) {
      const m = t.match(re);
      if (m && m[1]) {
        const candidate = m[1].trim().replace(/[\s]*[\?\!\.;:,]+$/,'').trim();
        return isLikelyRealName(candidate) ? candidate : '';
      }
    }
    // Si todo el texto parece ser únicamente un nombre, aceptarlo
    const cleaned = t.replace(/[\s]*[\?\!\.;:,]+$/,'').trim();
    return isLikelyRealName(cleaned) ? cleaned : '';
  };

  // Se removió la memoria por contacto (JID) asociada a WhatsApp

  const buildSystemPrompt = () => {
    const { fechaLarga, horaCorta, tz } = getCurrentDateContext()
    const jsonSchema = {
      type: "OBJECT",
      properties: {
        "detectedClientName": { "type": "STRING" },
        "detectedProgram": { "type": "STRING" },
        "response": { "type": "STRING" },
        "conversationComplete": { "type": "BOOLEAN" }
      },
      required: ["response", "conversationComplete"]
    };

    const timeGreeting = getGreeting();
    const prompt = `
Eres ${agentName}, recepcionista del Colegio Lasit.
Tu nombre del agente es exactamente: "${agentName}". Nunca te identifiques con otro nombre ni variantes. Si te presentas, usa ese nombre tal cual.

Referencia temporal (USAR SIEMPRE ESTA FECHA Y HORA):
- Hoy es ${fechaLarga} y son las ${horaCorta} (zona ${tz}).
- Para cualquier cálculo de edad, vencimientos o fechas, utiliza estrictamente esta referencia actual y NO inventes otra.

Apertura y cortesía:
- Al comenzar una conversación, saluda según el horario: "${timeGreeting}".
- Preséntate en una sola línea como recepcionista del Colegio Lasit e incluye tu nombre exacto "${agentName}" en esa misma línea (ej.: "${timeGreeting}, soy ${agentName}, recepcionista del Colegio Lasit").
- Si el usuario repite saludos breves ("hola", "buenas"), evita repetir toda la presentación. Responde de forma breve y amable.

Estilo humano y tratamiento del cliente:
- Mantén un tono cercano, natural y humano; evita frases robóticas o recordatorios sobre ser IA.
- Varía la redacción y evita muletillas repetitivas.
- Una vez que tengas el nombre completo del cliente, dirígete a él usando SOLO su nombre (primer nombre) en el resto de la conversación, sin repetir los apellidos salvo que sea estrictamente necesario (por ejemplo, al confirmar un dato formal).
- No abuses de mencionar el nombre: úsalo con moderación, sólo cuando aporte calidez o claridad.

Regla inviolable sobre nombres ya capturados:
- Si el cliente ya ha proporcionado sus nombres y apellidos en la conversación (esto se te indicará en el contexto dinámico con el nombre del cliente), es ABSOLUTAMENTE PROHIBIDO volver a solicitar o reconfirmar el nombre.
- Continúa directamente con la atención.
- Solo si el cliente expresa que desea corregir o cambiar su nombre, entonces gestiona esa corrección.

Solicitud de apellido cuando solo hay primer nombre (pedir UNA sola vez):
- Si detectas que el cliente dio únicamente un primer nombre real (una sola palabra, alfabética), respóndele exactamente con una variación breve y amable: "Gracias, {Nombre}. Para poder registrarte correctamente, ¿podrías indicarme tu apellido por favor?".
- No pidas "nombres y apellidos completos" en este caso; solicita solo el apellido una sola vez.
- Si después de pedir el apellido el cliente no lo brinda, continúa la atención usando únicamente el primer nombre sin volver a insistir.

Solicitud de nombres y apellidos (SÓLO si aún no se tiene ningún nombre):
- Si el cliente NO ha dado ningún nombre y no hay contexto con nombre, pídeselo con redacción natural.
- Si no lo da, puedes reintentar con distinta redacción y tono cordial, evitando repetir literalmente frases previas.
- Si aun así no lo brinda, continúa ayudando sin insistir.

Identificación y captura del programa:
- Tu objetivo clave tras capturar el nombre es identificar el programa de interés del cliente y colocar el valor canónico en \`detectedProgram\`.
- Usa la Base de Conocimiento para decidir entre las opciones canónicas siguientes: "Bachillerato por ciclos", "Bachillerato Virtual", "Técnico en mecánica y electricidad de motocicletas" y "Centro de enseñanza automovilística".
- Si el cliente usa sinónimos o describe el programa, asigna el canónico equivalente (ej.: "virtual" → "Bachillerato Virtual", "motos" → "Técnico en mecánica y electricidad de motocicletas").
- Si no es claro aún, realiza preguntas puntuales y breves para determinarlo; si sigue ambiguo, deja \`detectedProgram\` vacío y continúa ayudando.

Base de Conocimiento (usa solo si ayuda):

${String(knowledgeBase || '').trim()}

Variaciones sugeridas (no copies literalmente; usa como guía según el caso):
- Caso primer nombre: "Gracias, {Nombre}. Para poder registrarte correctamente, ¿podrías indicarme tu apellido por favor?"
- Caso sin nombre alguno: "¿Podrías indicarme tus nombres y apellidos para registrarte y ayudarte mejor?"

Detección estructurada:
- En \`detectedClientName\`, coloca el nombre real detectado (puede ser solo el primer nombre o el nombre completo). No inventes apellidos; si solo hay primer nombre, devuélvelo tal cual.
- En \`detectedProgram\`, coloca el programa si lo menciona de forma clara (bachillerato por ciclos, bachillerato virtual, técnico en motos, cursos de conducción); si no es claro, deja vacío.

Formato de salida: Devuelve estrictamente un JSON con este esquema para facilitar la integración:
\`\`\`json
${JSON.stringify(jsonSchema, null, 2)}
\`\`\`

Donde:
- \`response\` es tu respuesta natural tal como se enviará al usuario.
- \`conversationComplete\` será \`true\` solo si consideras que la conversación terminó; de lo contrario \`false\`.
`;
    setSystemPrompt(prompt);
    resetChat();
  };

  // Utilidades para guardar contacto
  const getDigitsFromJid = (jid) => {
    try {
      const s = String(jid || '').trim()
      if (!s) return ''
      const core = s.includes('@') ? s.replace(/@.*/, '') : s
      return core.replace(/\D/g, '')
    } catch { return '' }
  }

  const getSuggestedLabelIdByProgram = (programName) => {
    try {
      const p = normalizeProgram(programName || '') || String(programName || '')
      if (!p) return null
      const match = savedList.find(it => String(it.program || '') === p)
      const lid = match?.tagId ? Number(match.tagId) : null
      return lid && lid > 0 ? lid : null
    } catch { return null }
  }

  const saveContactFromDetected = async (jid) => {
    const key = String(jid || '')
    if (!key) { alert('No hay número activo'); return }
    const detected = detectedByJid[key] || {}
    const name = String(saveNameByJid[key] ?? detected.clientName ?? '').trim()
    const phoneDigits = String(savePhoneByJid[key] || getDigitsFromJid(key)).replace(/\D/g, '')
    const countryCode = '57'
    if (!name) { alert('Ingresa los Nombres y Apellidos'); return }
    if (!phoneDigits) { alert('No se pudo obtener el teléfono'); return }
    // Si vienen 10 dígitos locales, anteponer CC
    const fullPhone = phoneDigits.length === 10 ? (countryCode + phoneDigits) : phoneDigits
    // Etiqueta sugerida: preferir selección manual, luego asignación automática, luego tarjeta guardada
    let labelId = saveLabelByJid[key] ? Number(saveLabelByJid[key]) : null
    if (!labelId) {
      labelId = assignedTag ? Number(assignedTag) : null
    }
    if (!labelId) {
      labelId = getSuggestedLabelIdByProgram(detected.programName) || null
    }

    try {
      setSavingContactByJid(prev => ({ ...prev, [key]: true }))
      // Crear/upsert contacto
      const r = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone: fullPhone, countryCode })
      })
      const j = await r.json()
      if (!j?.ok || !j?.jid) throw new Error(j?.error || 'No se pudo guardar el contacto')
      // Asignar etiqueta si existe
      if (labelId && labelId > 0) {
        try {
          const rl = await fetch(`/api/contacts/${encodeURIComponent(j.jid)}/labels`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ labelId })
          })
          const jl = await rl.json()
          if (!jl?.ok) throw new Error(jl?.error || 'No se pudo asignar la etiqueta')
        } catch (e) {
          console.warn('Etiqueta no asignada:', e?.message || e)
        }
      }
      // Refrescar lista local de contactos detectados con nombre y programa
      try { addContact({ name, program: detected.programName || '', jid: key }) } catch {}
      // Guardado exitoso: sin alerta modal
    } catch (e) {
      alert('Error al guardar: ' + (e?.message || String(e)))
    } finally {
      setSavingContactByJid(prev => ({ ...prev, [key]: false }))
    }
  }

  // Guardado automático: cuando haya nombre y programa detectado por JID
  const [autoSavedByJid, setAutoSavedByJid] = React.useState({})
  React.useEffect(() => {
    try {
      const keys = Object.keys(detectedByJid || {})
      keys.forEach((jid) => {
        const det = detectedByJid[jid] || {}
        const name = String(det.clientName || '').trim()
        const program = String(det.programName || '').trim()
        const phoneDigits = getDigitsFromJid(jid)
        if (name && program && phoneDigits && !autoSavedByJid[jid]) {
          // Sugerir etiqueta basada en tarjetas guardadas o asignación global
          const suggestedId = getSuggestedLabelIdByProgram(program) || (assignedTag ? Number(assignedTag) : null)
          if (suggestedId && suggestedId > 0) {
            setSaveLabelByJid(prev => ({ ...prev, [jid]: String(suggestedId) }))
          }
          // Prellenar estados de guardado para coherencia
          setSaveNameByJid(prev => ({ ...prev, [jid]: name }))
          setSavePhoneByJid(prev => ({ ...prev, [jid]: phoneDigits }))
          // Ejecutar guardado automático
          saveContactFromDetected(jid).finally(() => {
            setAutoSavedByJid(prev => ({ ...prev, [jid]: true }))
          })
        }
      })
    } catch {}
  }, [detectedByJid, savedList, assignedTag])

  const buildFreeSystemPrompt = () => {
    const timeGreeting = getGreeting();
    const { fechaLarga, horaCorta, tz } = getCurrentDateContext()
    const prompt = `
Eres ${agentName}, recepcionista del Colegio Lasit. Conversas en español (Colombia) con tono cordial y profesional.
Tu nombre del agente es exactamente: "${agentName}". Nunca te identifiques con otro nombre ni variantes. Si te presentas, usa ese nombre tal cual.

Referencia temporal (USAR SIEMPRE ESTA FECHA Y HORA):
- Hoy es ${fechaLarga} y son las ${horaCorta} (zona ${tz}).
- Para cualquier cálculo de edad, vencimientos o fechas, utiliza estrictamente esta referencia actual y NO inventes otra.

Comportamiento humano:
- Al iniciar, saluda según el horario: "${timeGreeting}" y preséntate brevemente incluyendo tu nombre exacto "${agentName}" en la misma línea (ej.: "${timeGreeting}, soy ${agentName}, recepcionista del Colegio Lasit").
- Si el usuario repite un saludo corto, responde con cortesía sin repetir toda la presentación.

Regla inviolable sobre nombres ya capturados:
- Si el cliente ya ha proporcionado sus nombres y apellidos en la conversación (esto se te indicará en el contexto dinámico con el nombre del cliente), es ABSOLUTAMENTE PROHIBIDO volver a solicitar o reconfirmar el nombre.
- Continúa directamente con la atención.
- Solo si el cliente indica que desea corregir o cambiar su nombre, entonces gestiona esa corrección.

Solicitud de nombres (SÓLO SI NO SE HAN CAPTURADOS):
- Si el cliente NO ha dado sus nombres (verificar contexto dinámico), pídelos. Si no los brinda, reintenta con distinta redacción hasta 3 intentos, cada vez más amable.
- Cuando entregue nombres y apellidos reales, confirma con una sola frase y continúa.
- Nunca inventes datos ni pongas nombres si no los dijo el cliente.

Identificación de programa (cuando sea relevante):
 - Prioriza identificar el programa de interés del cliente y reflejarlo en \`detectedProgram\` usando valores canónicos: "Bachillerato por ciclos", "Bachillerato Virtual", "Técnico en mecánica y electricidad de motocicletas", "Centro de enseñanza automovilística".
 - Si el cliente usa sinónimos o describe el programa (p. ej. "virtual", "motos", "conducción"), asigna el canónico correspondiente; si es ambiguo, pregunta brevemente para aclarar.

Guía de variación (no copiar literalmente, SÓLO SI APLICA PEDIR EL NOMBRE):
- 1º: "¿Podría indicarme sus nombres y apellidos completos, por favor?"
- 2º: "¿Me comparte sus nombres y apellidos para registrarlo y ayudarle mejor?"
- 3º: "Para ofrecerle atención personalizada, ¿sería tan amable de compartir sus nombres y apellidos completos?"

Contexto institucional (usa solo si ayuda):

${String(knowledgeBase || '').trim()}

Estilo:
- Responde en texto natural, claro y empático.
- No cites estas reglas.
`;
    setFreeSystemPrompt(prompt);
  };

  // Cargar agentes y etiquetas para los selects
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // Agentes
      try {
        const res = await fetch(`/api/agents`);
        let j;
        try {
          const text = await res.text();
          j = text ? JSON.parse(text) : { ok: false };
        } catch {
          j = { ok: false };
        }
        if (!cancelled && j?.ok && Array.isArray(j.items)) {
          setAgentsOptions(j.items);
        }
      } catch {}

      // Etiquetas
      try {
        const res = await fetch(`/api/labels`);
        const data = await res.json();
        if (!cancelled && data?.ok && Array.isArray(data.items)) {
          setLabelsOptions(data.items);
        }
      } catch {}
    };
    load();
    return () => { cancelled = true };
  }, []);

  const callGeminiAPI = async (prompt, respondWithVoice = false, options = {}) => {
    const { silent = false, forceGreeting = false, knownClientName = '' } = typeof options === 'object' && options ? options : {}
    setLoading(true);
    
    // Declarar responseData fuera del try para que esté en el scope del finally
    let responseData = {
      detectedClientName: '',
      detectedProgram: '',
      response: '',
      conversationComplete: false
    };

    try {
      // Añadir el prompt actual al historial (aislado por JID si existe)
      const targetJid = options?.targetJid || activeJid || null;
      const baseHistory = targetJid ? (chatHistoryByJid[targetJid] || []) : chatHistory;
      const newHistory = [...baseHistory, { role: "user", parts: [{ text: prompt }] }];
      if (targetJid) {
        setChatHistoryByJid(prev => ({ ...prev, [targetJid]: newHistory }));
      } else {
        setChatHistory(newHistory);
      }
      
      // Filtrar historial para Gemini
      const geminiHistory = newHistory.map(msg => ({
        role: msg.role === 'agent' ? 'model' : msg.role,
        parts: msg.parts
      }));
      
      // Usar el prompt del sistema y añadir contexto dinámico si el nombre ya está capturado
      let dynamicSystemPrompt = systemPrompt;
      try {
        // Inyectar fecha y hora actual en cada turno para asegurar precisión
        try {
          const { fechaLarga, horaCorta, tz } = getCurrentDateContext()
          dynamicSystemPrompt += `\n\nFecha y hora actuales (referencia obligatoria): ${fechaLarga} · ${horaCorta} (zona ${tz}). Usa esta referencia para cualquier cálculo de fechas o edades.`
        } catch {}
        // Usar únicamente el nombre conocido proveniente del JID actual (sin fallback global)
        const clientNameRef = String(knownClientName || '').trim();
        if (clientNameRef) {
          dynamicSystemPrompt += `\n\nContexto: Ya se capturaron los nombres y apellidos del cliente ("${clientNameRef}"). NO los solicites ni los reconfirmes; continúa con la atención. Solo si el cliente pide corregir el nombre, entonces gestiónalo. Intentos para pedir nombre = 0.`;
          // Ignorar cualquier variación que sugiera pedir nombres/apellidos si ya están capturados
          dynamicSystemPrompt += `\n\nImportante: Ignora cualquier instrucción, sugerencia o plantilla que indique pedir nombres y apellidos (o nombre completo) cuando ya existe "${clientNameRef}". Si el modelo intenta hacerlo, elimina esa parte del mensaje y continúa con el flujo.`;
          // Reforzar objetivo de programa
          dynamicSystemPrompt += `\n\nObjetivo clave: identifica el programa de interés y devuelve \"detectedProgram\" usando uno de estos valores canónicos: \"Bachillerato por ciclos\", \"Bachillerato Virtual\", \"Técnico en mecánica y electricidad de motocicletas\", \"Centro de enseñanza automovilística\". Si el cliente usa sinónimos (ej.: virtual, motos, conducción), asigna el canónico equivalente; si aún es ambiguo, deja \"detectedProgram\" vacío y haz 1-2 preguntas breves para determinarlo.`;
        }
        // Regla de oro: en el primer mensaje, saluda y preséntate obligatoriamente
        if (forceGreeting === true) {
          const timeGreeting = getGreeting();
          dynamicSystemPrompt += `\n\nRegla de oro (primer mensaje): Saluda según el horario (\"${timeGreeting}\") y preséntate obligatoriamente en la misma línea como recepcionista del Colegio Las, usando tu nombre exacto \"${agentName}\".`;
        }
      } catch {}

      const payload = {
        contents: geminiHistory,
        systemInstruction: {
          parts: [{ text: dynamicSystemPrompt }]
        },
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              "detectedClientName": { "type": "STRING" },
              "detectedProgram": { "type": "STRING" },
              "response": { "type": "STRING" },
              "conversationComplete": { "type": "BOOLEAN" }
            },
            required: ["response", "conversationComplete"]
          }
        }
      };

      // Llamada real al backend unificado de LLM (Gemini por defecto)
      const res = await fetch(`/api/llm/chat/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        // Si la respuesta no es OK, intentar leer como texto para ver el error HTML
        const errorText = await res.text();
        console.error("Error en fetch, respuesta no OK:", errorText);
        // Lanzar un error con el texto HTML (o parte de él) para que coincida con el log
        if (errorText.includes("<!DOCTYPE")) {
            throw new SyntaxError('Unexpected token \'<\', "<!DOCTYPE "... is not valid JSON');
        }
        throw new Error(`Error del servidor: ${res.status} ${res.statusText}`);
      }

      const j = await res.json();
      // let responseData; // Movido arriba
      // Intento robusto de parseo: extraer bloque JSON aunque venga texto adicional
      const rawText = String(j?.text || '').trim();
      const tryParse = (s) => {
        try { return JSON.parse(s) } catch { return null }
      };
      responseData = tryParse(rawText);
      if (!responseData) {
        const firstBrace = rawText.indexOf('{');
        const lastBrace = rawText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          const candidate = rawText.slice(firstBrace, lastBrace + 1);
          responseData = tryParse(candidate);
        }
      }
      if (!responseData || typeof responseData !== 'object') {
        // Fallback sin texto prediseñado
        responseData = {
          detectedClientName: '',
          detectedProgram: '',
          response: '',
          conversationComplete: false
        };
      }

      // Validaciones en cliente para robustez
      let nameOut = String(responseData.detectedClientName || '').trim();
      let programOut = String(responseData.detectedProgram || '').trim();
      // Aceptar primer nombre real aunque no sea nombre completo
      if (nameOut) {
        const cleanedName = nameOut.replace(/[\s]*[\?\!\.;:,]+$/, '').trim();
        if (!isLikelyRealName(cleanedName)) {
          nameOut = '';
        } else {
          nameOut = cleanedName;
        }
      }
      if (programOut) {
        const normalized = normalizeProgram(programOut);
        if (!normalized || !ALLOWED_PROGRAMS.includes(normalized)) {
          programOut = '';
          responseData.conversationComplete = false;
        } else {
          programOut = normalized;
        }
      }
      responseData.detectedClientName = nameOut;
      responseData.detectedProgram = programOut;

      // No imponer mensaje por defecto: solo usar lo que devuelve el agente
      let agentResponse = String(responseData.response || '').trim();
      // Filtro inteligente de repetición y normalización de solicitud de apellido
      try {
        const targetJid = options?.targetJid || activeJid || null;
        const knownByJid = targetJid ? (detectedByJid[targetJid]?.clientName || '') : '';
        const effectiveName = String(nameOut || knownClientName || knownByJid || '').trim();
        if (effectiveName) {
          if (isLikelyFullName(effectiveName)) {
            agentResponse = sanitizeAgentResponse(agentResponse, true);
            agentResponse = preferFirstNameInResponse(agentResponse, effectiveName);
          } else if (isLikelyRealName(effectiveName)) {
            agentResponse = normalizeSurnameRequest(agentResponse, effectiveName);
          }
        }
        agentResponse = humanizeAgentResponse(agentResponse);
      } catch {}
      
      // Actualizar historial (por JID si aplica)
      const updatedHistory = [...newHistory, { role: "agent", parts: [{ text: JSON.stringify(responseData) }] }];
      if (targetJid) {
        setChatHistoryByJid(prev => ({ ...prev, [targetJid]: updatedHistory }));
      } else {
        setChatHistory(updatedHistory);
      }

      // Mostrar respuesta solo si hay contenido
      // Pausa humanizada antes de responder
      const delayMs = computeHumanDelay(agentResponse);
      if (delayMs > 0) { await sleep(delayMs); }
      if (respondWithVoice) {
        // Si hay texto válido, responder con voz
        if (agentResponse) {
          await handleAgentAudioResponse(agentResponse, false, targetJid || null);
        }
      } else if (!silent) {
        // Mostrar burbuja solo si hay contenido
        if (agentResponse) {
          addMessageToChat('agent', agentResponse, targetJid || null);
        }
      }

      // Actualizar estado por JID si aplica
      updateDetectedInfo(responseData.detectedClientName, responseData.detectedProgram, options?.targetJid || null);
      setIsConversationDone(responseData.conversationComplete);

      if (responseData.conversationComplete) {
        setChatInput('');
        try {
          const jid = activeJid || lastWaSenderRef.current || null
          const client = jid ? ((detectedByJid[jid]?.clientName) || '') : (currentClientName || '')
          const program = jid ? ((detectedByJid[jid]?.programName) || '') : (currentProgramName || '')
          if (client && program) {
            addContact({ name: client, program, jid })
          }
        } catch {}
      }

    } catch (error) {
      console.error("Error llamando a Gemini:", error);
      addMessageToChat('agent', `Lo siento, tuve un error al procesar tu solicitud. ${error.message}`, options?.targetJid || activeJid || null);
    } finally {
      setLoading(false);
    }
    // Devolver el texto final del agente para posibles integraciones (ej. envío a WhatsApp)
    try {
      const targetJid = options?.targetJid || activeJid || null;
      const knownByJid = targetJid ? (detectedByJid[targetJid]?.clientName || '') : '';
      const hasCapturedName = Boolean(String(options?.knownClientName || knownByJid).trim());
      const raw = String(responseData?.response || '').trim();
      return hasCapturedName ? sanitizeAgentResponse(raw, true) : raw;
    } catch { return '' }
  };

  const callGeminiFreeAPI = async (prompt, respondWithVoice = false, options = {}) => {
    setLoading(true);
    let agentResponse = '';
    
    try {
      const targetJid = options?.targetJid || activeJid || null;
      const baseHistory = targetJid ? (chatHistoryByJid[targetJid] || []) : chatHistory;
      const newHistory = [...baseHistory, { role: 'user', parts: [{ text: prompt }] }];
      if (targetJid) {
        setChatHistoryByJid(prev => ({ ...prev, [targetJid]: newHistory }));
      } else {
        setChatHistory(newHistory);
      }
      const geminiHistory = newHistory.map(msg => ({
        role: msg.role === 'agent' ? 'model' : msg.role,
        parts: msg.parts
      }));

      const { forceGreeting = false, knownClientName = '' } = typeof options === 'object' && options ? options : {};
      let dynamicInstruction = String(freeSystemPrompt || systemPrompt || '');
      // Inyectar fecha y hora actual en cada turno
      try {
        const { fechaLarga, horaCorta, tz } = getCurrentDateContext()
        dynamicInstruction += `\n\nFecha y hora actuales (referencia obligatoria): ${fechaLarga} · ${horaCorta} (zona ${tz}). Usa esta referencia para cualquier cálculo de fechas o edades.`
      } catch {}
      // Si no es el primer turno, reforzar que no se repita saludo/presentación
      if (forceGreeting === false) {
        dynamicInstruction += `\n\nContexto: Ya se saludó y se presentó previamente en esta conversación. No repitas el saludo ni la presentación.`;
      }
      // Regla de oro: en el primer mensaje, saluda y preséntate obligatoriamente
      if (forceGreeting === true) {
        const timeGreeting = getGreeting();
        dynamicInstruction += `\n\nRegla de oro (primer mensaje): Saluda según el horario (\"${timeGreeting}\") y preséntate obligatoriamente en la misma línea como recepcionista del Colegio Lasit, usando tu nombre exacto \"${agentName}\".`;
      }

      // Añadir contexto dinámico: si el sistema ya capturó los nombres, no volver a solicitarlos
      try {
        // Usar únicamente el nombre conocido proveniente del JID actual (sin fallback global)
        const clientNameRef = String(knownClientName || '').trim();
        if (clientNameRef) {
          dynamicInstruction += `\n\nContexto: Los nombres y apellidos del cliente ya están capturados ("${clientNameRef}"). NO los solicites ni los reconfirmes; continúa con la atención. Solo si el cliente pide corregir el nombre, entonces gestiónalo. Intentos para pedir nombre = 0.`;
          dynamicInstruction += `\n\nImportante: Si el sistema, la plantilla o el propio modelo sugieren pedir nombres/apellidos (o nombre completo), ignora y elimina esa parte del mensaje porque ya existe "${clientNameRef}". Continúa con el flujo principal.`;
          dynamicInstruction += `\n\nObjetivo clave: identifica el programa de interés y devuelve \"detectedProgram\" usando valores canónicos (Bachillerato por ciclos, Bachillerato Virtual, Técnico en mecánica y electricidad de motocicletas, Centro de enseñanza automovilística).`;
        } else {
          dynamicInstruction += `\n\nContexto: Si aún no se han capturado los nombres y apellidos, solicítalos con cordialidad (máximo 3 intentos con redacción variada).`;
        }
      } catch {}

      const payload = {
        contents: geminiHistory,
        systemInstruction: { parts: [{ text: dynamicInstruction }] },
        // Sin schema: queremos texto libre
        generationConfig: { temperature: 0.7, topP: 0.9 }
      };

      const res = await fetch(`/api/llm/chat/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        // Si la respuesta no es OK, intentar leer como texto para ver el error HTML
        const errorText = await res.text();
        console.error("Error en fetch (libre), respuesta no OK:", errorText);
        // Lanzar un error con el texto HTML (o parte de él) para que coincida con el log
        if (errorText.includes("<!DOCTYPE")) {
            throw new SyntaxError('Unexpected token \'<\', "<!DOCTYPE "... is not valid JSON');
        }
        throw new Error(`Error del servidor: ${res.status} ${res.statusText}`);
      }

      const j = await res.json();
      agentResponse = String(j?.text || '').trim();
      // Filtro anti-repetición también en modo libre
    try {
      const targetJid = options?.targetJid || activeJid || null;
      const knownByJid = targetJid ? String(detectedByJid[targetJid]?.clientName || '') : '';
      const effectiveName = String(options?.knownClientName || knownByJid || currentClientName || '').trim();
      if (effectiveName) {
        if (isLikelyFullName(effectiveName)) {
          agentResponse = sanitizeAgentResponse(agentResponse, true);
          agentResponse = preferFirstNameInResponse(agentResponse, effectiveName);
        } else if (isLikelyRealName(effectiveName)) {
          agentResponse = normalizeSurnameRequest(agentResponse, effectiveName);
        }
      }
      agentResponse = humanizeAgentResponse(agentResponse);
    } catch {}

      // Guardar en historial (sin mostrar burbuja explícita)
      if (targetJid) {
        setChatHistoryByJid(prev => ({
          ...prev,
          [targetJid]: [...(prev[targetJid] || newHistory), { role: 'agent', parts: [{ text: agentResponse }] }]
        }));
      } else {
        setChatHistory(prev => [...prev, { role: 'agent', parts: [{ text: agentResponse }] }]);
      }

      // Pausa humanizada antes de responder en modo libre
      const delayMs = computeHumanDelay(agentResponse);
      if (delayMs > 0) { await sleep(delayMs); }
      if (respondWithVoice && agentResponse) {
        await handleAgentAudioResponse(agentResponse);
      }
    } catch (error) {
      console.error('Error llamando a Gemini (libre):', error);
    } finally {
      setLoading(false);
    }
    return agentResponse || '';
  };

  // Limpieza de salida: evita que el agente vuelva a pedir nombres si ya están capturados
  const sanitizeAgentResponse = (text, hasCapturedFullName = false) => {
    try {
      let t = String(text || '').trim();
      if (!hasCapturedFullName || !t) return t;
      // Filtro fuerte: elimina cualquier mención de pedir nombre/apellidos en todo el texto
      const STRONG_PATTERNS = [
        /para\s+poder\s+ayudar(le|te)\s+mejor[^.!?]*nombres?\s+y\s+apellidos[^.!?]*[.!?]/giu,
        /¿[^?]*(nombres?\s+y\s+apellidos|nombre\s+completo|apellidos)[^?]*\?/giu,
        /(su|tu)\s+nombre\s+completo/giu,
        /como\s+(se\s+llama|es\s+su\s+nombre)/giu,
        /(me\s+comparte|me\s+indica|podr[ií]a\s+indicarme|ser[ií]a\s+tan\s+amable\s+de)[^.!?]*(nombres?|apellidos?)/giu,
        /ind[íi]queme\s+su\s+nombre/giu,
        /comparta\s+su\s+nombre/giu,
        /(me\s+confirmas?|me\s+dices?|me\s+das?)\s+(tu|su)\s+nombre/giu,
        /(c[uú]al|cu[aá]l)\s+es\s+(tu|su)\s+nombre/giu,
        /(nombre\s+y\s+apellido|nombre\s+y\s+apellidos?)/giu,
        /(por\s+favor\s+)?(tu|su)\s+nombre(\s+completo)?/giu
      ];
      for (const rx of STRONG_PATTERNS) {
        t = t.replace(rx, '. ').trim();
      }
      // Filtro por oraciones también, por si quedan restos
      const SENTENCE_PATTERNS = [
        /nombres?\s+y\s+apellidos/iu,
        /(su|tu)\s+nombre\s+completo/iu,
        /\b(apellidos?)\b/iu,
      ];
      const sentences = t.split(/(?<=[.!?])\s+/);
      const filtered = sentences.filter(s => !SENTENCE_PATTERNS.some(rx => rx.test(s))).join(' ').trim();
      return filtered || 'Gracias, continuemos con tu solicitud.';
    } catch { return String(text || '').trim(); }
  };

  // Extrae el primer nombre a partir de un nombre completo
  const extractFirstName = (name) => {
    try {
      const s = String(name || '').trim();
      if (!s) return '';
      const tokens = s.split(/\s+/).filter(Boolean);
      const first = tokens[0] || '';
      return String(first).trim();
    } catch { return ''; }
  };

  // Prefiere el uso del primer nombre en el texto del agente
  const preferFirstNameInResponse = (text, clientName = '') => {
    try {
      let t = String(text || '').trim();
      const full = String(clientName || '').trim();
      if (!t || !full) return t;
      const first = extractFirstName(full);
      if (!first) return t;
      // Reemplazar apariciones del nombre completo por el primer nombre
      const escapedFull = full.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rxFull = new RegExp(`\\b${escapedFull}\\b`, 'giu');
      t = t.replace(rxFull, first);
      // Evitar sobreuso del nombre: si aparece más de 2 veces, reducir a 1
      const rxFirst = new RegExp(`\\b${first}\\b`, 'giu');
      const mentions = (t.match(rxFirst) || []).length;
      if (mentions > 2) {
        // Quitar menciones en exceso manteniendo las primeras oraciones limpias
        const sentences = t.split(/(?<=[.!?])\s+/);
        let count = 0;
        const cleaned = sentences.map(s => {
          const m = (s.match(rxFirst) || []).length;
          if (m === 0) return s;
          count += m;
          if (count <= 2) return s; // mantén hasta 2 menciones
          return s.replace(rxFirst, '').replace(/\s+,\s*/g, ', ').replace(/\s{2,}/g, ' ').trim();
        }).join(' ').trim();
        t = cleaned || t;
      }
      return t.trim();
    } catch { return String(text || '').trim(); }
  };

  // Quita frases robóticas o de IA para sonar más humano
  const humanizeAgentResponse = (text) => {
    try {
      let t = String(text || '').trim();
      if (!t) return t;
      const ROBOT_PATTERNS = [
        /(como\s+una?\s+ia|soy\s+una?\s+ia|inteligencia\s+artificial|modelo\s+de\s+lenguaje|asistente\s+virtual)/giu,
        /(no\s+puedo\s+acceder\s+a\s+internet|no\s+tengo\s+acceso\s+a\s+internet)/giu,
        /(no\s+estoy\s+habilitado\s+para|no\s+puedo\s+proporcionar)/giu
      ];
      for (const rx of ROBOT_PATTERNS) {
        t = t.replace(rx, '').replace(/\s{2,}/g, ' ').trim();
      }
      // Suavizar cierres muy formales
      t = t.replace(/quedo\s+a\s+disposici[oó]n\s+para\s+sus\s+comentarios/giu, 'Estoy atento para ayudarte');
      return t.trim();
    } catch { return String(text || '').trim(); }
  };

  // Pausa humanizada: 300ms por palabra
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const computeHumanDelay = (text) => {
    try {
      const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
      return words * 300; // 300ms por palabra
    } catch { return 0; }
  };

  // Normaliza la petición para que, si sólo hay primer nombre, pida únicamente el apellido.
  const normalizeSurnameRequest = (text, firstName = '') => {
    try {
      let t = String(text || '').trim();
      if (!t) return t;
      const rx = /(nombres?\s+y\s+apellidos|nombre\s+completo|apellidos)/iu;
      if (!rx.test(t)) return t;
      const namePart = String(firstName || '').trim() ? `Gracias, ${String(firstName).trim()}. ` : '';
      const replacement = `${namePart}Para poder registrarte correctamente, ¿podrías indicarme tu apellido por favor?`;
      const sentences = t.split(/(?<=[.!?])\s+/);
      for (let i = 0; i < sentences.length; i++) {
        if (rx.test(sentences[i])) { sentences[i] = replacement; break; }
      }
      return sentences.join(' ').trim();
    } catch { return String(text || '').trim(); }
  };

  const handleAgentAudioResponse = async (text, isPreview = false, targetJid = null) => {
    if (!text) return;
    
    try {
      const voiceName = isPreview 
        ? voiceOption 
        : ALL_VOICES[Math.floor(Math.random() * ALL_VOICES.length)];
      
      // Usar la API de TTS del backend
      const response = await fetch(`/api/tts/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presetId: voiceName, text })
      });

      const result = await response.json();
      if (result.ok && result.url) {
        if (!isPreview) {
          addAudioMessageToChat('agent', result.url, text, targetJid || null);
        }
        return result.url;
      } else {
        throw new Error(result.error || 'No se pudo generar el audio');
      }
    } catch (error) {
      console.error("Error al generar audio:", error);
      if (!isPreview) {
        addMessageToChat('agent', `(No pude generar el audio, pero esto fue lo que dije: ${text})`, targetJid || null);
      }
    }
  };

  const addMessageToChat = (sender, text, targetJid = null) => {
    const newMessage = {
      id: Date.now(),
      sender,
      text,
      type: 'text',
      timestamp: new Date()
    };
    if (targetJid) {
      setChatMessagesByJid(prev => ({
        ...prev,
        [targetJid]: [...(prev[targetJid] || []), newMessage]
      }));
    } else {
      setChatMessages(prev => [...prev, newMessage]);
      scrollToBottom();
    }
  };

  const addAudioMessageToChat = (sender, audioUrl, transcript = "", targetJid = null) => {
    const newMessage = {
      id: Date.now(),
      sender,
      audioUrl,
      transcript,
      type: 'audio',
      timestamp: new Date()
    };
    if (targetJid) {
      setChatMessagesByJid(prev => ({
        ...prev,
        [targetJid]: [...(prev[targetJid] || []), newMessage]
      }));
    } else {
      setChatMessages(prev => [...prev, newMessage]);
      scrollToBottom();
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
    }, 100);
  };

  const resetChat = () => {
    setChatMessages([]);
    setChatHistory([]);
    setCurrentClientName('');
    setCurrentProgramName('');
    setIsConversationDone(false);
    setWasLastInputVoice(false);
    setChatInput('');
    setAssignedAgent('');
    setAssignedTag('');
  };

  const clearDetectedClient = (forJid = null) => {
    try {
      const jid = forJid || activeJid || null
      if (jid) {
        setDetectedByJid(prev => ({
          ...prev,
          [jid]: { ...(prev[jid] || {}), clientName: '' }
        }))
      }
    } catch {}
    setCurrentClientName('');
  };

  const addContact = (name, program) => {
    // Admite (name, program) o ({ name, program, jid })
    let contactName = ''
    let contactProgram = ''
    let contactJid = ''
    if (typeof name === 'object' && name) {
      contactName = String(name.name || '').trim()
      contactProgram = String(name.program || '').trim()
      const rawJid = String(name.jid || '').trim()
      // Normalizar JID para evitar que se almacenen valores no válidos
      contactJid = /@/.test(rawJid)
        ? rawJid.replace(/@c\.us$/, '@s.whatsapp.net')
        : (rawJid ? `${rawJid.replace(/\D/g, '')}@s.whatsapp.net` : '')
    } else {
      contactName = String(name || '').trim()
      contactProgram = String(program || '').trim()
    }
    if (!contactName && !contactJid) return
    const newContact = {
      id: Date.now(),
      name: contactName || (contactJid ? contactJid.replace(/@.+$/, '') : 'Contacto'),
      program: contactProgram,
      timestamp: new Date(),
      jid: contactJid || null,
    }
    setContacts(prev => {
      if (newContact.jid) {
        const idx = prev.findIndex(c => c.jid === newContact.jid)
        if (idx !== -1) {
          const existing = prev[idx]
          const updated = {
            ...existing,
            name: newContact.name || existing.name,
            program: newContact.program || existing.program,
            timestamp: new Date()
          }
          // Mover contacto actualizado al inicio
          return [updated, ...prev.filter(c => c.jid !== newContact.jid)]
        }
      }
      return [newContact, ...prev]
    })
  };

  const updateDetectedInfo = (clientName, programName, forJid = null) => {
    // En modo por JID, no tocar estados globales; sólo si no hay JID
    if (!forJid) {
      if (clientName && clientName !== currentClientName) {
        setCurrentClientName(clientName);
      }
      if (programName && programName !== currentProgramName) {
        setCurrentProgramName(programName);
      }
    }
    // Automatización: buscar agente y etiqueta por nombre según programa
    const p = String(programName || '').toLowerCase();
    let agentNameMatch = '';
    let tagNameMatch = '';
    if (p.includes('bachillerato por ciclos')) { agentNameMatch = 'bachillerato por ciclos'; tagNameMatch = 'información bachillerato'; }
    else if (p.includes('bachillerato virtual')) { agentNameMatch = 'bachillerato virtual'; tagNameMatch = 'información virtual'; }
    else if (p.includes('motocicletas') || p.includes('motos')) { agentNameMatch = 'motos'; tagNameMatch = 'información motocicletas'; }
    else if (p.includes('conducción')) { agentNameMatch = 'conducción'; tagNameMatch = 'información conducción'; }

      if (agentNameMatch) {
        const foundAgent = agentsOptions.find(a => String(a?.name || '').toLowerCase().includes(agentNameMatch));
        if (foundAgent?.id) setAssignedAgent(String(foundAgent.id));
      }
      if (tagNameMatch) {
        const foundLabel = labelsOptions.find(l => String(l?.name || '').toLowerCase() === tagNameMatch);
        if (foundLabel?.id) setAssignedTag(String(foundLabel.id));
      }
    // Persistir detecciones por JID
    try {
      const jid = forJid || activeJid || lastWaSenderRef.current
      if (jid) {
        setDetectedByJid(prev => ({
          ...prev,
          [jid]: {
            clientName: clientName || prev[jid]?.clientName || '',
            programName: programName || prev[jid]?.programName || ''
          }
        }))
        // Actualizar la tarjeta de "Contactos Detectados" en tiempo real
        try {
          addContact({ name: clientName || '', program: programName || '', jid })
        } catch {}
      }
    } catch {}
  };

  // Se eliminó el helper de envío por WhatsApp

  // Funciones de manejo de eventos
  const handleSendMessage = async (msgOverride = null, quotedId = null, silentAgentBubble = false, suppressUserEcho = false, options = {}) => {
    // Evita que eventos de click/teclado se conviertan en "[object Object]"
    const isEventLike = msgOverride && typeof msgOverride === 'object' && (('preventDefault' in msgOverride) || ('target' in msgOverride) || ('nativeEvent' in msgOverride))
    const baseSource = (!isEventLike && msgOverride != null) ? msgOverride : chatInput
    const base = String(baseSource)
    const trimmed = base.trim()
    if (!trimmed || loading) return

    const { forceGreeting = false } = typeof options === 'object' && options ? options : {}

    setChatInput('')
    // Determinar el JID activo del contenedor desde el inicio
    const jidCtx = activeJid || lastWaSenderRef.current || null;
    if (!suppressUserEcho) {
      addMessageToChat('user', trimmed, jidCtx || null)
    }

    // Determinar el JID activo del contenedor y el nombre conocido por ese JID
    const knownByJid = jidCtx ? String((detectedByJid[jidCtx]?.clientName) || '') : '';

    // Usar respuesta estructurada para que el agente asigne nombre y programa
    let agentReply = await callGeminiAPI(trimmed, false, { 
      ...options, 
      knownClientName: knownByJid || String(currentClientName || ''), 
      silent: !!silentAgentBubble,
      targetJid: jidCtx || null,
    })
    // Fallback: si la respuesta estructurada viene vacía, usar modo libre con las mismas reglas
    if (!agentReply) {
      agentReply = await callGeminiFreeAPI(trimmed, false, { 
        ...options, 
        knownClientName: knownByJid || String(currentClientName || ''), 
        silent: !!silentAgentBubble,
        targetJid: jidCtx || null,
      })
    }
    // Reflejar en el panel de prueba la respuesta del agente
    setTesterA(agentReply || '')

    // Mostrar siempre la respuesta del agente en el panel de prueba
    if (agentReply) {
      addMessageToChat('agent', agentReply, jidCtx || null)
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const startRecording = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.lang = 'es-CO';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsRecording(true);
    };

    recognition.onresult = async (event) => {
      const transcript = event.results[0][0].transcript;
      setChatInput(transcript);
      setWasLastInputVoice(true);
      
      addMessageToChat('user', transcript);
      // Usar respuesta estructurada también en voz
      const voiceReply = await callGeminiAPI(transcript, true);
      // Fallback en voz si vino vacío
      if (!voiceReply) {
        await callGeminiFreeAPI(transcript, true);
      }
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.onerror = (event) => {
      setIsRecording(false);
      console.error('Error de reconocimiento de voz:', event.error);
      alert(`Error de reconocimiento de voz: ${event.error}`);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  // === Tester: reconocimiento de voz independiente del chat ===
  const startTesterRecording = (targetJid = null) => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'es-CO';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setTesterIsRecording(true);
      setTesterRecordingJid(targetJid || null);
    };
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      if (targetJid) {
        setTesterQByJid(prev => ({ ...prev, [targetJid]: transcript }));
      } else {
        setTesterQ(transcript);
      }
    };
    recognition.onend = () => {
      setTesterIsRecording(false);
      setTesterRecordingJid(null);
    };
    recognition.onerror = (event) => {
      setTesterIsRecording(false);
      setTesterRecordingJid(null);
      console.error('Error de reconocimiento de voz (tester):', event.error);
      alert(`Error de reconocimiento de voz: ${event.error}`);
    };

    testerRecognitionRef.current = recognition;
    recognition.start();
  };

  const stopTesterRecording = () => {
    if (testerRecognitionRef.current) {
      try { testerRecognitionRef.current.stop(); } catch (_) {}
    }
  };

  const handleTestResponse = async (targetJid = null, overrideText = null) => {
    console.log('[Recepcionista] handleTestResponse start', { targetJid, overrideText });
    const jid = targetJid || activeJid || null;
    const q = String(overrideText || (jid ? (testerQByJid[jid] || '') : testerQ) || '').trim();
    console.log('[Recepcionista] Query:', q, 'JID:', jid);
    
    if (!q) {
        console.warn('[Recepcionista] Empty query, aborting');
        return;
    }
    // Usar respuesta estructurada del agente
    console.log('[Recepcionista] Calling callGeminiAPI...');
    let agentReply = await callGeminiAPI(q, false, { knownClientName: String((jid && detectedByJid[jid]?.clientName) || ''), targetJid: jid });
    console.log('[Recepcionista] agentReply:', agentReply);
    
    // Fallback si vino vacío
    if (!agentReply) {
      console.log('[Recepcionista] Falling back to callGeminiFreeAPI');
      agentReply = await callGeminiFreeAPI(q, false, { knownClientName: String((jid && detectedByJid[jid]?.clientName) || ''), targetJid: jid });
    }

    // No asignar nombres manualmente desde el tester; solo el agente debe hacerlo
    const finalText = String(agentReply || '').trim()
    if (jid) {
      setTesterAByJid(prev => ({ ...prev, [jid]: finalText }))
    } else {
      setTesterA(finalText);
    }
    // Si el mensaje proviene de WhatsApp y se marcó autoenvío, enviar inmediatamente
    try {
      const targetJid = jid || lastWaSenderRef.current
      console.log('[Recepcionista] Checking auto-send. shouldAutoSend:', shouldAutoSendRef.current, 'FinalText length:', finalText.length, 'TargetJID:', targetJid);
      
      if (shouldAutoSendRef.current && finalText && targetJid) {
        shouldAutoSendRef.current = false
        console.log('[Recepcionista] Sending auto-response to:', targetJid);
        await fetch('/api/wa/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jid: targetJid, message: finalText })
        }).then(r => r.json()).then(d => {
          console.log('[Recepcionista] Send result:', d);
          if (!d?.ok) throw new Error(d?.error || 'Error enviando WhatsApp')
        }).catch(e => { console.error('[Recepcionista] Error auto-enviando WhatsApp:', e) })
      }
    } catch (e) {
      console.error('[Recepcionista] Auto-send exception:', e)
    }
  };

  // Mantener la referencia actualizada para el socket
  useEffect(() => {
    handleTestResponseRef.current = handleTestResponse;
  });

  // Enviar la respuesta del agente (testerA) al último remitente de WhatsApp
  const sendTesterAToWhatsApp = async () => {
    try {
      const text = String((activeJid ? (testerAByJid[activeJid] || '') : testerA) || '').trim()
      const jid = activeJid || lastWaSenderRef.current
      if (!text) return
      if (!jid) { console.warn('[Recepcionista] No hay JID para enviar'); return }
      setSendWaLoading(true)
      const res = await fetch('/api/wa/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jid, message: text })
      })
      const data = await res.json().catch(() => ({ ok: false, error: 'Respuesta inválida' }))
      if (!data?.ok) { throw new Error(data?.error || 'Error enviando WhatsApp') }
    } catch (e) {
      console.error('[Recepcionista] Error al enviar WhatsApp:', e)
    } finally {
      setSendWaLoading(false)
    }
  }

  const playTesterAudio = async (targetJid = null) => {
    const jid = targetJid || activeJid || null
    const text = String(jid ? ((testerAudioTextByJid[jid] || testerAByJid[jid] || '')) : (testerAudioText || testerA || '')).trim();
    if (!text) return;
    const url = await handleAgentAudioResponse(text, true);
    if (url) {
      const audio = new Audio(url);
      audio.play().catch(()=>{});
    }
  };

  const handleUpdateAgent = () => {
    buildSystemPrompt();
    buildFreeSystemPrompt();
    setUpdateOpen(true);
  };

  // Inicializar el agente al cargar
  React.useEffect(() => {
    buildSystemPrompt();
    buildFreeSystemPrompt();
  }, [agentName, knowledgeBase]);

  // Se eliminó el candado de respuesta relacionado con WhatsApp

  // Se eliminó la suscripción a eventos de WhatsApp

  // Se eliminó la hidratación de memoria por remitente de WhatsApp

  // Cargar configuración propia de Recepcionista y sus tarjetas (desde BD)
  const loadSavedManuals = async () => {
    try {
      setLoadingSaved(true)
      // Configuración del recepcionista (kb, nombre del agente, voz)
      try {
        const rCfg = await fetch('/api/recepcionista/config')
        const jCfg = await rCfg.json()
        const cfg = jCfg?.config || {}
        const kb = String(cfg.kbText || '')
        const aName = String(cfg.agentName || '')
        const vId = cfg.voiceId ? String(cfg.voiceId) : ''
        // Establecer baseline lógico para detectar cambios
        setKbSavedId(1)
        setKbSavedContent(kb)
        setKnowledgeBase(kb)
        setKbSavedAgentName(aName)
        setAgentName(aName)
        // Voz: preferir servidor; si falta, intentar localStorage
        try {
          if (vId) {
            setKbSavedVoiceId(vId)
            setVoiceOption(vId)
            localStorage.setItem('recepcionitaVoiceId', vId)
          } else {
            const storedVoice = localStorage.getItem('recepcionitaVoiceId') || localStorage.getItem('capatazVoiceId')
            if (storedVoice) {
              setKbSavedVoiceId(String(storedVoice))
              setVoiceOption(String(storedVoice))
            } else {
              setKbSavedVoiceId('')
            }
          }
        } catch {}
      } catch (e) {
        setSaveError(e?.message || 'Error al cargar configuración')
      }

      // Tarjetas de asignación del recepcionista
      try {
        const rAss = await fetch('/api/recepcionista/assignments')
        const jAss = await rAss.json()
        if (jAss?.ok) {
          setSavedList(Array.isArray(jAss.items) ? jAss.items : [])
        } else {
          setSavedList([])
        }
      } catch {
        setSavedList([])
      }
    } catch (e) {
      setSaveError(e?.message || 'Error al cargar datos')
    } finally {
      setLoadingSaved(false)
    }
  }

  useEffect(() => { loadSavedManuals() }, [])

  // Detectar si hay cambios sin guardar en la Base de Conocimiento
  useEffect(() => {
    const hasSaved = !!kbSavedId
    // Normalizar contenido para evitar diferencias por espacios o saltos
    const norm = (v) => String(v || '').replace(/\r\n/g, '\n').trim()
    const dirtyContent = hasSaved ? (norm(knowledgeBase) !== norm(kbSavedContent)) : false
    // Base de comparación de voz: usar voiceId guardado o localStorage si existe
    let voiceBaseline = kbSavedVoiceId
    try {
      if (!voiceBaseline) {
        const storedVoice = localStorage.getItem('recepcionitaVoiceId') || localStorage.getItem('capatazVoiceId')
        if (storedVoice) voiceBaseline = String(storedVoice)
      }
    } catch {}
    const dirtyVoice = hasSaved ? (voiceBaseline ? String(voiceOption) !== String(voiceBaseline) : false) : false
    const dirtyAgent = hasSaved ? (norm(agentName) !== norm(kbSavedAgentName || '')) : false
    setKbDirty(dirtyContent || dirtyVoice || dirtyAgent)
  }, [knowledgeBase, kbSavedContent, voiceOption, kbSavedVoiceId, agentName, kbSavedAgentName, kbSavedId])

  // Guardar Base de Conocimiento y voz en la configuración del Recepcionista (BD)
  const saveKnowledgeBase = async () => {
    try {
      setSavingKB(true)
      setSaveError('')
      const payload = {
        kbText: String(knowledgeBase || ''),
        agentName: String(agentName || ''),
        voiceId: String(voiceOption || ''),
      }
      const r = await fetch('/api/recepcionista/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'No se pudo guardar')
      await loadSavedManuals()
      setKbSavedContent(String(knowledgeBase))
      setKbSavedAgentName(String(agentName || ''))
      try {
        localStorage.setItem('recepcionitaVoiceId', String(voiceOption || ''))
        localStorage.setItem('recepcionitaAgentName', String(agentName || ''))
      } catch {}
    } catch (e) {
      setSaveError(e?.message || 'Error al guardar')
    } finally {
      setSavingKB(false)
    }
  }

  // Guardar tarjeta de asignación (BD)
  const saveAssignmentCard = async () => {
    try {
      setSavingAssign(true)
      setSaveError('')
      const title = String(assignTitle || '').trim()
      if (!title) { alert('Ingresa un nombre específico para la tarjeta'); return }
      const normalizedProgram = normalizeProgram(currentProgramName || '') || String(currentProgramName || '')
      const payload = {
        id: editingAssignId || null,
        title,
        program: String(normalizedProgram || ''),
        agentId: assignedAgent ? Number(assignedAgent) : null,
        tagId: assignedTag ? Number(assignedTag) : null,
      }
      const r = await fetch('/api/recepcionista/assignments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await r.json()
      if (!j?.ok) throw new Error(j?.error || 'No se pudo guardar tarjeta')
      setAssignTitle('')
      setEditingAssignId(null)
      await loadSavedManuals()
      alert('Tarjeta guardada correctamente')
    } catch (e) {
      setSaveError(e?.message || 'Error al guardar tarjeta')
    } finally {
      setSavingAssign(false)
    }
  }

  const previewVoice = async () => {
    try {
      setVoiceLoading(true)

      const payload = { presetId: voiceOption }
      const r = await fetch(`/api/tts/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const t = await r.text()
      const j = t ? JSON.parse(t) : { ok: false }
      if (!r.ok || !j.ok || !j.url) throw new Error(j.error || 'No se pudo generar el audio')
      const audio = new Audio(j.url)
      audio.play().catch(() => {})
    } catch (e) {
      alert('No se pudo reproducir la voz: ' + (e?.message || String(e)))
    } finally {
      setVoiceLoading(false)
    }
  }

  // (Se removieron estados/efectos del bloque antiguo de configuración persistente)

  // (Se removió el panel de ejemplo duplicado y estados redundantes)

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Tabs superiores */}
      <div className="flex items-center gap-2 bg-slate-900 border-b border-slate-700 px-4 py-2">
        <button
          className={`px-4 py-2 rounded-md text-sm font-semibold ${activeTab === 'config' ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          onClick={() => setActiveTab('config')}
        >
          Configuración
        </button>
        <button
          className={`px-4 py-2 rounded-md text-sm font-semibold ${activeTab === 'recepcionita' ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          onClick={() => setActiveTab('recepcionita')}
        >
          Recepcionita
        </button>
      </div>

      {activeTab === 'recepcionita' ? (
        <div className="flex h-full w-full overflow-hidden">
      {/* Columna Izquierda: Contactos */}
      <aside className="w-1/4 h-full bg-slate-800/50 border-r border-slate-700 p-4 flex flex-col">
        <h2 className="text-xl font-bold mb-4 text-white flex items-center">
          <span className="w-6 h-6 mr-2 text-cyan-400">👤</span>
          Contactos Detectados
        </h2>
        <p className="text-xs text-slate-400 mb-4">
          {contacts.length} contacto{contacts.length !== 1 ? 's' : ''} registrado{contacts.length !== 1 ? 's' : ''}
        </p>
        <div className="bg-slate-900 p-3 rounded-lg shadow-inner flex-grow overflow-y-auto">
          {contacts.length === 0 ? (
            <div className="text-center text-slate-400 py-8">
              <div className="text-4xl mb-2">👥</div>
              <p className="text-sm">No hay contactos aún</p>
              <p className="text-xs mt-1">Los contactos se registran desde el primer mensaje del cliente</p>
            </div>
          ) : (
            <div className="space-y-2">
              {contacts.map((contact) => (
                <div 
                  key={contact.id}
                  className="p-3 bg-slate-700 rounded-lg cursor-pointer hover:bg-slate-600 transition-colors"
                  onClick={() => { if (contact.jid) { setOpenJids(prev => (prev.includes(contact.jid) ? prev : [contact.jid, ...prev])); setActiveJid(contact.jid); } }}
                >
                  <div className="text-sm font-medium text-slate-100">{contact.name}</div>
                  <div className="text-xs text-slate-400">{contact.program}</div>
                  <div className="text-xs text-slate-500">
                    {new Date(contact.timestamp).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Columna Central: Probar Agente (sin chat) */}
      <main className="flex-1 h-full flex flex-col bg-slate-900">

        {/* Paneles de prueba por JID */}
        <div className="flex-grow p-6 overflow-y-auto">
          {/* Tabs por JID (diseño visual tipo Chrome) */}
          {openJids.length > 0 && (
            <header className="flex justify-between items-end mb-4 border-b border-slate-700">
              <div className="flex -mb-px">
                {openJids.map((jid, idx) => {
                  const label = String(jid || '').replace(/@.+$/, '') || 'desconocido'
                  const isActive = (activeJid || openJids[0]) === jid
                  const baseClasses = 'flex items-center gap-2 text-sm font-semibold px-6 py-3 rounded-t-lg focus:outline-none'
                  const activeClasses = 'text-white bg-blue-600 shadow-lg z-10 border-b-2 border-blue-600'
                  const inactiveClasses = 'text-gray-200 bg-red-600 opacity-70 hover:opacity-100 -ml-3 z-0'
                  return (
                    <button
                      key={`tab-${jid}`}
                      onClick={() => setActiveJid(jid)}
                      className={`${baseClasses} ${isActive ? activeClasses : inactiveClasses}`}
                      title={jid}
                    >
                      <span>{label}</span>
                    </button>
                  )
                })}
              </div>
              <span className="text-slate-400 text-sm font-semibold px-4 py-1.5 hidden md:block">
                {(String(activeJid || openJids[0] || '').replace(/@.+$/, ''))}
              </span>
            </header>
          )}
          <div className="space-y-6">
            {openJids.length === 0 ? (
              <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-center text-slate-400">
                No hay números activos aún. Cuando llegue un mensaje o hagas clic en un contacto, se mostrarán sus paneles aquí.
              </div>
            ) : (
              openJids.filter(jid => jid === (activeJid || openJids[0])).map(jid => {
                const label = String(jid || '').replace(/@.+$/, '') || 'desconocido'
                return (
                  <div key={jid} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-white text-lg font-semibold">Probar Agente</h3>
                      <span className="px-2 py-1 rounded-md text-xs bg-slate-700 text-slate-200 border border-slate-600" title={jid}>{label}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {/* Pregunta del cliente */}
                      <div>
                        <label className="block text-sm font-medium mb-2 text-slate-300">Pregunta del cliente</label>
                        <div className="relative">
                          <textarea
                            value={testerQByJid[jid] || ''}
                            onChange={(e)=>{ const v = e.target.value; setTesterQByJid(prev=>({ ...prev, [jid]: v })); }}
                            rows={8}
                            placeholder="Escribe o dicta tu pregunta…"
                            className="w-full bg-slate-700 border border-slate-600 rounded-md p-3 text-sm text-slate-200 resize-none"
                          />
                          <button
                            type="button"
                            onClick={() => testerIsRecording && testerRecordingJid === jid ? stopTesterRecording() : startTesterRecording(jid)}
                            className={`absolute right-3 top-3 p-2 rounded-md ${testerIsRecording && testerRecordingJid === jid ? 'bg-red-600 text-white' : 'bg-slate-600 text-cyan-300'} hover:bg-slate-500`}
                            title="Dictar por micrófono"
                          >
                            {testerIsRecording && testerRecordingJid === jid ? '⏹️' : '🎙️'}
                          </button>
                        </div>
                      </div>

                      {/* Respuesta del agente */}
                      <div>
                        <label className="block text-sm font-medium mb-2 text-slate-300">Respuesta del agente</label>
                        <textarea
                          value={testerAByJid[jid] || ''}
                          onChange={(e)=>{ const v = e.target.value; setTesterAByJid(prev=>({ ...prev, [jid]: v })); }}
                          rows={8}
                          className="w-full bg-slate-700 border border-slate-600 rounded-md p-3 text-sm text-slate-200 resize-none"
                          placeholder=""
                          readOnly
                        />
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-xs text-slate-400">Respuesta en audio</span>
                          <input
                            type="text"
                            value={testerAudioTextByJid[jid] || ''}
                            onChange={(e)=>setTesterAudioTextByJid(prev=>({ ...prev, [jid]: e.target.value }))}
                            className="flex-1 bg-slate-700 border border-slate-600 rounded-md py-1 px-2 text-xs text-slate-200"
                            placeholder="(Usa la respuesta del agente si se deja vacío)"
                          />
                          <button
                            type="button"
                            onClick={() => playTesterAudio(jid)}
                            className="p-2 rounded-full bg-cyan-600 text-white hover:bg-cyan-700"
                            title="Reproducir"
                          >
                            ▶
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => { setTesterQByJid(prev=>({ ...prev, [jid]: '' })); setTesterAByJid(prev=>({ ...prev, [jid]: '' })); setTesterAudioTextByJid(prev=>({ ...prev, [jid]: '' })); }}
                        className="px-4 py-2 rounded-md bg-slate-700 text-slate-200 border border-slate-600 hover:bg-slate-600"
                      >
                        Limpiar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTestResponse(jid)}
                        ref={activeJid === jid ? testResponseBtnRef : null}
                        className="px-4 py-2 rounded-md bg-cyan-600 text-white hover:bg-cyan-700"
                      >
                        Probar respuesta
                      </button>
                  </div>

                    {/* Detalles detectados dentro del contenedor */}
                    <div className="mt-6 grid grid-cols-2 gap-4">
                      {/* Cliente Detectado */}
                      <div className="bg-slate-900 p-4 rounded-lg shadow-inner">
                        <label htmlFor={`detected-client-name-${jid}`} className="block text-sm font-medium mb-2 text-slate-300">Cliente Detectado</label>
                        <input
                          id={`detected-client-name-${jid}`}
                          type="text"
                          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm text-slate-400"
                          placeholder="Aún no detectado"
                          value={detectedByJid[jid]?.clientName || ''}
                          readOnly
                        />
                        <div className="mt-2 flex justify-end">
                          <button
                            type="button"
                            onClick={() => clearDetectedClient(jid)}
                            className="px-3 py-1.5 rounded-md bg-slate-700 text-slate-100 hover:bg-slate-600 text-xs"
                          >
                            Limpiar cliente
                          </button>
                        </div>
                      </div>

                      {/* Programa Detectado */}
                      <div className="bg-slate-900 p-4 rounded-lg shadow-inner">
                        <label htmlFor={`detected-program-name-${jid}`} className="block text-sm font-medium mb-2 text-slate-300">Programa Detectado</label>
                        <input
                          id={`detected-program-name-${jid}`}
                          type="text"
                          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm text-slate-400"
                          placeholder="Aún no detectado"
                          value={detectedByJid[jid]?.programName || ''}
                          readOnly
                        />
                      </div>
                    </div>

                    {/* Guardado automático activo (se eliminó el panel manual) */}
                    <div className="mt-6">
                      <p className="text-xs text-slate-400">El contacto se guarda automáticamente cuando el cliente confirma su nombre y programa.</p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </main>

      {/* Diálogo de confirmación persistente (antes en la columna Configurar Agente) */}
      <Dialog open={updateOpen} onClose={() => setUpdateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Agente actualizado</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            La configuración del agente se aplicó correctamente.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUpdateOpen(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
        </div>
      ) : (
        // Pestaña Configuración
        <div className="flex-1 bg-slate-900 p-4 overflow-y-auto">
          <div className="h-full w-full flex flex-col space-y-4">
            {/* Contenedor 1: Voces, Nombre del Agente y Base de Conocimiento con su guardado */}
            <div className="bg-slate-900 p-4 rounded-lg shadow-inner space-y-4">
              {/* Probar Voces y Nombre del Agente */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Probar Voces */}
                <div className="bg-slate-900 p-4 rounded-lg shadow-inner">
                  <label htmlFor="voice-select" className="block text-sm font-medium mb-2 text-slate-300">Probar Voces</label>
                  <div className="flex space-x-2 items-center">
                    <select
                      id="voice-select"
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 text-sm"
                      value={voiceOption}
                      onChange={(e) => setVoiceOption(e.target.value)}
                    >
                      {VOICE_PRESETS.map(v => (<option key={v.id} value={v.id}>{v.label}</option>))}
                    </select>
                    <button
                      onClick={previewVoice}
                      disabled={voiceLoading}
                      className={`w-14 h-10 flex items-center justify-center bg-cyan-600 text-white rounded-md shadow-lg hover:bg-cyan-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 ${voiceLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                      {voiceLoading ? '⏳' : '▶'}
                    </button>
                  </div>
                </div>

                {/* Nombre del Agente */}
                <div className="bg-slate-900 p-4 rounded-lg shadow-inner">
                  <label htmlFor="agent-name" className="block text-sm font-medium mb-2 text-slate-300">Nombre del Agente</label>
                  <div className="flex space-x-2 items-center">
                    <input
                      id="agent-name"
                      type="text"
                      className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 text-sm"
                      value={agentName}
                      onChange={(e)=>setAgentName(e.target.value)}
                    />
                    {/* Espaciador para igualar ancho con el select de voces */}
                    <div className="w-14 h-10" />
                  </div>
                </div>
              </div>

              {/* Base de Conocimiento */}
              <div>
                <label htmlFor="knowledge-base" className="block text-sm font-medium mb-2 text-slate-300">Base de Conocimiento</label>
                <textarea
                  id="knowledge-base"
                  className="w-full min-h-[300px] px-3 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 text-sm"
                  value={knowledgeBase}
                  onChange={(e)=>setKnowledgeBase(e.target.value)}
                />
              </div>

              {/* Footer de guardado de KB */}
              <div className="flex items-center justify-end gap-3">
                {!saveError && !loadingSaved && (
                  <span className={`text-sm ${kbDirty ? 'text-red-400' : (kbSavedId ? 'text-green-400' : 'text-slate-300')}`}>
                    {kbDirty ? 'Cambios sin guardar' : (kbSavedId ? 'Guardado' : 'No guardado aún')}
                  </span>
                )}
                {loadingSaved && (<span className="text-sm text-slate-300">Cargando…</span>)}
                {saveError && (<span className="text-sm text-red-400">{saveError}</span>)}
                <button
                  disabled={savingKB}
                  onClick={saveKnowledgeBase}
                  className={`px-6 py-3 rounded-xl font-semibold text-white shadow-xl backdrop-blur-sm transition-colors duration-200 ${kbDirty ? 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800' : (kbSavedId ? 'bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700' : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700')}`}
                >
                  {savingKB ? 'Guardando…' : (kbDirty ? 'Guardar nuevamente' : (kbSavedId ? 'Guardado' : 'Guardar Base de Conocimiento'))}
                </button>
              </div>
            </div>

            {/* Contenedor 2: Asignación de Programa/Agente/Etiqueta y guardado de tarjeta */}
            <div className="bg-slate-900 p-4 rounded-lg shadow-inner space-y-4">
              {/* Fila con Programa, Agente y Etiqueta */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                {/* Asignar Programa */}
                <div className="bg-slate-900 p-4 rounded-lg shadow-inner">
                  <label htmlFor="detected-program" className="block text-sm font-medium mb-2 text-slate-300">Asignar Programa</label>
                  <input
                    id="detected-program"
                    type="text"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm text-slate-400"
                    placeholder="Escribe el programa asignar"
                    value={currentProgramName}
                    onChange={(e)=>setCurrentProgramName(e.target.value)}
                  />
                </div>

                {/* Asignar Agente */}
                <div className="bg-slate-900 p-4 rounded-lg shadow-inner">
                  <label htmlFor="assign-agent" className="block text-sm font-medium mb-2 text-slate-300">Asignar Agente</label>
                  <select
                    id="assign-agent"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 text-sm"
                    value={assignedAgent}
                    onChange={(e)=>setAssignedAgent(e.target.value)}
                  >
                    <option value="">Seleccionar agente...</option>
                    {agentsOptions.map(a => (
                      <option key={String(a.id)} value={String(a.id)}>{a.name}</option>
                    ))}
                  </select>
                </div>

                {/* Asignar Etiqueta */}
                <div className="bg-slate-900 p-4 rounded-lg shadow-inner">
                  <label htmlFor="assign-tag" className="block text-sm font-medium mb-2 text-slate-300">Asignar Etiqueta</label>
                  <select
                    id="assign-tag"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 text-sm"
                    value={assignedTag}
                    onChange={(e)=>setAssignedTag(e.target.value)}
                  >
                    <option value="">Seleccionar etiqueta...</option>
                    {labelsOptions.map(l => (
                      <option key={String(l.id)} value={String(l.id)}>{l.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Nombre específico y guardado en tarjeta */}
              <div>
                <label htmlFor="assign-title" className="block text-sm font-medium mb-2 text-slate-300">Nombre específico de la tarjeta</label>
                <div className="flex gap-3">
                  <input
                    id="assign-title"
                    type="text"
                    className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 text-sm"
                    placeholder="Ej: Asignación Bachillerato Virtual"
                    value={assignTitle}
                    onChange={(e)=>setAssignTitle(e.target.value)}
                  />
                  <button
                    onClick={saveAssignmentCard}
                    disabled={savingAssign}
                    className={`px-4 py-2 rounded-md font-semibold ${savingAssign ? 'bg-slate-700 text-slate-400' : 'bg-cyan-600 text-white hover:bg-cyan-700'}`}
                  >
                    {savingAssign ? 'Guardando…' : 'Guardar Tarjeta'}
                  </button>
                </div>
              </div>
            </div>

            {/* Tarjetas guardadas (presentación) */}
            <div className="bg-slate-900 p-4 rounded-lg shadow-inner">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-200">Tarjetas guardadas</h3>
                {loadingSaved && (<span className="text-xs text-slate-400">Actualizando…</span>)}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {savedList.map(it => {
                  const program = String(it.program || '')
                  const agentId = it.agentId ? String(it.agentId) : ''
                  const tagId = it.tagId ? String(it.tagId) : ''
                  const agentNameDisp = agentsOptions.find(a => String(a.id) === String(agentId))?.name || ''
                  const tagNameDisp = labelsOptions.find(l => String(l.id) === String(tagId))?.name || ''
                  return (
                    <div key={it.id} className="p-3 bg-slate-800 border border-slate-700 rounded-md">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-slate-100">{it.title || 'Sin título'}</div>
                        <div className="flex gap-2">
                          <button className="text-xs px-2 py-1 bg-slate-700 text-slate-100 rounded hover:bg-slate-600" onClick={async ()=>{
                            try {
                              const r = await fetch(`/api/recepcionista/assignments/${it.id}`)
                              const j = await r.json()
                              if (j?.ok && j?.item) {
                                setAssignTitle(String(j.item.title || ''))
                                setEditingAssignId(it.id)
                                setCurrentProgramName(String(j.item.program || ''))
                                setAssignedAgent(j.item.agentId ? String(j.item.agentId) : '')
                                setAssignedTag(j.item.tagId ? String(j.item.tagId) : '')
                              }
                            } catch {}
                          }}>Editar</button>
                          <button className="text-xs px-2 py-1 bg-red-700 text-white rounded hover:bg-red-600" onClick={()=>{ setDeleteAssignId(it.id); setDeleteAssignOpen(true) }}>Eliminar</button>
                        </div>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">{agentNameDisp ? `Agente: ${agentNameDisp}` : ''}</div>
                      <div className="text-xs text-slate-400 mt-1">{program ? `Programa: ${program}` : ''}</div>
                      <div className="text-xs text-slate-400 mt-1">{tagNameDisp ? `Etiqueta: ${tagNameDisp}` : ''}</div>
                      <div className="text-[10px] text-slate-500 mt-2">{it.updatedAt ? `Actualizado: ${it.updatedAt}` : ''}</div>
                    </div>
                  )
                })}

                {/* Modal confirmación eliminar tarjeta */}
                <Dialog open={deleteAssignOpen} onClose={()=>{ if(!deleteAssignLoading){ setDeleteAssignOpen(false); setDeleteAssignId(null) } }}>
                  <DialogTitle>Eliminar tarjeta</DialogTitle>
                  <DialogContent>
                    <Typography>¿Seguro que deseas eliminar esta tarjeta? Esta acción no se puede deshacer.</Typography>
                  </DialogContent>
                  <DialogActions>
                    <Button onClick={()=>{ setDeleteAssignOpen(false); setDeleteAssignId(null) }} disabled={deleteAssignLoading}>Cancelar</Button>
                    <Button color="error" variant="contained" disabled={deleteAssignLoading} onClick={async ()=>{
                      if (!deleteAssignId) { setDeleteAssignOpen(false); return }
                      try {
                        setDeleteAssignLoading(true)
                        const res = await fetch(`/api/recepcionista/assignments/${deleteAssignId}`, { method: 'DELETE' })
                        const j = await res.json()
                        if (!j?.ok) throw new Error(j?.error || 'No se pudo eliminar tarjeta')
                        if (editingAssignId === deleteAssignId) { setEditingAssignId(null); setAssignTitle('') }
                        await loadSavedManuals()
                        setDeleteAssignOpen(false)
                        setDeleteAssignId(null)
                      } catch (e) {
                        alert(e?.message || 'Error al eliminar tarjeta')
                      } finally {
                        setDeleteAssignLoading(false)
                      }
                    }}>Eliminar</Button>
                  </DialogActions>
                </Dialog>
                {savedList.filter(it => ['recepcionita-assignment','capataz-assignment'].includes(String(it.sectionName || ''))).length === 0 && (
                  <div className="text-xs text-slate-400">Aún no hay tarjetas guardadas.</div>
                )}
              </div>
            </div>
          </div>
          {/* (Se remueve el botón fijo; se reubica en la fila de asignaciones) */}
        </div>
      )}
    </div>
  );
}