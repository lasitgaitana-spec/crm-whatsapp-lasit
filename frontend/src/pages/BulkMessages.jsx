import React, { useEffect, useMemo, useState } from 'react'
import { Stack, Typography, Paper, Box, Button, TextField, Popover, IconButton, Tooltip, Table, TableHead, TableRow, TableCell, TableBody, Chip, Dialog, DialogTitle, DialogContent, DialogActions, MenuItem, Select, InputLabel, FormControl, Divider, Menu } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import FolderIcon from '@mui/icons-material/Folder'
import DriveFileMoveOutlinedIcon from '@mui/icons-material/DriveFileMoveOutlined'
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import { useNavigate } from 'react-router-dom'

export default function BulkMessages() {
  const navigate = useNavigate()
  const [folders, setFolders] = useState([])
  const [flows, setFlows] = useState([])
  const [search, setSearch] = useState('')
  const [activeFolder, setActiveFolder] = useState('Todos')
  const [showAllFolders, setShowAllFolders] = useState(false)

  const [anchorCreate, setAnchorCreate] = useState(null)
  const [openCreate, setOpenCreate] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderColor, setNewFolderColor] = useState('#1976d2')
  const [createError, setCreateError] = useState('')

  const [anchorFolderMenu, setAnchorFolderMenu] = useState(null)
  const [folderMenuName, setFolderMenuName] = useState('')
  const openFolderMenu = Boolean(anchorFolderMenu)
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState('')
  const [deleteFolderDialogOpen, setDeleteFolderDialogOpen] = useState(false)

  const [openCreateFlow, setOpenCreateFlow] = useState(false)
  const [flowName, setFlowName] = useState('')
  const [flowFolderId, setFlowFolderId] = useState('')
  const [createFlowError, setCreateFlowError] = useState('')

  const [deleteFlowDialog, setDeleteFlowDialog] = useState(false)
  const [deleteFlowTarget, setDeleteFlowTarget] = useState(null)

  const [editFlowDialog, setEditFlowDialog] = useState(false)
  const [editFlowTarget, setEditFlowTarget] = useState(null)
  const [editFlowName, setEditFlowName] = useState('')
  const [editFlowFolderId, setEditFlowFolderId] = useState('')

  const computedFolders = useMemo(() => {
    return folders.map(f => ({
      ...f,
      count: flows.filter(fl => (fl.folder_name || '') === f.name).length
    }))
  }, [folders, flows])

  const getContrastColor = (hex) => {
    const h = String(hex || '').replace('#','')
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return '#fff'
    const r = parseInt(h.slice(0,2), 16)
    const g = parseInt(h.slice(2,4), 16)
    const b = parseInt(h.slice(4,6), 16)
    const yiq = (r*299 + g*587 + b*114) / 1000
    return yiq >= 128 ? '#000' : '#fff'
  }

  const getFolderColor = (folderName) => {
    const f = folders.find(ff => ff.name === folderName)
    return f?.color || '#1976d2'
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
    setNewFolderColor('#1976d2')
    setCreateError('')
  }

  const handleOpenFolderMenu = (e, name) => {
    e.stopPropagation()
    setAnchorFolderMenu(e.currentTarget)
    setFolderMenuName(name)
  }
  const handleCloseFolderMenu = () => {
    setAnchorFolderMenu(null)
    setFolderMenuName('')
  }

  const startRenameFolder = () => {
    setRenameValue(folderMenuName || '')
    setRenameError('')
    setRenameDialogOpen(true)
    handleCloseFolderMenu()
  }
  const closeRenameDialog = () => { setRenameDialogOpen(false); setRenameValue(''); setRenameError('') }
  const confirmRenameFolder = async () => {
    const newName = (renameValue || '').trim()
    if (!newName) { setRenameError('Ingresa un nombre'); return }
    const target = folders.find(f => f.name === folderMenuName)
    if (!target) { setRenameError('Carpeta no encontrada'); return }
    try {
      const res = await fetch(`/api/bulk/flow-folders/${target.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName }) })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Error al renombrar carpeta')
      await loadFolders()
      await loadFlows()
      if (activeFolder === folderMenuName) setActiveFolder(newName)
      setRenameDialogOpen(false)
    } catch (e) {
      setRenameError(e?.message || 'Error al renombrar carpeta')
    }
  }
  const startDeleteFolder = () => { setDeleteFolderDialogOpen(true); handleCloseFolderMenu() }
  const closeDeleteFolderDialog = () => { setDeleteFolderDialogOpen(false) }
  const confirmDeleteFolder = async () => {
    const target = folders.find(f => f.name === folderMenuName)
    if (!target) { closeDeleteFolderDialog(); return }
    try {
      const res = await fetch(`/api/bulk/flow-folders/${target.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Error al eliminar carpeta')
      await loadFolders()
      await loadFlows()
      if (activeFolder === target.name) setActiveFolder('Todos')
      closeDeleteFolderDialog()
    } catch (e) {
      alert(e?.message || 'Error al eliminar carpeta')
    }
  }

  const handleOpenCreateFlow = () => {
    setFlowName('')
    setFlowFolderId('')
    setCreateFlowError('')
    setOpenCreateFlow(true)
  }
  const handleCloseCreateFlow = () => setOpenCreateFlow(false)

  const goToProgramming = (flow) => {
    const params = new URLSearchParams()
    if (flow.id) params.set('id', String(flow.id))
    params.set('name', flow.name || '')
    params.set('folder', flow.folder_name || '')
    navigate(`/campaigns/bulk-messages/program?${params.toString()}`)
  }

  const startEditFlow = (flow) => {
    setEditFlowTarget(flow)
    setEditFlowName(flow.name || '')
    setEditFlowFolderId(flow.folder_id || '')
    setEditFlowDialog(true)
  }
  const closeEditFlow = () => setEditFlowDialog(false)

  const confirmEditFlow = async () => {
    try {
      const name = String(editFlowName || '').trim()
      const folderId = editFlowFolderId ? Number(editFlowFolderId) : null
      if (!name) return setCreateFlowError('Nombre requerido')
      const res = await fetch(`/api/bulk/flows/${editFlowTarget.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, folderId }) })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Error al renombrar flujo')
      setEditFlowDialog(false)
      await loadFlows()
    } catch (e) {
      setCreateFlowError(e?.message || String(e))
    }
  }

  const startDeleteFlow = (flow) => { setDeleteFlowTarget(flow); setDeleteFlowDialog(true) }
  const closeDeleteFlow = () => setDeleteFlowDialog(false)
  const confirmDeleteFlow = async () => {
    try {
      const res = await fetch(`/api/bulk/flows/${deleteFlowTarget.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Error al eliminar flujo')
      setDeleteFlowDialog(false)
      await loadFlows()
    } catch (e) {
      setCreateFlowError(e?.message || String(e))
    }
  }

  const createFolder = async () => {
    try {
      const name = String(newFolderName || '').trim()
      const color = String(newFolderColor || '').trim()
      if (!name) return setCreateError('Nombre requerido')
  const res = await fetch('/api/bulk/flow-folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, color: newFolderColor }) })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Error al crear carpeta')
      setOpenCreate(false)
      await loadFolders()
    } catch (e) {
      setCreateError(e?.message || String(e))
    }
  }

  const createFlow = async () => {
    try {
      const name = String(flowName || '').trim()
      const folderId = flowFolderId ? Number(flowFolderId) : null
      if (!name) return setCreateFlowError('Nombre requerido')
      const res = await fetch('/api/bulk/flows', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, folderId }) })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Error al crear flujo')
      setOpenCreateFlow(false)
      await loadFlows()
    } catch (e) {
      setCreateFlowError(e?.message || String(e))
    }
  }

  const loadFolders = async () => {
    try {
      const res = await fetch('/api/bulk/flow-folders')
      const data = await res.json()
      setFolders(Array.isArray(data.items) ? data.items : [])
    } catch {}
  }
  const loadFlows = async () => {
    try {
      const res = await fetch('/api/bulk/flows')
      const data = await res.json()
      setFlows(Array.isArray(data.items) ? data.items : [])
    } catch {}
  }

  useEffect(() => { loadFolders(); loadFlows() }, [])

  const filtered = useMemo(() => {
    const q = String(search || '').trim().toLowerCase()
    let base = flows
    if (activeFolder && activeFolder !== 'Todos') {
      base = base.filter(f => (f.folder_name || '') === activeFolder)
    }
    if (!q) return base
    return base.filter(f => (f.name || '').toLowerCase().includes(q))
  }, [flows, search, activeFolder])

  return (
    <Stack spacing={3}>
      <Paper sx={{ p: 2 }}>
        {/* Encabezado pasos */}
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <Box sx={{ flex: 1, bgcolor: 'primary.main', color: 'primary.contrastText', p: 1.5, borderRadius: 1.5, textAlign: 'center', fontWeight: 600 }}>
            Paso 1  Creación de flujos
          </Box>
          <Box sx={{ flex: 1, bgcolor: 'primary.main', opacity: 0.6, color: 'primary.contrastText', p: 1.5, borderRadius: 1.5, textAlign: 'center', fontWeight: 600 }}>
            Paso 2  Programación de flujos
          </Box>
        </Box>

        {/* Barra superior: botones y buscador */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="h6">Mensajes masivos</Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="contained" color="primary" endIcon={<AddIcon />} onClick={handleOpenCreate}>Crear carpeta</Button>
            <Button variant="contained" color="success" endIcon={<AddIcon />} onClick={handleOpenCreateFlow} disabled={!computedFolders.length}>Crear flujo</Button>
            <TextField size="small" placeholder="Buscar" value={search} onChange={(e)=>setSearch(e.target.value)} />
          </Box>
        </Box>

        {/* Popover Crear carpeta */}
        <Popover
          open={openCreate}
          anchorEl={anchorCreate}
          onClose={handleCloseCreate}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <Box sx={{ p: 2, width: 360 }}>
            <Typography sx={{ fontWeight: 600, mb: 1 }}>Nueva carpeta</Typography>
            <TextField fullWidth label="Nombre" value={newFolderName} onChange={(e)=>setNewFolderName(e.target.value)} sx={{ mb: 1 }} />
            <Typography variant="body2">Color</Typography>
            <input type="color" value={newFolderColor} onChange={(e)=>setNewFolderColor(e.target.value)} style={{ width: 40, height: 28, border: 'none', background: 'transparent', padding: 0 }} />
            {createError && <Typography color="error" variant="caption">{createError}</Typography>}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              <Button onClick={handleCloseCreate}>Cancelar</Button>
              <Button variant="contained" onClick={createFolder}>Crear</Button>
            </Box>
          </Box>
        </Popover>

        {/* Grid de carpetas */}
        <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 1.5 }}>
          {/* Tile Todos */}
          <Paper onClick={()=>setActiveFolder('Todos')} sx={{ p: 1.25, borderRadius: 2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid', borderColor: activeFolder==='Todos' ? 'primary.light' : 'divider' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <FolderIcon color={activeFolder==='Todos' ? 'primary' : 'disabled'} />
              <Typography fontWeight={600}>Todos los flujos</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" color="text.secondary">{flows.length}</Typography>
            </Box>
          </Paper>

          {(showAllFolders ? computedFolders : computedFolders.slice(0, 10)).map((f) => (
            <Paper key={f.name} onClick={()=>setActiveFolder(f.name)} sx={{ p: 1.25, borderRadius: 2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid', borderColor: activeFolder===f.name ? 'primary.light' : 'divider' }}>
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
          anchorEl={anchorFolderMenu}
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

        {/* Dialogo eliminar carpeta */}
        <Dialog open={deleteFolderDialogOpen} onClose={closeDeleteFolderDialog}>
          <DialogTitle>Eliminar carpeta</DialogTitle>
          <DialogContent>
            <Typography>¿Deseas eliminar la carpeta "{folderMenuName}"? Los flujos quedarán sin carpeta.</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeDeleteFolderDialog}>Cancelar</Button>
            <Button color="error" variant="contained" onClick={confirmDeleteFolder}>Eliminar</Button>
          </DialogActions>
        </Dialog>

        {/* Tabla de flujos */}
        <Paper variant="outlined" sx={{ mt: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell width={320}>Nombre</TableCell>
                <TableCell>Connections</TableCell>
                <TableCell width={160}>Último cambio</TableCell>
                <TableCell width={180} align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map(f => (
                <TableRow key={f.id} hover>
                  <TableCell>
                    <Box
                      onClick={() => goToProgramming(f)}
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
        </Paper>
      </Paper>

      {/* Dialogo crear flujo */}
      <Dialog open={openCreateFlow} onClose={handleCloseCreateFlow}>
        <DialogTitle>Nuevo flujo</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField fullWidth label="Nombre" value={flowName} onChange={(e)=>setFlowName(e.target.value)} />
            <FormControl fullWidth>
              <InputLabel id="folder-select-label">Carpeta</InputLabel>
              <Select labelId="folder-select-label" label="Carpeta" value={String(flowFolderId)} onChange={(e)=>setFlowFolderId(e.target.value)}>
                <MenuItem value="">Sin carpeta</MenuItem>
                {folders.map(f => (
                  <MenuItem key={f.id} value={String(f.id)}>{f.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            {createFlowError && <Typography color="error" variant="caption">{createFlowError}</Typography>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseCreateFlow}>Cancelar</Button>
          <Button variant="contained" onClick={createFlow}>Crear</Button>
        </DialogActions>
      </Dialog>

      {/* Dialogo eliminar flujo */}
      <Dialog open={deleteFlowDialog} onClose={closeDeleteFlow}>
        <DialogTitle>Eliminar flujo</DialogTitle>
        <DialogContent>
          <Typography>¿Seguro que deseas eliminar este flujo? Esta acción no se puede deshacer.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDeleteFlow}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={confirmDeleteFlow}>Eliminar</Button>
        </DialogActions>
      </Dialog>

      {/* Dialogo editar flujo */}
      <Dialog open={editFlowDialog} onClose={closeEditFlow}>
        <DialogTitle>Editar flujo</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField fullWidth label="Nombre" value={editFlowName} onChange={(e)=>setEditFlowName(e.target.value)} />
            <FormControl fullWidth>
              <InputLabel id="edit-folder-select-label">Carpeta</InputLabel>
              <Select labelId="edit-folder-select-label" label="Carpeta" value={String(editFlowFolderId)} onChange={(e)=>setEditFlowFolderId(e.target.value)}>
                <MenuItem value="">Sin carpeta</MenuItem>
                {folders.map(f => (
                  <MenuItem key={f.id} value={String(f.id)}>{f.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEditFlow}>Cancelar</Button>
          <Button variant="contained" onClick={confirmEditFlow}>Guardar</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}