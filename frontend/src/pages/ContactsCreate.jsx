import React from 'react'
import { Stack, Typography, Paper, TextField, Box, Button, Alert, FormControl, InputLabel, Select, MenuItem } from '@mui/material'

export default function ContactsCreate() {
  // Estado y manejo de guardado
  const [name, setName] = React.useState('')
  const [countryCode, setCountryCode] = React.useState('57')
  const [phone, setPhone] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState(null)
  const [success, setSuccess] = React.useState(null)

  const localDigits = String(phone).replace(/\D/g, '')
  const isValidLocal = localDigits.length === 10

  const handleSave = async () => {
    setError(null); setSuccess(null)
    const n = name.trim()
    if (!n) { setError('El nombre es obligatorio'); return }
    if (!isValidLocal) { setError('El teléfono debe tener exactamente 10 dígitos'); return }
    try {
      setSaving(true)
      const fullPhone = String(countryCode).replace(/\D/g, '') + localDigits
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: n, phone: fullPhone, countryCode, createOnly: true })
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'No se pudo guardar')
      setSuccess('Contacto guardado')
      setName(''); setPhone('')
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5">Crear contacto</Typography>
      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          {success && <Alert severity="success">{success}</Alert>}
          <TextField label="Nombre" fullWidth value={name} onChange={e => setName(e.target.value)} />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <FormControl sx={{ minWidth: 140 }}>
              <InputLabel id="cc-label">Código país</InputLabel>
              <Select labelId="cc-label" value={countryCode} label="Código país" onChange={e => setCountryCode(String(e.target.value))}>
                <MenuItem value="57">+57 (Colombia)</MenuItem>
                <MenuItem value="1">+1 (EE.UU./Canadá)</MenuItem>
                <MenuItem value="52">+52 (México)</MenuItem>
                <MenuItem value="34">+34 (España)</MenuItem>
                <MenuItem value="51">+51 (Perú)</MenuItem>
                <MenuItem value="54">+54 (Argentina)</MenuItem>
                <MenuItem value="55">+55 (Brasil)</MenuItem>
                <MenuItem value="58">+58 (Venezuela)</MenuItem>
                <MenuItem value="56">+56 (Chile)</MenuItem>
              </Select>
            </FormControl>
            <TextField 
              label="Teléfono (10 dígitos)" 
              fullWidth 
              value={localDigits}
              onChange={e => setPhone(e.target.value)}
              inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', maxLength: 10 }}
              helperText={isValidLocal ? `Se guardará como +${countryCode} ${localDigits}` : 'Debe ingresar exactamente 10 dígitos'}
            />
          </Box>
          <Box>
            <Button variant="contained" onClick={handleSave} disabled={saving || !isValidLocal || !name.trim()}>Guardar</Button>
          </Box>
        </Stack>
      </Paper>
    </Stack>
  )
}