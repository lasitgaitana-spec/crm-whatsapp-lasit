import React from 'react'
import { Box, Button, Paper, Typography, Stack } from '@mui/material'

export default function Agents() {
  return (
    <Stack spacing={2}>
      <Typography variant="h5">Agentes</Typography>
      <Paper sx={{ p: 2, minHeight: 240 }}>
        <Typography>Configuración de agentes Gemini para WhatsApp.</Typography>
      </Paper>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button variant="contained">Nuevo agente</Button>
        <Button variant="outlined">Probar respuesta</Button>
      </Box>
    </Stack>
  )
}