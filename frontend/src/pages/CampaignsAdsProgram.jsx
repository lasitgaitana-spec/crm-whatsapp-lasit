import React, { useEffect, useRef, useState } from 'react'
  import { Stack, Typography, Paper, Box, Button, TextField, Menu, MenuItem, Chip, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, InputAdornment, FormControl, InputLabel, Select, List, ListItemButton, ListItemText, Checkbox, CircularProgress, Alert, Tooltip } from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import EditIcon from '@mui/icons-material/Edit'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import TextFieldsIcon from '@mui/icons-material/TextFields'
import ImageIcon from '@mui/icons-material/Image'
import VideocamIcon from '@mui/icons-material/Videocam'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import AudiotrackIcon from '@mui/icons-material/Audiotrack'
import SaveIcon from '@mui/icons-material/Save'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew'
import ContactPageIcon from '@mui/icons-material/ContactPage'
import { useNavigate, useSearchParams } from 'react-router-dom'

export default function CampaignsAdsProgram() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const flowIdParam = params.get('id') || ''
  const [flowName, setFlowName] = useState(params.get('name') || '')
  const [folderName, setFolderName] = useState(params.get('folder') || '')
  const [folders, setFolders] = useState([])
  const [error, setError] = useState('')
  const [steps, setSteps] = useState([])
  const [editingStepId, setEditingStepId] = useState(null)
  const [contentText, setContentText] = useState('')
  const [activeTool, setActiveTool] = useState('Texto')
  const [saveStatus, setSaveStatus] = useState('idle') // idle | saving | saved | error
  const saveTimerRef = useRef(null)
  const [activeForm, setActiveForm] = useState(null) // 'imagen' | 'video' | 'archivo' | 'audio' | 'retraso' | 'autooff' | 'contacto' | 'texto'
  const textInputRef = useRef(null)
  const [fieldsOptions, setFieldsOptions] = useState([])
  const [fieldsAnchorEl, setFieldsAnchorEl] = useState(null)
  const [imageUrl, setImageUrl] = useState('')
  const [imageUploads, setImageUploads] = useState([]) // [{url, filename, mime, size}]
  const [imageUploading, setImageUploading] = useState(false)
  const [imageError, setImageError] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [videoUploads, setVideoUploads] = useState([]) // [{url, filename, mime, size}]
  const [videoUploading, setVideoUploading] = useState(false)
  const [videoError, setVideoError] = useState('')
  const [fileUrl, setFileUrl] = useState('')
  const [fileUploads, setFileUploads] = useState([]) // [{url, filename, mime, size}]
  const [fileUploading, setFileUploading] = useState(false)
  const [fileError, setFileError] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const [audioUploads, setAudioUploads] = useState([]) // [{url, filename, mime, size}]
  const [audioUploading, setAudioUploading] = useState(false)
  const [audioError, setAudioError] = useState('')
  const [delaySeconds, setDelaySeconds] = useState('')
  const [autoOffSeconds, setAutoOffSeconds] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactOrg, setContactOrg] = useState('')
  const [contactDial, setContactDial] = useState('+57')
  const [dialMenuEl, setDialMenuEl] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewKind, setPreviewKind] = useState('media') // 'media' | 'contact'
  const [previewContact, setPreviewContact] = useState(null) // { name, phone }
  const [deleteStepDialogOpen, setDeleteStepDialogOpen] = useState(false)
  const [deleteStepTarget, setDeleteStepTarget] = useState(null)
  // Modal de prueba
  const [testOpen, setTestOpen] = useState(false)
  const [testPlatform, setTestPlatform] = useState('whatsapp')
  const [testQuery, setTestQuery] = useState('')
  const [testLoading, setTestLoading] = useState(false)
  const [testItems, setTestItems] = useState([])
  const [testItemsAll, setTestItemsAll] = useState([])
  const [testSelected, setTestSelected] = useState([])
  const [testError, setTestError] = useState('')
  const [testSending, setTestSending] = useState(false)
  // Telegram functionality removed

  const openPreview = (url) => { setPreviewKind('media'); setPreviewUrl(url); setPreviewOpen(true) }
  const openContactPreview = (name, phone) => { setPreviewKind('contact'); setPreviewContact({ name, phone }); setPreviewOpen(true) }
  const closePreview = () => { setPreviewOpen(false); setPreviewUrl(''); setPreviewContact(null); setPreviewKind('media') }

  const reloadFolders = async () => {
    try {
      const res = await fetch('/api/campaigns/flow-folders')
      const data = await res.json()
      if (data.ok) setFolders(Array.isArray(data.items) ? data.items : [])
    } catch {}
  }
  const loadFlowById = async (id) => {
    try {
      const res = await fetch(`/api/campaigns/flows/${id}`)
      const data = await res.json()
      if (data.ok && data.item) {
        setFlowName(data.item.name || '')
        setFolderName(data.item.folder_name || '')
        let stepsLoaded = []
        if (data.item.connections) {
          try {
            const parsed = JSON.parse(data.item.connections)
            if (parsed && Array.isArray(parsed.steps)) stepsLoaded = parsed.steps
          } catch {}
        }
        setSteps(stepsLoaded)
      }
    } catch {}
  }
  useEffect(() => {
    reloadFolders()
    const idNum = Number(flowIdParam)
    if (idNum > 0) loadFlowById(idNum)
  }, [])

  // Autoguardado: persiste steps en connections cuando cambian
  useEffect(() => {
    const idNum = Number(flowIdParam)
    if (!idNum || idNum <= 0) return
    setSaveStatus('saving')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        const connections = JSON.stringify({ steps })
        const res = await fetch(`/api/campaigns/flows/${idNum}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connections }) })
        const data = await res.json()
        if (!data.ok) throw new Error(data.error || 'Error al guardar programación')
        setSaveStatus('saved')
      } catch (e) {
        setSaveStatus('error')
        setError(e?.message || 'Error al guardar programación')
      }
    }, 600)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [steps])

  const addTextStep = () => {
    const text = String(contentText || '').trim()
    if (!text) return
    if (editingStepId) {
      setSteps(prev => prev.map(s => s.id === editingStepId ? { ...s, payload: { text } } : s))
      setEditingStepId(null); setActiveForm(null); setContentText('')
    } else {
      setSteps(prev => [...prev, { id: Date.now(), type: 'texto', payload: { text } }])
      setContentText('')
    }
  }
  const addPlaceholderStep = (type) => {
    setSteps(prev => [...prev, { id: Date.now(), type, payload: {} }])
  }
  const manualSaveNow = async () => {
    try {
      setSaveStatus('saving')
      const idNum = Number(flowIdParam)
      if (!idNum || idNum <= 0) throw new Error('ID de flujo inválido')
      const connections = JSON.stringify({ steps })
      const res = await fetch(`/api/campaigns/flows/${idNum}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connections })
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Error al guardar programación')
      setSaveStatus('saved')
      setTimeout(()=>setSaveStatus('idle'), 1500)
    } catch (e) {
      setSaveStatus('error')
      setError(e?.message || 'Error al guardar programación')
    }
  }
  const addImageStep = () => {
    // Si hay subidas previas, crear un paso por cada imagen
    if (editingStepId) {
      // En edición: reemplazar la imagen del paso con la primera subida
      // y si hay más imágenes, agregarlas como nuevos pasos.
      const urls = imageUploads.map(f => f.url)
      const nextUrl = urls[0] || String(imageUrl || '').trim()
      if (!nextUrl) return
      setSteps(prev => {
        const updated = prev.map(s => s.id === editingStepId ? { ...s, payload: { url: nextUrl } } : s)
        if (urls.length > 1) {
          const now = Date.now()
          const extra = urls.slice(1).map((u, idx) => ({ id: now + idx, type: 'imagen', payload: { url: u } }))
          return [...updated, ...extra]
        }
        return updated
      })
      setEditingStepId(null); setActiveForm(null)
      setImageUploads([]); setImageError(''); setImageUrl('')
      return
    }
    if (imageUploads.length > 0) {
      const now = Date.now()
      const newSteps = imageUploads.map((f, idx) => ({ id: now + idx, type: 'imagen', payload: { url: f.url } }))
      setSteps(prev => [...prev, ...newSteps])
      setImageUploads([]); setImageError(''); setActiveForm(null)
      return
    }
    // Fallback: usar URL escrita manualmente
    const url = String(imageUrl || '').trim()
    if (!url) return
    setSteps(prev => [...prev, { id: Date.now(), type: 'imagen', payload: { url } }])
    setImageUrl(''); setActiveForm(null)
  }
  const onSelectImages = async (ev) => {
    try {
      setImageError('')
      const files = Array.from(ev.target.files || [])
      if (files.length === 0) return
      // Validación rápida en cliente
      const allowed = ['image/jpeg','image/png','image/webp']
      for (const f of files) {
        if (!allowed.includes(f.type)) { setImageError('Tipo de archivo no permitido'); return }
        if (f.size > 2 * 1024 * 1024) { setImageError('Archivo demasiado grande (máx 2MB)'); return }
      }
      const fd = new FormData()
      files.forEach(f => fd.append('files', f))
      // Enviar el identificador del flujo para guardar en su carpeta
      const idNum = Number(flowIdParam)
      if (idNum && idNum > 0) fd.append('flowId', String(idNum))
      setImageUploading(true)
      const res = await fetch('/api/upload/images', { method: 'POST', body: fd })
      const data = await res.json()
      if (!data?.ok) { setImageError(data?.error || 'No se pudo subir imágenes'); setImageUploading(false); return }
      setImageUploads(Array.isArray(data.files) ? data.files : [])
    } catch (e) {
      setImageError(e?.message || 'Error al subir imágenes')
    } finally {
      setImageUploading(false)
    }
  }
  const addVideoStep = () => {
    // 1) Si estamos editando y hay subidas, actualizar con la primera y anexar el resto
    if (editingStepId && videoUploads.length > 0) {
      setSteps(prev => {
        const first = videoUploads[0]
        const updated = prev.map(s => s.id === editingStepId ? { ...s, type: 'video', payload: { url: first.url } } : s)
        if (videoUploads.length > 1) {
          const extra = videoUploads.slice(1).map((f, idx) => ({ id: Date.now() + idx + 1, type: 'video', payload: { url: f.url } }))
          return [...updated, ...extra]
        }
        return updated
      })
      setEditingStepId(null); setActiveForm(null)
      setVideoUploads([]); setVideoError(''); setVideoUrl('')
      return
    }
    // 2) Si hay videos subidos, añadirlos como pasos
    if (videoUploads.length > 0) {
      const now = Date.now()
      const newSteps = videoUploads.map((f, idx) => ({ id: now + idx, type: 'video', payload: { url: f.url } }))
      setSteps(prev => [...prev, ...newSteps])
      setVideoUploads([]); setVideoError(''); setActiveForm(null)
      return
    }
    // 3) Fallback URL manual
    const url = String(videoUrl || '').trim()
    if (!url) return
    if (editingStepId) {
      setSteps(prev => prev.map(s => s.id === editingStepId ? { ...s, type: 'video', payload: { url } } : s))
      setEditingStepId(null); setActiveForm(null)
    } else {
      setSteps(prev => [...prev, { id: Date.now(), type: 'video', payload: { url } }])
      setActiveForm(null)
    }
    setVideoUrl('')
  }

  const onSelectVideos = async (ev) => {
    try {
      setVideoError('')
      const files = Array.from(ev.target.files || [])
      if (files.length === 0) return
      const allowed = ['video/mp4']
      for (const f of files) {
        if (!allowed.includes(f.type)) { setVideoError('Tipo de archivo no permitido (solo .mp4)'); return }
        if (f.size > 15 * 1024 * 1024) { setVideoError('Archivo demasiado grande (máx 15MB)'); return }
      }
      const fd = new FormData()
      files.forEach(f => fd.append('files', f))
      const idNum = Number(flowIdParam)
      if (idNum && idNum > 0) fd.append('flowId', String(idNum))
      setVideoUploading(true)
      const res = await fetch('/api/upload/videos', { method: 'POST', body: fd })
      const data = await res.json()
      if (!data?.ok) { setVideoError(data?.error || 'No se pudo subir videos'); setVideoUploading(false); return }
      setVideoUploads(Array.isArray(data.files) ? data.files : [])
    } catch (e) {
      setVideoError(e?.message || 'Error al subir videos')
    } finally {
      setVideoUploading(false)
    }
  }
  const onSelectFiles = async (ev) => {
    try {
      setFileError('')
      const files = Array.from(ev.target.files || [])
      if (files.length === 0) return
      // Validación rápida en cliente por extensión y tamaño
      const allowed = new Set(['pdf','doc','docx','htm','html','json','xml','txt','csv','zip','7z','xls','xlsx','ppt','pptx'])
      for (const f of files) {
        const name = String(f.name || '')
        const ext = (name.split('.').pop() || '').toLowerCase()
        if (!allowed.has(ext)) { setFileError('Tipo de archivo no permitido'); return }
        if (f.size > 15 * 1024 * 1024) { setFileError('Archivo demasiado grande (máx 15MB)'); return }
      }
      const fd = new FormData()
      files.forEach(f => fd.append('files', f))
      const idNum = Number(flowIdParam)
      if (idNum && idNum > 0) fd.append('flowId', String(idNum))
      setFileUploading(true)
      const res = await fetch('/api/upload/files', { method: 'POST', body: fd })
      const data = await res.json()
      if (!data?.ok) { setFileError(data?.error || 'No se pudo subir archivos'); setFileUploading(false); return }
      setFileUploads(Array.isArray(data.files) ? data.files : [])
    } catch (e) {
      setFileError(e?.message || 'Error al subir archivos')
    } finally {
      setFileUploading(false)
    }
  }
  const onSelectAudios = async (ev) => {
    try {
      setAudioError('')
      const files = Array.from(ev.target.files || [])
      if (files.length === 0) return
      const allowed = ['audio/mpeg']
      for (const f of files) {
        if (!allowed.includes(f.type)) { setAudioError('Tipo de archivo no permitido (solo .mp3)'); return }
        if (f.size > 15 * 1024 * 1024) { setAudioError('Archivo demasiado grande (máx 15MB)'); return }
      }
      const fd = new FormData()
      files.forEach(f => fd.append('files', f))
      const idNum = Number(flowIdParam)
      if (idNum && idNum > 0) fd.append('flowId', String(idNum))
      setAudioUploading(true)
      const res = await fetch('/api/upload/audios', { method: 'POST', body: fd })
      const data = await res.json()
      if (!data?.ok) { setAudioError(data?.error || 'No se pudo subir audios'); setAudioUploading(false); return }
      setAudioUploads(Array.isArray(data.files) ? data.files : [])
    } catch (e) {
      setAudioError(e?.message || 'Error al subir audios')
    } finally {
      setAudioUploading(false)
    }
  }
  const addFileStep = () => {
    // 1) En edición y con subidas: reemplazar con la primera y anexar el resto
    if (editingStepId && fileUploads.length > 0) {
      setSteps(prev => {
        const first = fileUploads[0]
        const updated = prev.map(s => s.id === editingStepId ? { ...s, type: 'archivo', payload: { url: first.url } } : s)
        if (fileUploads.length > 1) {
          const extra = fileUploads.slice(1).map((f, idx) => ({ id: Date.now() + idx + 1, type: 'archivo', payload: { url: f.url } }))
          return [...updated, ...extra]
        }
        return updated
      })
      setEditingStepId(null); setActiveForm(null)
      setFileUploads([]); setFileError(''); setFileUrl('')
      return
    }
    // 2) Si hay archivos subidos, añadirlos como pasos
    if (fileUploads.length > 0) {
      const now = Date.now()
      const newSteps = fileUploads.map((f, idx) => ({ id: now + idx, type: 'archivo', payload: { url: f.url } }))
      setSteps(prev => [...prev, ...newSteps])
      setFileUploads([]); setFileError(''); setActiveForm(null)
      return
    }
    // 3) Fallback URL manual
    const url = String(fileUrl || '').trim()
    if (!url) return
    if (editingStepId) {
      setSteps(prev => prev.map(s => s.id === editingStepId ? { ...s, type: 'archivo', payload: { url } } : s))
      setEditingStepId(null); setActiveForm(null)
    } else {
      setSteps(prev => [...prev, { id: Date.now(), type: 'archivo', payload: { url } }])
      setActiveForm(null)
    }
    setFileUrl('')
  }
  const addAudioStep = () => {
    // 1) En edición y con subidas: reemplazar con la primera y anexar el resto
    if (editingStepId && audioUploads.length > 0) {
      setSteps(prev => {
        const first = audioUploads[0]
        const updated = prev.map(s => s.id === editingStepId ? { ...s, type: 'audio', payload: { url: first.url } } : s)
        if (audioUploads.length > 1) {
          const extra = audioUploads.slice(1).map((f, idx) => ({ id: Date.now() + idx + 1, type: 'audio', payload: { url: f.url } }))
          return [...updated, ...extra]
        }
        return updated
      })
      setEditingStepId(null); setActiveForm(null)
      setAudioUploads([]); setAudioError(''); setAudioUrl('')
      return
    }
    // 2) Si hay audios subidos, añadirlos como pasos
    if (audioUploads.length > 0) {
      const now = Date.now()
      const newSteps = audioUploads.map((f, idx) => ({ id: now + idx, type: 'audio', payload: { url: f.url } }))
      setSteps(prev => [...prev, ...newSteps])
      setAudioUploads([]); setAudioError(''); setActiveForm(null)
      return
    }
    // 3) Fallback URL manual
    const url = String(audioUrl || '').trim()
    if (!url) return
    if (editingStepId) {
      setSteps(prev => prev.map(s => s.id === editingStepId ? { ...s, type: 'audio', payload: { url } } : s))
      setEditingStepId(null); setActiveForm(null)
    } else {
      setSteps(prev => [...prev, { id: Date.now(), type: 'audio', payload: { url } }])
      setActiveForm(null)
    }
    setAudioUrl('')
  }
  const addDelayStep = () => {
    const seconds = Number(delaySeconds)
    if (!seconds || seconds <= 0) return
    setSteps(prev => [...prev, { id: Date.now(), type: 'retraso', payload: { seconds } }])
    setDelaySeconds(''); setActiveForm(null)
  }
  const addAutoOffStep = () => {
    const seconds = Number(autoOffSeconds)
    if (!seconds || seconds <= 0) return
    setSteps(prev => [...prev, { id: Date.now(), type: 'autooff', payload: { afterSeconds: seconds } }])
    setAutoOffSeconds(''); setActiveForm(null)
  }
  const addContactStep = () => {
    const name = String(contactName || '').trim()
    const phone = String(contactPhone || '').trim()
    const org = String(contactOrg || '').trim()
    if (!name && !phone) return
    // Normalizar: CC + últimos 10 dígitos
    const dialDigits = String(contactDial || '').replace(/\D/g, '')
    const phoneDigits = phone.replace(/\D/g, '')
    const local10 = phoneDigits.slice(-10)
    const fullPhone = `+${dialDigits}${local10}`
    const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\n${org ? `ORG:${org}\n` : ''}TEL;TYPE=CELL:${fullPhone}\nEND:VCARD`
    if (editingStepId) {
      setSteps(prev => prev.map(s => s.id === editingStepId ? { ...s, payload: { name, phone: fullPhone, org, vcard } } : s))
      setEditingStepId(null); setActiveForm(null)
    } else {
      setSteps(prev => [...prev, { id: Date.now(), type: 'contacto', payload: { name, phone: fullPhone, org, vcard } }])
      setActiveForm(null)
    }
    setContactName(''); setContactPhone(''); setContactOrg('')
  }

  // Probar helpers
  const openTestModal = () => { setTestOpen(true); setTestSelected([]); setTestQuery(''); setTestError(''); loadTestItems('whatsapp', '') }
  const closeTestModal = () => { setTestOpen(false); setTestSelected([]); setTestQuery(''); setTestError('') }
  // Telegram functions removed
  const loadTestItems = async (platform = testPlatform, q = testQuery) => {
    try {
      setTestLoading(true)
      let items = []
      // Only WhatsApp is supported now
      const res = await fetch(`/api/contacts?q=${encodeURIComponent(q || '')}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Error al cargar contactos')
      items = (data.contacts || []).map(c => ({ key: String(c.jid || c.phone || '').trim(), label: c.name || c.phone || c.jid, subLabel: c.phone || c.jid }))
      setTestItemsAll(items)
      const query = String(q || '').trim().toLowerCase()
      setTestItems(query ? items.filter(x => String(x.label || '').toLowerCase().includes(query) || String(x.subLabel || '').toLowerCase().includes(query)) : items)
    } catch (e) {
      setTestError(e?.message || 'Error cargando datos')
    } finally { setTestLoading(false) }
  }
  const handleTestPlatformChange = (val) => { setTestPlatform(val); setTestSelected([]); loadTestItems(val, testQuery) }
  const handleTestSearch = (val) => { 
    setTestQuery(val);
    const q = String(val || '').trim().toLowerCase()
    setTestItems(q ? testItemsAll.filter(x => String(x.label || '').toLowerCase().includes(q) || String(x.subLabel || '').toLowerCase().includes(q)) : testItemsAll)
  }
  const toggleSelectTestItem = (key) => { setTestSelected(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]) }
  const composeTestMessage = () => {
    const parts = steps.map(s => {
      if (s.type === 'texto') return s.payload?.text || ''
      if (s.type === 'imagen') return '[Imagen]'
      if (s.type === 'video') return '[Video]'
      if (s.type === 'archivo') return '[Archivo]'
      if (s.type === 'audio') return '[Audio]'
      if (s.type === 'contacto') return `[Contacto: ${(s.payload?.name || '').trim()} ${(s.payload?.phone || '').trim()}]`
      return ''
    }).filter(Boolean)
    const base = parts.join('\n\n')
    return base || `Prueba del flujo: ${flowName || 'Flujo'}`
  }
  const sendTest = async () => {
    if (testSelected.length === 0) { setTestError('Selecciona al menos un contacto'); return }
    try {
      setTestSending(true); setTestError('')
      // Solo WhatsApp soportado
        // 2) WhatsApp: enviar cada paso según su tipo, adjuntando medios reales
        const sleep = (ms) => new Promise(r => setTimeout(r, ms))
        const sendText = async (jid, text) => {
          const res = await fetch('/api/wa/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jid, message: text }) })
          const data = await res.json(); if (!data?.ok) throw new Error(data?.error || 'Falló el envío de texto por WhatsApp')
        }
        const sendMedia = async (jid, url, type, caption) => {
          // Descargar el recurso y reenviarlo como archivo al backend
          const absoluteUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`
          const resp = await fetch(absoluteUrl)
          if (!resp.ok) throw new Error(`No se pudo descargar ${type}`)
          const blob = await resp.blob()
          const filename = (absoluteUrl.split('/').pop() || `file.${(blob.type.split('/')[1]||'bin')}`)
          const fd = new FormData()
          fd.append('jid', jid)
          fd.append('type', type)
          if (caption) fd.append('caption', caption)
          fd.append('file', blob, filename)
          const res = await fetch('/api/wa/send-media', { method: 'POST', body: fd })
          const data = await res.json(); if (!data?.ok) throw new Error(data?.error || `Falló el envío de ${type} por WhatsApp`)
        }
        const sendContact = async (jid, payload) => {
          const body = { jid, name: payload?.name || '', phone: payload?.phone || '', org: payload?.org || '', vcard: payload?.vcard || '' }
          const res = await fetch('/api/wa/send-contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
          const data = await res.json(); if (!data?.ok) throw new Error(data?.error || 'Falló el envío de contacto por WhatsApp')
        }
        // Helpers para sustitución de llaves con datos del contacto
        const stripAccents = (s) => s?.normalize ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : s
        const normKey = (s) => String(stripAccents(s || '')).toLowerCase().trim()
        const getContactByJid = async (jid) => {
          try {
            const phone = String(jid || '').split('@')[0]
            const res = await fetch(`/api/contacts?q=${encodeURIComponent(phone)}`)
            const data = await res.json()
            if (!data?.ok || !Array.isArray(data.contacts)) return null
            const found = data.contacts.find(c => String(c.jid || '').trim() === String(jid).trim())
            return found || null
          } catch { return null }
        }
        const getContactFields = async (jid) => {
          try {
            const res = await fetch(`/api/contacts/${encodeURIComponent(jid)}/fields`)
            const data = await res.json()
            if (!data?.ok || !Array.isArray(data.items)) return []
            return data.items
          } catch { return [] }
        }
        const renderWithContact = (text, contact, fields) => {
          if (!text) return ''
          const map = new Map()
          // Campos personalizados
          if (Array.isArray(fields)) {
            for (const f of fields) {
              const key = normKey(f?.name)
              if (key) map.set(key, f?.value != null ? String(f.value) : '')
            }
          }
          // Formato de fecha en español: "Lunes 27 de octubre de 2025"
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
              const weekday = wd[(new Date()).getDay()] || 'lunes'
              const day = (new Date()).getDate()
              const month = months[(new Date()).getMonth()] || 'enero'
              const year = (new Date()).getFullYear()
              const cap = (s) => (s && s[0]) ? (s[0].toUpperCase() + s.slice(1)) : s
              return `${cap(weekday)} ${day} de ${month} de ${year}`
            }
          }

          // Tokens especiales: nombre, teléfono, jid, fecha
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
            ['hoy', fechaHoy]
          ]
          for (const [k, v] of specialPairs) map.set(k, v || '')

          const getVal = (rawKey) => {
            const nk = normKey(rawKey)
            return map.has(nk) ? map.get(nk) : undefined
          }
          // Soportar llaves simples {} y dobles {{}}
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
        for (const key of testSelected) {
          // Resolver datos del contacto y campos una sola vez por destinatario
          const contact = await getContactByJid(key)
          const fields = await getContactFields(key)
          for (const s of steps) {
            if (s.type === 'texto') {
              const raw = s.payload?.text || ''
              const text = renderWithContact(raw, contact, fields)
              if (text) await sendText(key, text)
            } else if (s.type === 'imagen' && s.payload?.url) {
              await sendMedia(key, s.payload.url, 'image', '')
            } else if (s.type === 'video' && s.payload?.url) {
              await sendMedia(key, s.payload.url, 'video', '')
            } else if (s.type === 'archivo' && s.payload?.url) {
              await sendMedia(key, s.payload.url, 'document', '')
            } else if (s.type === 'audio' && s.payload?.url) {
              await sendMedia(key, s.payload.url, 'audio', '')
            } else if (s.type === 'contacto') {
              await sendContact(key, s.payload || {})
            } else if (s.type === 'retraso') {
              const seconds = Number(s.payload?.seconds || 0)
              if (seconds > 0) await sleep(seconds * 1000)
            }
            // Pequeña pausa entre pasos para evitar rate limit
            await sleep(500)
          }
        }
      setTestSending(false)
      closeTestModal()
    } catch (e) {
      setTestSending(false)
      setTestError(e?.message || 'Error al enviar prueba')
    }
  }

  // Cargar campos disponibles para el botón {}
  useEffect(() => {
    const loadFields = async () => {
      try {
        const res = await fetch('/api/fields')
        const data = await res.json()
        if (data?.ok && Array.isArray(data.items)) {
          setFieldsOptions(data.items.map(f => ({ id: f.id, name: f.name })))
        }
      } catch (e) {
        // silencioso: si falla, el menú quedará vacío
      }
    }
    loadFields()
  }, [])

  // Utilidades de formato de texto en el editor
  const wrapSelection = (before, after) => {
    const el = textInputRef.current
    const value = contentText
    if (!el) return
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? value.length
    const selected = value.slice(start, end)
    const newText = value.slice(0, start) + before + selected + after + value.slice(end)
    setContentText(newText)
    setTimeout(() => { try { el.focus(); el.setSelectionRange(start + before.length, end + before.length) } catch {} }, 0)
  }
  const insertAtCursor = (text) => {
    const el = textInputRef.current
    const value = contentText
    if (!el) return
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? value.length
    const newText = value.slice(0, start) + text + value.slice(end)
    setContentText(newText)
    const pos = start + text.length
    setTimeout(() => { try { el.focus(); el.setSelectionRange(pos, pos) } catch {} }, 0)
  }
  const applyBold = () => wrapSelection('*', '*')
  const applyItalic = () => wrapSelection('_', '_')
  const applyHeading = () => {
    const el = textInputRef.current
    const value = contentText
    if (!el) return
    const start = el.selectionStart ?? value.length
    // Inicio de línea actual
    const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
    const newText = value.slice(0, lineStart) + '# ' + value.slice(lineStart)
    setContentText(newText)
    setTimeout(() => { try { el.focus(); el.setSelectionRange(start + 2, start + 2) } catch {} }, 0)
  }
  const openFieldsMenu = (e) => setFieldsAnchorEl(e.currentTarget)
  const closeFieldsMenu = () => setFieldsAnchorEl(null)
  const insertFieldToken = (name) => { insertAtCursor(`{${name}}`); closeFieldsMenu() }
  const removeStep = (id) => {
    setSteps(prev => prev.filter(s => s.id !== id))
  }
  const startDeleteStep = (s) => { setDeleteStepTarget(s); setDeleteStepDialogOpen(true) }
  const closeDeleteStepDialog = () => { setDeleteStepDialogOpen(false); setDeleteStepTarget(null) }
  const confirmDeleteStep = () => { if (deleteStepTarget) removeStep(deleteStepTarget.id); closeDeleteStepDialog() }
  const editStep = (s) => {
    setEditingStepId(s.id)
    setActiveForm(s.type)
    if (s.type === 'texto') setContentText(s.payload?.text || '')
    if (s.type === 'imagen') { setImageUrl(s.payload?.url || ''); setImageUploads([]); setImageError('') }
    if (s.type === 'video') setVideoUrl(s.payload?.url || '')
    if (s.type === 'archivo') { setFileUrl(s.payload?.url || ''); setFileUploads([]); setFileError('') }
    if (s.type === 'audio') { setAudioUrl(s.payload?.url || ''); setAudioUploads([]); setAudioError('') }
    if (s.type === 'contacto') { setContactName(s.payload?.name || ''); setContactPhone(s.payload?.phone || '') }
  }
  const saveProgram = async () => {
    try {
      const idNum = Number(flowIdParam)
      if (!idNum || idNum <= 0) { setError('ID de flujo faltante'); return }
      const connections = JSON.stringify({ steps })
      const res = await fetch(`/api/campaigns/flows/${idNum}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connections }) })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Error al guardar programación')
    } catch (e) {
      setError(e?.message || 'Error al guardar programación')
    }
  }

  return (
    <>
    <Stack spacing={3}>
      {/* Encabezado pasos */}
      <Box sx={{ display: 'flex', gap: 2 }}>
        <Box sx={{ flex: 1, bgcolor: 'success.main', opacity: 0.6, color: 'success.contrastText', p: 1.5, borderRadius: 1.5, textAlign: 'center', fontWeight: 600 }}>
          Paso 1  Creación de flujos
        </Box>
        <Box sx={{ flex: 1, bgcolor: 'success.main', color: 'success.contrastText', p: 1.5, borderRadius: 1.5, textAlign: 'center', fontWeight: 600 }}>
          Paso 2  Programación de flujos
        </Box>
      </Box>

      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="h6">Programación de flujos</Typography>
          <Button variant="outlined" onClick={() => navigate('/campaigns/ads')}>Volver a Paso 1</Button>
        </Box>

        <Box sx={{ mt: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>{flowName || 'Flujo'}</Typography>
            {saveStatus === 'saved' && (
              <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                <Chip icon={<CheckCircleOutlineIcon />} color="success" label="Cambios Guardados" />
              </Box>
            )}
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 3 }}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Contenido</Typography>
              {activeForm === 'texto' && (
                <Box sx={{ border: '1px solid #e0e0e0', borderRadius: 1.5, p: 1.5, bgcolor: 'background.default' }}>
                  <TextField
                    fullWidth
                    multiline
                    minRows={4}
                    inputRef={textInputRef}
                    placeholder="Introducir texto"
                    value={contentText}
                    onChange={(e)=>setContentText(e.target.value)}
                  />
                  {/* Barra de formato: B, I, T, {} */}
                  <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                    <Button size="small" variant="outlined" onClick={applyBold}>B</Button>
                    <Button size="small" variant="outlined" onClick={applyItalic}><i>I</i></Button>
                    <Button size="small" variant="outlined" onClick={applyHeading}>T</Button>
                    <Button size="small" variant="outlined" onClick={openFieldsMenu}>{'{}'}</Button>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                    <Button variant="outlined" onClick={()=>setContentText('')}>Cancelar</Button>
                    <Button variant="contained" onClick={addTextStep}>Guardar</Button>
                  </Box>
                </Box>
              )}

              {activeForm === 'imagen' && (
                <Box sx={{ border: '1px solid #e0e0e0', borderRadius: 1.5, p: 1.5, bgcolor: 'background.default', mt: 1 }}>
                  <Typography variant="caption" color="text.secondary">Tamaño máximo permitido: 2MB, aceptado: jpg, jpeg, png, webp</Typography>
                  {editingStepId && imageUrl && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                      <Typography variant="caption" color="text.secondary">Imagen actual:</Typography>
                      <Box
                        component="img"
                        src={imageUrl}
                        alt="imagen actual"
                        onClick={()=>openPreview(imageUrl)}
                        sx={{ width: 64, height: 64, borderRadius: 1, objectFit: 'cover', cursor: 'pointer', border: '1px solid', borderColor: 'divider' }}
                      />
                    </Box>
                  )}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                    <input id="image-upload-input" type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ display: 'none' }} onChange={onSelectImages} />
                    <label htmlFor="image-upload-input">
                      <Button variant="outlined" component="span" disabled={imageUploading}>{editingStepId ? 'Reemplazar imagen' : 'Subir imagen'}</Button>
                    </label>
                    {imageUploading && <Typography variant="caption">Subiendo…</Typography>}
                  </Box>
                  {imageError && <Typography variant="caption" color="error" sx={{ mt: 1 }}>{imageError}</Typography>}
                  {imageUploads.length > 0 && (
                    <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1 }}>
                      {imageUploads.map((f,i)=> (<Chip key={i} label={f.filename} />))}
                    </Stack>
                  )}
                  <TextField fullWidth label="URL de imagen (opcional)" value={imageUrl} onChange={(e)=>setImageUrl(e.target.value)} sx={{ mt: 1 }} />
                  <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                    <Button variant="outlined" onClick={()=>{ setImageUrl(''); setImageUploads([]); setImageError(''); if (editingStepId) { setEditingStepId(null); setActiveForm(null) } }}>Cancelar</Button>
                    <Button variant="contained" onClick={addImageStep} disabled={imageUploading}>Guardar</Button>
                  </Box>
                </Box>
              )}

              {activeForm === 'archivo' && (
                <Box sx={{ border: '1px solid #e0e0e0', borderRadius: 1.5, p: 1.5, bgcolor: 'background.default', mt: 1 }}>
                  <Typography variant="caption" color="text.secondary">Tamaño máximo permitido: 15MB, aceptados: pdf, doc, docx, htm, html, json, xml, txt, csv, zip, 7z, xls, xlsx, ppt, pptx</Typography>
                  {editingStepId && fileUrl && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                      <Typography variant="caption" color="text.secondary">Archivo actual:</Typography>
                      <Chip label={(fileUrl.split('/').pop() || 'archivo')} onClick={()=>openPreview(fileUrl)} sx={{ cursor: 'pointer' }} />
                    </Box>
                  )}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                    <input id="file-upload-input" type="file" multiple style={{ display: 'none' }} accept=".pdf,.doc,.docx,.htm,.html,.json,.xml,.txt,.csv,.zip,.7z,.xls,.xlsx,.ppt,.pptx" onChange={onSelectFiles} />
                    <label htmlFor="file-upload-input">
                      <Button variant="outlined" component="span" disabled={fileUploading}>{editingStepId ? 'Reemplazar archivo' : 'Subir archivo'}</Button>
                    </label>
                    {fileUploading && <Typography variant="caption">Subiendo…</Typography>}
                  </Box>
                  {fileError && <Typography variant="caption" color="error" sx={{ mt: 1 }}>{fileError}</Typography>}
                  {fileUploads.length > 0 && (
                    <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1 }}>
                      {fileUploads.map((f,i)=> (<Chip key={i} label={f.filename} onClick={()=>openPreview(f.url)} />))}
                    </Stack>
                  )}
                  <TextField fullWidth label="URL de archivo (opcional)" value={fileUrl} onChange={(e)=>setFileUrl(e.target.value)} sx={{ mt: 1 }} />
                  <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                    <Button variant="outlined" onClick={()=>{ setFileUrl(''); setFileUploads([]); setFileError(''); setActiveForm(null) }}>Cancelar</Button>
                    <Button variant="contained" onClick={addFileStep} disabled={fileUploading}>Guardar</Button>
                  </Box>
                </Box>
              )}

              {activeForm === 'video' && (
                <Box sx={{ border: '1px solid #e0e0e0', borderRadius: 1.5, p: 1.5, bgcolor: 'background.default', mt: 1 }}>
                  <Typography variant="caption" color="text.secondary">Tamaño máximo permitido: 15MB, formato compatible WhatsApp/Telegram: mp4</Typography>
                  {editingStepId && videoUrl && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                      <Typography variant="caption" color="text.secondary">Video actual:</Typography>
                      <Box component="video" src={videoUrl} onClick={()=>openPreview(videoUrl)} sx={{ width: 160, height: 90, borderRadius: 1, border: '1px solid', borderColor: 'divider', cursor: 'pointer' }} />
                    </Box>
                  )}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                    <input id="video-upload-input" type="file" accept="video/mp4" style={{ display: 'none' }} onChange={onSelectVideos} />
                    <label htmlFor="video-upload-input">
                      <Button variant="outlined" component="span" disabled={videoUploading}>{editingStepId ? 'Reemplazar video' : 'Subir video'}</Button>
                    </label>
                    {videoUploading && <Typography variant="caption">Subiendo…</Typography>}
                  </Box>
                  {videoError && <Typography variant="caption" color="error" sx={{ mt: 1 }}>{videoError}</Typography>}
                  {videoUploads.length > 0 && (
                    <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1 }}>
                      {videoUploads.map((f,i)=> (<Chip key={i} label={f.filename} />))}
                    </Stack>
                  )}
                  <TextField fullWidth label="URL de video (opcional)" value={videoUrl} onChange={(e)=>setVideoUrl(e.target.value)} sx={{ mt: 1 }} />
                  <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                    <Button variant="outlined" onClick={()=>{ setVideoUrl(''); setVideoUploads([]); setVideoError(''); if (editingStepId) { setEditingStepId(null); setActiveForm(null) } }}>Cancelar</Button>
                    <Button variant="contained" onClick={addVideoStep} disabled={videoUploading}>Guardar</Button>
                  </Box>
                </Box>
              )}

              {activeForm === 'audio' && (
                <Box sx={{ border: '1px solid #e0e0e0', borderRadius: 1.5, p: 1.5, bgcolor: 'background.default', mt: 1 }}>
                  <Typography variant="caption" color="text.secondary">Tamaño máximo permitido: 15MB, formato compatible: mp3</Typography>
                  {editingStepId && audioUrl && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                      <Typography variant="caption" color="text.secondary">Audio actual:</Typography>
                      <Box component="audio" src={audioUrl} controls onClick={()=>openPreview(audioUrl)} sx={{ width: 220, borderRadius: 1, border: '1px solid', borderColor: 'divider', cursor: 'pointer' }} />
                    </Box>
                  )}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                    <input id="audio-upload-input" type="file" accept="audio/mpeg" multiple style={{ display: 'none' }} onChange={onSelectAudios} />
                    <label htmlFor="audio-upload-input">
                      <Button variant="outlined" component="span" disabled={audioUploading}>{editingStepId ? 'Reemplazar audio' : 'Subir audio'}</Button>
                    </label>
                    {audioUploading && <Typography variant="caption">Subiendo…</Typography>}
                  </Box>
                  {audioError && <Typography variant="caption" color="error" sx={{ mt: 1 }}>{audioError}</Typography>}
                  {audioUploads.length > 0 && (
                    <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1 }}>
                      {audioUploads.map((f,i)=> (<Chip key={i} label={f.filename} onClick={()=>openPreview(f.url)} />))}
                    </Stack>
                  )}
                  <TextField fullWidth label="URL de audio (opcional)" value={audioUrl} onChange={(e)=>setAudioUrl(e.target.value)} sx={{ mt: 1 }} />
                  <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                    <Button variant="outlined" onClick={()=>{ setAudioUrl(''); setAudioUploads([]); setAudioError(''); if (editingStepId) { setEditingStepId(null); setActiveForm(null) } }}>Cancelar</Button>
                    <Button variant="contained" onClick={addAudioStep} disabled={audioUploading}>Guardar</Button>
                  </Box>
                </Box>
              )}

              {activeForm === 'contacto' && (
                <Box sx={{ mt: 2, border: '1px solid #fee', bgcolor: '#fff5f5', borderRadius: 1.5, p: 1.5 }}>
                  <Paper variant="outlined" sx={{ p: 1.5, mb: 1 }}>
                    <Stack direction="row" spacing={1.25} alignItems="center">
                      <ContactPageIcon color="success" />
                      <Box>
                        <Typography sx={{ fontWeight: 600 }}>{contactName || 'Nombre del contacto'}</Typography>
                        <Typography color="text.secondary">{(contactDial || '') + (contactPhone || '') || 'Teléfono del contacto'}</Typography>
                        {contactOrg && (<Typography color="text.secondary">{contactOrg}</Typography>)}
                      </Box>
                    </Stack>
                  </Paper>
                  <Stack spacing={1.25}>
                    <TextField
                      fullWidth
                      label="Teléfono"
                      value={contactPhone}
                      onChange={(e)=>setContactPhone(e.target.value)}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Box onClick={(e)=>setDialMenuEl(e.currentTarget)} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.25, borderRadius: 1, cursor: 'pointer' }}>
                              <span role="img" aria-label="flag">{contactDial === '+57' ? '🇨🇴' : contactDial === '+1' ? '🇺🇸' : contactDial === '+52' ? '🇲🇽' : contactDial === '+51' ? '🇵🇪' : contactDial === '+56' ? '🇨🇱' : contactDial === '+54' ? '🇦🇷' : contactDial === '+34' ? '🇪🇸' : '🏳️'}</span>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>{contactDial}</Typography>
                            </Box>
                          </InputAdornment>
                        )
                      }}
                    />
                    <TextField fullWidth label="Nombre" value={contactName} onChange={(e)=>setContactName(e.target.value)} />
                    <TextField fullWidth label="Organización" value={contactOrg} onChange={(e)=>setContactOrg(e.target.value)} />
                  </Stack>
                  <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                    <Button variant="outlined" onClick={()=>{ setContactName(''); setContactPhone(''); setActiveForm(null) }}>Cancelar</Button>
                    <Button variant="contained" onClick={addContactStep}>Guardar</Button>
                  </Box>
                  <Menu anchorEl={dialMenuEl} open={Boolean(dialMenuEl)} onClose={()=>setDialMenuEl(null)}>
                    {[
                      { flag: '🇨🇴', dial: '+57', label: 'Colombia' },
                      { flag: '🇺🇸', dial: '+1', label: 'Estados Unidos' },
                      { flag: '🇲🇽', dial: '+52', label: 'México' },
                      { flag: '🇵🇪', dial: '+51', label: 'Perú' },
                      { flag: '🇨🇱', dial: '+56', label: 'Chile' },
                      { flag: '🇦🇷', dial: '+54', label: 'Argentina' },
                      { flag: '🇪🇸', dial: '+34', label: 'España' },
                    ].map(opt => (
                      <MenuItem key={opt.dial} onClick={()=>{ setContactDial(opt.dial); setDialMenuEl(null) }}>
                        <span style={{ marginRight: 8 }}>{opt.flag}</span>
                        {opt.label} ({opt.dial})
                      </MenuItem>
                    ))}
                  </Menu>
                </Box>
              )}

              <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 2 }}>Acciones</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5 }}>
                {[
                  { label: 'Texto', type: 'texto', Icon: TextFieldsIcon },
                  { label: 'Imagen', type: 'imagen', Icon: ImageIcon },
                  { label: 'Video', type: 'video', Icon: VideocamIcon },
                  { label: 'Archivo', type: 'archivo', Icon: AttachFileIcon },
                  { label: 'Audio', type: 'audio', Icon: AudiotrackIcon },
                  { label: 'Contacto', type: 'contacto', Icon: ContactPageIcon },
                  { label: 'Probar', type: 'probar', Icon: AccessTimeIcon },
                  { label: 'Guardar', type: 'guardar', Icon: SaveIcon },
                ].map(btn => (
                  <Paper
                    key={btn.type}
                    onClick={() => {
                      setActiveTool(btn.label)
                      if (btn.type === 'texto') { setActiveForm('texto') }
                      else if (btn.type === 'guardar') { manualSaveNow() }
                      else if (btn.type === 'probar') { openTestModal() }
                      else setActiveForm(btn.type)
                    }}
                    sx={{ gridColumn: btn.type === 'probar' ? 'span 2' : 'auto', p: 2, borderRadius: 2, cursor: 'pointer', border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, transition: 'all .15s ease-in-out', '&:hover': { borderColor: 'success.light', boxShadow: 1 } }}
                  >
                    <btn.Icon sx={{ color: 'success.main' }} />
                    <Typography sx={{ fontWeight: 600 }}>{btn.label}</Typography>
                  </Paper>
                ))}
              </Box>

              {/* Mini formularios por tipo (archivo, imagen, video, audio están arriba) */}
              {activeForm === 'retraso' && (
                <Box sx={{ mt: 2, border: '1px solid #fee', bgcolor: '#fff5f5', borderRadius: 1.5, p: 1.5 }}>
                  <TextField type="number" fullWidth label="Retraso (segundos)" value={delaySeconds} onChange={(e)=>setDelaySeconds(e.target.value)} />
                  <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                    <Button variant="outlined" onClick={()=>{ setDelaySeconds(''); setActiveForm(null) }}>Cancelar</Button>
                    <Button variant="contained" onClick={addDelayStep}>Guardar</Button>
                  </Box>
                </Box>
              )}
              {activeForm === 'autooff' && (
                <Box sx={{ mt: 2, border: '1px solid #fee', bgcolor: '#fff5f5', borderRadius: 1.5, p: 1.5 }}>
                  <TextField type="number" fullWidth label="Apagar flujo después (segundos)" value={autoOffSeconds} onChange={(e)=>setAutoOffSeconds(e.target.value)} />
                  <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                    <Button variant="outlined" onClick={()=>{ setAutoOffSeconds(''); setActiveForm(null) }}>Cancelar</Button>
                    <Button variant="contained" onClick={addAutoOffStep}>Guardar</Button>
                  </Box>
                </Box>
              )}

              {/* Menú de inserción de campos ({}) */}
              <Menu anchorEl={fieldsAnchorEl} open={Boolean(fieldsAnchorEl)} onClose={closeFieldsMenu}>
                {fieldsOptions.length === 0 ? (
                  <MenuItem disabled>Sin campos</MenuItem>
                ) : (
                  fieldsOptions.map(f => (
                    <MenuItem key={f.id} onClick={() => insertFieldToken(f.name)}>{f.name}</MenuItem>
                  ))
                )}
              </Menu>
            </Box>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Configuración de programación</Typography>
              <Typography color="text.secondary" sx={{ mb: 2 }}>Todos los cambios se pueden guardar en cualquier momento. Al confirmar los detalles, ajustaré cada bloque.</Typography>

              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography sx={{ fontWeight: 600, mb: 1 }}>Pasos del flujo</Typography>
                <Stack spacing={1}>
                  {steps.length === 0 && (
                    <Typography color="text.secondary">Aún no hay pasos. Agrega contenido desde la izquierda.</Typography>
                  )}
                  {steps.map((s, idx) => (
                    <Box key={s.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px dashed #e0e0e0', borderRadius: 1, p: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip size="small" label={`#${idx+1}`} />
                        <Typography sx={{ fontWeight: 600, textTransform: 'capitalize' }}>{s.type}</Typography>
                        {s.type === 'texto' && (
                          <Typography color="text.secondary" sx={{ ml: 1, maxWidth: 520, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{s.payload?.text}</Typography>
                        )}
                        {s.type === 'imagen' && s.payload?.url && (
                          <Box component="img" src={s.payload.url} alt="prev" onClick={()=>openPreview(s.payload.url)} sx={{ ml: 1, width: 48, height: 48, objectFit: 'cover', borderRadius: 1, border: '1px solid #eee', cursor: 'pointer' }} />
                        )}
                        {s.type === 'video' && s.payload?.url && (
                          <Box component="video" src={s.payload.url} onClick={()=>openPreview(s.payload.url)} sx={{ ml: 1, width: 120, height: 72, borderRadius: 1, border: '1px solid #eee', cursor: 'pointer' }} />
                        )}
                        {s.type === 'archivo' && s.payload?.url && (
                          <Chip size="small" label={(s.payload.url.split('/').pop() || 'archivo')} onClick={()=>openPreview(s.payload.url)} sx={{ ml: 1, cursor: 'pointer' }} />
                        )}
                        {s.type === 'audio' && s.payload?.url && (
                          <Chip size="small" label={(s.payload.url.split('/').pop() || 'audio.mp3')} onClick={()=>openPreview(s.payload.url)} sx={{ ml: 1, cursor: 'pointer' }} />
                        )}
                        {s.type === 'contacto' && (s.payload?.name || s.payload?.phone) && (
                          <Chip size="small" label={`${s.payload?.name || 'Contacto'}: ${s.payload?.phone || ''}${s.payload?.org ? ` · ${s.payload.org}` : ''}`} onClick={()=>openContactPreview(s.payload?.name || '', s.payload?.phone || '')} sx={{ ml: 1, cursor: 'pointer' }} />
                        )}
                      </Box>
                      <Box>
                        <IconButton aria-label="Editar" onClick={()=>editStep(s)} sx={{ mr: 0.5 }}>
                          <EditIcon />
                        </IconButton>
                        <IconButton aria-label="Eliminar" onClick={()=>startDeleteStep(s)}>
                          <DeleteOutlineIcon />
                        </IconButton>
                      </Box>
                    </Box>
                  ))}
                </Stack>
              {/* Eliminado chip duplicado inferior de "Cambios Guardados" */}
              </Paper>
            </Box>
          </Box>
        </Box>

      </Paper>
    </Stack>
  <Dialog open={previewOpen} onClose={closePreview} maxWidth="md" fullWidth>
      <DialogTitle>Vista previa</DialogTitle>
      <DialogContent>
        {previewKind === 'contact' && previewContact && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <ContactPageIcon color="success" />
              <Box>
                <Typography sx={{ fontWeight: 700 }}>{previewContact.name || 'Contacto'}</Typography>
                <Typography color="text.secondary">{previewContact.phone || ''}</Typography>
                {previewContact.org && (<Typography color="text.secondary">{previewContact.org}</Typography>)}
              </Box>
            </Stack>
          </Paper>
        )}
        {previewKind === 'media' && previewUrl && (
          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            {(() => {
              const lower = String(previewUrl).toLowerCase()
              const isVideo = lower.endsWith('.mp4')
              const isAudio = lower.endsWith('.mp3')
              const isImage = /(\.jpg|\.jpeg|\.png|\.webp)$/.test(lower)
              const isPdf = lower.endsWith('.pdf')
              if (isVideo) return (<Box component="video" src={previewUrl} controls sx={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 1 }} />)
              if (isAudio) return (<Box component="audio" src={previewUrl} controls sx={{ width: '100%' }} />)
              if (isImage) return (<Box component="img" src={previewUrl} alt="preview" sx={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }} />)
              if (isPdf) return (<Box component="iframe" src={previewUrl} title="PDF" sx={{ width: '100%', height: '70vh', border: 0 }} />)
              return (
                <Box sx={{ textAlign: 'center' }}>
                  <Typography>Vista previa no disponible. Abrir archivo:</Typography>
                  <Button href={previewUrl} target="_blank" rel="noopener" sx={{ mt: 1 }} variant="contained">Abrir en nueva pestaña</Button>
                </Box>
              )
            })()}
          </Box>
        )}
      </DialogContent>
    </Dialog>

    {/* Modal Probar flujo */}
    <Dialog open={testOpen} onClose={closeTestModal} fullWidth maxWidth="sm">
      <DialogTitle>Probar flujo</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <FormControl fullWidth>
            <InputLabel id="test-platform-label">Plataforma</InputLabel>
            <Select labelId="test-platform-label" label="Plataforma" value={testPlatform} onChange={(e)=>handleTestPlatformChange(e.target.value)}>
              <MenuItem value="whatsapp">WhatsApp</MenuItem>
            </Select>
          </FormControl>
          {/* Telegram functionality removed */}
          <TextField label="Buscar por nombre o número" value={testQuery} onChange={(e)=>handleTestSearch(e.target.value)} fullWidth />
          {testLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={24} /></Box>
          ) : (
            <List dense sx={{ maxHeight: 320, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
              {testItems.length === 0 && (
                <Box sx={{ p: 2 }}>
                  <Typography color="text.secondary">Sin resultados. Ajusta el buscador.</Typography>
                </Box>
              )}
              {testItems.map(it => (
                <ListItemButton key={it.key} onClick={()=>toggleSelectTestItem(it.key)} sx={{ display: 'flex', alignItems: 'center' }}>
                  <Checkbox edge="start" checked={testSelected.includes(it.key)} tabIndex={-1} disableRipple />
                  <ListItemText primary={it.label} secondary={it.subLabel} />
                </ListItemButton>
              ))}
            </List>
          )}
          {testError && <Typography color="error">{testError}</Typography>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={closeTestModal} disabled={testSending}>Cancelar</Button>
        <Button variant="contained" onClick={sendTest} disabled={testSending || testSelected.length === 0}>
          {testSending ? 'Enviando...' : `Enviar (${testSelected.length})`}
        </Button>
      </DialogActions>
    </Dialog>

    {/* Confirmación eliminar paso */}
    <Dialog open={deleteStepDialogOpen} onClose={closeDeleteStepDialog}>
      <DialogTitle>Eliminar paso</DialogTitle>
      <DialogContent>
        <Typography>¿Seguro que deseas eliminar este paso? Esta acción no se puede deshacer.</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={closeDeleteStepDialog}>Cancelar</Button>
        <Button color="error" variant="contained" onClick={confirmDeleteStep}>Eliminar</Button>
      </DialogActions>
    </Dialog>
    </>
  )
}
