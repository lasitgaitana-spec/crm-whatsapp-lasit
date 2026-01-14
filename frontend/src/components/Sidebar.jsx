import React from 'react'
import { Link } from 'react-router-dom'
import { Drawer, Toolbar, Box, List, ListSubheader, ListItem, ListItemButton, ListItemText } from '@mui/material'

const drawerWidth = 240

export default function Sidebar() {
  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box' },
      }}
    >
      <Toolbar />
      <Box sx={{ overflow: 'auto' }}>
        <List subheader={<ListSubheader>Chat en Vivo</ListSubheader>}>
          <ListItem disablePadding>
            <ListItemButton component={Link} to="/whatsapp">
              <ListItemText primary="WhatsApp" />
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding>
        {/* Eliminado: enlace Telegram */}
          </ListItem>
        </List>

        <List subheader={<ListSubheader>Contactos</ListSubheader>}>
          <ListItem disablePadding>
            <ListItemButton component={Link} to="/contacts/create">
              <ListItemText primary="Crear contacto" />
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding>
            <ListItemButton component={Link} to="/contacts/google">
              <ListItemText primary="Contactos Google" />
            </ListItemButton>
          </ListItem>
        </List>

        <List subheader={<ListSubheader>Masivo</ListSubheader>}>
          <ListItem disablePadding>
            <ListItemButton component={Link} to="/campaigns/ads">
              <ListItemText primary="Campañas Publicitarias" />
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding>
            <ListItemButton component={Link} to="/campaigns/bulk-messages">
              <ListItemText primary="Mensajes Masivos" />
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding>
            <ListItemButton component={Link} to="/campaigns/transmission">
              <ListItemText primary="Transmisión" />
            </ListItemButton>
          </ListItem>
        </List>

        <List subheader={<ListSubheader>Agentes</ListSubheader>}>
          <ListItem disablePadding>
            <ListItemButton component={Link} to="/agents/create">
              <ListItemText primary="Crear agente" />
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding>
            <ListItemButton component={Link} to="/agents/list">
              <ListItemText primary="Ver agentes" />
            </ListItemButton>
          </ListItem>
        </List>

        <List>
          <ListItem disablePadding>
            <ListItemButton component={Link} to="/">
              <ListItemText primary="Inicio" />
            </ListItemButton>
          </ListItem>
        </List>

        <List subheader={<ListSubheader>Configuración</ListSubheader>}>
          <ListItem disablePadding>
            <ListItemButton component={Link} to="/settings/connection">
              <ListItemText primary="Conexión" />
            </ListItemButton>
          </ListItem>
        </List>
      </Box>
    </Drawer>
  )
}