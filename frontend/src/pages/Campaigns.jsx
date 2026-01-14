import React from 'react'
import { Stack, Typography, Paper } from '@mui/material'

export default function Campaigns() {
  return (
    <Stack spacing={2}>
      <Typography variant="h5">Campañas</Typography>
      <Paper sx={{ p: 2 }}>
        <Typography>Gestión de campañas de mensajería (pendiente).</Typography>
      </Paper>
    </Stack>
  )
}