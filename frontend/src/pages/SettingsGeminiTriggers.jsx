import React from 'react'
import { Stack, Typography, Paper, Button, TextField, Checkbox, FormControlLabel } from '@mui/material'

export default function SettingsGeminiTriggers() {
  const save = () => {
    // TODO: persistir configuración de disparadores
    alert('Recepcionita guardados (placeholder).')
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5">Gemini – Recepcionita</Typography>
      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          <FormControlLabel control={<Checkbox defaultChecked />} label="Responder cuando llega un mensaje nuevo" />
          <FormControlLabel control={<Checkbox />} label="Usar horario activo" />
          <TextField label="Palabras clave (separadas por coma)" fullWidth />
          <TextField label="Respuesta automática" multiline minRows={4} fullWidth />
          <Button variant="contained" onClick={save}>Guardar</Button>
        </Stack>
      </Paper>
    </Stack>
  )
}