import React, { useEffect, useState } from 'react'
import { Stack, Typography, Paper, TextField, Button, Alert, Chip, Tooltip } from '@mui/material'

export default function SettingsAnthropicApiKey() {
  const [apiKey, setApiKey] = useState('')
  const [status, setStatus] = useState({ configured: false, masked: '', connected: false, reason: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadStatus = async () => {
    try {
      setError('')
      const r = await fetch('/api/settings/anthropic/apikey/status')
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'Error al cargar estado')
      setStatus({ configured: !!j.configured, masked: j.masked || '', connected: !!j.connected, reason: j.reason || '' })
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => { loadStatus() }, [])

  const save = async () => {
    try {
      setSaving(true)
      setError('')
      setSuccess('')
      const r = await fetch('/api/settings/anthropic/apikey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey })
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'No se pudo guardar la API Key')
      setApiKey('')
      setSuccess('API Key guardada correctamente')
      await loadStatus()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5">Anthropic – API Key</Typography>
      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          {success ? <Alert severity="success">{success}</Alert> : null}
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2">
              Estado: {status.configured ? `Configurada (${status.masked})` : 'No configurada'}
            </Typography>
            <Tooltip title={status.connected ? 'Conectado correctamente' : (status.reason || 'Sin conexión')}>
              <Chip size="small" label={status.connected ? 'Servidor: Conectado' : 'Servidor: Sin conexión'} color={status.connected ? 'success' : 'error'} />
            </Tooltip>
          </Stack>
          {!status.connected ? (
            <Typography variant="caption" color="text.secondary">
              {status.reason || 'Revisa tu conexión o API Key.'}
            </Typography>
          ) : null}
          <TextField label="Nueva API Key de Anthropic" type="password" value={apiKey} onChange={(e)=>setApiKey(e.target.value)} fullWidth />
          <Button variant="contained" onClick={save} disabled={saving || !apiKey}>Guardar</Button>
        </Stack>
      </Paper>
    </Stack>
  )
}