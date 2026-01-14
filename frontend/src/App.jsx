import React from 'react'
import { Routes, Route, useLocation, Navigate } from 'react-router-dom'
// import { Box, Toolbar } from '@mui/material'
import BorradorPage from './pages/BorradorPage'
import WhatsAppConnect from './pages/WhatsAppConnect'
import ContactsCreate from './pages/ContactsCreate'
import Campaigns from './pages/Campaigns'
import CampaignsAds from './pages/CampaignsAds'
import CampaignsAdsProgram from './pages/CampaignsAdsProgram'
import BulkMessages from './pages/BulkMessages'
import BulkMessagesProgram from './pages/BulkMessagesProgram'
import Transmission from './pages/Transmission'
import AgentsCreate from './pages/AgentsCreate'
import AgentsList from './pages/AgentsList'
import SuperAgentAssign from './pages/SuperAgentAssign'
import SettingsConnection from './pages/SettingsConnection.jsx'
import TailwindSidebar from './components/TailwindSidebar'
import WaStatusBadge from './components/WaStatusBadge'
import Contacts from './pages/Contacts'
import SettingsConnectionWhatsApp from './pages/SettingsConnectionWhatsApp.jsx'
import SettingsLabels from './pages/SettingsLabels.jsx'
import SettingsFields from './pages/SettingsFields.jsx'
import SettingsGeminiApiKey from './pages/SettingsGeminiApiKey.jsx'
import SettingsGeminiSuperAgent from './pages/SettingsGeminiSuperAgent.jsx'
import SettingsGeminiTriggers from './pages/SettingsGeminiTriggers.jsx'
import SettingsOpenAIApiKey from './pages/SettingsOpenAIApiKey.jsx'
import SettingsAnthropicApiKey from './pages/SettingsAnthropicApiKey.jsx'
import SettingsRecepcionita from './pages/SettingsRecepcionita.jsx'

function App() {
  const location = useLocation()
  const isBorrador = location.pathname === '/' || location.pathname === '/borrador'

  if (isBorrador) {
    return (
      <Routes>
        <Route path="/" element={<Navigate to="/whatsapp" replace />} />
        <Route path="/borrador" element={<Navigate to="/whatsapp" replace />} />
      </Routes>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Menú lateral estilo Borrador.html */}
      <TailwindSidebar />

      {/* Contenido principal a la derecha */}
      <main className="flex-1 flex flex-col ml-64 h-screen">
        {/* Cabecera fija minimal */}
        <header className="flex items-center justify-between h-20 bg-gray-800 border-l border-gray-700 px-8 py-4 z-20 flex-shrink-0">
          <h2 className="text-xl font-semibold text-white">CRM</h2>
          <div className="flex items-center space-x-4">
            {/* Indicador global de estado WhatsApp */}
            {<WaStatusBadge />}
          </div>
        </header>

        {/* Área de contenido */}
        <div className="flex-1 p-8 overflow-y-auto">
          <Routes>
            <Route path="/whatsapp" element={<WhatsAppConnect />} />
            <Route path="/contacts" element={<Contacts />} />
            {/* Eliminado: ruta /telegram */}
            <Route path="/contacts/create" element={<ContactsCreate />} />
            <Route path="/campaigns/ads" element={<CampaignsAds />} />
            <Route path="/campaigns/ads/program" element={<CampaignsAdsProgram />} />
            <Route path="/campaigns/bulk-messages" element={<BulkMessages />} />
            <Route path="/campaigns/bulk-messages/program" element={<BulkMessagesProgram />} />
            <Route path="/campaigns/transmission" element={<Transmission />} />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/agents/create" element={<AgentsCreate />} />
            <Route path="/agents/list" element={<AgentsList />} />
            <Route path="/agents/super/assign" element={<SuperAgentAssign />} />
            <Route path="/settings/connection" element={<SettingsConnection />} />
            <Route path="/settings/connection/whatsapp" element={<SettingsConnectionWhatsApp />} />
            <Route path="/settings/labels" element={<SettingsLabels />} />
            <Route path="/settings/fields" element={<SettingsFields />} />
            <Route path="/settings/gemini/apikey" element={<SettingsGeminiApiKey />} />
            <Route path="/settings/gemini/super-agent" element={<SettingsGeminiSuperAgent />} />
            <Route path="/settings/gemini/disparadores" element={<SettingsGeminiTriggers />} />
            <Route path="/settings/recepcionita" element={<SettingsRecepcionita />} />
            <Route path="/settings/openai/apikey" element={<SettingsOpenAIApiKey />} />
            <Route path="/settings/anthropic/apikey" element={<SettingsAnthropicApiKey />} />
            {/* Eliminado: ruta de configuración de Telegram */}
          </Routes>
        </div>
      </main>
    </div>
  )
}

export default App