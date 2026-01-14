import React, { useMemo, useState, useEffect, useCallback } from 'react'
import { 
  Stack, Typography, Paper, Grid, Box, TextField, FormControl, InputLabel, Select, MenuItem,
  RadioGroup, FormControlLabel, Radio,
  Switch, Divider, Button, Chip, Dialog, DialogTitle, DialogContent, DialogActions,
  List, ListItemButton, ListItem, ListItemText,
  LinearProgress, Tabs, Tab
} from '@mui/material'

export default function Transmission() {
  // Configuraciones básicas
  const [name, setName] = useState('')
  const [platform, setPlatform] = useState('whatsapp') // 'whatsapp'
  const [flow, setFlow] = useState('')
  const [moduleType, setModuleType] = useState('') // '' | 'campaigns' | 'bulk'
  const [delayMode, setDelayMode] = useState('smart') // 'smart' | 'manual'
  const [smartDelayLevel, setSmartDelayLevel] = useState('very_short') // very_short | short | medium | long | very_long
  const [manualDelaySeconds, setManualDelaySeconds] = useState('1')
  const [waStatus, setWaStatus] = useState('idle')
  const [sending, setSending] = useState(false)
  const SMART_LABELS = {
    very_short: 'Muy corto 1–5s',
    short: 'Corto 5–20s',
    medium: 'Medio 20–50s',
    long: 'Largo 50–120s',
    very_long: 'Muy largo 120–300s',
  }

  // Segmentación y filtros
  const [filters, setFilters] = useState([]) // {field, op, value}
  const [audienceCount, setAudienceCount] = useState(0)
  const [audienceUsers, setAudienceUsers] = useState([])
  const [showUsersOpen, setShowUsersOpen] = useState(false)

  // Selector de etiquetas para filtros
  const [labelPickerOpen, setLabelPickerOpen] = useState(false)
  const [labels, setLabels] = useState([])
  const [labelSearch, setLabelSearch] = useState('')

  const openLabelPicker = async () => {
    setLabelPickerOpen(true)
    try {
      const url = labelSearch ? `/api/labels?q=${encodeURIComponent(labelSearch)}` : '/api/labels'
      const res = await fetch(url)
      const data = await res.json()
      const items = Array.isArray(data.items) ? data.items : []
      setLabels(items.map(i => i.name))
    } catch {
      setLabels([])
    }
  }

  // Actualizar etiquetas al teclear búsqueda dentro del selector
  useEffect(() => {
    if (!labelPickerOpen) return
    const ctrl = new AbortController()
    const run = async () => {
      try {
        const url = labelSearch ? `/api/labels?q=${encodeURIComponent(labelSearch)}` : '/api/labels'
        const res = await fetch(url, { signal: ctrl.signal })
        const data = await res.json()
        const items = Array.isArray(data.items) ? data.items : []
        setLabels(items.map(i => i.name))
      } catch (e) {
        // no-op
      }
    }
    run()
    return () => ctrl.abort()
  }, [labelPickerOpen, labelSearch])
  const closeLabelPicker = () => setLabelPickerOpen(false)

  // Modal de configuración
  const [configOpen, setConfigOpen] = useState(false)
  const openConfig = () => setConfigOpen(true)
  const closeConfig = () => setConfigOpen(false)

  // Programación: enviar ahora o programar más tarde + repetición
  const [sendMode, setSendMode] = useState('now') // 'now' | 'later'
  const [recurrence, setRecurrence] = useState('none') // 'none' | 'daily' | 'weekly' | 'monthly'
  const [weeklyDays, setWeeklyDays] = useState([]) // ['mon','tue','wed','thu','fri','sat','sun']
  const [monthlyDay, setMonthlyDay] = useState('1') // 1..31
  const [monthlyMonths, setMonthlyMonths] = useState([1,2,3,4,5,6,7,8,9,10,11,12]) // 1..12

  // Contenedor de transmisiones guardadas
  const [transmissions, setTransmissions] = useState([])
  useEffect(() => {
    try {
      const raw = localStorage.getItem('crm.transmissions')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) setTransmissions(parsed)
      }
    } catch {}
  }, [])
  const persistTransmissions = useCallback((items) => {
    setTransmissions(items)
    try { localStorage.setItem('crm.transmissions', JSON.stringify(items)) } catch {}
  }, [])

  // Pestañas UI: 0 = Guardadas, 1 = Servidor
  const [tabIndex, setTabIndex] = useState(0)

  // Estado y funciones para transmisiones del servidor
  const [serverTx, setServerTx] = useState([])
  const refreshServerTransmissions = useCallback(async () => {
    try {
      const res = await fetch('/api/transmissions')
      const data = await res.json()
      if (data?.ok && Array.isArray(data.items)) {
        setServerTx(data.items)
      }
    } catch {}
  }, [])
  useEffect(() => { refreshServerTransmissions() }, [refreshServerTransmissions])
  useEffect(() => {
    const t = setInterval(() => { refreshServerTransmissions() }, 5000)
    return () => { try { clearInterval(t) } catch {} }
  }, [refreshServerTransmissions])

  // Al completar en servidor, mover a guardadas y eliminar del servidor
  useEffect(() => {
    const completed = (serverTx || []).filter(x => String(x.status).toLowerCase() === 'completed')
    if (!completed.length) return
    const already = new Set((transmissions || []).map(x => x.sourceServerId).filter(Boolean))
    const toAdd = []
    for (const t of completed) {
      if (already.has(t.id)) continue
      const flowLabel = (flowOptions.find(o => String(o.value) === String(t.flowId))?.label) || 'Flujo'
      const record = {
        id: Date.now() + Math.random(),
        name: t.name || 'Transmisión',
        platform: t.platform,
        flowId: t.flowId,
        flowLabel,
        delayMode: t.delayMode,
        smartDelayLevel: t.smartDelayLevel || null,
        manualDelaySeconds: t.manualDelaySeconds != null ? Number(t.manualDelaySeconds) : null,
        delayLabel: t.delayMode === 'smart' ? SMART_LABELS[t.smartDelayLevel] : `${Number(t.manualDelaySeconds || 0)}s`,
        filters: t.filters || [],
        scheduleAt: new Date().toISOString(),
        scheduleMode: 'now',
        recurrence: null,
        count: t.total ?? null,
        sent: t.sent ?? null,
        status: 'enviado',
        createdAt: new Date().toISOString(),
        sourceServerId: t.id,
      }
      toAdd.push(record)
    }
    if (toAdd.length) {
      persistTransmissions([...toAdd, ...transmissions])
      // eliminar del servidor en segundo plano
      for (const r of toAdd) {
        const s = completed.find(c => c.id === r.sourceServerId)
        if (s) { try { deleteTx(s.id) } catch {} }
      }
    }
  }, [serverTx])

  const pauseTx = async (id) => { try { await fetch(`/api/transmissions/${encodeURIComponent(id)}/pause`, { method: 'POST' }); await refreshServerTransmissions() } catch {} }
  const resumeTx = async (id) => { try { await fetch(`/api/transmissions/${encodeURIComponent(id)}/resume`, { method: 'POST' }); await refreshServerTransmissions() } catch {} }
  const stopTx = async (id) => { try { await fetch(`/api/transmissions/${encodeURIComponent(id)}/stop`, { method: 'POST' }); await refreshServerTransmissions() } catch {} }
  const deleteTx = async (id) => { try { await fetch(`/api/transmissions/${encodeURIComponent(id)}`, { method: 'DELETE' }); await refreshServerTransmissions() } catch {} }

  // Programación
  const todayStr = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`
  }, [])
  const timeStr = useMemo(() => {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  }, [])
  const [scheduleDate, setScheduleDate] = useState(todayStr)
  const [scheduleTime, setScheduleTime] = useState(timeStr)

  // Flujos disponibles (dependen del módulo seleccionado)
  const [flowOptionsAll, setFlowOptionsAll] = useState([]) // [{value,label}]
  const [flowOptions, setFlowOptions] = useState([{ value: '', label: 'Seleccionar' }])
  const fetchFlowsByModule = useCallback(async (mod) => {
    try {
      let url = ''
      if (mod === 'campaigns') url = '/api/campaigns/flows'
      else if (mod === 'bulk') url = '/api/bulk/flows'
      else { setFlowOptionsAll([]); return }
      const res = await fetch(url)
      const data = await res.json()
      if (Array.isArray(data.items)) {
        setFlowOptionsAll(data.items.map(f => ({ value: f.id, label: f.name || String(f.id) })))
      } else {
        setFlowOptionsAll([])
      }
    } catch {
      setFlowOptionsAll([])
    }
  }, [])
  useEffect(() => { 
    // cuando cambia el módulo, limpiar selección y cargar flujos
    setFlow('')
    if (moduleType) fetchFlowsByModule(moduleType)
    else setFlowOptionsAll([])
  }, [moduleType, fetchFlowsByModule])
  useEffect(() => {
    setFlowOptions([{ value: '', label: 'Seleccionar' }, ...flowOptionsAll])
  }, [flowOptionsAll])

  // Construir params de audiencia desde filtros simples
  const buildAudienceParams = useCallback(() => {
    const params = new URLSearchParams()
    let labelName = null
    let q = ''
    for (const f of filters) {
      const field = String(f.field || '').toLowerCase()
      const val = String(f.value || '').trim()
      if (field.includes('etiqueta') && val) {
        labelName = val
      }
      if (field.includes('buscar') && val) q = val
    }
    if (labelName) params.set('label', labelName)
    if (q) params.set('q', q)
    return params
  }, [filters])

  // Derivar contador de audiencia llamando al backend
  const recomputeAudience = useCallback(async () => {
    try {
      // Si no hay etiqueta seleccionada, no mostrar nada
      const hasLabel = filters.some(f => String(f.field||'').toLowerCase().includes('etiqueta') && String(f.value||'').trim())
      if (!hasLabel) { setAudienceCount(0); setAudienceUsers([]); return }
      const params = buildAudienceParams()
      const url = `/api/contacts${params.toString() ? `?${params.toString()}` : ''}`
      const res = await fetch(url)
      const data = await res.json()
      const users = Array.isArray(data.contacts) ? data.contacts : []
      setAudienceCount(users.length || 0)
      setAudienceUsers(users)
    } catch (e) {
      setAudienceCount(0)
      setAudienceUsers([])
    }
  }, [buildAudienceParams])

  // Recalcular audiencia cada vez que cambien los filtros
  useEffect(() => { recomputeAudience() }, [filters, recomputeAudience])

  const addFilter = () => {
    // Abrir selector de etiquetas (similar a la segunda imagen)
    openLabelPicker()
  }

  const clearFilters = () => {
    setFilters([])
    setAudienceCount(0)
    setAudienceUsers([])
  }

  const openShowUsers = () => {
    setShowUsersOpen(true)
    if (!audienceUsers.length) recomputeAudience()
  }
  const closeShowUsers = () => setShowUsersOpen(false)

  const editSavedTransmission = (t) => {
    try {
      setName(t.name || '')
      setPlatform(t.platform || 'whatsapp')
      setModuleType(t.moduleType || 'bulk')
      setFlow(String(t.flowId || ''))
      setDelayMode(t.delayMode || 'smart')
      if (t.delayMode === 'smart') setSmartDelayLevel(t.smartDelayLevel || 'medium')
      if (t.delayMode === 'manual') setManualDelaySeconds(String(t.manualDelaySeconds || '2'))
      setFilters(Array.isArray(t.filters) ? t.filters : [])
      setSendMode(t.scheduleMode || 'now')
      setRecurrence('none')
      setScheduleDate('')
      setScheduleTime('')
      setConfigOpen(true)
    } catch {}
  }

  // Eliminación de transmisión guardada con confirmación
  const [deleteSavedOpen, setDeleteSavedOpen] = useState(false)
  const [deleteSavedTarget, setDeleteSavedTarget] = useState(null)
  const openDeleteSaved = (t) => { setDeleteSavedTarget(t); setDeleteSavedOpen(true) }
  const closeDeleteSaved = () => { setDeleteSavedOpen(false); setDeleteSavedTarget(null) }
  const confirmDeleteSaved = () => {
    try {
      const id = deleteSavedTarget?.id
      if (!id) { closeDeleteSaved(); return }
      const next = (transmissions || []).filter(x => x.id !== id)
      persistTransmissions(next)
      closeDeleteSaved()
    } catch { closeDeleteSaved() }
  }

  // Cargar estado de plataformas al abrir modal o cambiar plataforma
  useEffect(() => {
    const loadStatuses = async () => {
      try { const r = await fetch('/api/wa/status'); const j = await r.json(); setWaStatus(String(j.status || 'idle')) } catch {}
      try { const r = await fetch('/api/tg/status'); const j = await r.json(); setTgStatus(String(j.status || 'idle')) } catch {}
    }
    loadStatuses()
  }, [platform, configOpen])

  const isPlatformConnected = useMemo(() => {
    if (platform === 'whatsapp') return waStatus === 'connected'
    return false
  }, [platform, waStatus])

  const startProgramming = async () => {
    if (sending) return
    setSending(true)
    // Validar conexión de plataforma antes de iniciar
    try {
      if (platform === 'whatsapp') {
        const r = await fetch('/api/wa/status')
        const j = await r.json()
        if (String(j.status || '').toLowerCase() !== 'connected') {
          throw new Error('WhatsApp no está conectado. Ve a Configuración → Conexión y pulsa Conectar.')
        }
      }
    } catch (e) {
      alert(e?.message || 'No se pudo validar la conexión de la plataforma')
      setSending(false)
      return
    }
    const payload = {
      name,
      platform,
      moduleType,
      flowId: flow,
      delayMode,
      smartDelayLevel: delayMode === 'smart' ? smartDelayLevel : null,
      manualDelaySeconds: delayMode === 'manual' ? Number(manualDelaySeconds) : null,
      filters,
      scheduleMode: sendMode,
      scheduleAt: sendMode === 'later' ? `${scheduleDate} ${scheduleTime}` : null,
      recurrence: recurrence === 'none' ? null : {
        type: recurrence,
        daysOfWeek: recurrence === 'weekly' ? weeklyDays : null,
        dayOfMonth: recurrence === 'monthly' ? Number(monthlyDay) : null,
        monthsOfYear: recurrence === 'monthly' ? monthlyMonths : null,
        time: scheduleTime,
        startDate: scheduleDate,
      },
    }
    try {
      const res = await fetch('/api/transmissions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Error al iniciar transmisión')
      const msg = data.sent != null
        ? `Transmisión enviada: ${data.sent}/${data.count}`
        : `Transmisión programada para ${new Date(data.scheduledAt || Date.now()).toLocaleString()}`
      // Guardar en contenedor local
      const record = {
        id: Date.now(),
        name,
        platform,
        flowId: flow,
        flowLabel: (flowOptions.find(o => String(o.value) === String(flow))?.label) || 'Flujo',
        delayMode,
        smartDelayLevel: delayMode === 'smart' ? smartDelayLevel : null,
        manualDelaySeconds: delayMode === 'manual' ? Number(manualDelaySeconds) : null,
        delayLabel: delayMode === 'smart' ? SMART_LABELS[smartDelayLevel] : `${Number(manualDelaySeconds)}s`,
        filters,
        scheduleAt: data.scheduledAt || (sendMode === 'later' ? `${scheduleDate} ${scheduleTime}` : new Date().toISOString()),
        scheduleMode: sendMode,
        recurrence,
        count: data.count ?? null,
        sent: data.sent ?? null,
        status: data.sent != null ? 'enviado' : 'programado',
        createdAt: new Date().toISOString(),
      }
      persistTransmissions([record, ...transmissions])
      closeConfig()
      await refreshServerTransmissions()
      alert(msg)
    } catch (e) {
      alert(e.message || 'No se pudo iniciar la transmisión')
    } finally {
      // asegurar cierre del modal incluso si hubo error
      try { closeConfig() } catch {}
      setSending(false)
    }
  }

  return (
    <Stack spacing={3}>
      <Typography variant="h5">Transmisión</Typography>
      {/* Botón para abrir configuración */}
      <Box>
        <Button variant="contained" color="primary" onClick={openConfig}>Configurar Transmisión</Button>
      </Box>
      {/* Tabs para Guardadas y Servidor */}
      <Paper sx={{ p: 2 }}>
        <Tabs value={tabIndex} onChange={(e, v) => setTabIndex(v)} sx={{ mb: 2 }}>
          <Tab label="Transmisiones guardadas" />
          <Tab label="Transmisiones en servidor" />
        </Tabs>
        {tabIndex === 0 ? (
          <>
            {transmissions.length === 0 ? (
              <Typography variant="body2" color="text.secondary">Aún no has configurado ninguna transmisión.</Typography>
            ) : (
              <Stack spacing={1.5}>
                {transmissions.map(t => (
                  <Box key={t.id} sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 2, p: 1.5, borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                    <Box>
                      <Typography sx={{ fontWeight: 700 }}>{t.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{t.platform} · {t.flowLabel}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="body2">{t.status === 'enviado' ? `Enviado ${t.sent}/${t.count}` : `Programado para ${new Date(t.scheduleAt).toLocaleString()}`}</Typography>
                      <Typography variant="caption" color="text.secondary">Retraso: {t.delayMode === 'smart' ? `inteligente · ${t.delayLabel}` : `manual · ${t.delayLabel}`}</Typography>
                      <Box sx={{ mt: 0.5, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {(t.filters || []).map((f, idx) => (
                          <Chip key={idx} size="small" label={`${f.field} ${f.op} ${f.value}`} />
                        ))}
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
                      <Button size="small" variant="outlined" onClick={() => editSavedTransmission(t)}>Editar y reutilizar</Button>
                      <Button size="small" color="error" onClick={() => openDeleteSaved(t)}>Eliminar</Button>
                    </Box>
                  </Box>
                ))}
              </Stack>
            )}
          </>
        ) : (
          <>
            {serverTx.length === 0 ? (
              <Typography variant="body2" color="text.secondary">Sin transmisiones activas.</Typography>
            ) : (
              <Stack spacing={1.5}>
                {serverTx.map(t => (
                  <Box key={t.id} sx={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr auto', gap: 2, p: 1.5, borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                    {/* Columna izquierda: título y etiquetas */}
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography sx={{ fontWeight: 700 }}>{t.name || 'Transmisión'}</Typography>
                        {/* Chip de estado */}
                        {(() => {
                          const map = { running: 'success', paused: 'warning', scheduled: 'info', recurring: 'info', stopped: 'default', completed: 'default' }
                          const color = map[String(t.status || '').toLowerCase()] || 'default'
                          return <Chip size="small" color={color} label={String(t.status || '').toLowerCase()} />
                        })()}
                      </Box>
                      <Typography variant="caption" color="text.secondary">{t.platform} · {t.moduleType || ''} · {String(t.flowId || '')}</Typography>
                      <Box sx={{ mt: 0.5, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {(t.filters || []).map((f, idx) => (
                          <Chip key={idx} size="small" variant="outlined" label={`${f.field} ${f.op} ${f.value}`} />
                        ))}
                        <Chip size="small" variant="outlined" label={t.delayMode === 'smart' ? `retraso inteligente · ${String(t.smartDelayLevel || '')}` : t.delayMode === 'manual' ? `retraso manual · ${Number(t.manualDelaySeconds || 0)}s` : 'retraso N/D'} />
                      </Box>
                    </Box>

                    {/* Columna centro: progreso y métricas */}
                    <Box>
                      {(() => {
                        const total = Number(t.total || 0)
                        const sent = Math.min(Number(t.sent || 0), total)
                        const progress = total > 0 ? Math.round((sent / total) * 100) : 0
                        return (
                          <Stack spacing={0.75}>
                            <Typography variant="body2">Enviados {sent}/{total} · Fallos {Number(t.failed || 0)}</Typography>
                            <LinearProgress variant="determinate" value={progress} sx={{ height: 8, borderRadius: 1 }} />
                            {/* Razones de fallo resumidas */}
                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                              {Object.entries(t.failReasons || {}).map(([k, v]) => (
                                <Chip key={k} size="small" color="error" variant="outlined" label={`${k}: ${v}`} />
                              ))}
                            </Box>
                          </Stack>
                        )
                      })()}
                    </Box>

                    {/* Columna derecha: acciones */}
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
                      {t.status === 'paused' ? (
                        <Button size="small" variant="outlined" onClick={()=>resumeTx(t.id)}>Reanudar</Button>
                      ) : t.status === 'running' ? (
                        <Button size="small" variant="outlined" onClick={()=>pauseTx(t.id)}>Pausar</Button>
                      ) : null}
                      {t.status !== 'stopped' && t.status !== 'completed' ? (
                        <Button size="small" color="error" variant="outlined" onClick={()=>stopTx(t.id)}>Detener</Button>
                      ) : null}
                      <Button size="small" color="error" onClick={()=>deleteTx(t.id)}>Eliminar</Button>
                    </Box>
                  </Box>
                ))}
              </Stack>
            )}
          </>
        )}
      </Paper>

      {/* Confirmación eliminar transmisión guardada */}
      <Dialog open={deleteSavedOpen} onClose={closeDeleteSaved}>
        <DialogTitle>Eliminar transmisión guardada</DialogTitle>
        <DialogContent>
          <Typography>¿Seguro que deseas eliminar "{deleteSavedTarget?.name || 'Transmisión'}"? Esta acción no se puede deshacer.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDeleteSaved}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={confirmDeleteSaved}>Eliminar</Button>
        </DialogActions>
      </Dialog>

      {/* Modal de configuración de transmisión (contenido anterior) */}
      <Dialog open={configOpen} onClose={closeConfig} maxWidth="md" fullWidth>
        <DialogTitle>Configurar Transmisión</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            {/* Configuraciones de transmisión */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle1" sx={{ mb: 2 }}>Configuraciones de transmisión</Typography>

                <Stack spacing={2}>
                  <TextField label="Nombre" placeholder="Nombre" value={name} onChange={(e)=>setName(e.target.value)} fullWidth />

                <FormControl fullWidth>
                  <InputLabel id="platform-label">Plataforma</InputLabel>
                  <Select labelId="platform-label" label="Plataforma" value={platform} onChange={(e)=>setPlatform(e.target.value)}>
                    <MenuItem value="whatsapp">WhatsApp</MenuItem>
                  </Select>
                </FormControl>

                <FormControl fullWidth>
                  <InputLabel id="module-label">Masivo</InputLabel>
                  <Select labelId="module-label" label="Masivo" value={moduleType} onChange={(e)=>setModuleType(e.target.value)}>
                    <MenuItem value="campaigns">Campañas Publicitarias</MenuItem>
                    <MenuItem value="bulk">Mensajes Masivos</MenuItem>
                  </Select>
                </FormControl>

                {/* Eliminado el buscador de flujo: el Select soporta navegación por teclado */}

                <FormControl fullWidth>
                  <InputLabel id="flow-label">Flujo</InputLabel>
                  <Select labelId="flow-label" label="Flujo" value={flow} onChange={(e)=>setFlow(e.target.value)}>
                    {flowOptions.map(opt => (<MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>))}
                  </Select>
                </FormControl>

                  <Box>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Retraso</Typography>
                    <RadioGroup row value={delayMode} onChange={(e)=>setDelayMode(e.target.value)}>
                      <FormControlLabel value="smart" control={<Radio />} label="Retraso inteligente" />
                      <FormControlLabel value="manual" control={<Radio />} label="Retraso manual" />
                    </RadioGroup>
                    {delayMode === 'smart' ? (
                      <Box sx={{ mt: 1 }}>
                        <RadioGroup value={smartDelayLevel} onChange={(e)=>setSmartDelayLevel(e.target.value)}>
                          <FormControlLabel value="very_short" control={<Radio />} label={SMART_LABELS.very_short} />
                          <FormControlLabel value="short" control={<Radio />} label={SMART_LABELS.short} />
                          <FormControlLabel value="medium" control={<Radio />} label={SMART_LABELS.medium} />
                          <FormControlLabel value="long" control={<Radio />} label={SMART_LABELS.long} />
                          <FormControlLabel value="very_long" control={<Radio />} label={SMART_LABELS.very_long} />
                        </RadioGroup>
                      </Box>
                    ) : (
                      <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <TextField type="number" value={manualDelaySeconds} onChange={(e)=>setManualDelaySeconds(e.target.value)} inputProps={{ min: 1 }} fullWidth />
                        <Typography>Segundos</Typography>
                      </Box>
                    )}
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                      Configura el retraso de tiempo con el que funcionará tu transmisión. Cuanto mayor sea el retraso, menos probable es que se confunda con spam.
                    </Typography>
                  </Box>
                </Stack>
              </Paper>
            </Grid>

            {/* Segmentación y cálculos en dos columnas */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2, height: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="subtitle1">Segmentación</Typography>
                  <Button variant="text" onClick={openShowUsers}>Contactos a enviar</Button>
                </Box>
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    Usuarios que recibirán esta transmisión: <strong>{audienceCount}</strong>
                  </Typography>

                <Divider sx={{ my: 2 }} />
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                  {filters.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">Agregar filtros para refinar su audiencia</Typography>
                  ) : filters.map((f, idx) => (
                    <Chip key={idx} label={`${f.field} ${f.op} ${f.value}`} onDelete={() => {
                      const next = filters.slice();
                      next.splice(idx, 1);
                      setFilters(next);
                    }} />
                  ))}
                </Box>
                <Stack direction="row" spacing={1}>
                  <Button variant="outlined" onClick={addFilter}>Agregar filtro</Button>
                  <Button variant="text" color="error" onClick={clearFilters} disabled={filters.length===0}>Limpiar filtros</Button>
                </Stack>

                {/* Se elimina listado inline. Ahora se usa el modal "Contactos a enviar" */}
              </Paper>
            </Grid>
            <Grid item xs={12} md={6}>
              {/* Cálculos de transmisión al lado derecho */}
              <Paper sx={{ p: 2, height: '100%' }}>
                <Typography variant="subtitle1">Cálculos de transmisión</Typography>
                <Box sx={{ mt: 1 }}>
                  {(() => {
                    const avgSmartSeconds = {
                      very_short: 3,
                      short: 12.5,
                      medium: 35,
                      long: 85,
                      very_long: 210,
                    }
                    const avgDelay = delayMode === 'smart' ? (avgSmartSeconds[smartDelayLevel] || 12) : Number(manualDelaySeconds) || 1
                    const totalSeconds = Math.ceil((audienceCount || 0) * avgDelay)
                    const minutes = Math.floor(totalSeconds / 60)
                    const seconds = totalSeconds % 60
                    const perMinute = avgDelay > 0 ? Math.max(1, Math.floor(60 / avgDelay)) : 60
                    return (
                      <Stack spacing={1}>
                        <Typography variant="body2">Retraso promedio: <strong>{avgDelay}s</strong> ({delayMode === 'smart' ? SMART_LABELS[smartDelayLevel] : 'Manual'})</Typography>
                        <Typography variant="body2">Ritmo estimado: <strong>{perMinute} mensajes/min</strong></Typography>
                        <Typography variant="body2">Duración estimada: <strong>{minutes}m {seconds}s</strong> para {audienceCount} usuarios</Typography>
                        <Typography variant="caption" color="text.secondary">Estimación aproximada. Podrían aplicarse descansos automáticos y límites.</Typography>
                      </Stack>
                    )
                  })()}
                </Box>
              </Paper>
            </Grid>
          </Grid>

          {/* Programación */}
          <Paper sx={{ p: 2, mt: 2 }}>
            <Stack spacing={2}>
              <Box>
                <Typography variant="subtitle1">Configuración de envío</Typography>
                <RadioGroup row value={sendMode} onChange={(e)=>setSendMode(e.target.value)}>
                  <FormControlLabel value="now" control={<Radio />} label="Enviar ahora" />
                  <FormControlLabel value="later" control={<Radio />} label="Establecer hora y ejecutar más tarde" />
                </RadioGroup>
              </Box>

              {sendMode === 'later' && (
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                  <TextField type="date" label="Fecha" value={scheduleDate} onChange={(e)=>setScheduleDate(e.target.value)} />
                  <TextField type="time" label="Hora" value={scheduleTime} onChange={(e)=>setScheduleTime(e.target.value)} />
                </Box>
              )}

              {sendMode === 'later' && (
                <Box>
                  <Typography variant="subtitle2">Repetición</Typography>
                  <RadioGroup row value={recurrence} onChange={(e)=>setRecurrence(e.target.value)}>
                    <FormControlLabel value="none" control={<Radio />} label="Una sola vez" />
                    <FormControlLabel value="daily" control={<Radio />} label="Diario" />
                    <FormControlLabel value="weekly" control={<Radio />} label="Semanal" />
                    <FormControlLabel value="monthly" control={<Radio />} label="Mensual" />
                  </RadioGroup>

                  {recurrence === 'weekly' && (
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                      {[
                        {k:'mon', l:'L'}, {k:'tue', l:'M'}, {k:'wed', l:'X'}, {k:'thu', l:'J'}, {k:'fri', l:'V'}, {k:'sat', l:'S'}, {k:'sun', l:'D'}
                      ].map(d => {
                        const active = weeklyDays.includes(d.k)
                        return (
                          <Chip key={d.k} label={d.l} color={active ? 'primary' : 'default'} variant={active ? 'filled' : 'outlined'} onClick={() => {
                            setWeeklyDays(prev => {
                              const set = new Set(prev)
                              if (set.has(d.k)) set.delete(d.k); else set.add(d.k)
                              return Array.from(set)
                            })
                          }} />
                        )
                      })}
                    </Box>
                  )}

                  {recurrence === 'monthly' && (
                    <Box sx={{ mt: 1, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                      <FormControl sx={{ minWidth: 120 }}>
                        <InputLabel id="monthly-day-label">Día del mes</InputLabel>
                        <Select labelId="monthly-day-label" label="Día del mes" value={monthlyDay} onChange={(e)=>setMonthlyDay(e.target.value)}>
                          {Array.from({length:31}, (_,i)=>String(i+1)).map(d => (
                            <MenuItem key={d} value={d}>{d}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>

                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        <Typography variant="body2" sx={{ alignSelf: 'center' }}>Meses</Typography>
                        {[
                          {k:1,l:'Ene'},{k:2,l:'Feb'},{k:3,l:'Mar'},{k:4,l:'Abr'},{k:5,l:'May'},{k:6,l:'Jun'},
                          {k:7,l:'Jul'},{k:8,l:'Ago'},{k:9,l:'Sep'},{k:10,l:'Oct'},{k:11,l:'Nov'},{k:12,l:'Dic'}
                        ].map(m => {
                          const active = monthlyMonths.includes(m.k)
                          return (
                            <Chip key={m.k} label={m.l} color={active ? 'primary' : 'default'} variant={active ? 'filled' : 'outlined'} onClick={() => {
                              setMonthlyMonths(prev => {
                                const set = new Set(prev)
                                if (set.has(m.k)) set.delete(m.k); else set.add(m.k)
                                return Array.from(set).sort((a,b)=>a-b)
                              })
                            }} />
                          )
                        })}
                      </Box>
                    </Box>
                  )}
                </Box>
              )}

              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Stack direction="row" spacing={2} alignItems="center">
                  {audienceCount === 0 && (
                    <Typography variant="body2" color="error">No hay usuarios para esta transmisión.</Typography>
                  )}
                  <Button
                  variant="contained"
                  color="primary"
                  onClick={startProgramming}
                  disabled={
                    !name || !flow ||
                    (delayMode==='manual' && (!manualDelaySeconds || Number(manualDelaySeconds) <= 0)) ||
                    (sendMode==='later' && (!scheduleDate || !scheduleTime)) ||
                    (sendMode==='later' && recurrence==='weekly' && weeklyDays.length===0) ||
                    (sendMode==='later' && recurrence==='monthly' && monthlyMonths.length===0) ||
                    (audienceCount === 0) || !isPlatformConnected || sending
                  }
                >{sendMode==='now' ? 'Enviar ahora' : 'Iniciar programación'}</Button>
                </Stack>
              </Box>
            </Stack>
          </Paper>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeConfig}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Contactos a enviar */}
      <Dialog open={showUsersOpen} onClose={closeShowUsers} maxWidth="sm" fullWidth>
        <DialogTitle>Contactos a enviar</DialogTitle>
        <DialogContent dividers>
          {audienceUsers.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No hay contactos seleccionados. Agrega una etiqueta para ver la lista.</Typography>
          ) : (
            <List dense>
              {(audienceUsers || []).slice(0, 100).map((u, i) => (
                <ListItem key={u.jid || i} disableGutters>
                  <ListItemText primary={(u.name || u.phone || u.jid || '').toString()} secondary={u.jid ? String(u.jid) : undefined} />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeShowUsers}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog selector de etiquetas para filtros */}
      <Dialog open={labelPickerOpen} onClose={closeLabelPicker} maxWidth="sm" fullWidth>
        <DialogTitle>Paso</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography variant="subtitle2">Etiqueta</Typography>
            <TextField placeholder="Buscar o ingresar valor" value={labelSearch} onChange={(e)=>setLabelSearch(e.target.value)} fullWidth />
            <Box sx={{ maxHeight: 300, overflowY: 'auto', borderRadius: 1, border: theme => `1px solid ${theme.palette.divider}` }}>
              <List dense>
                {(labels || []).filter(l => !labelSearch || String(l).toLowerCase().includes(labelSearch.toLowerCase())).map((l, idx) => (
                  <ListItemButton key={idx} onClick={() => {
                    const f = { field: 'Etiqueta', op: 'Es', value: l }
                    setFilters(prev => [...prev, f])
                    closeLabelPicker()
                    setTimeout(() => { recomputeAudience() }, 0)
                  }}>
                    <Typography variant="body2">{l}</Typography>
                  </ListItemButton>
                ))}
              </List>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            const value = labelSearch.trim()
            if (value) {
              const f = { field: 'Etiqueta', op: 'Es', value }
              setFilters(prev => [...prev, f])
              closeLabelPicker()
              setTimeout(() => { recomputeAudience() }, 0)
            } else {
              closeLabelPicker()
            }
          }}>Aceptar</Button>
          <Button onClick={closeLabelPicker}>Cancelar</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}