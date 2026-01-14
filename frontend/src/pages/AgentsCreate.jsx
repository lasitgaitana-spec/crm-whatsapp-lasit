import React from 'react'
import { io } from 'socket.io-client'
import { useNavigate, useSearchParams } from 'react-router-dom'

export default function AgentsCreate() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const agentIdParam = params.get('id')

  // Estado principal
  const [agentName, setAgentName] = React.useState('')
  const [advisorName, setAdvisorName] = React.useState('')
  const [saveStatus, setSaveStatus] = React.useState('idle') // idle | saving | error
  const [errorText, setErrorText] = React.useState('')

  // Pestañas estilo "Agente"
  // En creación (sin id) iniciamos con una pestaña predeterminada "Información General".
  const initialTabs = agentIdParam ? [] : [{
    id: `sec-${Date.now()}`,
    name: 'Información General',
    content: '',
    files: [],
    locations: [],
    active: true,
    isDefault: true
  }]
  const [tabs, setTabs] = React.useState(initialTabs)
  const [activeTabId, setActiveTabId] = React.useState(initialTabs.length ? initialTabs[0].id : '')
  // Clave de borrador local (para persistir pestañas/nombre entre recargas)
  const storageKey = React.useMemo(() => `agentsCreate:${agentIdParam || 'new'}`,[agentIdParam])
  const [draftLoaded, setDraftLoaded] = React.useState(false)
  // Modal de confirmación de eliminación de pestaña
  const [deleteTabOpen, setDeleteTabOpen] = React.useState(false)
  const [deleteTabId, setDeleteTabId] = React.useState(null)
  // Modal de renombrar pestaña
  const [renameTabOpen, setRenameTabOpen] = React.useState(false)
  const [renameTabId, setRenameTabId] = React.useState(null)
  const [renameName, setRenameName] = React.useState('')

  // (Memoria eliminada: centrado únicamente en el agente)

  // Modal de vista previa de archivos (imágenes/PDF)
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const [previewItem, setPreviewItem] = React.useState(null) // { url, mime, name, size }
  // Modal de ubicación (solo datos visibles: nombre, dirección, URL)
  const [locationModalOpen, setLocationModalOpen] = React.useState(false)
  const [locForm, setLocForm] = React.useState({ label: '', address: '', link: '' })

  const activeIndex = React.useMemo(() => tabs.findIndex(t => t.id === activeTabId), [tabs, activeTabId])
  const activeTab = activeIndex >= 0 ? tabs[activeIndex] : null

  // Helpers de parseo de "Recursos:" para rehidratar archivos/ubicaciones
  const inferMimeFromUrl = React.useCallback((u) => {
    const url = String(u || '').toLowerCase()
    if (/(\.png|\.jpg|\.jpeg|\.webp|\.gif)$/.test(url)) return 'image/*'
    if (url.endsWith('.pdf')) return 'application/pdf'
    if (/(\.doc|\.docx)$/.test(url)) return 'application/msword'
    if (/(\.xls|\.xlsx)$/.test(url)) return 'application/vnd.ms-excel'
    if (/(\.ppt|\.pptx)$/.test(url)) return 'application/vnd.ms-powerpoint'
    if (url.endsWith('.txt')) return 'text/plain'
    if (url.endsWith('.csv')) return 'text/csv'
    return ''
  }, [])
  const parseSavedResources = React.useCallback((content) => {
    const out = { text: String(content || ''), files: [], locations: [] }
    const raw = String(content || '')
    const lines = raw.split(/\r?\n/)
    const idx = lines.findIndex(l => l.trim().toLowerCase() === 'recursos:')
    if (idx === -1) return out
    const baseText = lines.slice(0, idx).join('\n').replace(/[\s\n]+$/, '')
    const extras = lines.slice(idx + 1)
    const files = []
    const locs = []
    const fileRe = /^-\s*\[(.+?)\]\((.+?)\)\s*$/
    const locRe = /^-\s*ubicación:\s*(.+)$/i
    for (const ln of extras) {
      const t = (ln || '').trim()
      if (!t) continue
      const m1 = t.match(fileRe)
      if (m1) {
        const label = m1[1]
        const url = m1[2]
        files.push({ filename: label, name: label, url, mime: inferMimeFromUrl(url), size: 0 })
        continue
      }
      const m2 = t.match(locRe)
      if (m2) { locs.push(m2[1]) }
    }
    return { text: baseText, files, locations: locs }
  }, [inferMimeFromUrl])
  const stripResourcesBlock = React.useCallback((text) => {
    return parseSavedResources(text).text
  }, [parseSavedResources])

  // Helper: detectar nombre "Información General" ignorando acentos/casos
  const isGeneralName = React.useCallback((name) => {
    const raw = String(name || '').toLowerCase()
    const noDiacritics = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    return /informacion\s*general/.test(noDiacritics)
  }, [])

  // Agregador: reconstruir "Información General" con el contenido de las demás pestañas
  const rebuildGeneralFromTabs = React.useCallback((list) => {
    const tabsList = Array.isArray(list) ? list : []
    if (!tabsList.length) return tabsList
    const generalIdx = tabsList.findIndex(t => t?.isDefault || isGeneralName(t?.name))
    if (generalIdx < 0) return tabsList
    const sections = tabsList.filter((t, i) => i !== generalIdx && (t?.active !== false))

    let textBlocks = []
    let aggFiles = []
    let aggLocs = []

    for (const s of sections) {
      const parsed = parseSavedResources(String(s?.content || ''))
      const base = String(parsed.text || '').trim()
      const title = String(s?.name || '').trim() || 'Sección'
      if (base || (Array.isArray(s?.files) && s.files.length) || (Array.isArray(s?.locations) && s.locations.length) || (Array.isArray(parsed.files) && parsed.files.length) || (Array.isArray(parsed.locations) && parsed.locations.length)) {
        const block = base ? `--- ${title} ---\n${base}` : `--- ${title} ---`
        textBlocks.push(block)
      }
      const files = [
        ...(((Array.isArray(s?.files) ? s.files : []) || [])),
        ...(((Array.isArray(parsed.files) ? parsed.files : []) || []))
      ]
      const locs = [
        ...(((Array.isArray(s?.locations) ? s.locations : []) || [])),
        ...(((Array.isArray(parsed.locations) ? parsed.locations : []) || []))
      ]
      aggFiles = aggFiles.concat(files)
      aggLocs = aggLocs.concat(locs)
    }

    const combinedText = textBlocks.join('\n\n').trim()
    const general = { ...tabsList[generalIdx], content: combinedText, files: aggFiles, locations: aggLocs, active: true, isDefault: true }
    const nextList = [...tabsList]
    nextList[generalIdx] = general
    return nextList
  }, [parseSavedResources, isGeneralName])

  // (movido más abajo, después de formatLocationForStorage) composeSectionTextForContext

  // Helper: formatear/parsear ubicaciones en una línea legible que también podamos convertir de vuelta
  const formatLocationForStorage = React.useCallback((loc) => {
    if (!loc) return ''
    const label = String(loc.label || '').trim()
    const lat = (loc.lat !== undefined && loc.lat !== null && String(loc.lat) !== '') ? String(loc.lat).trim() : ''
    const lng = (loc.lng !== undefined && loc.lng !== null && String(loc.lng) !== '') ? String(loc.lng).trim() : ''
    const address = String(loc.address || '').trim()
    const link = String(loc.link || '').trim()
    const latlng = (lat && lng) ? `${lat},${lng}` : ''
    return [label, latlng, address, link].join('|').replace(/\|+$/, '')
  }, [])
  const parseLocationString = React.useCallback((str) => {
    const raw = String(str || '')
    const parts = raw.split('|')
    const [label = '', latlng = '', address = '', link = ''] = parts
    let lat = null, lng = null
    if (latlng && /-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?/.test(latlng)) {
      const [la, lo] = latlng.split(',')
      lat = parseFloat(la)
      lng = parseFloat(lo)
    }
    const maps = (lat !== null && lng !== null)
      ? `https://www.google.com/maps?q=${lat},${lng}`
      : ''
    return { label, lat, lng, address, link: link || maps, raw }
  }, [])
  const staticMapUrl = React.useCallback((lat, lng) => {
    if (lat === null || lng === null || lat === undefined || lng === undefined) return ''
    const z = 15
    const size = '400x240'
    return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=${z}&size=${size}&markers=${lat},${lng},lightblue1`
  }, [])

  // Componer texto de sección incluyendo "Recursos:" con archivos y ubicaciones (para contexto LLM)
  const composeSectionTextForContext = React.useCallback((t) => {
    if (!t) return ''
    const base = String(t.content || '')
    const files = Array.isArray(t.files) ? t.files : []
    const locs = Array.isArray(t.locations) ? t.locations : []
    const hasExtras = files.length || locs.length
    if (!hasExtras) return base
    const extras = ['','Recursos:']
    for (const f of files) {
      const label = f?.original || f?.filename || f?.name || 'archivo'
      const url = f?.url || ''
      extras.push(`- [${label}](${url})`)
    }
    for (const l of locs) {
      // Convertir la ubicación almacenada (formato interno con "|") a una línea más natural
      const info = typeof l === 'string' ? parseLocationString(l) : l
      const parts = []
      if (info?.label) parts.push(String(info.label))
      if (info?.address) parts.push(`Dirección: ${String(info.address)}`)
      if (info && info.lat != null && info.lng != null) parts.push(`Coordenadas: ${info.lat},${info.lng}`)
      if (info?.link) parts.push(`Enlace: ${String(info.link)}`)
      const human = parts.length ? parts.join(' — ') : (typeof l === 'string' ? l : formatLocationForStorage(l))
      extras.push(`- Ubicación: ${human}`)
    }
    return `${base}\n\n${extras.join('\n')}`
  }, [formatLocationForStorage, parseLocationString])

  // Cargar en modo edición si hay ?id=
  React.useEffect(() => {
    const id = agentIdParam ? Number(agentIdParam) : 0
    if (!id) return
    let cancelled = false
    const run = async () => {
      // Revisar borrador local solo si es significativo; si está vacío, ignorarlo y limpiarlo
      try {
        const draftText = localStorage.getItem(storageKey)
        if (draftText) {
          try {
            const d = JSON.parse(draftText)
            const hasTabs = Array.isArray(d?.tabs) && d.tabs.length > 0
            const hasName = typeof d?.agentName === 'string' && d.agentName.trim().length > 0
            const hasAdvisor = typeof d?.advisorName === 'string' && d.advisorName.trim().length > 0
            if ((hasTabs || hasName) && hasAdvisor) return // mantener borrador significativo solo si también tiene asesor
            // Borrador vacío o incompleto: limpiarlo para permitir carga desde servidor
            localStorage.removeItem(storageKey)
          } catch { localStorage.removeItem(storageKey) }
        }
      } catch {}
      try {
        const res = await fetch(`/api/agents/${id}`)
        const text = await res.text()
        const j = text ? JSON.parse(text) : { ok: false, error: 'Respuesta vacía del servidor' }
        if (!res.ok || !j.ok || !j.agent) throw new Error(j.error || 'No se pudo cargar el agente')
        if (cancelled) return
        setAgentName(j.agent.name || '')
        setAdvisorName(j.agent.advisorName || '')
        const sections = Array.isArray(j.agent.sections) ? j.agent.sections : []
        const mapped = sections.map((s, idx) => {
          const parsed = parseSavedResources(s.content || '')
          const isDef = Boolean(s?.isDefault) || isGeneralName(s?.name)
          return {
            id: s.id ? String(s.id) : `sec-${idx+1}`,
            name: s.name || `Sección ${idx+1}`,
            content: parsed.text || '',
            files: parsed.files || [],
            locations: parsed.locations || [],
            active: true,
            isDefault: isDef
          }
        })
        const nextTabs = mapped.length ? rebuildGeneralFromTabs(mapped) : initialTabs
        setTabs(nextTabs)
        const defIdx = nextTabs.findIndex(t => t.isDefault)
        setActiveTabId(nextTabs.length ? (defIdx >= 0 ? nextTabs[defIdx].id : nextTabs[0].id) : '')
      } catch (e) {
        setErrorText(e.message || 'Error cargando')
      }
    }
    run()
    return () => { cancelled = true }
  }, [agentIdParam, storageKey])

  // Hidratar desde borrador local si existe
  React.useEffect(() => {
    // Requisito: en creación (sin id) NO queremos rehidratar pestañas de borrador
    if (!agentIdParam) {
      try { localStorage.removeItem(storageKey) } catch {}
      setDraftLoaded(true)
      return
    }
    try {
      const text = localStorage.getItem(storageKey)
      if (!text) { setDraftLoaded(true); return }
      const d = JSON.parse(text)
      if (d && typeof d === 'object') {
        if (typeof d.agentName === 'string') setAgentName(d.agentName)
        if (typeof d.advisorName === 'string') setAdvisorName(d.advisorName)
        if (Array.isArray(d.tabs) && d.tabs.length) {
          // Si el borrador es antiguo y tiene "Recursos:" dentro del contenido, parsearlo
          const mapped = d.tabs.map((t, idx) => {
            const parsed = parseSavedResources(t.content || '')
            const isDef = Boolean(t?.isDefault) || isGeneralName(t?.name)
            return {
              id: t.id || `sec-${Date.now()}-${idx}`,
              name: t.name || `Sección ${idx+1}`,
              content: parsed.text || t.content || '',
              files: (t.files && t.files.length ? t.files : parsed.files) || [],
              locations: (t.locations && t.locations.length ? t.locations : parsed.locations) || [],
              active: true,
              isDefault: isDef
            }
          })
          setTabs(rebuildGeneralFromTabs(mapped))
        }
        if (typeof d.activeTabId === 'string') setActiveTabId(d.activeTabId)
        // memoria eliminada
      }
    } catch {}
    setDraftLoaded(true)
  }, [storageKey, parseSavedResources])

  // Autosave de borrador local cuando cambian nombre/pestañas/activa
  React.useEffect(() => {
    // Evitar guardar hasta haber intentado cargar el borrador para no pisarlo
    if (!draftLoaded) return
    try {
      const data = { agentName, advisorName, tabs, activeTabId, ts: Date.now() }
      localStorage.setItem(storageKey, JSON.stringify(data))
    } catch {}
  }, [agentName, advisorName, tabs, activeTabId, storageKey, draftLoaded])

  // Manejo de tabs
  const addTab = () => {
    const base = 'Sección'
    const num = tabs.length + 1
    const id = `sec-${Date.now()}`
    const next = [...tabs, { id, name: `${base} ${num}`, content: '', files: [], locations: [], active: true }]
    setTabs(rebuildGeneralFromTabs(next))
    setActiveTabId(id)
  }
  const openRenameTab = (id) => {
    const current = tabs.find(t => t.id === id)
    if (current?.isDefault) return
    setRenameTabId(id)
    setRenameName(current ? current.name : '')
    setRenameTabOpen(true)
  }
  const closeRenameTab = () => {
    setRenameTabOpen(false)
    setRenameTabId(null)
    setRenameName('')
  }
  const confirmRenameTab = () => {
    const name = String(renameName || '').trim()
    if (!name || !renameTabId) { closeRenameTab(); return }
    setTabs(prev => rebuildGeneralFromTabs(prev.map(t => t.id === renameTabId ? { ...t, name } : t)))
    closeRenameTab()
  }
  const openDeleteTab = (id) => {
    const current = tabs.find(t => t.id === id)
    if (current?.isDefault) return
    setDeleteTabId(id); setDeleteTabOpen(true)
  }
  const closeDeleteTab = () => { setDeleteTabOpen(false); setDeleteTabId(null) }
  const deleteTab = (id) => {
    const current = tabs.find(t => t.id === id)
    if (!current || current.isDefault) return
    const next = tabs.filter(t => t.id !== id)
    setTabs(rebuildGeneralFromTabs(next))
    if (activeTabId === id && next.length) setActiveTabId(next[0].id)
  }
  const confirmDeleteTab = () => {
    if (!deleteTabId) return closeDeleteTab()
    deleteTab(deleteTabId)
    closeDeleteTab()
  }

  // Activar/Inactivar pestaña
  const toggleTabActive = (id) => {
    setTabs(prev => {
      const updated = prev.map(t => {
        if (t.id !== id) return t
        if (t.isDefault) return { ...t, active: true }
        return { ...t, active: t.active === false ? true : false }
      })
      return rebuildGeneralFromTabs(updated)
    })
  }

  // Vista previa
  const openPreview = (file) => {
    if (!file) return
    setPreviewItem({
      url: file.url || file.href || '#',
      mime: file.mime || file.type || '',
      name: file.original || file.filename || file.name || 'archivo',
      size: file.size || 0
    })
    setPreviewOpen(true)
  }
  const closePreview = () => { setPreviewOpen(false); setPreviewItem(null) }

  // Cerrar con ESC cuando el modal está abierto
  React.useEffect(() => {
    if (!previewOpen) return
    const onKey = (e) => { if (e.key === 'Escape') closePreview() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewOpen])

  // Contenido de tab activa
  const updateActiveContent = (val) => {
    if (!activeTab) return
    const next = [...tabs]
    next[activeIndex] = { ...next[activeIndex], content: val }
    setTabs(rebuildGeneralFromTabs(next))
  }

  // Gestor de recursos: archivos y ubicaciones
  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!activeTab || !files.length) return
    try {
      const images = files.filter(f => (f.type||'').startsWith('image/'))
      const others = files.filter(f => !(f.type||'').startsWith('image/'))

      const upload = async (endpoint, list) => {
        if (!list.length) return []
        const fd = new FormData()
        for (const f of list) fd.append('files', f)
        const res = await fetch(endpoint, { method: 'POST', body: fd })
        const text = await res.text()
        const j = text ? JSON.parse(text) : { ok: false, error: 'Respuesta vacía del servidor' }
        if (!res.ok || !j.ok) throw new Error(j.error || 'No se pudo subir archivos')
        return Array.isArray(j.files) ? j.files : []
      }

      const [imgUploaded, otherUploaded] = await Promise.all([
        upload('/api/upload/images', images),
        upload('/api/upload/files', others)
      ])

      const uploaded = [...imgUploaded, ...otherUploaded]
      if (uploaded.length) {
        const next = [...tabs]
        next[activeIndex] = { ...next[activeIndex], files: [...(next[activeIndex].files||[]), ...uploaded] }
        setTabs(rebuildGeneralFromTabs(next))
      }
    } catch (err) {
      alert(err?.message || 'Error subiendo archivos')
    } finally {
      // limpiar input para permitir volver a seleccionar los mismos archivos si se desea
      e.target.value = ''
    }
  }
  const addLocation = () => {
    if (!activeTab) return
    setLocForm({ label: '', address: '', link: '' })
    setLocationModalOpen(true)
  }

  const useMyLocation = () => {
    if (!navigator.geolocation) { alert('Geolocalización no soportada en este navegador'); return }
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords
      setLocForm((f) => ({ ...f, lat: String(latitude.toFixed(6)), lng: String(longitude.toFixed(6)) }))
    }, (err) => {
      alert('No se pudo obtener la ubicación: ' + (err?.message || 'desconocido'))
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 })
  }

  const confirmAddLocation = () => {
    if (!activeTab) return
    const label = String(locForm.label || '').trim()
    const address = String(locForm.address || '').trim()
    const link = String(locForm.link || '').trim()
    if (!label && !address && !link) { setLocationModalOpen(false); return }
    const toStore = formatLocationForStorage({ label, lat: '', lng: '', address, link })
    const next = [...tabs]
    next[activeIndex] = { ...next[activeIndex], locations: [...(next[activeIndex].locations||[]), toStore] }
    setTabs(rebuildGeneralFromTabs(next))
    setLocationModalOpen(false)
  }

  const removeLocationAt = (idx) => {
    if (!activeTab) return
    const next = [...tabs]
    const locs = [...(next[activeIndex].locations || [])]
    locs.splice(idx, 1)
    next[activeIndex] = { ...next[activeIndex], locations: locs }
    setTabs(rebuildGeneralFromTabs(next))
  }

  // Enviar ubicación por WhatsApp (manual). Si no hay lat/lng, envía texto con enlace.
  const sendLocationWhatsApp = async (loc) => {
    try {
      const info = typeof loc === 'string' ? parseLocationString(loc) : loc
      const to = window.prompt('Número WhatsApp (Ej: 3001234567)')
      if (!to) return
      if (info.lat != null && info.lng != null) {
        const res = await fetch('/api/wa/send-location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to, latitude: info.lat, longitude: info.lng, name: info.label || '', address: info.address || '' })
        })
        const j = await res.json().catch(()=>({ ok:false, error:'Respuesta inválida' }))
        if (!res.ok || !j.ok) throw new Error(j.error || 'No se pudo enviar ubicación')
      } else {
        const lines = []
        lines.push(`📍 ${info.label || 'Ubicación'}`)
        if (info.address) lines.push(info.address)
        if (info.link) lines.push(info.link)
        const message = lines.join('\n')
        const res = await fetch('/api/wa/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to, message })
        })
        const j = await res.json().catch(()=>({ ok:false, error:'Respuesta inválida' }))
        if (!res.ok || !j.ok) throw new Error(j.error || 'No se pudo enviar mensaje')
      }
      alert('Enviado a WhatsApp ✅')
    } catch (e) {
      alert(e?.message || 'Error enviando a WhatsApp')
    }
  }

  // Eliminar archivo de la pestaña activa
  const removeFileAt = (idx) => {
    if (!activeTab) return
    const next = [...tabs]
    const files = [...(next[activeIndex].files || [])]
    files.splice(idx, 1)
    next[activeIndex] = { ...next[activeIndex], files }
    setTabs(next)
  }

  const formatBytes = (b) => {
    const bytes = Number(b || 0)
    if (!bytes) return '0 B'
    const k = 1024
    const sizes = ['B','KB','MB','GB']
    const i = Math.min(Math.floor(Math.log(bytes)/Math.log(k)), sizes.length-1)
    const val = bytes / Math.pow(k, i)
    return `${val.toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`
  }

  // Guardar/Descartar
  const handleSave = async () => {
    setErrorText('')
    const name = String(agentName || '').trim()
    const advisor = String(advisorName || '').trim()
    if (!name) { setErrorText('Ingresa un nombre para el agente'); return }
    if (!advisor) { setErrorText('Ingresa el nombre del asesor'); return }
    setSaveStatus('saving')
    try {
      const sections = tabs.map(t => {
        const base = t.content || ''
        const files = (t.files || [])
        const locs = (t.locations || [])
        const hasExtras = files.length || locs.length
        const extras = hasExtras ? ['','Recursos:'] : []
        for (const f of files) {
          const label = f.original || f.filename || f.name || 'archivo'
          const url = f.url || ''
          extras.push(`- [${label}](${url})`)
        }
        for (const l of locs) {
          const line = typeof l === 'string' ? l : formatLocationForStorage(l)
          extras.push(`- Ubicación: ${String(line)}`)
        }
        return { name: t.name, content: extras.length ? `${base}\n\n${extras.join('\n')}` : base, active: t.active !== false }
      })
      const isEdit = !!agentIdParam
      const url = isEdit ? `/api/agents/${encodeURIComponent(agentIdParam)}` : '/api/agents'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, advisorName: advisor, sections }) })
      let j
      try {
        const text = await res.text()
        j = text ? JSON.parse(text) : { ok: false, error: 'Respuesta vacía del servidor' }
      } catch (e) { j = { ok: false, error: 'Respuesta inválida del servidor' } }
      if (!res.ok || !j.ok) throw new Error(j.error || 'No se pudo guardar')
      setSaveStatus('idle')
      // Al guardar exitosamente, limpiar borrador local
      try { localStorage.removeItem(storageKey) } catch {}
      navigate('/agents/list')
    } catch (e) {
      setSaveStatus('error')
      setErrorText(e.message || 'Error inesperado')
    }
  }
  const handleDiscard = () => {
    setAgentName('')
    setAdvisorName('')
    setTabs(initialTabs)
    setActiveTabId('')
    setErrorText('')
    setSaveStatus('idle')
    try { localStorage.removeItem(storageKey) } catch {}
    navigate('/agents/list')
  }

  // Tester del agente (integración Gemini con contexto de secciones)
  const [testerQ, setTesterQ] = React.useState('')
  const [testerA, setTesterA] = React.useState('')
  const [testerLoading, setTesterLoading] = React.useState(false)
  // Memoria del tester: historial y oferta de recurso reciente
  const [testerHistory, setTesterHistory] = React.useState([]) // [{role:'user'|'model', text:string}]
  const [lastOfferedResource, setLastOfferedResource] = React.useState(null) // {name, url}
  // Speech-to-Text (micrófono)
  const recognitionRef = React.useRef(null)
  const [isRecording, setIsRecording] = React.useState(false)
  // Integración con WhatsApp para prueba automática
  const [autoRespond, setAutoRespond] = React.useState(false)
  const [waActiveSender, setWaActiveSender] = React.useState(null)
  const waProcessedRef = React.useRef(new Set())
  const waSocketRef = React.useRef(null)

  const sendToWhatsApp = async (jid, message, quotedId = null) => {
    try {
      const res = await fetch('/api/wa/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jid, message: String(message || ''), quotedId })
      })
      const data = await res.json().catch(()=>({ ok:false, error:'Respuesta inválida del servidor' }))
      if (!data?.ok) throw new Error(data?.error || 'Falló el envío por WhatsApp')
      return true
    } catch (e) {
      console.error('[AutoResponder] Error enviando a WhatsApp:', e)
      return false
    }
  }
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
          setTesterQ(prev => (prev ? prev.trimEnd() + ' ' : '') + text.trim() + ' ')
        }
      }
      rec.onerror = (e) => {
        // Errores comunes: 'not-allowed', 'no-speech', 'aborted'
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

  // (Se removieron atajos deterministas; el modelo responde todas las preguntas)
  // Preparar Memoria a partir de las pestañas activas
  // (prepareMemory eliminado: centrado únicamente en el agente)
  // Llamada a Gemini con prompt de ventas actualizado (portado desde "Agente")
  const callGeminiAPI = async (historyMessages, fullContext, hasResources) => {
    // Construimos el prompt del sistema con reglas de ventas y manejo de recursos
    const systemPrompt = `
                Eres un asistente de ventas experto, amable y MUY natural para la institución educativa complejo educativo Lasit.
                Tu objetivo es tener una conversación humana, no sonar como un robot.

                Tu conocimiento se limita ESTRICTA Y ÚNICAMENTE a la siguiente "Base de Conocimiento".
                NO debes inventar información ni buscar en Internet.

                Base de Conocimiento (Contexto):
                ${fullContext}

                REGLAS DE ORO (MUY IMPORTANTE):

                1.  **(¡REGLA CRÍTICA!) REVISA "INFORMACIÓN GENERAL" PRIMERO:** El contexto tiene varias pestañas. Para preguntas generales (como "¿qué es...?", "¿quiénes son?", "háblame de...", "bachillerato por ciclos"), la respuesta CASI SIEMPRE está en la pestaña "INFORMACIÓN GENERAL". ¡DEBES REVISAR ESTA PESTAÑA A FONDO! No digas "no sé" si la información está en esa pestaña. Revisa todas las pestañas antes de rendirte.

                2.  **PROHIBIDO COPIAR Y PEGAR.** Esta es tu regla #2. NUNCA copies frases textualmente del "Contexto". Es un manual de capacitación para ti, no un guion para el cliente.
                
                3.  **REINTERPRETA Y HUMANIZA.** Tu trabajo es leer el contexto, entender la idea, y luego explicarla en TUS PROPIAS PALABRAS, de forma conversacional, amigable y resumida.
                    * Ejemplo MALO (copiando): "La duración total del programa varía y se determina según el último grado..."
                    * Ejemplo BUENO (humanizado): "¡Claro! La duración depende del grado en el que ingrese el estudiante, porque con nosotros puede avanzar muy rápido, un grado cada seis meses."
                
                4.  **PROHIBIDO IMITAR EL FORMATO.**
                    * Tu respuesta DEBE ser un párrafo de texto natural y llano.
                    * NUNCA uses formato especial, ni listas con asteriscos (*), guiones (-), números (1.), o negrilla (** **), aunque el contexto los tenga.
                    * Si el contexto es una lista (ej: "1. **Referencia:** Cerca al CAI..."), tu trabajo es convertirlo en una frase humana.
                    * Ejemplo BUENO (humanizado): "¡Claro! Para que te ubiques fácil, estamos a unos 5 minutos caminando desde el CAI de La Gaitana. También, la ruta 1125 del SITP te deja justo al frente."

                5.  **PREGUNTA PARA CALIFICAR (NO LISTAR).** Si la pregunta es amplia (ej: "¿cuánto dura?", "¿qué precios tienen?") y el contexto tiene MÚLTIPLES opciones (ej: una tabla), NO listes las opciones. Responde con una PREGUNTA DE SEGUIMIENTO.
                    * Ejemplo BUENO: "¡Con gusto! Para darte el dato exacto, ¿me confirmas por favor en qué grado quedó el estudiante?"
                
                6.  **MANEJO DE RECURSOS (Archivos y Ubicaciones) - ¡LÓGICA DE VENTAS PROACTIVA!**
                    * El contexto te listará los *nombres* y *detalles* de los archivos, imágenes y ubicaciones.
                    * **SÉ PROACTIVO Y CONVERSACIONAL (Tu ejemplo exacto):** Tu trabajo no es solo "mencionar" el recurso, sino "ofrecerlo" como un humano en un segundo paso.
                    
                    * **Ejemplo de PDF:** Si el cliente pregunta por "precios", y tú encuentras un archivo "precios.pdf", tu respuesta debe ser en dos partes:
                        1.  (La respuesta de texto): "¡Claro! Los precios de matrícula son X..."
                        2.  (La oferta proactiva): "De hecho, tengo un PDF con toda la lista de precios detallada. ¿Te gustaría que te lo comparta?"
                    
                    * **Ejemplo de UBICACIÓN:** Si el cliente pregunta "¿cuál es la dirección?", y tú encuentras una "Ubicación: Sede Principal, Dir: Calle 100, Enlace: https://maps.app.goo.gl/..."
                        1.  (La respuesta de texto): "¡Con gusto! Nuestra sede principal está en la Calle 100, muy cerca del CAI de La Gaitana."
                        2.  (La oferta proactiva): "Para que llegues más fácil, ¿quieres que te envíe el enlace de la ubicación?"

                    * **(IMPORTANTE):** Tu trabajo es solo *mencionar* y *ofrecer* estos recursos. NUNCA intentes mostrar la imagen, el PDF o el mapa. Solo habla de ellos y pregunta si el cliente los quiere.
                
                7.  **SÉ CONVERSACIONAL.** Responde como un humano. Usa frases cortas.

                8.  **UTILIZA UN NOMBRE.** Cuando te saluden contesta unicamente con tu nombre que sera *Marcela Rodriguez* y si te lo preguntan tu cargo sera: *Secretaria del Complejo educativo*.
                
                9.  **NO TE REFIERAS AL CONTEXTO.** Nunca digas "Según mi base de conocimiento...".

                10.  **PREGUNTAS PERSONALES.** Como interactuas como un humano si hacen preguntas personales responde *Disculpa estos chats son monitoriados por mi jefe, por lo tanto unicamente puedo contestar preguntas realcionadas con el complejo Lasit*...".
                
                11.  **NO INVENTES.** Si la pregunta no se puede responder con la base de conocimiento (después de haber revisado TODAS las pestañas, especialmente "INFORMACIÓN GENERAL"), informa amablemente que no tienes esa información específica.
            `

    // Preparamos el payload para el backend (proveedor Gemini)
    const payload = {
      provider: 'gemini',
      contents: historyMessages,
      systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
      generationConfig: { temperature: 0.2, maxOutputTokens: 350 }
    }
    const res = await fetch('/api/llm/chat/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    })
    const text = await res.text()
    const j = text ? JSON.parse(text) : { ok: false, error: 'Respuesta vacía del servidor' }
    if (!res.ok || !j.ok) throw new Error(j.error || 'Error generando respuesta')
    // Devolver también promptFeedback para poder manejar bloqueos/finishReason
    return { text: j.text || '', promptFeedback: j.promptFeedback || null }
  }
  // Heurística simple para identificar confirmaciones de envío
  const isConfirmation = (msg) => {
    const t = String(msg || '').trim().toLowerCase()
    return /^(si|sí|claro|dale|ok|okay|de una|envíalo|enviamelo|envíamela|por favor|hazlo|correcto)([!.\s]|$)/.test(t)
  }
  // Buscar si la respuesta del modelo ofreció explícitamente un recurso cargado
  const detectOfferedResource = (answer) => {
    try {
      const allFiles = tabs
        .filter(t => t.active !== false)
        .flatMap(t => Array.isArray(t.files) ? t.files : [])
      if (!allFiles.length) return null
      const text = String(answer || '')
      // 0) Marcadores explícitos
      const m = /(\{\{doc:([^:}]+):([^}]+)\}\}|\[\[doc:([^:\]]+):([^\]]+)\]\])/i.exec(text)
      if (m) {
        const section = (m[2] || m[4] || '').trim()
        const query = (m[3] || m[5] || '').trim()
        const r = resolveDocMarker(section, query)
        if (r) return r
      }
      // Match por nombre exacto primero
      for (const f of allFiles) {
        const cand = f?.original || f?.filename || f?.name
        const base = String(cand || '').replace(/\.[a-z0-9]+$/i, '')
        const low = text.toLowerCase()
        if (cand && low.includes(String(cand).toLowerCase())) {
          return { name: cand, url: f?.url || '' }
        }
        if (base && low.includes(base.toLowerCase())) {
          return { name: cand || base, url: f?.url || '' }
        }
      }
      // Si menciona PDF y hay uno, tomamos el primero como oferta
      if (/\bpdf\b/i.test(text)) {
        const pdf = allFiles.find(f => (f?.mime === 'application/pdf') || String(f?.url||'').toLowerCase().endsWith('.pdf'))
        if (pdf) return { name: pdf.original || pdf.filename || pdf.name || 'archivo.pdf', url: pdf.url || '' }
      }
      return null
    } catch { return null }
  }
  const askAgent = async (incomingQ = null, afterAnswer = null) => {
    const q = String((incomingQ ?? testerQ) || '').trim()
    if (!q) return
    setTesterLoading(true)
    try {
      const activeTabs = tabs.filter(t => t.active !== false)
      // Helpers para limitar el tamaño del contexto y evitar MAX_TOKENS
      const truncate = (txt, max) => {
        const s = String(txt || '')
        return s.length > max ? (s.slice(0, max) + '…') : s
      }
      const buildContext = (tabsList, mode = 'normal') => {
        const limits = mode === 'aggressive'
          ? { textGeneral: 1200, textDefault: 700, files: 4, locs: 3 }
          : { textGeneral: 2500, textDefault: 1400, files: 8, locs: 5 }
        let ctx = 'INICIO DE LA BASE DE CONOCIMIENTO:\n\n'
        for (const t of tabsList) {
          // Separar texto base de cualquier bloque "Recursos:" incrustado
          const parsed = parseSavedResources(String(t.content || ''))
          const isGeneral = /información\s*general/i.test(String(t.name || ''))
          const maxTxt = isGeneral ? limits.textGeneral : limits.textDefault
          const baseTextFull = parsed.text || ''
          const baseText = truncate(baseTextFull, maxTxt)
          // Unificar recursos: los cargados por UI y los rehidratados desde contenido (limitados)
          const files = [
            ...((Array.isArray(t.files) ? t.files : []) || []),
            ...((Array.isArray(parsed.files) ? parsed.files : []) || [])
          ].slice(0, limits.files)
          const locations = [
            ...((Array.isArray(t.locations) ? t.locations : []) || []),
            ...((Array.isArray(parsed.locations) ? parsed.locations : []) || [])
          ].slice(0, limits.locs)

          ctx += `--- Pestaña: "${t.name}" ---\n`
          ctx += 'Contenido de Texto:\n'
          ctx += baseText ? `${baseText}\n\n` : 'No hay información de texto.\n\n'

          const hasFiles = files && files.length > 0
          const hasLocs = locations && locations.length > 0
          if (hasFiles || hasLocs) {
            ctx += 'Recursos Disponibles en esta Pestaña:\n'
            // Archivos / Imágenes
            for (const f of files) {
              const label = f?.original || f?.filename || f?.name || 'archivo'
              const mime = String(f?.mime || '').toLowerCase()
              const url = String(f?.url || '')
              const isImg = mime.startsWith('image/') || /(\.png|\.jpg|\.jpeg|\.webp|\.gif)$/i.test(url)
              if (isImg) ctx += `* Imagen: "${label}"\n`
              else ctx += `* Archivo: "${label}" (Tipo: ${mime || 'desconocido'})\n`
            }
            // Ubicaciones
            for (const l of locations) {
              const info = typeof l === 'string' ? parseLocationString(l) : l
              const label = String(info?.label || '').trim()
              const address = String(info?.address || '').trim()
              const link = String(info?.link || '').trim()
              ctx += `* Ubicación: "${label}" (Dirección: ${address || 'N/D'}, Enlace: ${link || 'N/D'})\n`
            }
            ctx += '\n'
          } else {
            ctx += 'No hay archivos ni recursos en esta pestaña.\n\n'
          }
        }
        ctx += 'FIN DE LA BASE DE CONOCIMIENTO.'
        return ctx
      }

      // Contexto normal; si hay bloqueo por tokens, reintentaremos con modo agresivo
      let fullContext = buildContext(activeTabs, 'normal')
      // Log de depuración: largo del contexto
      try { console.debug('[Agente] KB length:', fullContext.length) } catch {}
      const hasResources = /Recursos Disponibles en esta Pestaña:/m.test(fullContext)
      // Si es una confirmación y hay recurso ofrecido, "adjuntar" directamente
      if (lastOfferedResource && isConfirmation(q)) {
        const line = lastOfferedResource.url ? ` ${lastOfferedResource.url}` : ''
        const msg = `¡Perfecto! Te envío el recurso: ${lastOfferedResource.name}.${line}`
        setTesterA(msg)
        setTesterHistory(prev => [...prev, { role: 'user', text: q }, { role: 'model', text: msg }])
        // Consumimos la oferta para evitar reenvíos no deseados
        setLastOfferedResource(null)
        return
      }

      // Construimos historial completo (capar a las últimas 3 interacciones previas)
      const cappedHistory = testerHistory.slice(-6)
      const historyForLLM = [...cappedHistory, { role: 'user', text: q }]
      const contents = historyForLLM.map(m => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: m.text }] }))

      let { text: answerText, promptFeedback } = await callGeminiAPI(contents, fullContext, hasResources)
      // Reintento con contexto más agresivo si hubo bloqueo por tokens
      if ((promptFeedback?.blockReason === 'MAX_TOKENS') || (promptFeedback?.finishReason === 'MAX_TOKENS')) {
        fullContext = buildContext(activeTabs, 'aggressive')
        try { console.debug('[Agente] Retry with aggressive KB length:', fullContext.length) } catch {}
        ;({ text: answerText, promptFeedback } = await callGeminiAPI(contents, fullContext, hasResources))
      }
      let finalAnswer = String(answerText || '').trim()
      if (!finalAnswer) {
        const reason = promptFeedback?.blockReason || promptFeedback?.finishReason || ''
        const reasonText = reason ? ` (Motivo: ${reason})` : ''
        finalAnswer = 'Lo siento, no pude generar una respuesta ahora.' + reasonText + '\n' +
          'Sugerencias: 1) reformula la pregunta, 2) verifica que las pestañas con la información (especialmente "Ubicación") estén activas.'
      }
      setTesterA(finalAnswer)
      setTesterHistory(prev => [...prev, { role: 'user', text: q }, { role: 'model', text: finalAnswer }])

      // Detectar si el modelo ofreció enviar algún recurso
      const offered = detectOfferedResource(finalAnswer)
      if (offered) setLastOfferedResource(offered)

      if (typeof afterAnswer === 'function') {
        try { await afterAnswer(finalAnswer) } catch (e) {
          console.error('[AutoResponder] afterAnswer error:', e)
        }
      }
    } catch (e) {
      setTesterA(`Error: ${e.message || String(e)}`)
    } finally { setTesterLoading(false) }
  }

  // Socket: escuchar mensajes de WhatsApp y auto-responder
  React.useEffect(() => {
    // Respetar el candado de respuesta del Recepcionista: si está activo, no auto-responder aquí
    try {
      const lock = localStorage.getItem('wa_reply_lock')
      if (lock && lock !== 'agentscreate') {
        if (waSocketRef.current) { try { waSocketRef.current.disconnect() } catch {} waSocketRef.current = null }
        return
      }
    } catch (_) {}

    if (!autoRespond) {
      if (waSocketRef.current) { try { waSocketRef.current.disconnect() } catch {} waSocketRef.current = null }
      return
    }
    const socket = io('/', { path: '/socket.io', transports: ['websocket'] })
    waSocketRef.current = socket
    socket.on('wa:message', (item) => {
      try {
        if (!item || item.fromMe || !item.text) return
        if (waProcessedRef.current.has(item.id)) return
        waProcessedRef.current.add(item.id)
        setWaActiveSender(item.sender || null)
        setTesterQ(item.text || '')
        // Generar respuesta y enviarla al remitente
        askAgent(item.text || '', async (answer) => {
          await sendToWhatsApp(item.sender, answer, item.id)
        })
      } catch (e) {
        console.error('[AutoResponder] Handler error:', e)
      }
    })
    return () => { try { socket.disconnect() } catch {}; waSocketRef.current = null }
  }, [autoRespond])

  // TTS: voces y preview
  // Voces del archivo original (IDs y etiquetas)
  const VOICE_PRESETS = [
    { id: 'Zephyr', label: 'Marcela (Amable)' },
    { id: 'Kore', label: 'Elizabeth (Profesional)' },
    { id: 'Leda', label: 'Ingrid (Joven)' },
    { id: 'Callirrhoe', label: 'Leidy (Clara)' },
    { id: 'Puck', label: 'Julio (Amable)' },
    { id: 'Orus', label: 'Alejandro (Profesional)' },
    { id: 'Fenrir', label: 'Juan (Energético)' },
    { id: 'Algenib', label: 'Alexander (Grave)' },
  ]
  const [voiceOption, setVoiceOption] = React.useState(VOICE_PRESETS[0].id)
  const [ttsVoices, setTtsVoices] = React.useState([])
  React.useEffect(() => {
    const loadVoices = () => {
      const list = window.speechSynthesis ? window.speechSynthesis.getVoices() : []
      setTtsVoices(list)
    }
    loadVoices()
    if (window.speechSynthesis && typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
      window.speechSynthesis.onvoiceschanged = loadVoices
    }
  }, [])

  const pickVoice = (presetId) => {
    const esVoices = ttsVoices.filter(v => (v.lang || '').toLowerCase().startsWith('es'))
    if (!esVoices.length) return ttsVoices[0] || null
    const prefer = {
      // Mapeo heurístico de los presets originales a voces ES comunes
      Zephyr: ['Microsoft Sabina', 'Google español', 'Microsoft Helena', 'Microsoft Laura', 'Paulina'],
      Kore: ['Microsoft Helena', 'Microsoft Dalia', 'Google español'],
      Leda: ['Microsoft Elvira', 'Luciana', 'Camila'],
      Callirrhoe: ['Microsoft Laura', 'Helena', 'Esperanza'],
      Puck: ['Microsoft Raul', 'Javier', 'Diego', 'Miguel'],
      Orus: ['Microsoft Pablo', 'Enrique', 'Alvaro'],
      Fenrir: ['Andres', 'Jorge', 'Carlos'],
      Algenib: ['Santiago', 'Benjamin', 'Antonio']
    }[presetId] || []
    for (const p of prefer) {
      const v = esVoices.find(v => (v.name || '').toLowerCase().includes(p.toLowerCase()))
      if (v) return v
    }
    return esVoices[0]
  }
  const [voiceLoading, setVoiceLoading] = React.useState(false)
  const previewVoice = async () => {
    try {
      setVoiceLoading(true)
      const payload = { presetId: voiceOption }
      const r = await fetch('/api/tts/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const t = await r.text()
      const j = t ? JSON.parse(t) : { ok: false }
      if (!r.ok || !j.ok || !j.url) throw new Error(j.error || 'No se pudo generar el audio')
      const audio = new Audio(j.url)
      audio.play().catch(()=>{})
    } catch (e) {
      alert('No se pudo reproducir la voz: ' + (e?.message || String(e)))
    } finally { setVoiceLoading(false) }
  }

  // === Marcadores de documentos en respuestas ===
  // Sintaxis admitida: {{doc:seccion:busqueda}} o [[doc:seccion:busqueda]]
  // - seccion y busqueda son case-insensitive y se hace match parcial.
  const resolveDocMarker = (sectionQuery, fileQuery) => {
    try {
      const sQ = String(sectionQuery || '').trim().toLowerCase()
      const fQ = String(fileQuery || '').trim().toLowerCase()
      const activeTabs = tabs.filter(t => t.active !== false)
      // 1) Localizar sección por nombre aproximado
      let section = activeTabs.find(t => String(t.name||'').toLowerCase() === sQ)
      if (!section) section = activeTabs.find(t => String(t.name||'').toLowerCase().includes(sQ))
      if (!section) return null
      const files = Array.isArray(section.files) ? section.files : []
      if (!files.length) return null
      // 2) Localizar archivo por nombre (original/filename) aproximado
      let f = files.find(x => String(x.original||x.filename||x.name||'').toLowerCase() === fQ)
      if (!f) f = files.find(x => String(x.original||x.filename||x.name||'').toLowerCase().includes(fQ))
      if (!f && fQ) return null
      // Si no se especifica fileQuery, tomar primer PDF o primero
      if (!f) f = files.find(x => (x?.mime === 'application/pdf') || String(x?.url||'').toLowerCase().endsWith('.pdf')) || files[0]
      if (!f) return null
      return { name: f.original || f.filename || f.name || 'archivo', url: f.url || '' }
    } catch { return null }
  }

  const parseAnswerNodes = (answer) => {
    const text = String(answer || '')
    const nodes = []
    let idx = 0
    const regex = /(\{\{doc:([^:}]+):([^}]+)\}\}|\[\[doc:([^:\]]+):([^\]]+)\]\])/ig
    let m
    while ((m = regex.exec(text)) !== null) {
      const start = m.index
      const end = regex.lastIndex
      if (start > idx) nodes.push(text.slice(idx, start))
      const section = (m[2] || m[4] || '').trim()
      const query = (m[3] || m[5] || '').trim()
      const res = resolveDocMarker(section, query)
      if (res) {
        // Tarjeta/callout con enlace
        nodes.push(
          <div key={`doc-${start}`} className="my-2 p-3 border border-blue-200 bg-blue-50 rounded">
            <div className="text-sm text-blue-900">Documento sugerido: <a className="underline font-medium" href={res.url} target="_blank" rel="noreferrer">{res.name}</a></div>
          </div>
        )
      } else {
        // Si no se pudo resolver, dejar texto literal para visibilidad
        nodes.push(text.slice(start, end))
      }
      idx = end
    }
    if (idx < text.length) nodes.push(text.slice(idx))
    return nodes
  }

  return (
    <div className="min-h-screen text-slate-200">
      <div className="max-w-7xl mx-auto p-4 md:p-8">
        {/* Barra superior: nombre del agente y asesor */}
        <div className="bg-white rounded-lg shadow-md p-3 flex items-center flex-wrap gap-4 mb-6">
          <label htmlFor="agent-name" className="text-sm font-medium text-gray-600 whitespace-nowrap">Nombre del agente:</label>
          <input
            id="agent-name"
            value={agentName}
            onChange={(e)=>setAgentName(e.target.value)}
            className="w-full sm:w-80 h-8 px-2 text-sm text-gray-800 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Ej. Bachillerato por Ciclos"
          />

          <label htmlFor="advisor-name" className="text-sm font-medium text-gray-600 whitespace-nowrap">Nombre del Asesor:</label>
          <input
            id="advisor-name"
            value={advisorName}
            onChange={(e)=>setAdvisorName(e.target.value)}
            className="w-full sm:w-72 h-8 px-2 text-sm text-gray-800 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Ej. Marcela"
          />
        </div>

        {/* Contenedor principal */}
        <div className="bg-slate-800 shadow-xl rounded-lg overflow-hidden">
          {/* Tabs */}
          <div className="border-b border-slate-700">
            <div className="flex items-center space-x-1 px-4" id="tabs-container">
              {tabs.map(t => (
                <div key={t.id} className="flex items-center">
                  <button onClick={()=>setActiveTabId(t.id)} className={`tab-button flex items-center space-x-2 py-3 px-4 text-sm font-medium border-b-2 ${activeTabId===t.id ? 'border-blue-500 text-white' : 'border-transparent text-slate-400 hover:text-white'}`}>
                    <span>{t.name}</span>
                  </button>
                  {/* Checkbox de activo eliminado: todas las pestañas se consideran activas */}
                  {t.isDefault ? null : (
                    <button type="button" onClick={()=> openRenameTab(t.id)} className="ml-1 p-1 text-slate-400 hover:text-white" title="Renombrar">✎</button>
                  )}
                  {t.isDefault ? null : (
                    <button type="button" onClick={()=> openDeleteTab(t.id)} className="ml-1 p-1 text-red-400 hover:text-red-300" title="Eliminar">🗑</button>
                  )}
                </div>
              ))}
              <button onClick={addTab} className="ml-2 p-2 rounded-full text-slate-400 hover:bg-slate-700 hover:text-white" title="Añadir nueva pestaña">＋</button>
            </div>
          </div>

          {/* Modal de confirmación para eliminar pestaña */}
          {deleteTabOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/50" onClick={closeDeleteTab}></div>
              <div className="relative bg-white rounded-lg shadow-xl max-w-sm w-full mx-4 p-5">
                <h4 className="text-lg font-semibold text-gray-800 mb-2">Eliminar pestaña</h4>
                <p className="text-sm text-gray-600 mb-4">¿Seguro que deseas eliminar esta pestaña? Esta acción no se puede deshacer.</p>
                <div className="flex justify-end gap-2">
                  <button onClick={closeDeleteTab} className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">Cancelar</button>
                  <button onClick={confirmDeleteTab} className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700">Eliminar</button>
                </div>
              </div>
            </div>
          ) : null}

          {/* Modal de renombrar pestaña */}
          {renameTabOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/50" onClick={closeRenameTab}></div>
              <div className="relative bg-white rounded-lg shadow-xl max-w-sm w-full mx-4 p-5">
                <h4 className="text-lg font-semibold text-gray-800 mb-2">Renombrar pestaña</h4>
                <div className="mb-4">
                  <label className="block text-sm text-gray-600 mb-1">Nuevo nombre</label>
                  <input
                    value={renameName}
                    onChange={(e)=>setRenameName(e.target.value)}
                    onKeyDown={(e)=>{ if(e.key==='Enter') confirmRenameTab(); if(e.key==='Escape') closeRenameTab() }}
                    autoFocus
                    className="w-full h-10 px-3 text-base text-gray-800 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Ej. Información General"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={closeRenameTab} className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">Cancelar</button>
                  <button onClick={confirmRenameTab} className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">Guardar</button>
                </div>
              </div>
            </div>
          ) : null}

          {/* Modal de vista previa de archivos */}
          {previewOpen && previewItem ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/70" onClick={closePreview}></div>
              <div className="relative max-w-[92vw] w-full mx-4">
                <button onClick={closePreview} className="absolute -top-10 right-0 bg-black/60 text-white rounded-full h-9 w-9 flex items-center justify-center hover:bg-black/80" title="Cerrar">×</button>
                {/* Contenido dinámico */}
                {((previewItem.mime||'').startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(previewItem.url||'')) ? (
                  <div className="bg-slate-900 rounded-lg shadow-2xl overflow-hidden p-2">
                    <img src={previewItem.url} alt={previewItem.name} className="max-h-[88vh] max-w-[92vw] object-contain mx-auto" />
                  </div>
                ) : ((previewItem.mime||'') === 'application/pdf' || (previewItem.url||'').toLowerCase().endsWith('.pdf')) ? (
                  <div className="bg-white rounded-lg shadow-2xl overflow-hidden w-[92vw] max-w-[1200px] h-[88vh]">
                    <iframe src={previewItem.url} title={previewItem.name} className="w-full h-full" />
                  </div>
                ) : (
                  <div className="bg-slate-900 rounded-lg shadow-2xl p-6 text-slate-200 max-w-[90vw]">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex items-center justify-center h-12 w-12 rounded-md bg-slate-700 text-rose-400 text-2xl">📄</div>
                      <div>
                        <div className="font-semibold">{previewItem.name}</div>
                        <div className="text-xs text-slate-400">{(previewItem.size||0) ? `${(previewItem.size/1024).toFixed(1)} KB` : ''}</div>
                      </div>
                    </div>
                    <div className="text-sm text-slate-300">Este tipo de archivo no tiene vista previa integrada.</div>
                    <div className="mt-4 flex gap-2">
                      <a href={previewItem.url} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">Abrir en nueva pestaña</a>
                      <button onClick={closePreview} className="px-4 py-2 rounded-md border border-slate-600 text-slate-200 hover:bg-slate-800">Cerrar</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* Contenido */}
          <div className="p-6 md:p-8">
            {activeTab ? (
              // Key por sección para forzar remount y aislar estado/DOM entre pestañas
              <div key={activeTab.id} className="tab-content active-content">
                {/* Campo de texto */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-slate-300 mb-2">Contenido</label>
                  <div className="relative">
                    <textarea
                      value={stripResourcesBlock(activeTab.content)}
                      onChange={(e)=>updateActiveContent(e.target.value)}
                      readOnly={activeTab?.isDefault || isGeneralName(activeTab?.name)}
                      rows={(activeTab?.isDefault || isGeneralName(activeTab?.name)) ? 20 : 8}
                      className="w-full p-4 bg-slate-900 border border-blue-500 rounded-md shadow-inner text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={ (activeTab?.isDefault || isGeneralName(activeTab?.name)) ? 'Contenido generado automáticamente desde las otras pestañas' : 'Inserta información aquí...' }
                    ></textarea>
                    {(activeTab?.isDefault || isGeneralName(activeTab?.name)) ? (
                      <div className="mt-2 text-xs text-slate-400">Este contenido se edita desde las demás pestañas (＋).</div>
                    ) : null}
                  </div>
                </div>

                {/* Gestor de recursos (oculto en Información General y pestaña por defecto) */}
                {!(activeTab?.isDefault || isGeneralName(activeTab?.name)) ? (
                  <div className="resource-manager" data-tab-id={activeTab.id}>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Archivos y Recursos</label>
                    <div className="bg-slate-900 border border-slate-700 rounded-md p-4">
                      <div className="flex space-x-3 mb-4">
                        <>
                          <label className="relative cursor-pointer bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-md inline-flex items-center">
                            <span>+ Añadir Archivo</span>
                            <input
                              type="file"
                              className="hidden file-input"
                              multiple
                              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.json,.xml,.zip,.7z,.htm,.html"
                              onChange={handleFiles}
                            />
                          </label>
                          <button onClick={addLocation} className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 px-4 rounded-md inline-flex items-center">+ Añadir Ubicación</button>
                        </>
                      </div>
                      {/* Galería */}
                      <div className="resource-gallery grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 min-h-[100px]">
                        {(activeTab.files||[]).map((f, i) => {
                          const isImg = String(f.mime||'').startsWith('image/')
                          const href = f.url || '#'
                          const nameFull = f.original || f.filename || f.name || 'archivo'
                          const name = String(nameFull).replace(/\.[a-z0-9]+$/i, '')
                          // Key estable por archivo y sección para evitar reutilización entre pestañas
                          const stableKey = `${activeTab.id}-${href || nameFull}-${i}`
                          return (
                          <div key={stableKey} className="relative group">
                            {isImg ? (
                              <button type="button" onClick={()=>openPreview(f)} className="block overflow-hidden rounded-xl shadow bg-slate-800 h-44 w-full text-left">
                                {/* Imagen (altura uniforme) */}
                                <img src={href} alt={name} className="w-full h-full object-cover" />
                              </button>
                            ) : (
                              <button type="button" onClick={()=>openPreview(f)} className="block bg-slate-800 rounded-xl p-4 shadow hover:bg-slate-700 text-center relative h-44 w-full">
                                <div className="flex flex-col items-center justify-center h-full">
                                  <div className="flex items-center justify-center h-14 w-14 rounded-lg bg-slate-700">
                                    <span className="text-3xl leading-none text-rose-400">📄</span>
                                  </div>
                                  <div className="mt-3 text-sm font-semibold text-slate-200 truncate w-full" title={nameFull}>{name}</div>
                                  <div className="text-[11px] text-slate-400">{formatBytes(f.size)}</div>
                                </div>
                                <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-white/10"></div>
                              </button>
                            )}
                            {/* Botón eliminar (no disponible en Información General) */}
                            {(activeTab?.isDefault || isGeneralName(activeTab?.name)) ? null : (
                              <button
                                type="button"
                                title="Quitar"
                                onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); removeFileAt(i) }}
                                className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-slate-900/90 text-slate-200 shadow hidden group-hover:flex items-center justify-center hover:bg-red-600"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        )
                      })}
                      {(activeTab.locations||[]).map((loc, i) => {
                        const info = typeof loc === 'string' ? parseLocationString(loc) : loc
                        const mapUrl = (info.lat != null && info.lng != null) ? staticMapUrl(info.lat, info.lng) : ''
                        const title = info.label || 'Ubicación guardada'
                        const addr = info.address || ''
                        const link = info.link || (info.lat!=null && info.lng!=null ? `https://www.google.com/maps?q=${info.lat},${info.lng}` : '')
                        const imgSrc = mapUrl || '/map-placeholder.svg'
                        return (
                          <div key={`l-${activeTab.id}-${i}`} className="bg-slate-800 rounded-xl overflow-hidden shadow border border-slate-700">
                            <a href={link||'#'} target="_blank" rel="noreferrer" className="block">
                              <img src={imgSrc} alt={title} className="w-full h-32 object-cover" />
                            </a>
                            <div className="p-3 text-slate-200 text-sm">
                              <div className="font-semibold truncate" title={title}>📍 {title}</div>
                              {addr ? (<div className="text-slate-400 text-xs truncate" title={addr}>{addr}</div>) : null}
                              <div className="mt-2 flex items-center gap-2">
                                <button type="button" onClick={()=>sendLocationWhatsApp(loc)} className="px-3 py-1 rounded-md bg-emerald-600 text-white text-xs hover:bg-emerald-700">Enviar WhatsApp</button>
                                {link ? (
                                  <a href={link} target="_blank" rel="noreferrer" className="px-3 py-1 rounded-md bg-blue-600 text-white text-xs hover:bg-blue-700">Abrir en Maps</a>
                                ) : null}
                                {(activeTab?.isDefault || isGeneralName(activeTab?.name)) ? null : (
                                  <button type="button" onClick={()=>removeLocationAt(i)} className="px-3 py-1 rounded-md border border-slate-600 text-slate-200 text-xs hover:bg-slate-800">Quitar</button>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
                ) : null}

                {/* Botones Guardar/Descartar + Voz del Agente */}
                <div className="flex items-center justify-between mt-6 gap-3 flex-wrap">
                  <div className="flex items-center space-x-3">
                    <button onClick={handleSave} disabled={saveStatus==='saving'} className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-md shadow hover:bg-blue-700 transition-colors">{saveStatus==='saving' ? 'Guardando...' : 'GUARDAR'}</button>
                    <button onClick={handleDiscard} disabled={saveStatus==='saving'} className="px-6 py-2 bg-slate-600 text-slate-200 font-semibold rounded-md shadow hover:bg-slate-700 transition-colors">DESCARTAR</button>
                  </div>
                  <div className="flex items-center space-x-2">
                    <label className="text-sm font-medium text-slate-300">Voz del Agente:</label>
                    <select value={voiceOption} onChange={(e)=>setVoiceOption(e.target.value)} className="text-sm rounded-md border border-slate-600 bg-slate-900 text-slate-200 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {VOICE_PRESETS.map(v => (
                        <option key={v.id} value={v.id}>{v.label}</option>
                      ))}
                    </select>
                    <button onClick={previewVoice} disabled={voiceLoading} className={`p-2 rounded-full ${voiceLoading ? 'bg-slate-700 cursor-not-allowed text-slate-400' : 'bg-slate-700 hover:bg-slate-600 text-slate-200'}`} title="Probar voz">{voiceLoading ? '⏳' : '🔊'}</button>
                  </div>
                </div>

                {errorText ? (
                  <div className="mt-4 text-sm text-red-300">{errorText}</div>
                ) : null}
              </div>
            ) : (
              <div className="text-slate-400">No hay pestañas activas.</div>
            )}
          </div>
        </div>

        {/* Modal: Añadir ubicación */}
        {locationModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={()=>setLocationModalOpen(false)}></div>
            <div className="relative bg-slate-800 border border-slate-700 rounded-xl shadow-xl w-full max-w-lg p-5">
              <div className="text-lg font-semibold text-slate-100 mb-3">Añadir Ubicación</div>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Nombre (Ej: Sede Principal)</label>
                  <input value={locForm.label} onChange={(e)=>setLocForm(f=>({...f,label:e.target.value}))} className="w-full px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Sede Principal" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Dirección</label>
                  <input value={locForm.address} onChange={(e)=>setLocForm(f=>({...f,address:e.target.value}))} className="w-full px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Av. Siempre Viva 123" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">URL (Google Maps, Waze, etc.)</label>
                  <input value={locForm.link} onChange={(e)=>setLocForm(f=>({...f,link:e.target.value}))} className="w-full px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="https://maps.app.goo.gl/..." />
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={()=>setLocationModalOpen(false)} className="px-4 py-2 rounded-md border border-slate-600 text-slate-200 text-sm hover:bg-slate-800">Cancelar</button>
                <button type="button" onClick={confirmAddLocation} className="px-4 py-2 rounded-md bg-green-600 text-white text-sm hover:bg-green-700">Guardar Ubicación</button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Panel de prueba del agente */}
        <div id="agent-tester" className="bg-white rounded-lg shadow-lg p-6 md:p-8 mt-8">
          <h3 className="text-xl font-semibold text-gray-800 mb-2">Probar Agente</h3>
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs md:text-sm text-gray-500">
              {waActiveSender ? `Último remitente WhatsApp: ${waActiveSender}` : 'Esperando mensaje de WhatsApp…'}
            </div>
            <label className="inline-flex items-center space-x-2 text-sm">
              <input type="checkbox" checked={autoRespond} onChange={(e)=>setAutoRespond(e.target.checked)} />
              <span>Escuchar WhatsApp y auto-responder</span>
            </label>
          </div>
          {/* Diagnóstico corto removido para simplificar el tester */}
          {/* Bloque de contexto detallado removido para simplificar la UI del tester */}
          {/* Bloque de memoria eliminado: nos centramos únicamente en el agente */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Pregunta del cliente</label>
              <div className="relative">
                <textarea value={testerQ} onChange={(e)=>setTesterQ(e.target.value)} rows={6} className="w-full p-4 pr-16 border border-gray-300 rounded-md shadow-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Escribe o dicta tu pregunta..."></textarea>
                <button type="button" onClick={toggleRecording} className={`absolute top-3 right-3 p-2 rounded-full ${isRecording ? 'bg-red-100 text-red-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`} title={isRecording ? 'Detener grabación' : 'Grabar audio'}>
                  {isRecording ? '⏹' : '🎤'}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Respuesta del agente</label>
              <div className="w-full p-4 bg-gray-50 border border-gray-300 rounded-md shadow-sm text-gray-700 whitespace-pre-wrap min-h-[144px]">
                {parseAnswerNodes(testerA)}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end mt-4">
            <div className="flex items-center space-x-3">
              <button onClick={()=>{ setTesterQ(''); setTesterA(''); setTesterHistory([]); setLastOfferedResource(null) }} className="px-5 py-2 bg-gray-600 text-white font-semibold rounded-md shadow hover:bg-gray-700 transition-colors">Limpiar</button>
              <button onClick={askAgent} disabled={testerLoading} className="px-5 py-2 bg-blue-600 text-white font-semibold rounded-md shadow hover:bg-blue-700 transition-colors">{testerLoading ? 'Consultando...' : 'Probar respuesta'}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}