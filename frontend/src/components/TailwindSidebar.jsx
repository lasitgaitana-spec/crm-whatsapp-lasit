import React from 'react'
import { Link } from 'react-router-dom'

export default function TailwindSidebar() {
  return (
    <aside className="w-64 bg-gray-800 p-6 flex flex-col fixed inset-y-0 left-0 overflow-y-auto z-30">
      {/* Logo */}
      <div className="flex items-center justify-center mb-8">
        <div className="w-16 h-16 rounded-full ring-2 ring-blue-500 overflow-hidden">
          <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
        </div>
      </div>

      {/* Navegación Principal */}
      <nav className="flex-1 space-y-2">
        {/* Chat en Vivo */}
        <details className="group">
          <summary className="w-full flex items-center justify-between p-3 rounded-lg text-gray-200 hover:bg-gray-700 transition-colors duration-200 cursor-pointer list-none">
            <span className="flex items-center space-x-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.5 14.67 3 13.38 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
              <span>Chat en Vivo</span>
            </span>
            <svg className="w-4 h-4 transform transition-transform duration-200 group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
          </summary>
          <ul className="ml-6 mt-2 space-y-2">
            <li>
              <Link to="/whatsapp" className="flex items-center space-x-3 p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-colors duration-200">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="WhatsApp"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.79.46 3.48 1.28 4.94L2 22l5.3-1.38c1.41.79 3.02 1.22 4.74 1.22 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm5.63 11.31c-.24-.12-1.43-.71-1.66-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.93-1.18-.71-.62-1.18-1.38-1.32-1.62-.14-.24-.02-.37.1-.49.1-.1.24-.26.36-.39.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.48-.4-.4-.54-.4-.14 0-.3-.02-.46-.02-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.74 2.66 4.22 3.72.59.26 1.05.41 1.41.53.59.19 1.12.16 1.54.1.47-.07 1.43-.58 1.63-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28z"></path></svg>
                <span>WhatsApp</span>
              </Link>
            </li>
            <li>
              {/* Eliminada opción Docs WhatsApp */}
            </li>
            {/* Eliminado: enlace Telegram */}
          </ul>
        </details>

        {/* Contactos */}
        <details className="group">
          <summary className="w-full flex items-center justify-between p-3 rounded-lg text-gray-200 hover:bg-gray-700 transition-colors duration-200 cursor-pointer list-none">
            <span className="flex items-center space-x-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 016-6h6m6 3h-3a3 3 0 00-3-3v-1a3 3 0 013-3h3v-1a3 3 0 00-3-3h-3m-6.375 0H3m12 18v-3a3 3 0 00-3-3h-3v-1a3 3 0 013-3h3v-1a3 3 0 00-3-3h-3"></path></svg>
              <span>Contactos</span>
            </span>
            <svg className="w-4 h-4 transform transition-transform duration-200 group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
          </summary>
          <ul className="ml-6 mt-2 space-y-2">
            <li>
              <Link to="/contacts/create" className="flex items-center space-x-3 p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-colors duration-200">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path></svg>
                <span>Crear contacto</span>
              </Link>
            </li>
            <li>
              <Link to="/contacts" className="flex items-center space-x-3 p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-colors duration-200">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                <span>Ver contactos</span>
              </Link>
            </li>
          </ul>
        </details>

        {/* Masivo */}
        <details className="group">
          <summary className="w-full flex items-center justify-between p-3 rounded-lg text-gray-200 hover:bg-gray-700 transition-colors duration-200 cursor-pointer list-none">
            <span className="flex items-center space-x-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h3m5 0h3"></path></svg>
              <span>Masivo</span>
            </span>
            <svg className="w-4 h-4 transform transition-transform duration-200 group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
          </summary>
          <ul className="ml-6 mt-2 space-y-2">
            <li>
              <Link to="/campaigns/ads" className="flex items-center space-x-3 p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-colors duration-200">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m4 4V8a4 4 0 10-8 0v8a4 4 0 108 0z" /></svg>
                <span>Campañas Publicitarias</span>
              </Link>
            </li>
            <li>
              <Link to="/campaigns/bulk-messages" className="flex items-center space-x-3 p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-colors duration-200">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h8M7 16h6" /></svg>
                <span>Mensajes Masivos</span>
              </Link>
            </li>
            <li>
              <Link to="/campaigns/transmission" className="flex items-center space-x-3 p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-colors duration-200">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                <span>Transmisión</span>
              </Link>
            </li>
          </ul>
        </details>

        {/* Agentes */}
        <details className="group">
          <summary className="w-full flex items-center justify-between p-3 rounded-lg text-gray-200 hover:bg-gray-700 transition-colors duration-200 cursor-pointer list-none">
            <span className="flex items-center space-x-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2m6-4a3 3 0 110-6m6 6a3 3 0 11-6 0"></path></svg>
              <span>Agentes</span>
            </span>
            <svg className="w-4 h-4 transform transition-transform duration-200 group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
          </summary>
          <ul className="ml-6 mt-2 space-y-2">
            <li>
              <Link to="/agents/create" className="flex items-center space-x-3 p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-colors duration-200">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path></svg>
                <span>Crear agente</span>
              </Link>
            </li>
            <li>
              <Link to="/agents/list" className="flex items-center space-x-3 p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-colors duration-200">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                <span>Ver agentes</span>
              </Link>
            </li>
          </ul>
        </details>

        {/* Inicio */}
        <li>
          <Link to="/" className="w-full flex items-center space-x-3 p-3 rounded-lg text-gray-200 hover:bg-gray-700 transition-colors duration-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6-4h.01M12 12h.01M15 12h.01"></path></svg>
            <span>Inicio</span>
          </Link>
        </li>

        {/* Configuración */}
        <details className="group">
          <summary className="w-full flex items-center justify-between p-3 rounded-lg text-gray-200 hover:bg-gray-700 transition-colors duration-200 cursor-pointer list-none">
            <span className="flex items-center space-x-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.572c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.572-1.066c-1.543.94-3.31-.826-2.37-2.37A1.724 1.724 0 004.317 13.675c-1.756-.426-1.756-2.924 0-3.35A1.724 1.724 0 005.383 7.753c-.94-1.543.826-3.31 2.37-2.37A1.724 1.724 0 0010.325 4.317z"></path></svg>
              <span>Configuración</span>
            </span>
            <svg className="w-4 h-4 transform transition-transform duration-200 group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
          </summary>
          <ul className="ml-6 mt-2 space-y-2">
            <details className="group">
              <summary className="w-full flex items-center justify-between p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors duration-200 cursor-pointer list-none">
                <span className="flex items-center space-x-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                  <span>Conexión</span>
                </span>
                <svg className="w-4 h-4 transform transition-transform duration-200 group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              </summary>
              <ul className="ml-6 mt-2 space-y-2">
                <li>
                  <Link to="/settings/connection/whatsapp" className="flex items-center space-x-3 p-2 rounded-md text-gray-500 hover:text-white hover:bg-gray-700 transition-colors duration-200">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="WhatsApp"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.79.46 3.48 1.28 4.94L2 22l5.3-1.38c1.41.79 3.02 1.22 4.74 1.22 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm5.63 11.31c-.24-.12-1.43-.71-1.66-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.93-1.18-.71-.62-1.18-1.38-1.32-1.62-.14-.24-.02-.37.1-.49.1-.1.24-.26.36-.39.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.48-.4-.4-.54-.4-.14 0-.3-.02-.46-.02-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.74 2.66 4.22 3.72.59.26 1.05.41 1.41.53.59.19 1.12.16 1.54.1.47-.07 1.43-.58 1.63-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28z"></path></svg>
                    <span>WhatsApp</span>
                  </Link>
                </li>

              </ul>
            </details>
            <details className="group">
              <summary className="w-full flex items-center justify-between p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors duration-200 cursor-pointer list-none">
                <span className="flex items-center space-x-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7h18M3 12h18M3 17h18"/></svg>
                  <span>Plataformas AI</span>
                </span>
                <svg className="w-4 h-4 transform transition-transform duration-200 group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              </summary>
              <ul className="ml-6 mt-2 space-y-2">
                <li>
                  <Link to="/settings/openai/apikey" className="flex items-center space-x-3 p-2 rounded-md text-gray-500 hover:text-white hover:bg-gray-700 transition-colors duration-200">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 11c1.657 0 3-1.343 3-3S13.657 5 12 5 9 6.343 9 8s1.343 3 3 3zm0 2c-3.314 0-6 1.343-6 3v2h12v-2c0-1.657-2.686-3-6-3z"/></svg>
                    <span>OpenAI</span>
                  </Link>
                </li>
                <li>
                  <Link to="/settings/anthropic/apikey" className="flex items-center space-x-3 p-2 rounded-md text-gray-500 hover:text-white hover:bg-gray-700 transition-colors duration-200">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 11c1.657 0 3-1.343 3-3S13.657 5 12 5 9 6.343 9 8s1.343 3 3 3zm0 2c-3.314 0-6 1.343-6 3v2h12v-2c0-1.657-2.686-3-6-3z"/></svg>
                    <span>Anthropic</span>
                  </Link>
                </li>
                <li>
                  <Link to="/settings/gemini/apikey" className="flex items-center space-x-3 p-2 rounded-md text-gray-500 hover:text-white hover:bg-gray-700 transition-colors duration-200">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 11c1.657 0 3-1.343 3-3S13.657 5 12 5 9 6.343 9 8s1.343 3 3 3zm0 2c-3.314 0-6 1.343-6 3v2h12v-2c0-1.657-2.686-3-6-3z"/></svg>
                    <span>Gemini</span>
                  </Link>
                </li>
              </ul>
            </details>
            <details className="group">
              <summary className="w-full flex items-center justify-between p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors duration-200 cursor-pointer list-none">
                <span className="flex items-center space-x-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14M12 5l7 7-7 7"/></svg>
                  <span>Asistente AI</span>
                </span>
                <svg className="w-4 h-4 transform transition-transform duration-200 group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              </summary>
              <ul className="ml-6 mt-2 space-y-2">
                <li>
                  <Link to="/settings/gemini/super-agent" className="flex items-center space-x-3 p-2 rounded-md text-gray-500 hover:text-white hover:bg-gray-700 transition-colors duration-200">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>
                    <span>Super Agente</span>
                  </Link>
                </li>
                <li>
                  <Link to="/settings/recepcionita" className="flex items-center space-x-3 p-2 rounded-md text-gray-500 hover:text-white hover:bg-gray-700 transition-colors duration-200">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6l4 2"/></svg>
                    <span>Recepcionita</span>
                  </Link>
                </li>
              </ul>
            </details>
            <li>
              <Link to="/settings/labels" className="flex items-center space-x-3 p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-colors duration-200">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h10M7 12h6M5 5a2 2 0 012-2h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V5z"></path></svg>
                <span>Etiquetas</span>
              </Link>
            </li>
            <li>
              <Link to="/settings/fields" className="flex items-center space-x-3 p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-colors duration-200">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5h6M7 9h10M7 13h10M9 17h6"></path></svg>
                <span>Campos</span>
              </Link>
            </li>
          </ul>
        </details>
      </nav>
    </aside>
  )
}