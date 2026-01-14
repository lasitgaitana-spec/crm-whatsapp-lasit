import React, { useEffect, useState } from 'react'
import { Stack, Typography, Paper, Grid, Card, CardContent, CardActions, Button, Chip, CardActionArea, IconButton, Box, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import { useNavigate } from 'react-router-dom'

export default function AgentsList() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const openDeleteModal = (id) => { setConfirmDeleteId(id); setConfirmOpen(true) }
  const handleConfirmDelete = async () => {
    if (!confirmDeleteId) return
    setDeleteLoading(true)
    try {
      const res = await fetch(`/api/agents/${confirmDeleteId}`, { method: 'DELETE' })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error || 'No se pudo eliminar')
      setItems(items => items.filter(x => x.id !== confirmDeleteId))
      setConfirmOpen(false)
      setConfirmDeleteId(null)
    } catch (e) {
      setError(e.message || 'Error al eliminar')
    } finally {
      setDeleteLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await fetch('/api/agents')
        // Parseo seguro del cuerpo: evita "Unexpected end of JSON input"
        let j
        try {
          const text = await res.text()
          j = text ? JSON.parse(text) : { ok: false, error: 'Respuesta vacía del servidor' }
        } catch (e) {
          j = { ok: false, error: 'Respuesta inválida del servidor' }
        }
        if (!res.ok || !j.ok) throw new Error(j.error || 'No se pudo cargar')
        if (!cancelled) setItems(j.items || [])
      } catch (e) {
        if (!cancelled) setError(e.message || 'Error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [])

  return (
    <Stack spacing={2}>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>Agentes</Typography>
      <Paper sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }} elevation={0}>
        {error && <Typography color="error">{error}</Typography>}
        {loading ? (
          <Typography color="text.secondary">Cargando...</Typography>
        ) : items.length === 0 ? (
          <Stack spacing={2} alignItems="center" sx={{ py: 6 }}>
            <Typography color="text.secondary">No hay agentes aún</Typography>
            <Button variant="contained" onClick={()=>navigate('/agents/create')}>Crear agente</Button>
          </Stack>
        ) : (
          <>
            <Grid container spacing={3}>
              {items.map(item => (
                <Grid item xs={12} sm={6} md={4} key={item.id}>
                  <Card variant="outlined" sx={{ position: 'relative', borderRadius: 3, boxShadow: 4, height: 260, '&:hover .card-hover-actions': { opacity: 1 } }}>
                    <CardActionArea onClick={()=>navigate(`/agents/create?id=${item.id}`)} sx={{ height: '100%' }}>
                    <CardContent sx={{ p: 3 }}>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                        <PersonOutlineIcon sx={{ color: 'primary.main' }} />
                        <Typography variant="h5" sx={{ fontWeight: 800 }}>{item.name}</Typography>
                      </Stack>
                      {item.advisorName ? (
                        <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 0.5 }}>
                          Asesor: {item.advisorName}
                        </Typography>
                      ) : null}
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip size="small" label={`${item.sections} secciones`} />
                        <Typography variant="body2" color="text.secondary">Actualizado: {item.updatedAt}</Typography>
                      </Stack>
                    </CardContent>
                    </CardActionArea>
                    <Box className="card-hover-actions" sx={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 0.5, opacity: 0, transition: 'opacity 0.2s ease', backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 2, p: 0.5 }}>
                      <IconButton size="small" aria-label="editar" onClick={(e)=>{ e.stopPropagation(); navigate(`/agents/create?id=${item.id}`) }}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" aria-label="eliminar" color="error" onClick={(e)=>{ e.stopPropagation(); openDeleteModal(item.id) }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Card>
                </Grid>
              ))}
            </Grid>
            {/* Modal de confirmación de eliminación */}
            <Dialog open={confirmOpen} onClose={()=>{ if(!deleteLoading){ setConfirmOpen(false); setConfirmDeleteId(null) } }}>
              <DialogTitle>Eliminar agente</DialogTitle>
              <DialogContent>
                <Typography>Esta acción eliminará el agente y sus secciones. ¿Deseas continuar?</Typography>
              </DialogContent>
              <DialogActions>
                <Button onClick={()=>{ setConfirmOpen(false); setConfirmDeleteId(null) }} disabled={deleteLoading}>Cancelar</Button>
                <Button color="error" variant="contained" onClick={handleConfirmDelete} disabled={deleteLoading}>{deleteLoading ? 'Eliminando...' : 'Eliminar'}</Button>
              </DialogActions>
            </Dialog>
          </>
        )}
      </Paper>
    </Stack>
  )
}