import React, { useEffect, useMemo, useState } from 'react'
import { Stack, Typography, Paper, Box, Button, TextField, Alert, Dialog, DialogTitle, DialogContent, DialogActions, Table, TableHead, TableRow, TableCell, TableBody, IconButton, FormControl, InputLabel, Select, MenuItem, Chip } from '@mui/material'
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'

export default function SettingsFields() {
  const [fields, setFields] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newFolderId, setNewFolderId] = useState('')
  const [newType, setNewType] = useState('text')
  const [editOpen, setEditOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editFolderId, setEditFolderId] = useState('')
  const [editType, setEditType] = useState('text')

  const [folders, setFolders] = useState([])
  const [folderFilter, setFolderFilter] = useState('')
  const [folderOpen, setFolderOpen] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [manageFolderOpen, setManageFolderOpen] = useState(false)
  const [manageFolderName, setManageFolderName] = useState('')

  const fetchFields = async (q = '') => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (folderFilter) params.set('folderId', String(folderFilter))
      const res = await fetch(`/api/fields${params.toString() ? `?${params.toString()}` : ''}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'No se pudo cargar')
      setFields(data.items || [])
    } catch (e) {
      setError(e.message || 'Error cargando campos')
    } finally { setLoading(false) }
  }

  const fetchFolders = async () => {
    try {
      const res = await fetch('/api/field-folders')
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'No se pudo cargar carpetas')
      setFolders(data.items || [])
    } catch (e) {
      // opcional: manejar errores de carpetas
    }
  }

  useEffect(() => { fetchFields(''); fetchFolders() }, [])
  useEffect(() => { fetchFields(query.trim()) }, [folderFilter])

  const openCreate = () => { setNewName(''); setNewDescription(''); setNewFolderId(''); setCreateOpen(true) }
  const typeOptions = [
    { value: 'text', label: 'Texto' },
    { value: 'number', label: 'Número' },
    { value: 'date', label: 'Fecha' },
    { value: 'datetime', label: 'Fecha y hora' },
  ]
  const closeCreate = () => { setCreateOpen(false) }

  const createField = async () => {
    setError(null)
    try {
      const name = String(newName || '').trim()
      const description = String(newDescription || '').trim()
      if (!name) { setError('Ingresa un nombre válido'); return }
      const body = { name, description, type: newType }
      if (newFolderId) body.folderId = Number(newFolderId)
      const res = await fetch('/api/fields', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'No se pudo crear')
      closeCreate()
      await fetchFields(query.trim())
    } catch (e) {
      setError(e.message || 'Error al crear campo')
    }
  }

  const openEdit = (item) => {
    if (item.is_system) {
      setError('No se pueden editar campos prediseñados del sistema')
      return
    }
    setEditItem(item); setEditName(item?.name || ''); setEditDescription(item?.description || ''); setEditFolderId(item?.folder_id || item?.folderId || ''); setEditType(item?.type || 'text'); setEditOpen(true)
  }
  const closeEdit = () => { setEditOpen(false); setEditItem(null) }

  const saveEdit = async () => {
    setError(null)
    try {
      const id = editItem?.id
      const name = String(editName || '').trim()
      const description = String(editDescription || '').trim()
      if (!id) { setError('Elemento inválido'); return }
      if (!name) { setError('Ingresa un nombre válido'); return }
      const ok = window.confirm('¿Confirmas actualizar el campo?')
      if (!ok) return
      const body = { name, description, type: editType }
      body.folderId = editFolderId ? Number(editFolderId) : null
      const res = await fetch(`/api/fields/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'No se pudo actualizar')
      closeEdit()
      await fetchFields(query.trim())
    } catch (e) { setError(e.message || 'Error al actualizar campo') }
  }

  const onDelete = async (item) => {
    if (item.is_system) {
      setError('No se pueden eliminar campos prediseñados del sistema')
      return
    }
    setError(null)
    try {
      const ok = window.confirm(`¿Eliminar el campo "${item.name}"?`)
      if (!ok) return
      const res = await fetch(`/api/fields/${item.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'No se pudo eliminar')
      await fetchFields(query.trim())
    } catch (e) { setError(e.message || 'Error al eliminar campo') }
  }

  const tableRows = useMemo(() => fields.map((f) => (
    <TableRow key={f.id} hover sx={{ opacity: f.is_system ? 0.8 : 1 }}>
      <TableCell width={40}><input type="checkbox" aria-label={`seleccionar ${f.name}`} disabled={f.is_system} /></TableCell>
      <TableCell>
        <Stack direction="row" spacing={1} alignItems="center">
          <span>{f.name}</span>
          {Boolean(f.is_system) ? <Chip label="Sistema" size="small" color="primary" variant="outlined" /> : null}
        </Stack>
      </TableCell>
      <TableCell>{f.description || ''}</TableCell>
      <TableCell>{typeOptions.find(t=>t.value===f.type)?.label || ''}</TableCell>
      <TableCell>{f.folder_name || ''}</TableCell>
      <TableCell align="right">
        <IconButton 
          size="small" 
          aria-label="Editar campo" 
          onClick={() => openEdit(f)}
          disabled={f.is_system}
        >
          <EditIcon fontSize="small" />
        </IconButton>
        <IconButton 
          size="small" 
          aria-label="Eliminar campo" 
          color="error" 
          onClick={() => onDelete(f)}
          disabled={f.is_system}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      </TableCell>
    </TableRow>
  )), [fields])

  return (
    <Stack spacing={3} sx={{ p: 3 }}>
      <Typography variant="h4">Campos personalizados</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <Paper sx={{ p: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between">
          <Stack direction="row" spacing={1}>
            <Button variant="contained" color="success" onClick={() => { const ok = window.confirm('¿Crear nuevo campo?'); if (ok) openCreate() }}>Crear campo del usuario</Button>
            <Button variant="outlined" color="success" startIcon={<CreateNewFolderIcon />} onClick={() => setFolderOpen(true)}>Crear carpeta</Button>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField placeholder="Buscar" value={query} onChange={(e)=>setQuery(e.target.value)} onKeyDown={(e)=>{ if(e.key==='Enter'){ fetchFields(query.trim()) } }} sx={{ maxWidth: 240 }} />
            <FormControl sx={{ minWidth: 180 }}>
              <InputLabel id="folder-filter-label">Carpeta</InputLabel>
              <Select labelId="folder-filter-label" label="Carpeta" value={folderFilter} onChange={(e)=>setFolderFilter(e.target.value)}>
                <MenuItem value=""><em>Todas</em></MenuItem>
                {folders.map(f => (<MenuItem key={f.id} value={String(f.id)}>{f.name}</MenuItem>))}
              </Select>
            </FormControl>
            {folderFilter && (
              <Button variant="outlined" onClick={() => { const f = folders.find(x=>String(x.id)===String(folderFilter)); setManageFolderName(f?.name || ''); setManageFolderOpen(true) }}>Editar carpeta</Button>
            )}
          </Stack>
        </Stack>
        <Box sx={{ mt: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell width={40}></TableCell>
                <TableCell>Nombre</TableCell>
                <TableCell>Descripción</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Carpeta</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6}><Typography variant="body2">Cargando...</Typography></TableCell></TableRow>
              ) : (
                tableRows
              )}
            </TableBody>
          </Table>
        </Box>
      </Paper>

      <Dialog open={createOpen} onClose={closeCreate} maxWidth="sm" fullWidth>
        <DialogTitle>Crear nuevo campo</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Nombre" value={newName} onChange={(e)=>setNewName(e.target.value)} autoFocus />
            <TextField label="Descripción" value={newDescription} onChange={(e)=>setNewDescription(e.target.value)} />
            <FormControl>
              <InputLabel id="new-type-label">Tipo</InputLabel>
              <Select labelId="new-type-label" label="Tipo" value={newType} onChange={(e)=>setNewType(e.target.value)}>
                {typeOptions.map(opt => (<MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>))}
              </Select>
            </FormControl>
            <FormControl>
              <InputLabel id="new-folder-label">Carpeta</InputLabel>
              <Select labelId="new-folder-label" label="Carpeta" value={newFolderId} onChange={(e)=>setNewFolderId(e.target.value)}>
                <MenuItem value=""><em>Ninguna</em></MenuItem>
                {folders.map(f => (<MenuItem key={f.id} value={String(f.id)}>{f.name}</MenuItem>))}
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeCreate}>Cancelar</Button>
          <Button variant="contained" onClick={() => { const ok = window.confirm('¿Confirmas crear este campo?'); if(ok) createField() }}>Crear campo</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editOpen} onClose={closeEdit} maxWidth="sm" fullWidth>
        <DialogTitle>Editar campo</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Nombre" value={editName} onChange={(e)=>setEditName(e.target.value)} autoFocus />
            <TextField label="Descripción" value={editDescription} onChange={(e)=>setEditDescription(e.target.value)} />
            <FormControl>
              <InputLabel id="edit-type-label">Tipo</InputLabel>
              <Select labelId="edit-type-label" label="Tipo" value={editType} onChange={(e)=>setEditType(e.target.value)}>
                {typeOptions.map(opt => (<MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>))}
              </Select>
            </FormControl>
            <FormControl>
              <InputLabel id="edit-folder-label">Carpeta</InputLabel>
              <Select labelId="edit-folder-label" label="Carpeta" value={editFolderId} onChange={(e)=>setEditFolderId(e.target.value)}>
                <MenuItem value=""><em>Ninguna</em></MenuItem>
                {folders.map(f => (<MenuItem key={f.id} value={String(f.id)}>{f.name}</MenuItem>))}
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEdit}>Cancelar</Button>
          <Button variant="contained" onClick={saveEdit}>Guardar cambios</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={folderOpen} onClose={()=>setFolderOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Crear carpeta</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField placeholder="Ingrese el nombre" value={folderName} onChange={(e)=>setFolderName(e.target.value)} autoFocus />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=>setFolderOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={async ()=>{
            const name = String(folderName || '').trim()
            if(!name){ setError('Ingresa un nombre de carpeta'); return }
            const ok = window.confirm('¿Confirmas crear la carpeta?')
            if(!ok) return
            const res = await fetch('/api/field-folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
            const data = await res.json()
            if(!data.ok){ setError(data.error || 'No se pudo crear carpeta'); return }
            setFolderOpen(false); setFolderName(''); await fetchFolders()
          }}>Crear carpeta</Button>
        </DialogActions>
      </Dialog>

      {/* Gestión de carpeta seleccionada: renombrar y eliminar */}
      <Dialog open={Boolean(folderFilter) && manageFolderOpen} onClose={()=>setManageFolderOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Editar carpeta</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Nombre" value={manageFolderName} onChange={(e)=>setManageFolderName(e.target.value)} autoFocus />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="error" onClick={async ()=>{
            const id = Number(folderFilter)
            const ok = window.confirm('¿Eliminar esta carpeta? Los campos quedarán sin carpeta.')
            if(!ok) return
            const res = await fetch(`/api/field-folders/${id}`, { method: 'DELETE' })
            const data = await res.json()
            if(!data.ok){ setError(data.error || 'No se pudo eliminar carpeta'); return }
            setManageFolderOpen(false); setFolderFilter(''); await fetchFolders(); await fetchFields(query.trim())
          }}>Eliminar</Button>
          <Button onClick={()=>setManageFolderOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={async ()=>{
            const id = Number(folderFilter)
            const name = String(manageFolderName || '').trim()
            if(!name){ setError('Ingresa un nombre'); return }
            const res = await fetch(`/api/field-folders/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
            const data = await res.json()
            if(!data.ok){ setError(data.error || 'No se pudo actualizar carpeta'); return }
            setManageFolderOpen(false); await fetchFolders(); await fetchFields(query.trim())
          }}>Guardar</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}