import React, { useEffect, useMemo, useState } from 'react'
import { Stack, Typography, Paper, Box, Chip, Button, TextField, Table, TableHead, TableRow, TableCell, TableBody, Divider, Popover, MenuItem, Menu, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Tooltip } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import FolderIcon from '@mui/icons-material/Folder'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline'
import DriveFileMoveOutlinedIcon from '@mui/icons-material/DriveFileMoveOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { useNavigate } from 'react-router-dom'

export default function CampaignsAds() {
  const navigate = useNavigate()
  // Datos demo
  const [folders, setFolders] = useState([]) // {id, name, created_at}
  const [flows, setFlows] = useState([]) // {id, name, folder_id, folder_name, connections, runs, ctr, updatedAt}

  const [search, setSearch] = useState('')
  const [activeFolder, setActiveFolder] = useState('Todos')
  const [showAllFolders, setShowAllFolders] = useState(true)
  const [anchorCreate, setAnchorCreate] = useState(null)
  const [openCreate, setOpenCreate] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderColor, setNewFolderColor] = useState('#2e7d32')
  const [createError, setCreateError] = useState('')

  // Utilidades de color (dentro del componente para acceder a estado)
  const getContrastColor = (hex) => {
    const h = String(hex || '').replace('#','')
    const full = h.length === 3 ? h.split('').map(ch => ch+ch).join('') : h
    if (!/^([0-9a-fA-F]{6})$/.test(full)) return '#fff'
    const r = parseInt(full.slice(0,2),16)
    const g = parseInt(full.slice(2,4),16)
    const b = parseInt(full.slice(4,6),16)
    const yiq = (r*299 + g*587 + b*114) / 1000
    return yiq >= 128 ? '#000' : '#fff'
  }
  const getFolderColor = (folderName) => {
    const f = folders.find(ff => ff.name === folderName)
    return f?.color || '#2e7d32'
  }

  const handleOpenCreate = (e) => {
    setAnchorCreate(e.currentTarget)
    setOpenCreate(true)
    setCreateError('')
  }

  const handleCloseCreate = () => {
    setOpenCreate(false)
    setAnchorCreate(null)
    setNewFolderName('')
    setNewFolderColor('#2e7d32')
    setCreateError('')
  }

  const handleSubmitCreate = async () => {
    const name = (newFolderName || '').trim()
    if (!name) {
      setCreateError('Ingresa un nombre')
      return
    }
    const exists = folders.some(f => (f.name || '').toLowerCase() === name.toLowerCase())
    if (exists) {
      setCreateError('Ya existe una carpeta con ese nombre')
      return
    }
    try {
      const res = await fetch('/api/campaigns/flow-folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, color: newFolderColor }) })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Error al crear carpeta')
      await reloadFolders()
      handleCloseCreate()
    } catch (e) {
      setCreateError(e?.message || 'Error al crear carpeta')
    }
  }

  // Crear flujo
  const [anchorCreateFlow, setAnchorCreateFlow] = useState(null)
  const [openCreateFlow, setOpenCreateFlow] = useState(false)
  const [newFlowName, setNewFlowName] = useState('')
  const [selectedFolder, setSelectedFolder] = useState('')
  const [flowError, setFlowError] = useState('')

  const handleOpenCreateFlow = (e) => {
    setAnchorCreateFlow(e.currentTarget)
    setOpenCreateFlow(true)
    setFlowError('')
    // si hay carpeta activa, preseleccionarla
    setSelectedFolder(activeFolder !== 'Todos' ? activeFolder : '')
  }
  const handleCloseCreateFlow = () => {
    setOpenCreateFlow(false)
    setAnchorCreateFlow(null)
    setNewFlowName('')
    setSelectedFolder('')
    setFlowError('')
  }
  const today = () => {
    const d = new Date()
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth()+1).padStart(2, '0')
    const yyyy = d.getFullYear()
    return `${dd}/${mm}/${yyyy}`
  }
  const handleSubmitCreateFlow = async () => {
    const name = (newFlowName || '').trim()
    if (!name) { setFlowError('Ingresa un nombre'); return }
    const folder = (selectedFolder || '').trim()
    if (!folder) { setFlowError('Selecciona una carpeta'); return }
    const exists = flows.some(f => (f.folder_name || '') === folder && (f.name || '').toLowerCase() === name.toLowerCase())
    if (exists) { setFlowError('Ya existe un flujo con ese nombre en la carpeta'); return }
    try {
      const folderObj = folders.find(f => f.name === folder)
      const folderId = folderObj?.id || null
      const res = await fetch('/api/campaigns/flows', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, folderId }) })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Error al crear flujo')
      setFlows(prev => [data.item, ...prev])
      handleCloseCreateFlow()
    } catch (e) {
      setFlowError(e?.message || 'Error al crear flujo')
    }
  }

  const filteredFlows = useMemo(() => {
    const q = search.trim().toLowerCase()
    let base = flows
    if (activeFolder && activeFolder !== 'Todos') {
      base = base.filter(f => (f.folder_name || '') === activeFolder)
    }
    if (!q) return base
    return base.filter(f => (f.name || '').toLowerCase().includes(q))
  }, [search, flows, activeFolder])

  // Conteo dinámico de carpetas según flows
  const computedFolders = useMemo(() => {
    return folders.map(f => ({
      ...f,
      count: flows.filter(fl => (fl.folder_name || '') === f.name).length
    }))
  }, [folders, flows])

  // Menú de carpeta (editar/eliminar)
  const [folderMenuAnchor, setFolderMenuAnchor] = useState(null)
  const [folderMenuTarget, setFolderMenuTarget] = useState(null) // nombre de carpeta
  const openFolderMenu = Boolean(folderMenuAnchor)
  const handleOpenFolderMenu = (event, folderName) => {
    event.stopPropagation()
    setFolderMenuAnchor(event.currentTarget)
    setFolderMenuTarget(folderName)
  }
  const handleCloseFolderMenu = () => {
    setFolderMenuAnchor(null)
    // No limpiar folderMenuTarget aquí para que las acciones conozcan el objetivo
  }

  // Renombrar carpeta
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState('')
  const startRenameFolder = () => {
    setRenameValue(folderMenuTarget || '')
    setRenameError('')
    setRenameDialogOpen(true)
    handleCloseFolderMenu()
  }
  const closeRenameDialog = () => {
    setRenameDialogOpen(false)
    setRenameValue('')
    setRenameError('')
    setFolderMenuTarget(null)
  }
  const confirmRenameFolder = async () => {
    const newName = (renameValue || '').trim()
    if (!newName) { setRenameError('Ingresa un nombre'); return }
    const exists = computedFolders.some(f => f.name.toLowerCase() === newName.toLowerCase())
    if (exists && newName !== folderMenuTarget) { setRenameError('Ya existe una carpeta con ese nombre'); return }
    try {
      const target = folders.find(f => f.name === folderMenuTarget)
      if (!target) { setRenameError('Carpeta no encontrada'); return }
      const res = await fetch(`/api/campaigns/flow-folders/${target.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName }) })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Error al renombrar carpeta')
      await reloadFolders()
      await reloadFlows()
      if (activeFolder === folderMenuTarget) setActiveFolder(newName)
      closeRenameDialog()
    } catch (e) {
      setRenameError(e?.message || 'Error al renombrar carpeta')
    }
  }

  // Eliminar carpeta
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const startDeleteFolder = () => {
    setDeleteDialogOpen(true)
    handleCloseFolderMenu()
  }
  const closeDeleteDialog = () => { setDeleteDialogOpen(false); setFolderMenuTarget(null) }
  const confirmDeleteFolder = async () => {
    try {
      const target = folders.find(f => f.name === folderMenuTarget)
      if (!target) { closeDeleteDialog(); return }
      const res = await fetch(`/api/campaigns/flow-folders/${target.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Error al eliminar carpeta')
      await reloadFolders()
      await reloadFlows()
      if (activeFolder === target.name) setActiveFolder('Todos')
      closeDeleteDialog()
    } catch (e) {
      // Mostrar error mínimo
      alert(e?.message || 'Error al eliminar carpeta')
    }
  }

  // Navegar a Paso 2 (Programación de flujos)
  const goToProgramming = (flow) => {
    const params = new URLSearchParams()
    if (flow.id) params.set('id', String(flow.id))
    params.set('name', flow.name || '')
    params.set('folder', flow.folder_name || '')
    navigate(`/campaigns/ads/program?${params.toString()}`)
  }

  // Cargar datos desde API
  const reloadFolders = async () => {
    try {
      const res = await fetch('/api/campaigns/flow-folders')
      const data = await res.json()
      if (data.ok) setFolders(Array.isArray(data.items) ? data.items : [])
    } catch {}
  }
  const reloadFlows = async () => {
    try {
      const res = await fetch('/api/campaigns/flows')
      const data = await res.json()
      if (data.ok) setFlows(Array.isArray(data.items) ? data.items : [])
    } catch {}
  }
  useEffect(() => { reloadFolders(); reloadFlows() }, [])

  // Eliminar flujo
  const [deleteFlowDialogOpen, setDeleteFlowDialogOpen] = useState(false)
  const [deleteFlowTarget, setDeleteFlowTarget] = useState(null)
  const startDeleteFlow = (flow) => { setDeleteFlowTarget(flow); setDeleteFlowDialogOpen(true) }
  const closeDeleteFlowDialog = () => { setDeleteFlowDialogOpen(false); setDeleteFlowTarget(null) }
  const confirmDeleteFlow = async () => {
    try {
      if (!deleteFlowTarget?.id) { closeDeleteFlowDialog(); return }
      const res = await fetch(`/api/campaigns/flows/${deleteFlowTarget.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Error al eliminar flujo')
      await reloadFlows()
      closeDeleteFlowDialog()
    } catch (e) {
      alert(e?.message || 'Error al eliminar flujo')
    }
  }

  // Editar flujo (renombrar / mover de carpeta)
  const [editFlowDialogOpen, setEditFlowDialogOpen] = useState(false)
  const [editFlowTarget, setEditFlowTarget] = useState(null)
  const [editFlowName, setEditFlowName] = useState('')
  const [editFlowFolder, setEditFlowFolder] = useState('') // nombre de carpeta
  const [editFlowError, setEditFlowError] = useState('')
  const startEditFlow = (flow) => {
    setEditFlowTarget(flow)
    setEditFlowName(flow?.name || '')
    setEditFlowFolder(flow?.folder_name || '')
    setEditFlowError('')
    setEditFlowDialogOpen(true)
  }
  const closeEditFlowDialog = () => {
    setEditFlowDialogOpen(false)
    setEditFlowTarget(null)
    setEditFlowName('')
    setEditFlowFolder('')
    setEditFlowError('')
  }
  const confirmEditFlow = async () => {
    const name = (editFlowName || '').trim()
    const folderName = (editFlowFolder || '').trim() // '' permite mover a "sin carpeta"
    if (!name) { setEditFlowError('Ingresa un nombre'); return }
    // Validar duplicado en carpeta destino (ignorando el propio flujo)
    const dup = flows.some(f => (f.folder_name || '') === folderName && (f.name || '').toLowerCase() === name.toLowerCase() && f.id !== editFlowTarget?.id)
    if (dup) { setEditFlowError('Ya existe un flujo con ese nombre en la carpeta'); return }
    try {
      const folderId = folderName ? (folders.find(ff => ff.name === folderName)?.id || null) : null
      const res = await fetch(`/api/campaigns/flows/${editFlowTarget.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, folderId }) })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Error al actualizar flujo')
      await reloadFlows()
      closeEditFlowDialog()
    } catch (e) {
      setEditFlowError(e?.message || 'Error al actualizar flujo')
    }
  }

  return (
    <Stack spacing={3}>
      <Paper sx={{ p: 2 }}>
        {/* Encabezado pasos (ubicado dentro del contenido para mayor visibilidad) */}
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <Box sx={{ flex: 1, bgcolor: 'success.main', color: 'success.contrastText', p: 1.5, borderRadius: 1.5, textAlign: 'center', fontWeight: 600 }}>
            Paso 1  Creación de flujos
          </Box>
          <Box sx={{ flex: 1, bgcolor: 'success.main', opacity: 0.6, color: 'success.contrastText', p: 1.5, borderRadius: 1.5, textAlign: 'center', fontWeight: 600 }}>
            Paso 2  Programación de flujos
          </Box>
        </Box>

        
        {/* Barra superior: botones y buscador */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="h6">Flujos de conversación</Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="contained" color="success" endIcon={<AddIcon />} onClick={handleOpenCreate}>Crear carpeta</Button>
            <Button variant="contained" endIcon={<AddIcon />} onClick={handleOpenCreateFlow} disabled={!computedFolders.length}>Crear flujo</Button>
            <TextField size="small" placeholder="Buscar" value={search} onChange={(e)=>setSearch(e.target.value)} />
          </Box>
        </Box>

        {/* Popover Crear carpeta */}
        <Popover
          open={openCreate}
          anchorEl={anchorCreate}
          onClose={handleCloseCreate}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        >
          <Box sx={{ p: 2, width: 300, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <TextField
              autoFocus
              fullWidth
              placeholder="Nombre"
              value={newFolderName}
              onChange={(e)=>setNewFolderName(e.target.value)}
              error={!!createError}
              helperText={createError || ' '}
              onKeyDown={(e)=>{ if(e.key==='Enter'){ e.preventDefault(); handleSubmitCreate(); } }}
            />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2">Color</Typography>
              <input type="color" value={newFolderColor} onChange={(e)=>setNewFolderColor(e.target.value)} style={{ width: 40, height: 28, border: 'none', background: 'transparent', padding: 0 }} />
            </Box>
            <Button fullWidth variant="contained" onClick={handleSubmitCreate}>Crear carpeta</Button>
          </Box>
        </Popover>

        {/* Popover Crear flujo */}
        <Popover
          open={openCreateFlow}
          anchorEl={anchorCreateFlow}
          onClose={handleCloseCreateFlow}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        >
          <Box sx={{ p: 2, width: 320, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <TextField
              autoFocus
              fullWidth
              placeholder="Nombre"
              value={newFlowName}
              onChange={(e)=>setNewFlowName(e.target.value)}
            />
            <TextField
              select
              label="Carpeta"
              value={selectedFolder}
              onChange={(e)=>setSelectedFolder(e.target.value)}
              fullWidth
            >
              {computedFolders.map(f => (
                <MenuItem key={f.name} value={f.name}>{f.name}</MenuItem>
              ))}
            </TextField>
            {flowError && (<Typography color="error" variant="caption">{flowError}</Typography>)}
            <Button fullWidth variant="contained" onClick={handleSubmitCreateFlow}>Crear flujo</Button>
          </Box>
        </Popover>

        {/* Grid de carpetas */}
        <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 1.5 }}>
          {/* Tile Todos */}
          <Paper onClick={()=>setActiveFolder('Todos')} sx={{ p: 1.25, borderRadius: 2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid', borderColor: activeFolder==='Todos' ? 'success.light' : 'divider' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <FolderIcon color={activeFolder==='Todos' ? 'success' : 'disabled'} />
              <Typography fontWeight={600}>Todos los flujos</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" color="text.secondary">{flows.length}</Typography>
            </Box>
          </Paper>

          {(showAllFolders ? computedFolders : computedFolders.slice(0, 10)).map((f) => (
            <Paper key={f.name} onClick={()=>setActiveFolder(f.name)} sx={{ p: 1.25, borderRadius: 2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid', borderColor: activeFolder===f.name ? 'success.light' : 'divider' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <FolderIcon sx={{ color: getFolderColor(f.name) }} />
                <Typography sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" color="text.secondary">{f.count}</Typography>
                <IconButton size="small" onClick={(e)=>handleOpenFolderMenu(e, f.name)}>
                  <MoreVertIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                </IconButton>
              </Box>
            </Paper>
          ))}

          {/* Tile Mostrar más/menos */}
          {computedFolders.length > 10 && (
            <Paper sx={{ p: 1.25, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Button variant="text" onClick={()=>setShowAllFolders(v=>!v)}>{showAllFolders ? 'Mostrar menos' : 'Mostrar más'}</Button>
            </Paper>
          )}
        </Box>

        {computedFolders.length === 0 && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">Crea una carpeta para comenzar y luego añade flujos dentro.</Typography>
          </Box>
        )}

        {/* Menú contextual carpeta */}
        <Menu
          open={openFolderMenu}
          anchorEl={folderMenuAnchor}
          onClose={handleCloseFolderMenu}
        >
          <MenuItem onClick={startRenameFolder}>Renombrar</MenuItem>
          <MenuItem onClick={startDeleteFolder}>Eliminar</MenuItem>
        </Menu>

        {/* Dialogo renombrar */}
        <Dialog open={renameDialogOpen} onClose={closeRenameDialog}>
          <DialogTitle>Renombrar carpeta</DialogTitle>
          <DialogContent sx={{ pt: 1 }}>
            <TextField
              autoFocus
              fullWidth
              value={renameValue}
              onChange={(e)=>setRenameValue(e.target.value)}
              error={!!renameError}
              helperText={renameError || ' '}
              placeholder="Nuevo nombre"
              onKeyDown={(e)=>{ if(e.key==='Enter'){ e.preventDefault(); confirmRenameFolder(); } }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={closeRenameDialog}>Cancelar</Button>
            <Button variant="contained" onClick={confirmRenameFolder}>Guardar</Button>
          </DialogActions>
        </Dialog>

        {/* Dialogo eliminar */}
        <Dialog open={deleteDialogOpen} onClose={closeDeleteDialog}>
          <DialogTitle>Eliminar carpeta</DialogTitle>
          <DialogContent>
            <Typography>¿Deseas eliminar la carpeta "{folderMenuTarget}"? Los flujos quedarán sin carpeta.</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeDeleteDialog}>Cancelar</Button>
            <Button color="error" variant="contained" onClick={confirmDeleteFolder}>Eliminar</Button>
          </DialogActions>
        </Dialog>

        <Divider sx={{ my: 2 }} />

        {/* Tabla de flujos */}
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Nombre</TableCell>
              <TableCell>Connections</TableCell>
              <TableCell>Último cambio</TableCell>
              <TableCell align="right">Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
              {filteredFlows.map((f, i) => (
                <TableRow key={i} hover>
                <TableCell sx={{ width: 420 }}>
                  <Box
                    onDoubleClick={() => goToProgramming(f)}
                    sx={{
                      cursor: 'pointer',
                      display: 'inline-flex',
                      flexDirection: 'column',
                      gap: 0.5,
                      backgroundColor: getFolderColor(f.folder_name || ''),
                      color: getContrastColor(getFolderColor(f.folder_name || '')),
                      px: 1.5,
                      py: 1,
                      borderRadius: 2,
                      boxShadow: 1,
                      maxWidth: 380,
                      minWidth: 260,
                      transition: 'background-color 120ms ease',
                      '&:hover': { filter: 'brightness(0.95)' }
                    }}
                  >
                    <Typography
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.95rem',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}
                    >
                      {f.name}
                    </Typography>
                    {(f.folder_name || '') && (
                      <Typography variant="caption" sx={{ opacity: 0.9 }}>
                        {f.folder_name}
                      </Typography>
                    )}
                  </Box>
                </TableCell>
                <TableCell>
                  {(() => {
                    let conn = null
                    try {
                      conn = typeof f.connections === 'string' ? JSON.parse(f.connections) : f.connections
                    } catch {}
                    const steps = Array.isArray(conn?.steps) ? conn.steps : []
                    if (!steps.length) return (<Typography variant="body2" color="text.secondary">Sin pasos</Typography>)

                    const counts = steps.reduce((acc, s) => {
                      const t = (s?.type || '').toLowerCase()
                      const key = t === 'vcard' ? 'contacto' : t
                      acc[key] = (acc[key] || 0) + 1
                      return acc
                    }, {})
                    const labels = {
                      texto: 'Texto',
                      imagen: 'Imagen',
                      video: 'Video',
                      archivo: 'Archivo',
                      audio: 'Audio',
                      contacto: 'Contacto'
                    }
                    const previewText = steps.find(s => (s?.type || '').toLowerCase() === 'texto')?.payload?.text || ''
                    const snippet = (previewText || '').replace(/\s+/g, ' ').slice(0, 60)

                    return (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
                        <Chip size="small" color="default" label={`${steps.length} pasos`} />
                        {Object.entries(counts).map(([k, v]) => (
                          <Chip key={k} size="small" variant="outlined" label={`${labels[k] || k} ${v}`} />
                        ))}
                        {snippet && (
                          <Typography variant="caption" sx={{ ml: 0.5 }} color="text.secondary">“{snippet}{previewText.length > 60 ? '…' : ''}”</Typography>
                        )}
                      </Box>
                    )
                  })()}
                </TableCell>
              <TableCell>{f.updatedAt}</TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <Tooltip title="Editar">
                    <IconButton color="primary" size="small" onClick={() => goToProgramming(f)}>
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Renombrar">
                    <IconButton color="info" size="small" onClick={() => startEditFlow(f)} sx={{ ml: 0.5 }}>
                      <DriveFileRenameOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Mover">
                    <IconButton color="warning" size="small" onClick={() => startEditFlow(f)} sx={{ ml: 0.5 }}>
                      <DriveFileMoveOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Eliminar">
                    <IconButton color="error" size="small" onClick={() => startDeleteFlow(f)} sx={{ ml: 0.5 }}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
              </TableCell>
            </TableRow>
          ))}
          </TableBody>
        </Table>

        {/* Dialogo editar flujo */}
        <Dialog open={editFlowDialogOpen} onClose={closeEditFlowDialog}>
          <DialogTitle>Editar flujo</DialogTitle>
          <DialogContent sx={{ pt: 1 }}>
            <Stack spacing={2} sx={{ mt: 0.5 }}>
              <TextField
                label="Nombre"
                value={editFlowName}
                onChange={(e)=>setEditFlowName(e.target.value)}
                error={!!editFlowError}
                helperText={editFlowError || ' '}
                onKeyDown={(e)=>{ if(e.key==='Enter'){ e.preventDefault(); confirmEditFlow(); } }}
              />
              <TextField
                select
                label="Carpeta"
                value={editFlowFolder}
                onChange={(e)=>setEditFlowFolder(e.target.value)}
                fullWidth
              >
                <MenuItem value="">Sin carpeta</MenuItem>
                {computedFolders.map(f => (
                  <MenuItem key={f.name} value={f.name}>{f.name}</MenuItem>
                ))}
              </TextField>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeEditFlowDialog}>Cancelar</Button>
            <Button variant="contained" onClick={confirmEditFlow}>Guardar</Button>
          </DialogActions>
        </Dialog>

        {/* Dialogo eliminar flujo */}
        <Dialog open={deleteFlowDialogOpen} onClose={closeDeleteFlowDialog}>
          <DialogTitle>Eliminar flujo</DialogTitle>
          <DialogContent>
            <Typography>¿Deseas eliminar el flujo "{deleteFlowTarget?.name}"?</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeDeleteFlowDialog}>Cancelar</Button>
            <Button color="error" variant="contained" onClick={confirmDeleteFlow}>Eliminar</Button>
          </DialogActions>
        </Dialog>
      </Paper>
    </Stack>
  )
}