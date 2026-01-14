import React, { useEffect, useState, useCallback } from 'react'
import { Stack, Typography, Paper, Box, Button, Alert, TextField, Divider } from '@mui/material'

export default function SettingsConnection() {
  const [status, setStatus] = useState('idle')
  const [user, setUser] = useState(null)
  const [phone, setPhone] = useState(null)
  const [qr, setQr] = useState(null)
  const [activity, setActivity] = useState({ unreadCount: 0, lastMessage: null })
  const [error, setError] = useState(null)
  const [pairPhone, setPairPhone] = useState('')
  const [pairCode, setPairCode] = useState(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/wa/status')
      const data = await res.json()
      setStatus(data.status || 'idle')
      if ((data.status || 'idle') === 'connected') {
        await fetchMe()
        setQr(null)
      } else if ((data.status || 'idle') === 'qr') {
        await fetchQr()
      } else {
        setQr(null)
        setUser(null)
        setPhone(null)
      }
    } catch (e) { setError('No se pudo obtener el estado') }
  }, [])

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch('/api/wa/me')
      const data = await res.json()
      if (data.ok) {
        setUser(data.user || null)
        setPhone(data.phoneNumber || null)
      }
    } catch (e) {}
  }, [])

  const fetchQr = useCallback(async () => {
    try {
      const res = await fetch('/api/wa/qr')
      const data = await res.json()
      setStatus(data.status || 'idle')
      setQr(data.qr || null)
    } catch (e) { setError('No se pudo obtener el QR') }
  }, [])

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch('/api/wa/activity')
      const data = await res.json()
      if (data.ok) setActivity({ unreadCount: data.unreadCount || 0, lastMessage: data.lastMessage || null })
    } catch (e) {}
  }, [])

  const start = useCallback(async () => {
    setError(null)
    setPairCode(null)
    try {
      await fetch('/api/wa/start', { method: 'POST' })
      await fetchStatus()
      await fetchQr()
    } catch (e) { setError('No se pudo iniciar la conexión') }
  }, [fetchStatus, fetchQr])

  const reconnect = useCallback(async () => {
    setError(null)
    try {
      await fetch('/api/wa/reconnect', { method: 'POST' })
      await fetchStatus()
      await fetchQr()
    } catch (e) { setError('No se pudo forzar la reconexión') }
  }, [fetchStatus, fetchQr])

  const disconnect = useCallback(async () => {
    setError(null)
    try {
      await fetch('/api/wa/disconnect', { method: 'POST' })
      await fetchStatus()
    } catch (e) { setError('No se pudo desconectar') }
  }, [fetchStatus])

  const resetAuth = useCallback(async () => {
    setError(null)
    setPairCode(null)
    try {
      await fetch('/api/wa/reset-auth', { method: 'POST' })
      await start()
    } catch (e) { setError('No se pudo resetear la sesión') }
  }, [start])

  const requestPairingCode = useCallback(async () => {
    setError(null)
    setPairCode(null)
    try {
      const digits = String(pairPhone || '').replace(/\D/g, '')
      if (!digits) { setError('Ingresa un número válido'); return }
      const res = await fetch('/api/wa/pairing-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phoneNumber: digits })
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'No se pudo obtener el código')
      setPairCode(String(data.code || ''))
    } catch (e) { setError(e.message || 'Error al solicitar código') }
  }, [pairPhone])


  useEffect(() => {
    fetchStatus()
    fetchActivity()
    const id = setInterval(() => { fetchStatus(); fetchActivity(); }, 5000)
    return () => clearInterval(id)
  }, [fetchStatus, fetchActivity])

  const isConnected = status === 'connected'
  // Removed: const isTgConnected = tgStatus === 'connected'

  return (
    <Stack spacing={2}>
      <Typography variant="h5">Configuración de Conexión</Typography>
      {error && (
        <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
      )}
      <Paper sx={{ p: 2 }} id="whatsapp">
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="subtitle1">WhatsApp: {status}</Typography>
            {user && (
              <Typography variant="body2" color="text.secondary">{user?.name || user?.id}{phone ? ` (${phone})` : ''}</Typography>
            )}
            {activity.lastMessage && (
              <Typography variant="body2" color="text.secondary">Último: {(activity.lastMessage.text || '').slice(0, 80)}</Typography>
            )}
            {activity.unreadCount > 0 && (
              <Typography variant="body2" color="text.secondary">No leídos: {activity.unreadCount}</Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {!isConnected && (
              <>
                <Button variant="contained" onClick={start}>Conectar</Button>
                <Button variant="outlined" onClick={reconnect}>Forzar reconexión</Button>
                <Button variant="outlined" color="error" onClick={resetAuth}>Resetear sesión</Button>
              </>
            )}
            {isConnected && (
              <Button variant="outlined" color="error" onClick={disconnect}>Desconectar</Button>
            )}
          </Box>
        </Box>
        {!isConnected && (
          <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2">QR de conexión</Typography>
              {qr ? (
                <Box sx={{ mt: 1 }}>
                  <img src={qr} alt="Código QR" style={{ width: 220, height: 220 }} />
                </Box>
              ) : (
                <Alert severity="info">Si el estado es "qr", se mostrará aquí el código.</Alert>
              )}
            </Box>
            <Divider orientation="vertical" flexItem />
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2">Conectar por código de emparejamiento</Typography>
              <Stack spacing={1} sx={{ mt: 1 }}>
                <TextField label="Número (CC + 10 dígitos)" size="small" value={pairPhone} onChange={(e)=>setPairPhone(e.target.value)} />
                <Button variant="outlined" onClick={requestPairingCode}>Solicitar código</Button>
                {pairCode && (<Alert severity="success">Código: {pairCode}</Alert>)}
              </Stack>
            </Box>
          </Stack>
        )}
      </Paper>
    </Stack>
  )
}