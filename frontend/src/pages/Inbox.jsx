import React from 'react'
import { Box, Button, Paper, Typography, Stack } from '@mui/material'

export default function Inbox() {
  return (
    <Stack spacing={2}>
      <Typography variant="h5">Bandeja de entrada</Typography>

      <Paper sx={{ p: 2, minHeight: 240 }}>
        <Typography>Área de conversación (WhatsApp).</Typography>
      </Paper>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button variant="contained">Responder con Gemini</Button>
        <Button variant="outlined">Conectar WhatsApp</Button>
        {/* Telegram functionality removed */}
      </Box>
    </Stack>
  )
}