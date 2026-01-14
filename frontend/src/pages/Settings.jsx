import React from 'react'
import { Box, Button, Paper, Typography, Stack, TextField } from '@mui/material'

export default function Settings() {
  return (
    <Stack spacing={2}>
      <Typography variant="h5">Ajustes</Typography>
      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          <TextField label="API Key de Gemini" fullWidth />
          <TextField label="Token de WhatsApp" fullWidth />
          {/* Telegram configuration removed */}
          <Box>
            <Button variant="contained">Guardar</Button>
          </Box>
        </Stack>
      </Paper>
    </Stack>
  )
}