import React, { useEffect, useState } from 'react'
import { Stack, Typography, Paper, Grid, TextField, MenuItem, Button, Alert, CircularProgress, Divider, Checkbox, FormControlLabel, Dialog, DialogTitle, DialogContent, DialogActions, Box, Chip, Tooltip, IconButton, InputAdornment } from '@mui/material'
import MicIcon from '@mui/icons-material/Mic'
import StopIcon from '@mui/icons-material/Stop'
import { useNavigate } from 'react-router-dom'
// Flujo libre: el chat se conecta a Gemini vía backend. Sin pasos predefinidos.

const DEFAULT_SECTIONS = [
  { value: 'Información general', label: 'Información general' },
  { value: 'Horarios', label: 'Horarios' },
  { value: 'Ubicación', label: 'Ubicación' },
  { value: 'Bachillerato', label: 'Bachillerato' },
]

export default function SuperAgentAssign() {
  const navigate = useNavigate()
  const [agents, setAgents] = useState([])
  const [loadingAgents, setLoadingAgents] = useState(true)
  const [error, setError] = useState('')

  const [targetAgentId, setTargetAgentId] = useState('')
  const [selectedSections, setSelectedSections] = useState(DEFAULT_SECTIONS[0].value)
  const [availableSections, setAvailableSections] = useState(DEFAULT_SECTIONS)
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [savedManualOk, setSavedManualOk] = useState(false)
  const [saveToKnowledge, setSaveToKnowledge] = useState(true)
  const [openInfo, setOpenInfo] = useState(false)

  // Socrático
  const [asking, setAsking] = useState(false)
  const [answerInput, setAnswerInput] = useState('')
  const [draft, setDraft] = useState('')
  const [answers, setAnswers] = useState({})
  const [messages, setMessages] = useState([])
  const [geminiConfigured, setGeminiConfigured] = useState(false)
  const [geminiAgentReady, setGeminiAgentReady] = useState(false)
  const [chatHistory, setChatHistory] = useState([]) // [{ role: 'user'|'model', parts:[{text}]}]
  const [activeTab, setActiveTab] = useState('agente') // 'agente' | 'manuales'
  const [reportText, setReportText] = useState('')
  const [reportVisible, setReportVisible] = useState(false)
  const [copyDisabled, setCopyDisabled] = useState(true)
  // Autoguardado local
  const [lastAutoSaveAt, setLastAutoSaveAt] = useState(null)
  // Manuales guardados (UI)
  const [savedList, setSavedList] = useState([])
  const [loadingSaved, setLoadingSaved] = useState(false)
  const [saveTitle, setSaveTitle] = useState('')
  const [provider, setProvider] = useState('gemini') // 'gemini' | 'openai' | 'anthropic'
  const [provStatus, setProvStatus] = useState({
    gemini: { configured: false, connected: false, reason: '' },
    openai: { configured: false, connected: false, reason: '' },
    anthropic: { configured: false, connected: false, reason: '' }
  })
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deletedOk, setDeletedOk] = useState(false)

  // Dictado por micrófono (Speech-to-Text)
  const recognitionRef = React.useRef(null)
  const [isRecording, setIsRecording] = useState(false)

  const startRecording = () => {
    try {
      const SR = (window.SpeechRecognition || window.webkitSpeechRecognition)
      if (!SR) {
        alert('Tu navegador no soporta reconocimiento de voz (Web Speech API). Prueba con Chrome.')
        return
      }
      const rec = new SR()
      rec.lang = 'es-CO'
      rec.interimResults = false
      rec.continuous = true
      rec.onresult = (event) => {
        let text = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            text += event.results[i][0].transcript
          }
        }
        if (text) {
          setAnswerInput(prev => (prev ? prev.trimEnd() + ' ' : '') + text.trim() + ' ')
        }
      }
      rec.onerror = (e) => {
        if (e?.error === 'not-allowed') {
          alert('Permiso de micrófono denegado. Habilítalo en el navegador.')
        }
        setIsRecording(false)
      }
      rec.onend = () => {
        setIsRecording(false)
        recognitionRef.current = null
      }
      recognitionRef.current = rec
      rec.start()
      setIsRecording(true)
    } catch (err) {
      setIsRecording(false)
      alert('No se pudo iniciar el reconocimiento de voz: ' + (err?.message || String(err)))
    }
  }
  const stopRecording = () => {
    try {
      const rec = recognitionRef.current
      if (rec) rec.stop()
    } catch {}
  }
  const toggleRecording = () => {
    if (isRecording) stopRecording(); else startRecording()
  }

  // Modal de confirmación tras asignar
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignInfo, setAssignInfo] = useState({ agentName: '', sectionName: '', manualSaved: false })

  const pushAgentMessage = (text) => {
    setMessages((m) => [...m, { role: 'agent', text, ts: Date.now() }])
  }
  const pushUserMessage = (text) => {
    setMessages((m) => [...m, { role: 'user', text, ts: Date.now() }])
  }

  const getTargetAgentName = () => {
    const found = agents.find(a => String(a.id) === String(targetAgentId))
    return found ? found.name : ''
  }

  const getSystemPrompt = (agentName, sectionName) => {
    return `
Eres un "Arquitecto Socrático" con un rol DUAL. Tu interlocutor es un experto (Alejandro).
Tu misión actual es: Construir la sección de **"${sectionName}"** para el manual de ventas del programa **"${agentName}"**.

Tu método de trabajo es el siguiente:

1.  **Rol de Consultor (Socrático):**
    Primero, harás preguntas expertas para extraer el *conocimiento clave* de Alejandro para esa sección.
    *(Ejemplo para 'Tarifas': "Alejandro, ¿cuál es la tarifa oficial y qué incluye exactamente?")*

2.  **Rol de Cliente Sombra (Role-play):**
    Inmediatamente después de su respuesta, simularás ser un cliente real (un estudiante, un padre de familia) y le harás preguntas difíciles u objeciones *específicas* a esa información.
    *(Ejemplo: "Entendido. Pero si yo soy un cliente, ¿por qué es tan caro? ¿Qué pasa si no puedo pagar? ¿Tienen financiación? ¿El otro instituto me lo da más barato.")*

Este método dual nos permitirá construir un manual que no solo *informa*, sino que *prepara* al vendedor para la realidad.

REGLAS CLAVE:
- **Mantén el Contexto:** Toda tu conversación debe girar *únicamente* alrededor de la sección "${sectionName}" del programa "${agentName}".
- **Sé Perspicaz:** Actúa como un experto en ventas colombiano. Entiende el contexto de LASÏT.
- **Generación del Manual:** Cuando sientas que la sección **"${sectionName}"** está completa, pregúntale a Alejandro si quiere continuar con otra sección o si desea generar el manual.
  Dile explícitamente: '¿Quieres que generemos el manual con la información que tenemos o prefieres que cambiemos de sección?'
  Si Alejandro dice 'sí', 'genera el manual', 'terminemos', o afirmaciones similares, tu próxima respuesta DEBE contener la etiqueta [GENERAR_MANUAL].
- **Etiqueta Final:** Para generar el manual, tu respuesta debe incluir la etiqueta [GENERAR_MANUAL].
`
  }

  const setTyping = (on) => { setAsking(!!on) }

  const startConversation = (agentName, sectionName) => {
    const firstBotMessage = `Hola Alejandro. Estoy listo para mi **doble rol** (Consultor y Cliente).\n\nHe cargado el contexto:\n- **Agente Destino:** ${agentName}\n- **Sección a Construir:** ${sectionName}\n\nEmpecemos por la sección **'${sectionName}'**: ¿Cuál es la información más fundamental que un vendedor debe saber sobre esto?`
    pushAgentMessage(firstBotMessage)
    setChatHistory((h) => [...h, { role: 'model', parts: [{ text: firstBotMessage }] }])
  }

  const handleContextChange = (agentName, sectionName) => {
    const contextMessage = `(¡Contexto actualizado!)\n\nHe reenfocado mi rol. Ahora estamos trabajando en:\n- **Agente Destino:** ${agentName}\n- **Sección a Construir:** ${sectionName}\n\nContinuemos: ¿Cuál es la información clave para esta nueva sección?`
    pushAgentMessage(contextMessage)
    setChatHistory((h) => [...h, { role: 'model', parts: [{ text: contextMessage }] }])
  }

  const handleFinalReport = async (fullText) => {
    const reportContent = String(fullText || '').replace('[GENERAR_MANUAL]', '').trim()
    const headers = [
      'MANUAL MAESTRO DE VENTAS', 'MANUAL DE VENTAS', 'GUÍA DE VENTAS', 'PROGRAMA:', '==============='
    ]
    let intro = '¡Manual generado!'
    let manual = reportContent
    let idx = -1
    for (const h of headers) {
      idx = reportContent.toUpperCase().indexOf(h)
      if (idx !== -1) break
    }
    if (idx !== -1) {
      intro = reportContent.substring(0, idx).trim()
      manual = reportContent.substring(idx).trim()
    } else {
      const parts = reportContent.split('\n\n')
      if (parts.length > 1) {
        intro = parts[0]
        manual = parts.slice(1).join('\n\n')
      }
    }
    if (intro) pushAgentMessage(intro)
    pushAgentMessage('¡Excelente trabajo! Puedes ver el manual completo en el panel de la derecha.')
    setReportText(manual)
    setReportVisible(true)
    setCopyDisabled(false)
    setTyping(false)

    // Ya no asignamos automáticamente: el guardado se realiza en pestaña "Manuales Guardados".
    setSavedOk(false)
  }

  const fetchBotResponse = async (contentsOverride) => {
    try {
      setTyping(true)
      const agentName = getTargetAgentName()
      const sectionName = selectedSections
      if (!agentName || !sectionName) {
        setTyping(false)
        pushAgentMessage('Por favor, selecciona un agente y una sección para continuar.')
        return
      }
      const systemInstruction = { parts: [{ text: getSystemPrompt(agentName, sectionName) }] }
      const payload = { provider, contents: contentsOverride ?? chatHistory, systemInstruction, generationConfig: { temperature: 0.5, maxOutputTokens: 2048 } }
      const r = await fetch('/api/llm/chat/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const t = await r.text(); const j = t ? JSON.parse(t) : { ok: false }
      if (!r.ok || !j.ok) throw new Error(j.error || 'Error de API')
      const botText = String(j.text || '')
      if (!botText) {
        setTyping(false)
        const reason = j.promptFeedback?.blockReason ? ` (Razón: ${j.promptFeedback.blockReason})` : ''
        pushAgentMessage(`Lo siento, mi respuesta fue bloqueada${reason}. ¿Podrías reformular?`)
        return
      }
      if (botText.includes('[GENERAR_MANUAL]')) {
        handleFinalReport(botText)
      } else {
        setTyping(false)
        pushAgentMessage(botText)
        setChatHistory((h) => [...h, { role: 'model', parts: [{ text: botText }] }])
      }
    } catch (e) {
      setTyping(false)
      pushAgentMessage(`Error: No se pudo conectar con el asistente. Detalle: ${e?.message || e}`)
    }
  }

  useEffect(() => {
    const run = async () => {
      setLoadingAgents(true)
      setError('')
      try {
        const res = await fetch('/api/agents')
        // Parseo seguro para evitar "Unexpected end of JSON input"
        let j
        try {
          const text = await res.text()
          j = text ? JSON.parse(text) : { ok: false, error: 'Respuesta vacía del servidor' }
        } catch (e) {
          j = { ok: false, error: 'Respuesta inválida del servidor' }
        }
        if (!res.ok || !j.ok) throw new Error(j.error || 'No se pudo cargar agentes')
        const items = j.items || []
        setAgents(items)
        // Preselecciona "Bachillerato por ciclos" si existe; si no, el primero
        if (items.length && !targetAgentId) {
          const preferred = items.find(a => String(a.name).toLowerCase() === 'bachillerato por ciclos')
          const initialId = preferred ? preferred.id : items[0].id
          setTargetAgentId(String(initialId))
        }
      } catch (e) {
        setError(e.message || 'Error al cargar agentes')
      } finally {
        setLoadingAgents(false)
      }
    }
    run()
  }, [])

  // Cargar manuales guardados cuando se entra a la pestaña
  useEffect(() => {
    const loadSaved = async () => {
      if (activeTab !== 'manuales') return
      setLoadingSaved(true)
      setSavedManualOk(false)
      try {
        const r = await fetch('/api/manuals/saved')
        const t = await r.text(); const j = t ? JSON.parse(t) : { ok: false }
        if (!r.ok || !j.ok) throw new Error(j.error || 'No se pudieron cargar manuales')
        setSavedList(Array.isArray(j.items) ? j.items : [])
      } catch (e) {
        console.warn('Error cargando manuales guardados', e?.message || e)
      } finally {
        setLoadingSaved(false)
      }
    }
    loadSaved()
  }, [activeTab])

  const handleSaveManual = async () => {
    setSavedManualOk(false)
    const content = String(reportVisible ? reportText : draft || '').trim()
    if (!content) { setError('No hay contenido para guardar'); return }
    const agentName = getTargetAgentName()
    const sectionName = selectedSections
    const title = String(saveTitle || `${agentName || 'Manual'} - ${sectionName || ''}`).trim()
    try {
      const r = await fetch('/api/manuals/saved', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, content, agentName, sectionName }) })
      const t = await r.text(); const j = t ? JSON.parse(t) : { ok: false }
      if (!r.ok || !j.ok) throw new Error(j.error || 'No se pudo guardar el manual')
      setSavedManualOk(true)
      setSaveTitle('')
      // refrescar lista
      try {
        const r2 = await fetch('/api/manuals/saved'); const t2 = await r2.text(); const j2 = t2 ? JSON.parse(t2) : { ok: false }
        if (r2.ok && j2.ok) setSavedList(Array.isArray(j2.items) ? j2.items : [])
      } catch {}
    } catch (e) {
      setError(e?.message || 'Error al guardar el manual')
    }
  }

  // Cargar secciones dinámicas al seleccionar agente
  useEffect(() => {
    const loadSections = async () => {
      const aId = Number(targetAgentId)
      if (!aId) { setAvailableSections(DEFAULT_SECTIONS); return }
      try {
        const res = await fetch(`/api/agents/${aId}`)
        // Parseo seguro del detalle de agente
        let j
        try {
          const text = await res.text()
          j = text ? JSON.parse(text) : { ok: false, error: 'Respuesta vacía del servidor' }
        } catch (e) {
          j = { ok: false, error: 'Respuesta inválida del servidor' }
        }
        if (!res.ok || !j.ok || !j.agent) { setAvailableSections(DEFAULT_SECTIONS); return }
        const names = Array.isArray(j.agent.sections) ? j.agent.sections.map(s => String(s.name || '').trim()).filter(Boolean) : []
        const uniqueNames = Array.from(new Set(names))
        const opts = uniqueNames.length ? uniqueNames.map(n => ({ value: n, label: n })) : DEFAULT_SECTIONS
        setAvailableSections(opts)
        // Prefiere "Información general" si está disponible, si no la primera opción
        const prefer = opts.find(o => o.value === 'Información general')?.value || (opts[0]?.value || DEFAULT_SECTIONS[0].value)
        setSelectedSections(prefer)
      } catch (e) {
        console.warn('No se pudieron cargar secciones del agente', e)
        setAvailableSections(DEFAULT_SECTIONS)
        setSelectedSections(DEFAULT_SECTIONS[0].value)
      }
    }
    loadSections()
  }, [targetAgentId])

  // Al cambiar de sección, re-inicializa el chat y pide una nueva pregunta a Gemini
  useEffect(() => {
    const greeting = 'Hola, soy tu asistente socrático. Voy a ayudarte a estructurar toda la información sin pasos predefinidos.'
    setAnswers({})
    setMessages([{ role: 'agent', text: greeting, ts: Date.now() }])
    setChatHistory([])
    setReportText('')
    setReportVisible(false)
    setCopyDisabled(true)
    const aName = getTargetAgentName(); const sName = selectedSections
    if (aName && sName) startConversation(aName, sName)
  }, [selectedSections])

  // Extrae características desde texto (coma o saltos de línea), sin numeración
  // Utilidades para integración con Gemini
  const loadGeminiStatus = async () => {
    try {
      const r = await fetch('/api/settings/gemini/apikey/status')
      const t = await r.text(); const j = t ? JSON.parse(t) : { ok: false }
      setGeminiConfigured(!!j.configured)
      setProvStatus(s => ({ ...s, gemini: { configured: !!j.configured, connected: !!j.connected, reason: j.reason || '' } }))
    } catch {}
  }

  const loadOpenAIStatus = async () => {
    try {
      const r = await fetch('/api/settings/openai/apikey/status')
      const t = await r.text(); const j = t ? JSON.parse(t) : { ok: false }
      setProvStatus(s => ({ ...s, openai: { configured: !!j.configured, connected: !!j.connected, reason: j.reason || '' } }))
    } catch {}
  }

  const loadAnthropicStatus = async () => {
    try {
      const r = await fetch('/api/settings/anthropic/apikey/status')
      const t = await r.text(); const j = t ? JSON.parse(t) : { ok: false }
      setProvStatus(s => ({ ...s, anthropic: { configured: !!j.configured, connected: !!j.connected, reason: j.reason || '' } }))
    } catch {}
  }

  const loadAllStatuses = async () => {
    await Promise.all([loadGeminiStatus(), loadOpenAIStatus(), loadAnthropicStatus()])
  }

  const ensureSuperAgent = async () => {
    try {
      const r = await fetch('/api/gemini/super/config')
      const t = await r.text(); const j = t ? JSON.parse(t) : { ok: false }
      if (!j.ok) throw new Error('No se pudo leer config')
      if (!j.agent) {
        const p = await fetch('/api/gemini/super/config', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Super Agente Socrático', domain: 'ventas', basePrompt: 'Haz preguntas claras y breves para organizar conocimiento de ventas. No respondas, solo pregunta.' , active: 1 })
        })
        const pt = await p.text(); const pj = pt ? JSON.parse(pt) : { ok: false }
        if (!pj.ok) throw new Error(pj.error || 'No se pudo crear el agente')
      }
      setGeminiAgentReady(true)
    } catch (e) {
      console.warn('Super Agente Gemini no disponible:', e?.message || e)
      setGeminiAgentReady(false)
    }
  }

  // Documento libre: vamos consolidando el conocimiento en formato libre
  const appendToDraft = (title, content) => {
    const ttl = title ? `# ${title}` : null
    setDraft(d => `${d}${d ? '\n\n' : ''}${ttl ? ttl + '\n' : ''}${content}`)
  }

  // En el nuevo flujo usamos fetchBotResponse con chatHistory y system prompt

  const sendMessage = async () => {
    const text = answerInput.trim()
    if (!text) return
    pushUserMessage(text)
    // Construye el siguiente historial y úsalo para la llamada inmediatamente,
    // evitando condiciones donde el estado aún no se ha actualizado.
    const nextHistory = [...chatHistory, { role: 'user', parts: [{ text }] }]
    setChatHistory(nextHistory)
    setAnswerInput('')
    await fetchBotResponse(nextHistory)
  }

  // Carga primera pregunta al entrar (si ya hay sección seleccionada)
  useEffect(() => {
    loadAllStatuses(); ensureSuperAgent();
    const greeting = 'Hola, soy tu asistente socrático. Voy a ayudarte a estructurar toda la información sin pasos predefinidos.'
    setMessages([{ role: 'agent', text: greeting, ts: Date.now() }])
    setChatHistory([])
  }, [])

  const getAutoSaveKey = () => `superAgent:auto:${targetAgentId || 'any'}:${selectedSections || 'any'}`
  const getChatAutoKey = () => `superAgent:chat:${targetAgentId || 'any'}:${selectedSections || 'any'}`
  const findAgentIdByName = (name) => {
    const n = String(name || '').trim().toLowerCase()
    const a = agents.find(x => String(x.name || '').trim().toLowerCase() === n)
    return a ? String(a.id) : ''
  }
  const getChatKeyFor = (agentId, sectionName) => `superAgent:chat:${agentId || 'any'}:${sectionName || 'any'}`

  // Restaurar borrador y chat locales cuando cambian agente/sección
  useEffect(() => {
    try {
      const raw = localStorage.getItem(getAutoSaveKey())
      if (raw) {
        const obj = JSON.parse(raw)
        const txt = String(obj?.content || '')
        if (txt) {
          if (reportVisible) setReportText(txt); else setDraft(txt)
          if (obj?.ts) setLastAutoSaveAt(obj.ts)
        }
      }
      const craw = localStorage.getItem(getChatAutoKey())
      if (craw) {
        const cobj = JSON.parse(craw)
        if (Array.isArray(cobj?.messages) && Array.isArray(cobj?.chatHistory)) {
          setMessages(cobj.messages)
          setChatHistory(cobj.chatHistory)
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetAgentId, selectedSections])

  // Autoguardado local periódico del contenido visible (manual o borrador) y del chat
  useEffect(() => {
    const id = setInterval(() => {
      try {
        const content = String((reportVisible ? reportText : draft) || '').trim()
        const ts = Date.now()
        if (content) {
          localStorage.setItem(getAutoSaveKey(), JSON.stringify({ content, ts }))
          setLastAutoSaveAt(ts)
        }
        // Guardar chat
        localStorage.setItem(getChatAutoKey(), JSON.stringify({ messages, chatHistory, ts }))
      } catch {}
    }, 10000)
    return () => clearInterval(id)
  }, [reportVisible, reportText, draft, messages, chatHistory, targetAgentId, selectedSections])

  const handleSave = async () => {
    setError('')
    setSavedOk(false)
    setSavedManualOk(false)
    const aId = Number(targetAgentId)
    const secs = selectedSections ? [selectedSections] : []
    // Solo permitimos asignar si el "manual de ventas generado" tiene contenido
    const cont = String(reportText || '').trim()
    if (!aId) { setError('Selecciona el agente destino'); return }
    if (!secs.length) { setError('Selecciona una sección'); return }
    if (!cont) { setError('El manual generado está vacío. Genera el manual antes de asignar.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/super-agent/assign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetAgentId: aId, sections: secs.map(name => ({ name, content: cont })) })
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error || 'No se pudo asignar el contenido')

      // Guardar también en el conocimiento del Súper Agente
      if (saveToKnowledge) {
        try {
          const kRes = await fetch('/api/gemini/super/knowledge', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: cont, tags: 'asignacion' })
          })
          // No interrumpimos si falla; dejamos aviso en consola
          if (!kRes.ok) {
            console.warn('No se pudo guardar en conocimiento del Súper Agente')
          }
        } catch (e) {
          console.warn('Error guardando en conocimiento del Súper Agente', e)
        }
      }

      setSavedOk(true)

      // Autoguardado en "Manuales guardados"
      let manualSaved = false
      try {
        const agentName = getTargetAgentName()
        const sectionName = selectedSections
        const title = String(saveTitle || `${agentName || 'Manual'} - ${sectionName || ''}`).trim()
        const r2 = await fetch('/api/manuals/saved', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, content: cont, agentName, sectionName })
        })
        const t2 = await r2.text(); const j2 = t2 ? JSON.parse(t2) : { ok: false }
        if (r2.ok && j2.ok) {
          setSavedManualOk(true)
          manualSaved = true
          // refrescar lista si estamos en esa pestaña
          try {
            const lr = await fetch('/api/manuals/saved'); const lt = await lr.text(); const lj = lt ? JSON.parse(lt) : { ok: false }
            if (lr.ok && lj.ok) setSavedList(Array.isArray(lj.items) ? lj.items : [])
          } catch {}
        }
      } catch (e) {
        console.warn('No se pudo hacer el autoguardado del manual', e?.message || e)
      }

      // Abrir modal de confirmación con datos de la asignación
      setAssignInfo({ agentName: getTargetAgentName(), sectionName: selectedSections, manualSaved })
      setAssignOpen(true)

      setDraft('')
    } catch (e) {
      setError(e.message || 'Error al asignar contenido')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Stack spacing={2} sx={{ width: '100%', overflowX: 'hidden' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h5" sx={{ fontWeight: 700 }}>Súper agente</Typography>
        <Button variant="outlined" size="small" onClick={()=>setOpenInfo(true)}>¿Qué es Súper Agente?</Button>
      </Stack>
      <Paper sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, width: '100%', overflowX: 'hidden' }} elevation={0}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {savedOk && <Alert severity="success" sx={{ mb: 2 }}>Contenido asignado correctamente</Alert>}
        {savedManualOk && <Alert severity="success" sx={{ mb: 2 }}>Manual guardado en "Manuales guardados"</Alert>}
        {deletedOk && <Alert severity="success" sx={{ mb: 2 }}>Manual eliminado correctamente</Alert>}
        {lastAutoSaveAt && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Guardado automático (local): {new Date(lastAutoSaveAt).toLocaleTimeString()}
          </Typography>
        )}
        {loadingAgents ? (
          <Stack direction="row" alignItems="center" spacing={1}>
            <CircularProgress size={20} />
            <Typography color="text.secondary">Cargando agentes...</Typography>
          </Stack>
        ) : (
          <Box>
            {/* Tabs */}
            <Stack direction="row" spacing={1} sx={{ borderBottom: '1px solid', borderColor: 'divider', mb: 2 }}>
              <Button variant={activeTab==='agente'?'contained':'text'} size="small" onClick={()=>setActiveTab('agente')}>Agente Socrático</Button>
              <Button variant={activeTab==='manuales'?'contained':'text'} size="small" onClick={()=>setActiveTab('manuales')}>Manuales Guardados</Button>
            </Stack>

            {activeTab === 'agente' ? (
              <Box sx={{ width: '100%', display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 3, alignItems: 'stretch' }}>
                {/* Columna izquierda: chat */}
                <Box sx={{ minWidth: 0 }}>
                  <Paper variant="outlined" sx={{ p: 2, height: '100%', width: '100%' }}>
                    <Stack spacing={2}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Typography variant="h6">Arquitecto Socrático (IA)</Typography>
                        <Button variant="outlined" color="error" size="small" onClick={()=>{ setMessages([]); setChatHistory([]); setReportText(''); setReportVisible(false); setCopyDisabled(true); setAnswerInput('') }}>Limpiar Chat</Button>
                      </Stack>
                      {/* Estado de proveedores */}
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Tooltip title={provStatus.gemini.connected ? 'Conectado correctamente' : (provStatus.gemini.reason || 'Sin conexión')}>
                          <Chip size="small" color={provStatus.gemini.connected ? 'success' : 'error'} label={`Gemini: ${provStatus.gemini.connected ? 'Conectado' : 'Sin conexión'}`} variant={provStatus.gemini.configured ? 'filled' : 'outlined'} />
                        </Tooltip>
                        <Tooltip title={provStatus.openai.connected ? 'Conectado correctamente' : (provStatus.openai.reason || 'Sin conexión')}>
                          <Chip size="small" color={provStatus.openai.connected ? 'success' : 'error'} label={`OpenAI: ${provStatus.openai.connected ? 'Conectado' : 'Sin conexión'}`} variant={provStatus.openai.configured ? 'filled' : 'outlined'} />
                        </Tooltip>
                        <Tooltip title={provStatus.anthropic.connected ? 'Conectado correctamente' : (provStatus.anthropic.reason || 'Sin conexión')}>
                          <Chip size="small" color={provStatus.anthropic.connected ? 'success' : 'error'} label={`Anthropic: ${provStatus.anthropic.connected ? 'Conectado' : 'Sin conexión'}`} variant={provStatus.anthropic.configured ? 'filled' : 'outlined'} />
                        </Tooltip>
                        <Button onClick={loadAllStatuses} size="small" variant="text">Actualizar estado</Button>
                      </Stack>
                      {provider==='gemini' && !geminiConfigured && (<Alert severity="warning">Gemini API Key no configurada. Verifica en Configuración.</Alert>)}
                      <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} md={6}>
                          <TextField select fullWidth size="small" label="Agente destino" value={targetAgentId} onChange={(e)=>{ setTargetAgentId(e.target.value); const aName = agents.find(a=>String(a.id)===String(e.target.value))?.name || ''; if (aName && selectedSections) { if (chatHistory.length>1) handleContextChange(aName, selectedSections); else startConversation(aName, selectedSections) } }} InputLabelProps={{ shrink: true }}>
                            {agents.map(a => (<MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>))}
                          </TextField>
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <TextField select fullWidth size="small" label="Secciones a asignar" value={selectedSections} onChange={(e)=>{ setSelectedSections(e.target.value); const aName = getTargetAgentName(); const sName = e.target.value; if (aName && sName) { if (chatHistory.length>1) handleContextChange(aName, sName); else startConversation(aName, sName) } }} InputLabelProps={{ shrink: true }}>
                            {availableSections.map(s => (<MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>))}
                          </TextField>
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <TextField select fullWidth size="small" label="Proveedor IA" value={provider} onChange={(e)=> setProvider(e.target.value)} InputLabelProps={{ shrink: true }}>
                            <MenuItem value="gemini">Gemini</MenuItem>
                            <MenuItem value="openai">OpenAI</MenuItem>
                            <MenuItem value="anthropic">Anthropic</MenuItem>
                          </TextField>
                        </Grid>
                      </Grid>
                      <Divider />
                      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1, maxHeight: 360, overflow: 'auto', bgcolor: 'background.default' }}>
                        {messages.map((m, i) => (
                          <Box key={`${m.ts}-${i}`} sx={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', mb: 1 }}>
                            <Box sx={{ bgcolor: m.role === 'user' ? 'primary.main' : 'grey.100', color: m.role === 'user' ? 'primary.contrastText' : 'text.primary', px: 1.5, py: 1, borderRadius: 2, maxWidth: '75%' }}>
                              {m.text}
                            </Box>
                          </Box>
                        ))}
                      </Box>
                      {asking && (<Typography variant="caption" color="text.secondary">El asistente está pensando…</Typography>)}
                      <Stack direction="row" spacing={1} alignItems="flex-end" sx={{ flexWrap: 'wrap' }}>
                        <TextField 
                          label="Escribe tu mensaje" 
                          multiline 
                          minRows={2} 
                          value={answerInput} 
                          onChange={(e)=>setAnswerInput(e.target.value)} 
                          fullWidth 
                          size="small"
                          InputProps={{
                            endAdornment: (
                              <InputAdornment position="end">
                                <Tooltip title={isRecording ? 'Detener dictado' : 'Dictar con micrófono'}>
                                  <IconButton aria-label="dictar" onClick={toggleRecording} color={isRecording ? 'error' : 'default'} size="small">
                                    {isRecording ? <StopIcon fontSize="small" /> : <MicIcon fontSize="small" />}
                                  </IconButton>
                                </Tooltip>
                              </InputAdornment>
                            )
                          }}
                        />
                        <Button variant="contained" onClick={sendMessage} disabled={asking || !answerInput.trim()}>{asking ? 'Procesando…' : 'Enviar'}</Button>
                      </Stack>
                    </Stack>
                  </Paper>
                </Box>

                {/* Columna derecha: manual generado y asignación */}
                <Box sx={{ minWidth: 0 }}>
                  <Paper variant="outlined" sx={{ p: 2, height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                      <Typography variant="h6">Manual de Ventas Generado</Typography>
                      <Button variant="contained" size="small" onClick={async()=>{ try { await navigator.clipboard.writeText(reportText); setCopyDisabled(true) } catch { setCopyDisabled(true) } }} disabled={copyDisabled}>Copiar Manual</Button>
                    </Stack>
                    <Box sx={{ flexGrow: 1, overflow: 'auto', border: '1px dashed', borderColor: 'divider', borderRadius: 1, p: 1, display: reportVisible ? 'block' : 'none' }}>
                      <Typography component="pre" sx={{ fontFamily: 'monospace', fontSize: 13, whiteSpace: 'pre-wrap' }}>{reportText}</Typography>
                    </Box>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="subtitle1" sx={{ mb: 1 }}>Asignar a otros agentes</Typography>
                    <Grid container spacing={2} alignItems="center">
                      <Grid item xs={12} md={5}>
                        <TextField select fullWidth size="small" label="Agente destino" value={targetAgentId} onChange={(e)=>setTargetAgentId(e.target.value)} sx={{ minWidth: 240 }} InputLabelProps={{ shrink: true }}>
                          {agents.map(a => (<MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>))}
                        </TextField>
                      </Grid>
                      <Grid item xs={12} md={5}>
                        <TextField select fullWidth size="small" label="Secciones a asignar" value={selectedSections} onChange={(e)=>setSelectedSections(e.target.value)} sx={{ minWidth: 240 }} InputLabelProps={{ shrink: true }}>
                          {availableSections.map(s => (<MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>))}
                        </TextField>
                      </Grid>
                      <Grid item xs={12} md={2} sx={{ display: 'flex', justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
                        <Button fullWidth={false} variant="contained" onClick={handleSave} disabled={saving}>{saving ? 'Asignando...' : 'Asignar'}</Button>
                      </Grid>
                    </Grid>
                    <FormControlLabel sx={{ mt: 1 }} control={<Checkbox checked={saveToKnowledge} onChange={(e)=>setSaveToKnowledge(e.target.checked)} />} label="Guardar también en el conocimiento del Súper Agente (al asignar)" />
                    <Stack direction="row" spacing={2} sx={{ mt: 2 }} alignItems="center">
                      <Button variant="outlined" onClick={()=>navigate('/agents/list')} disabled={saving}>Ver agentes</Button>
                    </Stack>
                  </Paper>
                </Box>
              </Box>
            ) : (
              <Box>
                <Paper variant="outlined" sx={{ p: 2, overflowX: 'hidden' }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1, flexWrap: 'wrap' }}>
                    <Typography variant="subtitle1">Manuales guardados</Typography>
                    <Button size="small" onClick={()=>setActiveTab('manuales') && null /* keep focus */}>{loadingSaved ? 'Actualizando…' : 'Actualizar'}</Button>
                  </Stack>
                  {loadingSaved ? (
                    <Stack direction="row" spacing={1} alignItems="center"><CircularProgress size={18} /><Typography variant="body2">Cargando…</Typography></Stack>
                  ) : (
                    <Stack spacing={1} sx={{ maxHeight: '60vh', overflowY: 'auto', pr: 0.5 }}>
                      {savedList.length === 0 ? (<Typography variant="body2" color="text.secondary">No hay manuales guardados todavía.</Typography>) : null}
                      {savedList.map(it => (
                        <Paper key={it.id} variant="outlined" sx={{ p: 1, overflowX: 'hidden' }}>
                          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between" sx={{ flexWrap: 'wrap' }}>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="subtitle2" noWrap>{it.title || '(Sin título)'}</Typography>
                              <Typography variant="caption" color="text.secondary">{it.agentName || '—'} · {it.sectionName || '—'} · {new Date(it.created_at).toLocaleString()}</Typography>
                              <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }} noWrap>{it.preview}</Typography>
                            </Box>
                            <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                              <Button size="small" variant="text" onClick={async()=>{ try { const r = await fetch(`/api/manuals/saved/${it.id}`); const t = await r.text(); const j = t ? JSON.parse(t) : { ok: false }; if (r.ok && j.ok) { setReportText(j.manual.content || ''); setReportVisible(true); setActiveTab('agente') } } catch {} }}>Cargar por manual</Button>
                              <Button size="small" variant="text" onClick={async()=>{ try { const r = await fetch(`/api/manuals/saved/${it.id}`); const t = await r.text(); const j = t ? JSON.parse(t) : { ok: false }; if (r.ok && j.ok) { const agentName = it.agentName || j.manual.agentName || ''; const sectionName = it.sectionName || j.manual.sectionName || ''; const agentId = findAgentIdByName(agentName); if (agentId) setTargetAgentId(agentId); if (sectionName) setSelectedSections(sectionName); // restaurar chat
                                  const k = getChatKeyFor(agentId, sectionName); try { const raw = localStorage.getItem(k); if (raw) { const obj = JSON.parse(raw); if (Array.isArray(obj?.messages)) setMessages(obj.messages); if (Array.isArray(obj?.chatHistory)) setChatHistory(obj.chatHistory) } } catch {}
                                  setReportText(j.manual.content || ''); setReportVisible(true); setActiveTab('agente') } } catch {} }}>Chat agente</Button>
                              <Button size="small" color="error" variant="text" onClick={()=>{ setDeleteTarget(it); setDeleteOpen(true); setDeletedOk(false) }}>Eliminar</Button>
                            </Stack>
                          </Stack>
                        </Paper>
                      ))}
                    </Stack>
                  )}
                </Paper>
              </Box>
            )}
          </Box>
        )}
      </Paper>
      <Typography variant="body2" color="text.secondary">
        Nota: el contenido guardado en "Bachillerato" se copia automáticamente a "Información general".
      </Typography>

      {/* Confirmar eliminación */}
      <Dialog open={deleteOpen} onClose={()=>{ if(!deleting) setDeleteOpen(false) }} maxWidth="xs" fullWidth>
        <DialogTitle>Eliminar manual guardado</DialogTitle>
        <DialogContent>
          <Typography variant="body2">¿Seguro que deseas eliminar “{deleteTarget?.title || 'manual'}”?</Typography>
          <Typography variant="caption" color="text.secondary">Esta acción no se puede deshacer.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=>setDeleteOpen(false)} disabled={deleting}>Cancelar</Button>
          <Button color="error" variant="contained" disabled={deleting} onClick={async()=>{ try { setDeleting(true); const r = await fetch(`/api/manuals/saved/${deleteTarget?.id}`, { method: 'DELETE' }); if (r.ok) { setSavedList(prev=>prev.filter(x=>x.id!==deleteTarget?.id)); setDeletedOk(true); } } catch {} finally { setDeleting(false); setDeleteOpen(false); setDeleteTarget(null); } }}>Eliminar</Button>
        </DialogActions>
      </Dialog>

      {/* Asignación completada */}
      <Dialog open={assignOpen} onClose={()=>setAssignOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Asignación completada</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Se asignó el contenido al agente “{assignInfo.agentName || '—'}” en la sección “{assignInfo.sectionName || '—'}”.
          </Typography>
          <Typography variant="body2" color={assignInfo.manualSaved ? 'success.main' : 'error.main'}>
            {assignInfo.manualSaved ? 'También se guardó una copia en “Manuales guardados”.' : 'No se pudo guardar la copia en “Manuales guardados”.'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=>{ setAssignOpen(false) }}>Cerrar</Button>
          <Button variant="contained" onClick={()=>{ setActiveTab('manuales'); setAssignOpen(false) }}>Ver manuales guardados</Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo informativo */}
      <Dialog open={openInfo} onClose={()=>setOpenInfo(false)} maxWidth="sm" fullWidth>
        <DialogTitle>¿Qué es Súper Agente?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            El Súper Agente guía la creación de entrenamiento mediante preguntas socráticas.
            Tus respuestas se consolidan en el resultado de la columna derecha.
            Luego puedes asignar ese contenido a uno o varias secciones de otros agentes.
            Opcionalmente, el material también se guarda en el conocimiento del Súper Agente
            para reutilización futura.
          </Typography>
          <Typography variant="body2">
            Regla: si se asigna a "Bachillerato", el sistema también propaga el contenido a
            "Información general" automáticamente.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=>setOpenInfo(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
