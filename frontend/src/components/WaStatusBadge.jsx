import React, { useEffect, useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'

export default function WaStatusBadge() {
  const [status, setStatus] = useState('idle')
  const [user, setUser] = useState(null)
  const [phone, setPhone] = useState(null)
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const [activity, setActivity] = useState({ unreadCount: 0, lastMessage: null })

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/wa/status')
      const data = await res.json()
      setStatus(data.status || 'idle')
      if ((data.status || 'idle') === 'connected') {
        await fetchMe()
      } else {
        setUser(null)
        setPhone(null)
      }
    } catch (e) {
      setStatus('error')
    }
  }, [])

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch('/api/wa/me')
      const data = await res.json()
      if (data.ok) {
        setUser(data.user || null)
        setPhone(data.phoneNumber || null)
      }
    } catch (e) {
      // noop
    }
  }, [])

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch('/api/wa/activity')
      const data = await res.json()
      if (data.ok) {
        setActivity({ unreadCount: data.unreadCount || 0, lastMessage: data.lastMessage || null })
      }
    } catch (e) {
      // noop
    }
  }, [])

  const handleConnect = useCallback(async () => {
    try {
      await fetch('/api/wa/start', { method: 'POST' })
      await fetchStatus()
      await fetchActivity()
      setOpen(false)
    } catch (e) {}
  }, [fetchStatus, fetchActivity])

  useEffect(() => {
    // primera carga
    fetchStatus()
    fetchActivity()
    // polling conjunto
    const id = setInterval(() => {
      fetchStatus()
      fetchActivity()
    }, 3000)
    return () => clearInterval(id)
  }, [fetchStatus, fetchActivity])

  useEffect(() => {
    const onDocClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  useEffect(() => {
    if (open) {
      // Al abrir el popover, marcar como visto
      fetch('/api/wa/activity/reset', { method: 'POST' }).catch(() => {})
      fetchActivity()
    }
  }, [open, fetchActivity])

  const color = status === 'connected'
    ? 'bg-green-600 hover:bg-green-500'
    : status === 'qr'
    ? 'bg-blue-600 hover:bg-blue-500'
    : status === 'connecting'
    ? 'bg-yellow-600 hover:bg-yellow-500'
    : status === 'error'
    ? 'bg-red-600 hover:bg-red-500'
    : 'bg-gray-600 hover:bg-gray-500'

  const text = status === 'connected'
    ? `WA Conectado${phone ? ` (${phone})` : ''}`
    : status === 'qr'
    ? 'WA QR listo'
    : status === 'connecting'
    ? 'WA Conectando...'
    : status === 'disconnected'
    ? 'WA Desconectado'
    : 'WA Idle'

  return (
    <div className="relative" ref={containerRef}>
      <button type="button" className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium text-white ${color}`} onClick={() => setOpen((v) => !v)}>
        <span className="mr-2">WA</span>
        <span>{text}</span>
        {activity.unreadCount > 0 && (
          <span className="ml-2 bg-red-500 text-white rounded-full px-2 py-0.5 text-xs">{activity.unreadCount}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-gray-800 text-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-30">
          <div className="p-3 border-b border-gray-700">
            <div className="text-sm font-semibold">Estado: {status}</div>
            {user && (
              <div className="text-xs text-gray-300">{user?.name || user?.id}{phone ? ` (${phone})` : ''}</div>
            )}
            {activity.lastMessage && (
              <div className="text-xs text-gray-300 mt-2">Último: {(activity.lastMessage.text || '').slice(0, 80)}</div>
            )}
          </div>
          <div className="p-2 flex flex-col gap-2">
            {status !== 'connected' && (
              <button className="w-full bg-green-600 hover:bg-green-500 rounded px-3 py-2 text-sm" onClick={handleConnect}>Conectar</button>
            )}
            <Link to="/whatsapp" className="w-full bg-gray-700 hover:bg-gray-600 rounded px-3 py-2 text-sm text-center" onClick={() => setOpen(false)}>
              Ver detalles
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}