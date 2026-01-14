import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { Stack, Typography, Paper, Box, Button, TextField, Alert, Dialog, DialogTitle, DialogContent, DialogActions, Table, TableHead, TableRow, TableCell, TableBody, IconButton } from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'

export default function SettingsLabels() {
  const [labels, setLabels] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')

  const fetchLabels = useCallback(async (q = '') => {
    setLoading(true)
    setError(null)
    try {
      const url = q ? `/api/labels?q=${encodeURIComponent(q)}` : '/api/labels'
      const res = await fetch(url)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'No se pudo obtener las etiquetas')
      setLabels(Array.isArray(data.items) ? data.items : [])
    } catch (e) {
      setError(e.message || 'Error al listar etiquetas')
    } finally {
      setLoading(false)
    }
  }, [])

  const onSearchChange = (e) => {
    const v = e.target.value
    setQuery(v)
  }

  useEffect(() => { fetchLabels('') }, [fetchLabels])

  useEffect(() => {
    const id = setTimeout(() => { fetchLabels(query.trim()) }, 300)
    return () => clearTimeout(id)
  }, [query, fetchLabels])

  const openCreate = () => { setNewName(''); setNewDescription(''); setCreateOpen(true) }
  const closeCreate = () => { setCreateOpen(false) }

  const createLabel = async () => {
    setError(null)
    try {
      const name = String(newName || '').trim()
      const description = String(newDescription || '').trim()
      if (!name) { setError('Ingresa un nombre válido'); return }
      const res = await fetch('/api/labels', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description })
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'No se pudo crear la etiqueta')
      closeCreate()
      setNewName(''); setNewDescription('')
      await fetchLabels(query.trim())
    } catch (e) {
      setError(e.message || 'Error al crear etiqueta')
    }
  }

  const openEdit = (item) => {
    setEditItem(item)
    setEditName(item?.name || '')
    setEditDescription(item?.description || '')
    setEditOpen(true)
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
      const confirmUpdate = window.confirm('¿Confirmas actualizar la etiqueta?')
      if (!confirmUpdate) return
      const res = await fetch(`/api/labels/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description })
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'No se pudo actualizar')
      closeEdit()
      await fetchLabels(query.trim())
    } catch (e) {
      setError(e.message || 'Error al actualizar etiqueta')
    }
  }

  const onDelete = async (item) => {
    setError(null)
    try {
      const confirmDelete = window.confirm(`¿Eliminar la etiqueta "${item.name}"?`)
      if (!confirmDelete) return
      const res = await fetch(`/api/labels/${item.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'No se pudo eliminar')
      await fetchLabels(query.trim())
    } catch (e) {
      setError(e.message || 'Error al eliminar etiqueta')
    }
  }

  const tableRows = useMemo(() => labels.map((l) => (
    <TableRow key={l.id} hover>
      <TableCell width={40}>
        <input type="checkbox" aria-label={`seleccionar ${l.name}`} />
      </TableCell>
      <TableCell>{l.name}</TableCell>
      <TableCell>{l.description || ''}</TableCell>
      <TableCell align="right">
        <IconButton size="small" aria-label="Editar etiqueta" onClick={() => openEdit(l)}>
          <EditIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" aria-label="Eliminar etiqueta" color="error" onClick={() => onDelete(l)}>
          <DeleteIcon fontSize="small" />
        </IconButton>
      </TableCell>
    </TableRow>
  )), [labels])

  return (
    <Stack spacing={2}>
      <Typography variant="h5">Configuraciones</Typography>
      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="h6">Etiquetas</Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button variant="contained" onClick={openCreate}>Crear nueva etiqueta</Button>
            <TextField size="small" placeholder="Buscar" value={query} onChange={onSearchChange} />
          </Box>
        </Box>
        {error && (
          <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>{error}</Alert>
        )}
        <Box sx={{ mt: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell width={40}></TableCell>
                <TableCell>Nombre</TableCell>
                <TableCell>Descripción</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tableRows}
              {(!loading && labels.length === 0) && (
                <TableRow>
                  <TableCell colSpan={4} align="center">Sin etiquetas</TableCell>
                </TableRow>
              )}
              {(loading) && (
                <TableRow>
                  <TableCell colSpan={4} align="center">Cargando...</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      </Paper>

      <Dialog open={createOpen} onClose={closeCreate} maxWidth="sm" fullWidth>
        <DialogTitle>Crear nueva etiqueta</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Nombre" value={newName} onChange={(e)=>setNewName(e.target.value)} autoFocus />
            <TextField label="Descripción" value={newDescription} onChange={(e)=>setNewDescription(e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeCreate}>Cancelar</Button>
          <Button variant="contained" onClick={() => {
            const ok = window.confirm('¿Confirmas crear esta etiqueta?')
            if (ok) createLabel()
          }}>Crear nueva etiqueta</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editOpen} onClose={closeEdit} maxWidth="sm" fullWidth>
        <DialogTitle>Editar etiqueta</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Nombre" value={editName} onChange={(e)=>setEditName(e.target.value)} autoFocus />
            <TextField label="Descripción" value={editDescription} onChange={(e)=>setEditDescription(e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEdit}>Cancelar</Button>
          <Button variant="contained" onClick={saveEdit}>Guardar cambios</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}