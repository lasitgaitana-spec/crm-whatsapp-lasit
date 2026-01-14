import React from 'react'
import { Box, Button, Paper, Typography, Stack, TextField, InputAdornment, IconButton, Divider, Avatar, TableContainer, Table, TableHead, TableRow, TableCell, TableBody, Checkbox, Tooltip, Popover, List, ListItemButton, ListItemText, ListItemIcon, Chip, Dialog, DialogTitle, DialogContent, DialogActions, LinearProgress, Alert, FormControl, InputLabel, Select, MenuItem, Menu, CircularProgress, Link } from '@mui/material'
import FilterListIcon from '@mui/icons-material/FilterList'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import SearchIcon from '@mui/icons-material/Search'
import ChatIcon from '@mui/icons-material/Chat'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
// Eliminados iconos del panel "Más popular" (ya no se usa)
import CheckIcon from '@mui/icons-material/Check'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import EditIcon from '@mui/icons-material/Edit'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined'
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined'
import * as XLSX from 'xlsx'
import { useNavigate } from 'react-router-dom'

export default function Contacts() {
  const [contacts, setContacts] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)
  const [q, setQ] = React.useState('')
  const [selected, setSelected] = React.useState([])
  const [filtersAnchor, setFiltersAnchor] = React.useState(null)
  const [labels, setLabels] = React.useState([])
  const [labelsLoading, setLabelsLoading] = React.useState(false)
  const [labelQ, setLabelQ] = React.useState('')
  const [activeLabel, setActiveLabel] = React.useState(null) // {id,name}
  // Filtros avanzados
  const [filterCategory, setFilterCategory] = React.useState('label') // 'label' | 'platform'
  const [activePlatform, setActivePlatform] = React.useState('') // '', 'whatsapp', 'telegram', 'both', 'none'
  const navigate = useNavigate()

  // Menú de acciones por fila
  const [rowMenuAnchor, setRowMenuAnchor] = React.useState(null)
  const [rowMenuContact, setRowMenuContact] = React.useState(null)
  const openRowMenu = (evt, contact) => { setRowMenuAnchor(evt.currentTarget); setRowMenuContact(contact) }
  const closeRowMenu = () => { setRowMenuAnchor(null); }

  // Diálogo de edición
  const [editOpen, setEditOpen] = React.useState(false)
  const [editName, setEditName] = React.useState('')
  const [editPhone, setEditPhone] = React.useState('')
  const [editLoading, setEditLoading] = React.useState(false)
  const openEdit = (contact) => { if (!contact) return; setEditName(contact.name || ''); setEditPhone(contact.phone || ''); setEditOpen(true) }
  const saveEdit = async () => {
    try {
      setEditLoading(true)
      // Por ahora, se edita solo el nombre; el teléfono se mantiene.
      const countryCode = '57'
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, phone: editPhone, countryCode })
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'No se pudo actualizar el contacto')
      // Actualizar estado local
      setContacts(prev => prev.map(c => c.phone === editPhone ? { ...c, name: editName } : c))
      setEditOpen(false)
    } catch (e) {
      setError(e.message || 'Error al guardar cambios')
    } finally {
      setEditLoading(false)
    }
  }

  // Confirmación de eliminación individual
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false)
  const [deleteOneLoading, setDeleteOneLoading] = React.useState(false)
  const confirmDeleteOne = () => { setDeleteConfirmOpen(true) }
  const deleteOne = async () => {
    if (!rowMenuContact) return
    try {
      setDeleteOneLoading(true)
      const res = await fetch('/api/contacts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jids: [rowMenuContact.jid] })
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'No se pudo eliminar el contacto')
      setContacts(prev => prev.filter(c => c.jid !== rowMenuContact.jid))
      setSelected(prev => prev.filter(j => j !== rowMenuContact.jid))
      setDeleteConfirmOpen(false)
      setRowMenuContact(null)
    } catch (e) {
      setError(e.message || 'Error al eliminar contacto')
    } finally {
      setDeleteOneLoading(false)
    }
  }

  React.useEffect(() => {
    const fetchContacts = async () => {
      try {
        let url = q ? `/api/contacts?q=${encodeURIComponent(q)}` : '/api/contacts'
        if (activeLabel?.id) {
          const param = `labelId=${encodeURIComponent(activeLabel.id)}`
          url += (url.includes('?') ? '&' : '?') + param
        }
        if (activePlatform) {
          const param = `platform=${encodeURIComponent(activePlatform)}`
          url += (url.includes('?') ? '&' : '?') + param
        }
        const res = await fetch(url)
        let data
        const ct = res.headers.get('content-type') || ''
        if (ct.includes('application/json')) {
          try { data = await res.json() } catch { data = null }
        } else {
          // Respuesta no JSON o vacía: no romper la vista
          const txt = await res.text().catch(() => '')
          if (!txt || !txt.trim()) {
            data = { ok: true, contacts: [] }
          } else {
            data = null
          }
        }
        if (!res.ok) {
          // Tratar errores de servidor de forma silenciosa para evitar mensajes técnicos
          console.warn('Fallo al cargar contactos', res.status, res.statusText)
          setContacts([])
          setError(null)
          return
        }
        if (data && data.ok === false && data.error) {
          console.warn('Error API contactos:', data.error)
          setContacts([])
          setError(null)
          return
        }
        setContacts(Array.isArray(data?.contacts) ? data.contacts : [])
      } catch (e) {
        // No mostrar mensajes técnicos; mantener la vista usable
        console.warn('Excepción al cargar contactos:', e)
        setError(null)
      } finally {
        setLoading(false)
      }
    }
    fetchContacts()
  }, [q, activeLabel, activePlatform])

  // Cargar etiquetas cuando se abre el popover o cambia el query
  React.useEffect(() => {
    if (!filtersAnchor) return
    const fetchLabels = async () => {
      try {
        setLabelsLoading(true)
        const url = labelQ ? `/api/labels?q=${encodeURIComponent(labelQ)}` : '/api/labels'
        const res = await fetch(url)
        const data = await res.json()
        if (!data.ok) throw new Error(data.error || 'No se pudo cargar etiquetas')
        setLabels(Array.isArray(data.items) ? data.items : [])
      } catch (e) {
        // Mostrar en UI superior
        setError(e.message || 'Error al cargar etiquetas')
      } finally {
        setLabelsLoading(false)
      }
    }
    fetchLabels()
  }, [filtersAnchor, labelQ])

  const openChat = (jid) => navigate(`/whatsapp?jid=${encodeURIComponent(jid)}`)
  const openChatForContact = (contact) => {
    if (!contact) return
    // Se ha retirado Telegram; siempre navegar al chat de WhatsApp
    return openChat(contact.jid)
  }
  const allChecked = selected.length > 0 && selected.length === contacts.length
  const toggleAll = (checked) => setSelected(checked ? contacts.map(c => c.jid) : [])
  const toggleOne = (jid) => setSelected(prev => prev.includes(jid) ? prev.filter(x => x !== jid) : [...prev, jid])

  // Descargar informe (Excel) respetando filtros activos
  const downloadReport = () => {
    const params = new URLSearchParams()
    if (q && q.trim()) params.set('q', q.trim())
    if (activeLabel?.id) params.set('labelId', String(activeLabel.id))
    if (activePlatform) params.set('platform', activePlatform)
    const url = `/api/contacts/export?${params.toString()}`
    window.open(url, '_blank')
  }

  // Eliminación masiva
  const [deleteLoading, setDeleteLoading] = React.useState(false)
  const bulkDelete = async () => {
    if (selected.length === 0) return
    const ok = window.confirm(`¿Eliminar ${selected.length} contacto(s) seleccionados?`)
    if (!ok) return
    try {
      setDeleteLoading(true)
      const res = await fetch('/api/contacts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jids: selected })
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'No se pudo eliminar')
      const removedSet = new Set(selected)
      setContacts(prev => prev.filter(c => !removedSet.has(c.jid)))
      setSelected([])
    } catch (e) {
      setError(e.message || 'Error al eliminar contactos')
    } finally {
      setDeleteLoading(false)
    }
  }

  // Ficha de contacto al pulsar el nombre
  const [cardOpen, setCardOpen] = React.useState(false)
  const [cardContact, setCardContact] = React.useState(null)
  const [cardLabels, setCardLabels] = React.useState([])
  const [cardLabelsLoading, setCardLabelsLoading] = React.useState(false)
  const [cardAddLabelId, setCardAddLabelId] = React.useState('')
  const [labelOptions, setLabelOptions] = React.useState([])
  const [labelOptionsLoading, setLabelOptionsLoading] = React.useState(false)

  // Etiquetas masivas
  const [bulkLabelsOpen, setBulkLabelsOpen] = React.useState(false)
  const [bulkLabelIds, setBulkLabelIds] = React.useState([])
  const [bulkLabelMode, setBulkLabelMode] = React.useState('add') // 'add' | 'replace'
  const [bulkLabelsLoading, setBulkLabelsLoading] = React.useState(false)
  const openBulkLabels = async () => {
    // cargar opciones de etiquetas si no están
    if (labelOptions.length === 0 && !labelOptionsLoading) {
      try {
        setLabelOptionsLoading(true)
        const res = await fetch('/api/labels')
        const data = await res.json()
        if (data.ok) setLabelOptions(Array.isArray(data.items) ? data.items : [])
      } catch {}
      finally { setLabelOptionsLoading(false) }
    }
    setBulkLabelIds([])
    setBulkLabelMode('add')
    setBulkLabelsOpen(true)
  }
  const applyBulkLabels = async () => {
    if (selected.length === 0 || bulkLabelIds.length === 0) return
    try {
      setBulkLabelsLoading(true)
      const res = await fetch('/api/contacts/labels/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jids: selected, labelIds: bulkLabelIds.map(Number), mode: bulkLabelMode })
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'No se pudo aplicar etiquetas')
      setBulkLabelsOpen(false)
      setBulkLabelIds([])
    } catch (e) {
      setError(e.message || 'Error al aplicar etiquetas masivas')
    } finally {
      setBulkLabelsLoading(false)
    }
  }

  const [cardFields, setCardFields] = React.useState([]) // [{id,name,type,value}]
  const [cardFieldsLoading, setCardFieldsLoading] = React.useState(false)
  const [fieldOptions, setFieldOptions] = React.useState([])
  const [fieldOptionsLoading, setFieldOptionsLoading] = React.useState(false)
  const [fieldAssignId, setFieldAssignId] = React.useState('')
  const [fieldAssignValue, setFieldAssignValue] = React.useState('')
  // Edición inline de campos asignados
  const [editingFieldId, setEditingFieldId] = React.useState(null)
  const [editingValue, setEditingValue] = React.useState('')
  const [cardPlatform, setCardPlatform] = React.useState('')
  const [choosePlatformOpen, setChoosePlatformOpen] = React.useState(false)
  const [chooseContact, setChooseContact] = React.useState(null)

  const openContactCard = async (contact) => {
    setCardContact(contact)
    setCardPlatform(contact?.platforms || '')
    setCardOpen(true)
    // Cargar etiquetas asignadas
    try {
      setCardLabelsLoading(true)
      const res = await fetch(`/api/contacts/${encodeURIComponent(contact.jid)}/labels`)
      const data = await res.json()
      if (data.ok) setCardLabels(Array.isArray(data.items) ? data.items : [])
    } catch {}
    finally { setCardLabelsLoading(false) }
    // Cargar opciones de etiquetas
    try {
      setLabelOptionsLoading(true)
      const res = await fetch('/api/labels')
      const data = await res.json()
      if (data.ok) setLabelOptions(Array.isArray(data.items) ? data.items : [])
    } catch {}
    finally { setLabelOptionsLoading(false) }
    // Cargar campos y valores
    try {
      setCardFieldsLoading(true)
      const res = await fetch(`/api/contacts/${encodeURIComponent(contact.jid)}/fields`)
      const data = await res.json()
      if (data.ok) setCardFields(Array.isArray(data.items) ? data.items : [])
    } catch {}
    finally { setCardFieldsLoading(false) }
    // Opciones de campos
    try {
      setFieldOptionsLoading(true)
      const res = await fetch('/api/fields')
      const data = await res.json()
      if (data.ok) setFieldOptions(Array.isArray(data.items) ? data.items : [])
    } catch {}
    finally { setFieldOptionsLoading(false) }
  }

  const addLabelToCard = async () => {
    if (!cardContact || !cardAddLabelId) return
    try {
      const res = await fetch(`/api/contacts/${encodeURIComponent(cardContact.jid)}/labels`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ labelId: Number(cardAddLabelId) })
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'No se pudo asignar etiqueta')
      const added = labelOptions.find(l => l.id === Number(cardAddLabelId))
      if (added) setCardLabels(prev => prev.some(x => x.id === added.id) ? prev : [...prev, added])
      setCardAddLabelId('')
    } catch (e) {
      setError(e.message || 'Error al asignar etiqueta')
    }
  }

  const removeLabelFromCard = async (labelId) => {
    if (!cardContact) return
    try {
      const res = await fetch(`/api/contacts/${encodeURIComponent(cardContact.jid)}/labels/${encodeURIComponent(labelId)}`, { method: 'DELETE' })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'No se pudo eliminar etiqueta')
      setCardLabels(prev => prev.filter(l => l.id !== labelId))
    } catch (e) {
      setError(e.message || 'Error al eliminar etiqueta')
    }
  }

  const assignFieldValue = async () => {
    if (!cardContact || !fieldAssignId) return
    try {
      const res = await fetch(`/api/contacts/${encodeURIComponent(cardContact.jid)}/fields`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fieldId: Number(fieldAssignId), value: fieldAssignValue })
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'No se pudo asignar campo')
      setCardFields(prev => prev.map(f => f.id === Number(fieldAssignId) ? { ...f, value: fieldAssignValue } : f))
      setFieldAssignId(''); setFieldAssignValue('')
    } catch (e) {
      setError(e.message || 'Error al asignar campo')
    }
  }

  const clearFieldValue = async (fieldId) => {
    if (!cardContact) return
    try {
      const res = await fetch(`/api/contacts/${encodeURIComponent(cardContact.jid)}/fields/${encodeURIComponent(fieldId)}`, { method: 'DELETE' })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'No se pudo limpiar campo')
      setCardFields(prev => prev.map(f => f.id === fieldId ? { ...f, value: null } : f))
      // Si se limpia el campo que se está editando, cerrar editor
      if (editingFieldId === fieldId) { setEditingFieldId(null); setEditingValue('') }
    } catch (e) {
      setError(e.message || 'Error al limpiar campo')
    }
  }

  const startEditField = (field) => {
    setEditingFieldId(field.id)
    setEditingValue(String(field.value ?? ''))
  }

  const saveEditedFieldValue = async () => {
    if (!cardContact || !editingFieldId) return
    try {
      const res = await fetch(`/api/contacts/${encodeURIComponent(cardContact.jid)}/fields`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fieldId: Number(editingFieldId), value: editingValue })
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'No se pudo asignar campo')
      setCardFields(prev => prev.map(f => f.id === Number(editingFieldId) ? { ...f, value: editingValue } : f))
      setEditingFieldId(null)
      setEditingValue('')
    } catch (e) {
      setError(e.message || 'Error al asignar campo')
    }
  }
  // Asignar plataforma al contacto desde la ficha
  const assignPlatformToCard = async () => {
    if (!cardContact || !cardPlatform) return
    try {
      const res = await fetch(`/api/contacts/${encodeURIComponent(cardContact.jid)}/platform`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform: String(cardPlatform) })
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'No se pudo asignar plataforma')
      setContacts(prev => prev.map(c => c.jid === cardContact.jid ? { ...c, platforms: cardPlatform } : c))
      setCardContact(prev => prev ? { ...prev, platforms: cardPlatform } : prev)
    } catch (e) {
      setError(e.message || 'Error al asignar plataforma')
    }
  }
  // Importar contactos: estado
  const [importOpen, setImportOpen] = React.useState(false)
  const [importFile, setImportFile] = React.useState(null)
  const [importPreview, setImportPreview] = React.useState([])
  const [importParsing, setImportParsing] = React.useState(false)
  const [importProgress, setImportProgress] = React.useState(0)
  const [importError, setImportError] = React.useState(null)
  const [applyLabelId, setApplyLabelId] = React.useState('')
  const [importLabels, setImportLabels] = React.useState([])
  const [importLabelsLoading, setImportLabelsLoading] = React.useState(false)
  const [importSummary, setImportSummary] = React.useState(null)
  const [applyPlatform, setApplyPlatform] = React.useState('')

  const handleChooseFile = (e) => {
    const f = e.target.files?.[0] || null
    if (!f) return
    setImportFile(f)
    setImportError(null)
    setImportSummary(null)
    // Parsear vista previa limitada
    setImportParsing(true)
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const data = evt.target.result
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json(ws, { defval: '' })
        setImportPreview(json.slice(0, 10))
      } catch (err) {
        setImportError(err.message || 'No se pudo leer el archivo')
      } finally {
        setImportParsing(false)
      }
    }
    reader.onerror = () => { setImportError('Error leyendo el archivo'); setImportParsing(false) }
    reader.readAsArrayBuffer(f)
  }

  const mapRow = (row) => {
    // Soporta múltiples encabezados comunes
    const name = row['Nombre'] || row['name'] || row['Name'] || ''
    const phone = row['Telefono'] || row['Teléfono'] || row['phone'] || row['Phone'] || ''
    const countryCode = row['CodigoPais'] || row['Código país'] || row['Codigo Pais'] || row['CountryCode'] || row['countryCode'] || '57'
    const labelsRaw = row['Etiquetas'] || row['Etiqueta'] || row['Labels'] || ''
    const labels = String(labelsRaw || '').split(/[;,]/).map(s => s.trim()).filter(Boolean)
    return { name, phone, countryCode, labels }
  }

  // Cargar etiquetas para el Select al abrir el diálogo
  React.useEffect(() => {
    if (!importOpen) return
    const fetchLabels = async () => {
      try {
        setImportLabelsLoading(true)
        const res = await fetch('/api/labels')
        const data = await res.json()
        if (!data.ok) throw new Error(data.error || 'No se pudo cargar etiquetas')
        setImportLabels(Array.isArray(data.items) ? data.items : [])
      } catch (e) {
        setImportLabels([])
      } finally {
        setImportLabelsLoading(false)
      }
    }
    fetchLabels()
  }, [importOpen])

  const startImport = async () => {
    try {
      setImportError(null)
      setImportSummary(null)
      if (!importFile) { setImportError('Seleccione un archivo'); return }
      if (!applyPlatform) { setImportError('Seleccione la plataforma antes de importar'); return }
      setImportParsing(true)
      setImportProgress(0)
      const reader = new FileReader()
      reader.onload = async (evt) => {
        try {
          const data = evt.target.result
          const wb = XLSX.read(data, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const json = XLSX.utils.sheet_to_json(ws, { defval: '' })
          const items = json.map(mapRow).filter(it => String(it.phone || '').trim())
          const chunkSize = 1000
          let processed = 0
          let errorsCount = 0
          let labelLinks = 0
          let duplicates = 0
          let created = 0
          for (let i = 0; i < items.length; i += chunkSize) {
            const chunk = items.slice(i, i + chunkSize)
            const body = { items: chunk }
            if (applyLabelId) body.applyLabelId = Number(applyLabelId)
            if (applyPlatform) body.applyPlatform = String(applyPlatform)
            const resp = await fetch('/api/contacts/import', {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
            })
            const dataResp = await resp.json()
            if (!dataResp.ok) { errorsCount += chunk.length; continue }
            processed += (dataResp.summary?.processed || chunk.length)
            errorsCount += (dataResp.summary?.errorsCount || 0)
            labelLinks += (dataResp.summary?.labelLinks || 0)
            duplicates += (dataResp.summary?.duplicates || 0)
            created += (dataResp.summary?.created || 0)
            setImportProgress(Math.round((processed / items.length) * 100))
          }
          setImportSummary({ processed, errorsCount, labelLinks, duplicates, created })
          // Refrescar tabla
          setQ('')
          setActiveLabel(null)
        } catch (err) {
          setImportError(err.message || 'Fallo al procesar archivo')
        } finally {
          setImportParsing(false)
        }
      }
      reader.onerror = () => { setImportError('Error leyendo el archivo'); setImportParsing(false) }
      reader.readAsArrayBuffer(importFile)
    } catch (e) {
      setImportError(e.message || 'Error inesperado')
      setImportParsing(false)
    }
  }

  return (
    <Box sx={{ display: 'flex', gap: 2 }}>
      {/* Contenido principal (panel "Más popular" eliminado) */}
      <Stack sx={{ flex: 1 }} spacing={2}>
        <Typography variant="h5">Contactos</Typography>
        {error && <Typography color="error">{error}</Typography>}

        {/* Barra de acciones */}
        <Paper sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
            <Stack direction="row" spacing={1} alignItems="center">
              <Button variant="outlined" startIcon={<FilterListIcon />} onClick={(e) => setFiltersAnchor(e.currentTarget)}>Filtros</Button>
              {activeLabel && (
                <Chip label={`Etiqueta: ${activeLabel.name}`} onDelete={() => setActiveLabel(null)} size="small" />
              )}
              {activePlatform && (
                <Chip
                  label={`Plataforma: ${activePlatform === 'whatsapp' ? 'WhatsApp' : 'Sin plataforma'}`}
                  onDelete={() => setActivePlatform('')}
                  size="small"
                />
              )}
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1, mx: 2 }}>
              <TextField
                fullWidth
                placeholder="Buscar"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                InputProps={{ startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ) }}
              />
            </Stack>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" startIcon={<CloudUploadIcon />} onClick={() => setImportOpen(true)}>Importar contactos</Button>
              <Button variant="outlined" startIcon={<FileDownloadIcon />} onClick={downloadReport}>Descargar informe</Button>
              <Button variant="contained" color="success" startIcon={<AddCircleOutlineIcon />} onClick={() => navigate('/contacts/create')}>Crear contacto</Button>
              {selected.length > 0 && (
                <Button variant="contained" color="primary" onClick={openBulkLabels}>
                  Etiquetas masivas
                </Button>
              )}
              {selected.length > 0 && (
                <Button variant="contained" color="error" startIcon={<DeleteOutlineIcon />} onClick={bulkDelete} disabled={deleteLoading}>
                  Eliminar seleccionados ({selected.length})
                </Button>
              )}
            </Stack>
          </Stack>
        </Paper>

        {/* Contador de contactos (se actualiza con filtros y eliminaciones) */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 1 }}>
          <Chip label={`Contactos: ${contacts.length}`} color="primary" variant="outlined" />
        </Box>

        {/* Tabla de contactos */}
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={selected.length > 0 && !allChecked}
                    checked={allChecked}
                    onChange={(e) => toggleAll(e.target.checked)}
                  />
                </TableCell>
                <TableCell>Usuarios</TableCell>
                <TableCell>No Telefónico</TableCell>
                <TableCell>Fecha de inscripción</TableCell>
                <TableCell>Plataforma</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6}>Cargando…</TableCell></TableRow>
              ) : contacts.length === 0 ? (
                <TableRow><TableCell colSpan={6}>No hay contactos guardados.</TableCell></TableRow>
              ) : (
                contacts.map((c) => {
                  const dt = c.created_at ? new Date(c.created_at) : null
                  const dateStr = dt ? dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString() : '-'
                  const primary = c.name || (c.phone ? `+${c.phone}` : c.jid)
                  const secondary = c.phone ? `+${c.phone}` : c.jid
                  const platformLabel = c.platforms === 'whatsapp' ? 'WhatsApp' : '-'
                  const canChat = true
                  return (
                    <TableRow key={c.jid} hover onClick={() => openContactCard(c)} sx={{ cursor: 'pointer' }}>
                      <TableCell padding="checkbox">
                        <Checkbox checked={selected.includes(c.jid)} onChange={() => toggleOne(c.jid)} onClick={(e) => e.stopPropagation()} />
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Avatar sx={{ width: 28, height: 28 }}>{String(primary).charAt(0).toUpperCase()}</Avatar>
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{primary}</Typography>
                            <Typography variant="caption" color="text.secondary">{secondary}</Typography>
                          </Box>
                        </Stack>
                      </TableCell>
                      <TableCell>{c.phone ? `+${c.phone}` : '-'}</TableCell>
                      <TableCell>{dateStr}</TableCell>
                      <TableCell>{platformLabel}</TableCell>
                      <TableCell align="right">
                        <Tooltip title="Ver ficha">
                          <IconButton onClick={(e) => { e.stopPropagation(); openContactCard(c) }} size="small"><InfoOutlinedIcon /></IconButton>
                        </Tooltip>
                        <Tooltip title="Abrir chat">
                          <span>
                            <IconButton onClick={(e) => { e.stopPropagation(); openChatForContact(c) }} size="small" disabled={!canChat}><ChatIcon /></IconButton>
                          </span>
                        </Tooltip>
                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); openRowMenu(e, c) }}><MoreVertIcon /></IconButton>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Stack>

      {/* Menú de acciones por fila */}
      <Menu
        anchorEl={rowMenuAnchor}
        open={!!rowMenuAnchor}
        onClose={closeRowMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <MenuItem onClick={() => { openEdit(rowMenuContact); closeRowMenu() }}>Editar contacto</MenuItem>
        <MenuItem onClick={() => { confirmDeleteOne(); closeRowMenu() }} style={{ color: '#d32f2f' }}>Eliminar contacto…</MenuItem>
      </Menu>

      {/* Diálogo editar contacto */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)}>
        <DialogTitle>Editar contacto</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Nombre" fullWidth value={editName} onChange={(e) => setEditName(e.target.value)} />
            <TextField label="Teléfono" fullWidth value={editPhone ? `+${editPhone}` : ''} disabled helperText="El teléfono no se edita aquí." />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)} disabled={editLoading}>Cancelar</Button>
          <Button variant="contained" onClick={saveEdit} disabled={editLoading || !editName}>Guardar</Button>
        </DialogActions>
      </Dialog>
      {/* Diálogo: Etiquetas masivas (estilo llamativo) */}
      <Dialog
        open={bulkLabelsOpen}
        onClose={() => setBulkLabelsOpen(false)}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { borderRadius: 2, border: '2px solid', borderColor: 'primary.main', boxShadow: 10 } }}
      >
        <DialogTitle sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', py: 1.5 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <LabelOutlinedIcon />
            <Typography variant="h6" sx={{ flex: 1, fontWeight: 700 }}>Etiquetas masivas</Typography>
            <Chip label={`Seleccionados: ${selected.length}`} color="secondary" size="small" variant="filled" />
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            <Paper variant="outlined" sx={{ p: 2, borderStyle: 'dashed' }}>
              <FormControl fullWidth>
                <InputLabel id="bulk-labels-select">Etiquetas</InputLabel>
                <Select
                  labelId="bulk-labels-select"
                  multiple
                  value={bulkLabelIds}
                  label="Etiquetas"
                  onChange={(e) => setBulkLabelIds(e.target.value)}
                  renderValue={(selectedIds) => (
                    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                      {selectedIds.map((id) => {
                        const lbl = labelOptions.find(l => l.id === id)
                        return <Chip key={id} label={lbl ? lbl.name : id} size="small" color="primary" variant="outlined" />
                      })}
                    </Stack>
                  )}
                >
                  {labelOptionsLoading ? (
                    <MenuItem disabled><CircularProgress size={18} sx={{ mr: 1 }} />Cargando…</MenuItem>
                  ) : labelOptions.map(l => (
                    <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth sx={{ mt: 2 }}>
                <InputLabel id="bulk-labels-mode">Acción</InputLabel>
                <Select labelId="bulk-labels-mode" value={bulkLabelMode} label="Acción" onChange={(e) => setBulkLabelMode(e.target.value)}>
                  <MenuItem value="add">Agregar a etiquetas existentes</MenuItem>
                  <MenuItem value="replace">Reemplazar todas por las seleccionadas</MenuItem>
                </Select>
              </FormControl>
            </Paper>
            <Alert icon={<WarningAmberOutlinedIcon />} severity="warning" sx={{ bgcolor: 'warning.light' }}>
              Esta acción aplica etiquetas a todos los contactos seleccionados. Si eliges "Reemplazar", se eliminarán las etiquetas actuales antes de asignar las nuevas.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="outlined" onClick={() => setBulkLabelsOpen(false)}>Cancelar</Button>
          <Button variant="contained" color="primary" onClick={applyBulkLabels} disabled={bulkLabelsLoading || bulkLabelIds.length === 0}>Aplicar</Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo elegir plataforma para chat cuando el contacto tiene ambas */}
      <Dialog open={choosePlatformOpen} onClose={() => setChoosePlatformOpen(false)}>
        <DialogTitle>Elegir plataforma</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>Selecciona cómo chatear con {(chooseContact?.name || chooseContact?.phone || 'el contacto')}.</Typography>
          <Stack direction="row" spacing={2}>
            <Button variant="outlined" onClick={() => { setChoosePlatformOpen(false); if (chooseContact) openChat(chooseContact.jid) }}>WhatsApp</Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChoosePlatformOpen(false)}>Cancelar</Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo confirmación eliminar */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>Eliminar contacto</DialogTitle>
        <DialogContent>
          <Typography>¿Seguro que deseas eliminar este contacto? Esta acción no se puede deshacer.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)} disabled={deleteOneLoading}>Cancelar</Button>
          <Button variant="contained" color="error" onClick={deleteOne} disabled={deleteOneLoading}>Eliminar</Button>
        </DialogActions>
      </Dialog>

      {/* Ficha de contacto (al hacer clic en el nombre) */}
      <Dialog open={cardOpen} onClose={() => setCardOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {cardContact?.name || cardContact?.phone || 'Contacto'}
          {cardContact && (
            <Tooltip title="Editar nombre">
              <IconButton size="small" sx={{ ml: 1 }} onClick={() => { setEditName(cardContact?.name || ''); setEditPhone(cardContact?.phone || ''); setEditOpen(true) }}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </DialogTitle>
        <DialogContent dividers>
          <Stack direction="column" spacing={3}>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Etiquetas</Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
                {cardLabelsLoading ? <CircularProgress size={18} /> : cardLabels.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No hay etiquetas asignadas</Typography>
                ) : cardLabels.map(l => (
                  <Chip key={l.id} label={l.name} onDelete={() => removeLabelFromCard(l.id)} sx={{ mr: 1, mb: 1 }} />
                ))}
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel id="add-label">Agregar etiqueta</InputLabel>
                  <Select labelId="add-label" label="Agregar etiqueta" value={cardAddLabelId} onChange={e => setCardAddLabelId(e.target.value)} disabled={labelOptionsLoading}>
                    {labelOptions.map(opt => (
                      <MenuItem key={opt.id} value={opt.id}>{opt.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button variant="outlined" onClick={addLabelToCard} disabled={!cardAddLabelId}>Asignar</Button>
              </Stack>
            </Box>
            {/* Plataforma del contacto */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Plataforma</Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel id="card-platform">Plataforma</InputLabel>
                  <Select labelId="card-platform" label="Plataforma" value={cardPlatform} onChange={e => setCardPlatform(e.target.value)}>
                    <MenuItem value=""><em>Sin plataforma</em></MenuItem>
                    <MenuItem value="whatsapp">WhatsApp</MenuItem>
                  </Select>
                </FormControl>
                <Button variant="outlined" onClick={assignPlatformToCard} disabled={!cardContact || !cardPlatform}>Asignar</Button>
              </Stack>
            </Box>
            <Divider />
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Campos personalizados</Typography>
              {/* Chips con campos asignados (similar a etiquetas) */}
              <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
                {cardFieldsLoading ? (
                  <CircularProgress size={18} />
                ) : (
                  (() => {
                    const assigned = cardFields.filter(f => (f.value ?? '') !== '' && f.value !== null)
                    if (assigned.length === 0) {
                      return <Typography variant="body2" color="text.secondary">Sin campos asignados</Typography>
                    }
                    return assigned.map(f => (
                      <Chip key={f.id} label={`${f.name}: ${String(f.value)}`} onDelete={() => clearFieldValue(f.id)} onClick={() => startEditField(f)} clickable sx={{ mr: 1, mb: 1 }} />
                    ))
                  })()
                )}
              </Stack>
              {/* Editor inline cuando se hace clic en un chip */}
              {editingFieldId && (
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography sx={{ minWidth: 160 }}>{cardFields.find(x => x.id === editingFieldId)?.name}</Typography>
                  <TextField size="small" placeholder="Valor" value={editingValue} onChange={e => setEditingValue(e.target.value)} sx={{ flex: 1 }} />
                  <Button size="small" variant="contained" onClick={saveEditedFieldValue}>Guardar</Button>
                  <Button size="small" variant="text" onClick={() => { setEditingFieldId(null); setEditingValue('') }}>Cancelar</Button>
                </Stack>
              )}

              {/* Bloque para asignar nuevo campo */}
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2 }}>
                <FormControl size="small" sx={{ minWidth: 220 }}>
                  <InputLabel id="add-field">Agregar campo</InputLabel>
                  <Select labelId="add-field" label="Agregar campo" value={fieldAssignId} onChange={e => setFieldAssignId(e.target.value)} disabled={fieldOptionsLoading}>
                    {fieldOptions.map(opt => (
                      <MenuItem key={opt.id} value={opt.id}>{opt.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField size="small" placeholder="Valor" value={fieldAssignValue} onChange={e => setFieldAssignValue(e.target.value)} sx={{ flex: 1 }} />
                <Button variant="outlined" onClick={assignFieldValue} disabled={!fieldAssignId}>Asignar</Button>
              </Stack>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCardOpen(false)}>Cerrar</Button>
          {cardContact && <Button variant="contained" onClick={() => openChatForContact(cardContact)}>Ir a Chat</Button>}
        </DialogActions>
      </Dialog>

      {/* Diálogo importar contactos */}
      <Dialog open={importOpen} onClose={() => { setImportOpen(false); setImportFile(null); setImportPreview([]); setImportError(null); setImportSummary(null); setImportProgress(0); setApplyLabelId(''); setApplyPlatform('') }} maxWidth="md" fullWidth>
        <DialogTitle>Importar contactos</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Typography variant="body2">
              Por favor, suba un archivo .xlsx o .csv con su base de contactos. Puede descargar una
              <Link href="/api/contacts/template" target="_blank" rel="noreferrer" color="primary" underline="hover" sx={{ fontSize: '1rem', fontWeight: 600, ml: 0.5 }}>
                Plantilla
              </Link>{' '}y ver reglas básicas de columnas.
            </Typography>
            {importError && <Alert severity="error">{importError}</Alert>}
            {importParsing && <LinearProgress />}
            <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', borderStyle: 'dashed' }}>
              <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} id="import-file-input" onChange={handleChooseFile} />
              <label htmlFor="import-file-input">
                <Button component="span" startIcon={<CloudUploadIcon />}>Cargar archivo</Button>
              </label>
              <Typography variant="caption" color="text.secondary" display="block">Haz clic para seleccionar o arrastra y suelta el archivo</Typography>
              {importFile && <Typography variant="caption" sx={{ mt: 1, display: 'block' }}>Archivo: {importFile.name}</Typography>}
            </Paper>
            <FormControl fullWidth>
              <InputLabel id="apply-label-select">Aplicar etiqueta a todos</InputLabel>
              <Select labelId="apply-label-select" value={applyLabelId} label="Aplicar etiqueta a todos" onChange={(e)=>setApplyLabelId(e.target.value)} disabled={importLabelsLoading}>
                <MenuItem value=""><em>Sin etiqueta</em></MenuItem>
                {importLabels.map((l) => (
                  <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel id="apply-platform-select">Plataforma</InputLabel>
              <Select labelId="apply-platform-select" value={applyPlatform} label="Plataforma" onChange={(e)=>setApplyPlatform(e.target.value)}>
                <MenuItem value=""><em>Sin plataforma</em></MenuItem>
                <MenuItem value="whatsapp">WhatsApp</MenuItem>
              </Select>
            </FormControl>
            {importPreview.length > 0 && (
              <Box>
                <Typography variant="subtitle2">Vista previa (primeras filas):</Typography>
                <TableContainer component={Paper} sx={{ maxHeight: 240 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        {Object.keys(importPreview[0]).map((k) => (<TableCell key={k}>{k}</TableCell>))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {importPreview.map((r, idx) => (
                        <TableRow key={idx}>
                          {Object.keys(importPreview[0]).map((k) => (<TableCell key={k}>{String(r[k])}</TableCell>))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}
            {importProgress > 0 && <LinearProgress variant="determinate" value={importProgress} />}
            {importSummary && (
              <Alert severity={importSummary.created === 0 ? 'info' : 'success'}>
                Procesados: {importSummary.processed}. Duplicados: {importSummary.duplicates || 0}.{' '}
                {importSummary.created === 0 ? 'No se agregaron contactos.' : `Agregados: ${importSummary.created}.`}{' '}
                Errores: {importSummary.errorsCount}.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportOpen(false)}>Cerrar</Button>
          <Button variant="contained" onClick={startImport} disabled={importParsing || !importFile}>Importar contactos</Button>
        </DialogActions>
      </Dialog>
      {/* Popover Filtros: Etiqueta / Plataforma */}
      <Popover
        open={!!filtersAnchor}
        anchorEl={filtersAnchor}
        onClose={() => { setFiltersAnchor(null); setLabelQ('') }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ display: 'flex', width: 520, height: 360 }}>
          {/* Panel izquierda: categorías */}
          <Box sx={{ width: 200, borderRight: '1px solid', borderColor: 'divider', p: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Filtro</Typography>
            <List dense sx={{ mt: 1 }}>
              <ListItemButton selected={filterCategory === 'label'} onClick={() => setFilterCategory('label')}>
                {filterCategory === 'label' && (
                  <ListItemIcon sx={{ minWidth: 28 }}>
                    <CheckIcon fontSize="small" color="success" />
                  </ListItemIcon>
                )}
                <ListItemText primary="Etiqueta" />
              </ListItemButton>
              <ListItemButton selected={filterCategory === 'platform'} onClick={() => setFilterCategory('platform')}>
                {filterCategory === 'platform' && (
                  <ListItemIcon sx={{ minWidth: 28 }}>
                    <CheckIcon fontSize="small" color="success" />
                  </ListItemIcon>
                )}
                <ListItemText primary="Plataforma" />
              </ListItemButton>
            </List>
            <Typography variant="caption" color="text.secondary">Seleccione una categoría</Typography>
          </Box>
          {/* Panel derecha: contenido según categoría */}
          <Box sx={{ flex: 1, p: 1 }}>
            {filterCategory === 'label' ? (
              <>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Buscar o ingresar valor"
                  value={labelQ}
                  onChange={(e) => setLabelQ(e.target.value)}
                  InputProps={{ startAdornment: (
                    <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
                  ) }}
                />
                <Typography variant="caption" sx={{ mt: 1, mb: 0.5, display: 'block' }} color="text.secondary">Resultados</Typography>
                <List dense sx={{ maxHeight: 280, overflowY: 'auto' }}>
                  <ListItemButton onClick={() => { setActiveLabel(null); setFiltersAnchor(null) }}>
                    <ListItemText primary="Sin filtro" />
                  </ListItemButton>
                  {labelsLoading ? (
                    <ListItemButton disabled><ListItemText primary="Cargando…" /></ListItemButton>
                  ) : labels.slice().sort((a,b)=>String(a.name).localeCompare(String(b.name))).map(l => (
                    <ListItemButton key={l.id} selected={activeLabel?.id === l.id} onClick={() => { setActiveLabel({ id: l.id, name: l.name }); setFiltersAnchor(null) }}>
                      {activeLabel?.id === l.id && (
                        <ListItemIcon sx={{ minWidth: 28 }}>
                          <CheckIcon fontSize="small" color="success" />
                        </ListItemIcon>
                      )}
                      <ListItemText primary={l.name} />
                    </ListItemButton>
                  ))}
                </List>
              </>
            ) : (
              <>
                <Typography variant="caption" sx={{ mb: 0.5, display: 'block' }} color="text.secondary">Plataforma</Typography>
                <List dense>
                  <ListItemButton onClick={() => { setActivePlatform(''); setFiltersAnchor(null) }}>
                    <ListItemText primary="Sin filtro" />
                  </ListItemButton>
                  <ListItemButton selected={activePlatform === 'whatsapp'} onClick={() => { setActivePlatform('whatsapp'); setFiltersAnchor(null) }}>
                    <ListItemIcon sx={{ minWidth: 28 }}><WhatsAppIcon color="success" fontSize="small" /></ListItemIcon>
                    <ListItemText primary="WhatsApp" />
                  </ListItemButton>
                  <ListItemButton selected={activePlatform === 'none'} onClick={() => { setActivePlatform('none'); setFiltersAnchor(null) }}>
                    <ListItemText primary="Sin plataforma" />
                  </ListItemButton>
                </List>
              </>
            )}
          </Box>
        </Box>
      </Popover>
    </Box>
  )
}