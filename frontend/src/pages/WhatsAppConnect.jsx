import React, { useEffect, useState, useCallback, useRef } from 'react'
import { Stack, Typography, Paper, Box, Button, Alert, TextField, Divider, List, ListItem, ListItemButton, ListItemText, Chip, Avatar, IconButton, InputAdornment, Popover } from '@mui/material'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew'
import SearchIcon from '@mui/icons-material/Search'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import EmojiEmotionsIcon from '@mui/icons-material/EmojiEmotions'
import MicIcon from '@mui/icons-material/Mic'
import SendIcon from '@mui/icons-material/Send'
import { io } from 'socket.io-client'
import Picker from '@emoji-mart/react'
import emojiData from '@emoji-mart/data'
import ReplyOutlinedIcon from '@mui/icons-material/ReplyOutlined'
import { useLocation } from 'react-router-dom'


export default function WhatsAppConnect() {
  // Normaliza un JID utilizando únicamente los dígitos del usuario y fija dominio @s.whatsapp.net
  // Soporta JIDs de multi-dispositivo con ':' y dominios como @s.whatsapp.net y @lid
  const normalizeJidDigitsToS = (jid) => {
    const j = String(jid || '')
    const userPart = j.split('@')[0] || ''
    const base = userPart.includes(':') ? userPart.split(':')[0] : userPart
    const digits = base.replace(/\D/g, '')
    return digits ? `${digits}@s.whatsapp.net` : j
  }
  const [status, setStatus] = useState('idle')
  const [qr, setQr] = useState(null)
  const [error, setError] = useState(null)
  const [user, setUser] = useState(null)
  const [phone, setPhone] = useState(null)
  const [sendTo, setSendTo] = useState('')
  const [sendText, setSendText] = useState('')
  const [sendOk, setSendOk] = useState(null)
  const [activity, setActivity] = useState({ unreadCount: 0, lastMessage: null })
  const [inbox, setInbox] = useState([])
  const [pairPhone, setPairPhone] = useState('')
  const [pairCode, setPairCode] = useState(null)
  const [replyTo, setReplyTo] = useState('')
  const [replyText, setReplyText] = useState('')
  const messagesRef = useRef(null)
  const [activeChat, setActiveChat] = useState(null)
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [emojiAnchorEl, setEmojiAnchorEl] = useState(null)
  const emojiOpen = Boolean(emojiAnchorEl)
  const inputRef = useRef(null)
  const [replyQuote, setReplyQuote] = useState(null)
  const [recording, setRecording] = useState(false)
  const recorderRef = useRef(null)
  const recordChunksRef = useRef([])
  const recordTimerRef = useRef(null)
  const [recordElapsed, setRecordElapsed] = useState(0)
  // Búsqueda dentro del chat
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMatches, setSearchMatches] = useState([])
  const [searchIndex, setSearchIndex] = useState(0)
  // Conexión de sockets para chat en vivo (restaurado)
  useEffect(() => {
    const socket = io('/', { path: '/socket.io', transports: ['websocket'] })
    socket.on('wa:status', ({ status, user }) => {
      setStatus(status || 'idle')
      if ((status || 'idle') === 'connected' && user) {
        setUser(user)
        setPhone(user.phoneNumber || null)
      }
      if ((status || 'idle') === 'qr') {
        fetchQr()
      }
    })
    socket.on('wa:inbox', ({ messages }) => {
      if (Array.isArray(messages)) {
        const ordered = messages.slice().sort((a,b) => (a.ts || Date.now()) - (b.ts || Date.now()))
        setInbox(ordered)
      }
    })
    socket.on('wa:message', (item) => {
      setInbox(prev => {
        const idx = prev.findIndex(m => m.id === item.id)
        let next
        if (idx >= 0) {
          next = prev.slice()
          next[idx] = { ...next[idx], ...item }
        } else {
          next = [...prev, item]
          if (next.length > 100) next = next.slice(next.length - 100)
        }
        return next.sort((a,b) => (a.ts || Date.now()) - (b.ts || Date.now()))
      })
      // Usar pushName del mensaje para fijar nombre estable si existe
      try {
        const useJid = item?.sender ? normalizeJidDigitsToS(item.sender) : null
        const name = item?.pushName || null
        if (useJid && name) {
          setStableNameByJid(prev => {
            const curr = prev[useJid]
            // Si no hay nombre o el actual es solo dígitos, actualiza con pushName
            const isDigits = /^\d+$/.test(String(curr || ''))
            if (!curr || isDigits) return { ...prev, [useJid]: String(name) }
            return prev
          })
        }
      } catch {}
    })
    socket.on('wa:message:update', ({ id, status }) => {
      setInbox(prev => prev.map(m => m.id === id ? { ...m, status } : m))
    })
    return () => { socket.disconnect() }
  }, [])
  // Recalcular coincidencias de búsqueda cuando cambie query o chat activo
  useEffect(() => {
    if (!activeChat || !searchQuery) { setSearchMatches([]); setSearchIndex(0); return }
    const q = searchQuery.toLowerCase()
    const matches = []
    inbox.filter(m => m.sender === activeChat && typeof m.text === 'string').forEach((m, idx) => {
      if ((m.text || '').toLowerCase().includes(q)) matches.push({ id: m.id, idx })
    })
    setSearchMatches(matches)
    setSearchIndex(matches.length ? 0 : 0)
  }, [searchQuery, activeChat, inbox])
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight
    }
  }, [inbox, activeChat])

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/wa/status')
      const data = await res.json()
      setStatus(data.status || 'idle')
      if ((data.status || 'idle') === 'qr') {
        await fetchQr()
      } else if ((data.status || 'idle') === 'connected') {
        setQr(null)
        await fetchMe()
      } else {
        setQr(null)
        setUser(null)
        setPhone(null)
      }
    } catch (e) {
      setError('No se pudo obtener el estado')
    }
  }, [])

  const fetchQr = useCallback(async () => {
    try {
      const res = await fetch('/api/wa/qr')
      const data = await res.json()
      setStatus(data.status || 'idle')
      setQr(data.qr || null)
    } catch (e) {
      setError('No se pudo obtener el QR')
    }
  }, [])

  // Refresco periódico del QR mientras el estado sea 'qr'
  useEffect(() => {
    if (status !== 'qr') return
    const id = setInterval(() => { fetchQr().catch(()=>{}) }, 8000)
    return () => clearInterval(id)
  }, [status, fetchQr])

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch('/api/wa/me')
      const data = await res.json()
      if (data.ok) {
        setUser(data.user || null)
        setPhone(data.phoneNumber || null)
      }
    } catch (e) {
      // ignorar
    }
  }, [])

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch('/api/wa/activity')
      const data = await res.json()
      if (data.ok) setActivity({ unreadCount: data.unreadCount || 0, lastMessage: data.lastMessage || null })
    } catch (e) {}
  }, [])

  const fetchInbox = useCallback(async () => {
    try {
      const res = await fetch('/api/wa/inbox')
      const data = await res.json()
      if (data.ok) setInbox(Array.isArray(data.messages) ? data.messages.slice().sort((a,b) => (a.ts || Date.now()) - (b.ts || Date.now())) : [])
    } catch (e) {}
  }, [])

  const start = useCallback(async () => {
    setError(null)
    setPairCode(null)
    try {
      await fetch('/api/wa/start', { method: 'POST' })
      await fetchStatus()
      await fetchQr()
    } catch (e) {
      setError('No se pudo iniciar la conexión')
    }
  }, [fetchStatus, fetchQr])

  const reconnect = useCallback(async () => {
    setError(null)
    try {
      await fetch('/api/wa/reconnect', { method: 'POST' })
      await fetchStatus()
      await fetchQr()
    } catch (e) {
      setError('No se pudo forzar la reconexión')
    }
  }, [fetchStatus, fetchQr])

  const disconnect = useCallback(async () => {
    setError(null)
    try {
      await fetch('/api/wa/disconnect', { method: 'POST' })
      await fetchStatus()
    } catch (e) {
      setError('No se pudo desconectar')
    }
  }, [fetchStatus])

  const resetAuth = useCallback(async () => {
    setError(null)
    setPairCode(null)
    try {
      await fetch('/api/wa/reset-auth', { method: 'POST' })
      await start()
    } catch (e) {
      setError('No se pudo resetear la sesión')
    }
  }, [start])

  const requestPairingCode = useCallback(async () => {
    setError(null)
    setPairCode(null)
    try {
      const res = await fetch('/api/wa/pairing-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: pairPhone })
      })
      const data = await res.json()
      if (data.ok && data.code) {
        setPairCode(data.code)
      } else {
        setError(data.error || 'No se pudo obtener el código')
      }
    } catch (e) {
      setError('Fallo al solicitar el código')
    }
  }, [pairPhone])

  const send = useCallback(async () => {
    setSendOk(null)
    setError(null)
    try {
      const to = String(sendTo).replace(/\D/g, '')
      if (!to || !sendText) {
        setError('Ingresa número y mensaje')
        return
      }
      const res = await fetch('/api/wa/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, message: sendText })
      })
      const data = await res.json()
      if (data.ok) {
        setSendOk('Mensaje enviado')
        setSendText('')
        await fetchInbox()
      } else {
        setError(data.error || 'Error al enviar')
      }
    } catch (e) {
      setError('Fallo al enviar')
    }
  }, [sendTo, sendText, fetchInbox])

  const sendReply = useCallback(async () => {
    setSendOk(null)
    setError(null)
    try {
      const to = String(replyTo).replace(/\D/g, '')
      if (!to || !replyText) {
        setError('Selecciona conversación y escribe mensaje')
        return
      }
      const res = await fetch('/api/wa/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, message: replyText })
      })
      const data = await res.json()
      if (data.ok) {
        setSendOk('Respuesta enviada')
        setReplyText('')
        await fetchInbox()
      } else {
        setError(data.error || 'Error al enviar respuesta')
      }
    } catch (e) {
      setError('Fallo al enviar respuesta')
    }
  }, [replyTo, replyText, fetchInbox])

  // Cargar estado inicial al montar
  useEffect(() => {
    fetchStatus()
    fetchActivity()
    fetchInbox()
  }, [fetchStatus, fetchActivity, fetchInbox])

  useEffect(() => {
    const id = setInterval(() => {
      fetchStatus()
      fetchActivity()
      fetchInbox()
    }, 15000)
    return () => clearInterval(id)
  }, [fetchStatus, fetchActivity, fetchInbox])

  const chats = React.useMemo(() => {
    const map = new Map()
    inbox.forEach(m => {
      const jidNorm = normalizeJidDigitsToS(m.sender)
      const prev = map.get(jidNorm)
      if (!prev || m.ts > prev.lastTs) {
        map.set(jidNorm, { jid: jidNorm, lastText: m.text, lastTs: m.ts })
      }
    })
    return Array.from(map.values()).sort((a,b) => b.lastTs - a.lastTs)
  }, [inbox])
  useEffect(() => {
    if (!activeChat && chats.length > 0) setActiveChat(chats[0].jid)
  }, [chats, activeChat])
  // Siempre mostrar el número original proveniente del JID (sin nombres ni mapeos)
  // Soporta JIDs de multi-dispositivo con ':' y dominios como @s.whatsapp.net y @lid
  const phoneFromJid = (jid) => {
    const j = String(jid || '')
    const userPart = j.split('@')[0] || ''
    const base = userPart.includes(':') ? userPart.split(':')[0] : userPart
    const digits = base.replace(/\D/g, '')
    return digits || (j.replace(/@.*/, '') || 'Chat')
  }
  // Nombre estable por JID: se fija con el número extraído del propio JID
  const [stableNameByJid, setStableNameByJid] = React.useState({})
  useEffect(() => {
    try {
      const next = { ...stableNameByJid }
      inbox.forEach(m => {
        const jid = m.sender
        if (jid && !next[jid]) next[jid] = phoneFromJid(jid)
      })
      // También fijar para chats calculados
      chats.forEach(c => { if (c.jid && !next[c.jid]) next[c.jid] = phoneFromJid(c.jid) })
      if (Object.keys(next).length !== Object.keys(stableNameByJid).length) {
        setStableNameByJid(next)
      }
    } catch {}
  }, [inbox, chats])
  
  const formatTime = (ts) => {
    const d = new Date(ts)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  const location = useLocation()
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const urlJid = params.get('jid')
    const urlPhone = params.get('phone')
    if (urlJid) {
      setActiveChat(urlJid)
    } else if (urlPhone) {
      const raw = String(urlPhone).replace(/\D/g, '')
      if (!raw) return
      const myPhone = (phone || '').replace(/\D/g, '')
      let normalized = raw
      if (/^\d{10}$/.test(raw) && myPhone.startsWith('57')) {
        normalized = '57' + raw
      }
      const jid = normalized + '@s.whatsapp.net'
      setActiveChat(jid)
    }
  }, [location.search, phone])
  const escapeHtml = (s) => (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const highlightText = (text, query) => {
    const safe = escapeHtml(text || '')
    if (!query) return safe
    const q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return safe.replace(new RegExp(q, 'ig'), (m) => `<mark style="background:#ffeb3b">${m}</mark>`)
  }
  const goToMatch = (dir) => {
    if (searchMatches.length === 0) return
    let next = searchIndex + (dir === 'next' ? 1 : -1)
    if (next < 0) next = searchMatches.length - 1
    if (next >= searchMatches.length) next = 0
    setSearchIndex(next)
    const targetId = searchMatches[next].id
    const el = document.querySelector(`[data-msg-id="${targetId}"]`)
    if (el && messagesRef.current) {
      const y = el.offsetTop - 40
      messagesRef.current.scrollTo({ top: y, behavior: 'smooth' })
    }
  }
  const isSameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  const getDayLabel = (d) => {
    const today = new Date()
    const yesterday = new Date()
    yesterday.setDate(today.getDate() - 1)
    if (isSameDay(d, today)) return 'Hoy'
    if (isSameDay(d, yesterday)) return 'Ayer'
    return d.toLocaleDateString()
  }
  const renderMessages = () => {
    // Filtrar por chat activo (normalizando el JID) y ordenar cronológicamente
    let msgs = inbox
      .filter(m => normalizeJidDigitsToS(m.sender) === activeChat)
      .sort((a,b) => (a.ts || Date.now()) - (b.ts || Date.now()))
    // Deduplicar por id para evitar claves repetidas en el render
    const seenIds = new Set()
    msgs = msgs.filter(m => {
      const id = m.id || `${m.ts}-${m.sender}`
      if (seenIds.has(id)) return false
      seenIds.add(id)
      return true
    })
    if (msgs.length === 0) return (<Typography variant="body2" color="text.secondary">Empieza la conversación…</Typography>)
    const items = []
    let lastDay
    let lastSender = null
    
    msgs.forEach((m, index) => {
      const d = new Date(m.ts || Date.now())
      const dayKey = d.toDateString()
      const currentSender = m.fromMe ? 'me' : m.sender
      
      // Separador de día
      if (dayKey !== lastDay) {
        items.push(
          <Box key={'day-' + dayKey} sx={{ display: 'flex', justifyContent: 'center', my: 1 }}>
            <Chip label={getDayLabel(d)} size="small" />
          </Box>
        )
        lastDay = dayKey
      }
      
      // Verificar si es el primer mensaje de este remitente o si cambió el remitente
      const isFirstFromSender = currentSender !== lastSender
      const isLastFromSender = index === msgs.length - 1 || 
        (index < msgs.length - 1 && 
         (msgs[index + 1].fromMe ? 'me' : msgs[index + 1].sender) !== currentSender)
      
      const isMe = !!m.fromMe
      
      items.push(
        <Box key={`${m.id || m.ts || index}` } sx={{ 
          display: 'flex', 
          justifyContent: isMe ? 'flex-end' : 'flex-start', 
          mb: isLastFromSender ? 1.5 : 0.5,
          alignItems: 'flex-end'
        }}>
          {/* Avatar solo para el último mensaje del remitente (no propio) */}
          {!isMe && isLastFromSender && (
            <Avatar sx={{ width: 28, height: 28, mr: 1, bgcolor: '#25d366', fontSize: '0.75rem' }}>
              {prettyName(m.sender)[0]?.toUpperCase()}
            </Avatar>
          )}
          {!isMe && !isLastFromSender && (
            <Box sx={{ width: 28, mr: 1 }} />
          )}
          
          <Box sx={{ 
            maxWidth: '72%', 
            px: 1.5, 
            py: 1, 
            borderRadius: isMe 
              ? (isFirstFromSender ? '18px 18px 4px 18px' : isLastFromSender ? '18px 4px 4px 18px' : '18px 4px 4px 4px')
              : (isFirstFromSender ? '18px 18px 18px 4px' : isLastFromSender ? '4px 18px 18px 4px' : '4px 18px 18px 4px'),
            bgcolor: isMe ? '#DCF8C6' : '#fff', 
            boxShadow: 1,
            position: 'relative'
          }}>
            {/* Mostrar número/nombre del remitente solo en el primer mensaje del grupo */}
            {!isMe && isFirstFromSender && (
              <Typography variant="caption" sx={{ color: '#25d366', fontWeight: 600, display: 'block', mb: 0.5 }}>
                {prettyName(m.sender)}
              </Typography>
            )}
            
            {m.text && (
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#303030' }}
                dangerouslySetInnerHTML={{ __html: highlightText(m.text, searchQuery) }}
                />
              )}
            {m.media && m.media.type === 'image' && (
              <Box sx={{ mt: 0.5 }}>
                <a href={m.media.path} target="_blank" rel="noreferrer">
                  <img src={m.media.path} alt={m.media.filename || 'imagen'} style={{ maxWidth: '100%', borderRadius: 8 }} />
                </a>
              </Box>
            )}
            {m.media && m.media.type === 'audio' && (
              <Box sx={{ mt: 0.5 }}>
                <audio controls src={m.media.path} style={{ width: '100%' }} />
              </Box>
            )}
            {m.media && m.media.type === 'document' && (
              <Box sx={{ mt: 0.5 }}>
                <a href={m.media.path} target="_blank" rel="noreferrer" style={{ color: '#1e88e5', textDecoration: 'none' }}>
                  {m.media.filename || 'Documento'}
                </a>
              </Box>
            )}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.25 }}>
              <Typography variant="caption" sx={{ fontSize: '0.7rem', color: '#667781' }}>
                {formatTime(m.ts || Date.now())}
                {isMe && (
                  <span style={{ marginLeft: 4, color: m.status === 'read' ? '#4fc3f7' : '#667781' }}>
                    {m.status === 'sent' ? '✓' : '✓✓'}
                  </span>
                )}
              </Typography>
              <IconButton size="small" sx={{ color: '#54656f' }} onClick={() => setReplyQuote(m)}>
                <ReplyOutlinedIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>
        </Box>
      )
      
      lastSender = currentSender
    })
    return items
  }

  // Mapa: JID -> teléfono desde la base de datos de contactos
  const [contactPhoneByJid, setContactPhoneByJid] = useState({})
  const fetchContacts = useCallback(async () => {
    try {
      const resp = await fetch('/api/contacts')
      const json = await resp.json()
      const list = Array.isArray(json?.contacts) ? json.contacts : []
      const next = {}
      list.forEach(c => {
        const jid = String(c.jid || '')
        const phone = String(c.phone || '')
        // Solo mapear teléfonos para JIDs estándar de WhatsApp (@s.whatsapp.net)
        if (jid && /@s\.whatsapp\.net$/.test(jid)) {
          next[jid] = phone || ''
          const normalizedKey = normalizeJidDigitsToS(jid)
          if (normalizedKey) next[normalizedKey] = phone || ''
        }
      })
      setContactPhoneByJid(next)
    } catch {}
  }, [])
  useEffect(() => { fetchContacts() }, [fetchContacts])
  // Refrescar contactos cuando cambie el inbox (por captura automática en backend)
  useEffect(() => { fetchContacts() }, [inbox])
  // Información para el header del chat activo: número confiable y si es JID @lid
  const activeHeaderInfo = React.useMemo(() => {
    if (!activeChat) return { phone: '', isLid: false }
    const key = normalizeJidDigitsToS(activeChat)
    const phoneFromContacts = contactPhoneByJid[key] || ''
    // Buscar último mensaje del chat activo para obtener displayPhone y dominio del JID original
    const msgs = inbox.filter(m => normalizeJidDigitsToS(m.sender) === key)
    const last = msgs.length ? msgs[msgs.length - 1] : null
    const isLid = last ? /@lid$/.test(String(last.sender || '')) : false
    const phoneFromMsg = last?.displayPhone || ''
    const phone = phoneFromContacts || phoneFromMsg || ''
    return { phone, isLid }
  }, [activeChat, contactPhoneByJid, inbox])

  // Teléfono confiable para un JID: solo números reales
  const reliablePhoneForJid = useCallback((jid) => {
    const key = normalizeJidDigitsToS(jid)
    const isStandard = /@s\.whatsapp\.net$/.test(String(jid || ''))
    const fromContacts = contactPhoneByJid[key] || ''
    const fromJid = isStandard ? phoneFromJid(jid) : ''
    // Buscar último mensaje del chat para obtener displayPhone (solo si vino del backend)
    const msgs = inbox.filter(m => normalizeJidDigitsToS(m.sender) === key)
    const last = msgs.length ? msgs[msgs.length - 1] : null
    const fromMsg = last?.displayPhone || ''
    const phone = fromContacts || fromJid || fromMsg || ''
    return phone
  }, [contactPhoneByJid, inbox])

  const prettyName = (jid) => {
    const phone = reliablePhoneForJid(jid)
    return phone || 'Sin número'
  }
  const sendReplyFromActiveChat = async () => {
    if (!isConnected || !activeChat || !replyText?.trim()) return
    try {
      // Usar el JID original del último mensaje del chat activo
      const key = normalizeJidDigitsToS(activeChat)
      const msgs = inbox.filter(m => normalizeJidDigitsToS(m.sender) === key)
      const last = msgs.length ? msgs[msgs.length - 1] : null
      const targetJid = last?.sender || activeChat

      const res = await fetch('/api/wa/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jid: targetJid, message: replyText.trim(), quotedId: replyQuote?.id || null })
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data?.error || 'Error al enviar')
      setReplyText('')
      setReplyQuote(null)
      await fetchInbox()
    } catch (e) {
      setError(e.message || 'Fallo al enviar respuesta')
      console.error('Error al enviar respuesta:', e)
    }
  }
  const isConnected = status === 'connected'

  const sendMediaFile = async (file) => {
    if (!file) return
    const connected = status === 'connected'
    if (!connected || !activeChat) return
    try {
      setUploading(true)
      const fd = new FormData()
      const filename = file.name || 'adjunto'
      fd.append('file', file, filename)
      fd.append('jid', activeChat)
      const mime = file.type || ''
      let type = 'document'
      if (mime.startsWith('image/')) type = 'image'
      else if (mime.startsWith('audio/')) type = 'audio'
      fd.append('type', type)
      const res = await fetch('/api/wa/send-media', { method: 'POST', body: fd })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Error al enviar adjunto')
      await fetchInbox()
    } catch (err) {
      console.error(err)
      setError(err.message || 'Fallo al enviar adjunto')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 64px)', border: '1px solid #ddd', borderRadius: 2, overflow: 'hidden' }}>
      {/* Sidebar de chats */}
      <Box sx={{ width: 320, bgcolor: '#f0f2f5', borderRight: '1px solid #ddd', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ p: 1.25, bgcolor: '#ededed', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Avatar sx={{ width: 32, height: 32 }}>{(user?.name || phone || 'U')?.toString()?.[0] || 'U'}</Avatar>
            <Typography variant="subtitle2">Chats</Typography>
          </Box>
          <Box>
            <IconButton size="small"><MoreVertIcon /></IconButton>
          </Box>
        </Box>
        <Divider />
        <Box sx={{ p: 1 }}>
          <TextField 
            size="small" 
            fullWidth 
            placeholder="Buscar o iniciar chat" 
            disabled={!isConnected} 
            InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} /></InputAdornment>) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isConnected) {
                const raw = String(e.currentTarget.value || '').replace(/\D/g, '')
                if (!raw) return
                const myPhone = (phone || '').replace(/\D/g, '')
                let normalized = raw
                if (/^\d{10}$/.test(raw) && myPhone.startsWith('57')) {
                  normalized = '57' + raw
                }
                const jid = normalized + '@s.whatsapp.net'
                setActiveChat(jid)
                e.currentTarget.value = ''
              }
            }}
          />
        </Box>
        <Divider />
        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          <List dense>
            {chats.map(c => {
              const unreadCount = inbox.filter(m => m.sender === c.jid && !m.fromMe && !m.read).length
              return (
                <ListItem key={c.jid} disablePadding>
                  <ListItemButton selected={activeChat === c.jid} onClick={() => setActiveChat(c.jid)} disabled={!isConnected} sx={{ py: 1.5 }}>
                    <Avatar sx={{ width: 40, height: 40, mr: 1.5, bgcolor: '#25d366' }}>
                      {prettyName(c.jid)[0]?.toUpperCase()}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 500, color: '#111b21' }}>
                          {prettyName(c.jid)}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#667781' }}>
                          {formatTime(c.lastTs)}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="body2" sx={{ color: '#667781', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          {c.lastText?.slice(0, 50)}
                        </Typography>
                        {unreadCount > 0 && (
                          <Chip label={unreadCount} size="small" sx={{ bgcolor: '#25d366', color: 'white', minWidth: 20, height: 20, fontSize: '0.75rem' }} />
                        )}
                      </Box>
                    </Box>
                  </ListItemButton>
                </ListItem>
              )
            })}
            {chats.length === 0 && (
              <Box sx={{ p: 2 }}>
                <Typography variant="body2" color="text.secondary">No hay conversaciones todavía.</Typography>
              </Box>
            )}
          </List>
        </Box>
      </Box>

      {/* Panel de conversación */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#efeae2', backgroundImage: 'url("data:image/svg+xml,%3Csvg width="100" height="100" xmlns="http://www.w3.org/2000/svg"%3E%3Cdefs%3E%3Cpattern id="a" patternUnits="userSpaceOnUse" width="100" height="100"%3E%3Cpath d="M0 0h100v100H0z" fill="%23efeae2"/%3E%3Cpath d="M20 20h60v60H20z" fill="none" stroke="%23d1d7db" stroke-width="0.5" opacity="0.1"/%3E%3C/pattern%3E%3C/defs%3E%3Crect width="100%25" height="100%25" fill="url(%23a)\"/%3E%3C/svg%3E")' }}>
        {activeChat ? (
          <>
            {/* Header del chat activo */}
            <Box sx={{ p: 1.5, bgcolor: '#ededed', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <Avatar sx={{ width: 40, height: 40, bgcolor: '#25d366' }}>
                  {(activeHeaderInfo.phone || 'S')[0]?.toUpperCase()}
                </Avatar>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 500, lineHeight: 1.2, color: '#111b21' }}>
                    {activeHeaderInfo.phone || 'Sin número'}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#667781' }}>
                    {isConnected ? 'en línea' : 'desconectado'}
                  </Typography>
                  {!activeHeaderInfo.phone && activeHeaderInfo.isLid && (
                    <Typography variant="caption" sx={{ color: '#b00020', display: 'block' }}>
                      Sin número (ID vinculado)
                    </Typography>
                  )}
                </Box>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <IconButton size="small" disabled={!isConnected} sx={{ color: '#54656f' }} onClick={() => setSearchOpen(prev => !prev)}>
                  <SearchIcon />
                </IconButton>
                <IconButton size="small" disabled={!isConnected} sx={{ color: '#54656f' }}>
                  <AttachFileIcon />
                </IconButton>
                <IconButton size="small" sx={{ color: '#54656f' }}>
                  <MoreVertIcon />
                </IconButton>
                {searchOpen && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 1 }}>
                    <TextField size="small" placeholder="Buscar en el chat" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                    <Typography variant="caption">{searchMatches.length ? `${searchIndex+1}/${searchMatches.length}` : '0/0'}</Typography>
                    <Button size="small" onClick={() => goToMatch('prev')}>↑</Button>
                    <Button size="small" onClick={() => goToMatch('next')}>↓</Button>
                  </Box>
                )}
               </Box>
            </Box>

            {/* Mensajes estilo WhatsApp */}
            <Box ref={messagesRef} sx={{ flex: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column' }}>
              {renderMessages()}
            </Box>

            {/* Composer estilo WhatsApp */}
            <Box sx={{ p: 1.5, bgcolor: '#f0f2f5', borderTop: '1px solid #ddd', display: 'flex', gap: 1, alignItems: 'flex-end' }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={async (e) => {
                e.preventDefault()
                const files = Array.from(e.dataTransfer?.files || [])
                if (files.length > 0) {
                  for (const f of files) { await sendMediaFile(f) }
                }
              }}
            >
              <IconButton size="small" disabled={!isConnected} sx={{ color: '#54656f', mb: 0.5 }} onClick={(e) => setEmojiAnchorEl(e.currentTarget)}>
                <EmojiEmotionsIcon />
              </IconButton>
              <IconButton size="small" disabled={!isConnected} sx={{ color: '#54656f', mb: 0.5 }} onClick={() => fileInputRef.current?.click()}>
                <AttachFileIcon />
              </IconButton>
              {replyQuote && (
                <Box sx={{ flex: '0 0 auto', maxWidth: '40%', bgcolor: '#fff', borderLeft: '3px solid #53bdeb', borderRadius: 1, p: 1, mr: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="caption" sx={{ color: '#53bdeb' }}>Respondiendo a {replyQuote.fromMe ? 'Tú' : prettyName(replyQuote.sender)}</Typography>
                    <Button size="small" onClick={() => setReplyQuote(null)} sx={{ minWidth: 0, color: '#54656f' }}>X</Button>
                  </Box>
                  <Typography variant="caption" sx={{ color: '#667781' }}>
                    {replyQuote.text || (replyQuote.media ? `[${replyQuote.media.type}]` : '')}
                  </Typography>
                </Box>
              )}
              <input ref={fileInputRef} type="file" accept="image/*,audio/*,application/pdf,application/*" style={{ display: 'none' }} onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                await sendMediaFile(file)
              }} />
              <TextField 
                inputRef={inputRef}
                value={replyText} 
                onChange={e => setReplyText(e.target.value)}
                onPaste={async (e) => {
                  const items = Array.from(e.clipboardData?.items || [])
                  for (const it of items) {
                    const file = it.getAsFile?.()
                    if (file) { e.preventDefault(); await sendMediaFile(file); break }
                  }
                }}
                onKeyPress={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    if (replyText?.trim() && isConnected && activeChat) {
                      sendReplyFromActiveChat()
                    }
                  }
                }}
                fullWidth 
                multiline
                maxRows={4}
                size="small" 
                placeholder="Escribe un mensaje"
                disabled={!isConnected || !activeChat}
                sx={{ 
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '20px',
                    bgcolor: 'white',
                    '& fieldset': { border: 'none' },
                    '&:hover fieldset': { border: 'none' },
                    '&.Mui-focused fieldset': { border: '2px solid #00a884' }
                  }
                }}
              />
              {replyText?.trim() ? (
                <IconButton 
                  color="primary" 
                  onClick={sendReplyFromActiveChat} 
                  disabled={!isConnected || !activeChat}
                  sx={{ 
                    bgcolor: '#00a884', 
                    color: 'white', 
                    mb: 0.5,
                    '&:hover': { bgcolor: '#008f72' },
                    '&:disabled': { bgcolor: '#ccc', color: '#999' }
                  }}
                >
                  <SendIcon />
                </IconButton>
              ) : (
                <IconButton disabled={!isConnected} sx={{ color: recording ? '#e53935' : '#54656f', mb: 0.5 }} onClick={async () => {
                  if (!recording) {
                    try {
                      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
                      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : (MediaRecorder.isTypeSupported('audio/ogg') ? 'audio/ogg' : '')
                      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
                      recordChunksRef.current = []
                      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) recordChunksRef.current.push(e.data) }
                      rec.onstop = async () => {
                        const blob = new Blob(recordChunksRef.current, { type: rec.mimeType || 'audio/webm' })
                        recordChunksRef.current = []
                        try {
                          setUploading(true)
                          const fd = new FormData()
                          fd.append('file', blob, 'voice-message.webm')
                          fd.append('jid', activeChat)
                          fd.append('type', 'audio')
                          fd.append('ptt', 'true')
                          const res = await fetch('http://localhost:3000/api/wa/send-media', { method: 'POST', body: fd })
                          const data = await res.json()
                          if (!data.ok) throw new Error(data.error || 'Error al enviar nota de voz')
                        } catch (err) {
                          console.error(err)
                          setError(err.message || 'Fallo al enviar nota de voz')
                        } finally {
                          setUploading(false)
                        }
                      }
                      rec.start(1000)
                      recorderRef.current = rec
                      setRecording(true)
                      setRecordElapsed(0)
                      recordTimerRef.current = setInterval(() => setRecordElapsed(prev => prev + 1), 1000)
                    } catch (err) {
                      console.error(err)
                      setError('Permiso de micrófono denegado o no disponible')
                    }
                  } else {
                    try {
                      const rec = recorderRef.current
                      if (rec?.state === 'recording') rec.stop()
                      const tracks = rec?.stream?.getTracks?.() || []
                      tracks.forEach(t => t.stop())
                    } finally {
                      setRecording(false)
                      clearInterval(recordTimerRef.current)
                      setRecordElapsed(0)
                    }
                  }
                }}>
                  <MicIcon />
                </IconButton>
              )}
            </Box>
            {error && activeChat && (
              <Box sx={{ px: 2, py: 0.5 }}>
                <Typography variant="caption" sx={{ color: 'error.main' }}>{error}</Typography>
              </Box>
            )}
            {uploading && (
              <Box sx={{ px: 2, py: 0.5 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>Enviando adjunto…</Typography>
              </Box>
            )}
            {recording && (
              <Box sx={{ px: 2, py: 0.5 }}>
                <Typography variant="caption" sx={{ color: '#e53935' }}>Grabando… {recordElapsed}s</Typography>
              </Box>
            )}
          </>
        ) : (
          /* Pantalla de bienvenida cuando no hay chat seleccionado */
          <Box sx={{ 
            flex: 1, 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center',
            textAlign: 'center',
            p: 4
          }}>
            <WhatsAppIcon sx={{ fontSize: 120, color: '#d1d7db', mb: 2 }} />
            <Typography variant="h5" sx={{ color: '#41525d', mb: 1, fontWeight: 300 }}>
              WhatsApp Web
            </Typography>
            <Typography variant="body1" sx={{ color: '#667781', maxWidth: 400, mb: 3 }}>
              Envía y recibe mensajes sin mantener tu teléfono conectado.
            </Typography>
            {!isConnected && (
              <>
                <Alert severity="info" sx={{ maxWidth: 500, mb: 2 }}>
                  Conéctate escaneando el código QR o usando código de emparejamiento.
                </Alert>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center', mb: 2 }}>
                  <Button variant="contained" color="success" onClick={start}>Conectar</Button>
                  <Button variant="outlined" color="primary" onClick={reconnect}>Reconectar</Button>
                  <Button variant="outlined" color="warning" onClick={resetAuth}>Resetear sesión</Button>
                </Box>
                {qr && (
                  <Box sx={{ bgcolor: '#fff', p: 2, borderRadius: 2, boxShadow: 1, mb: 2 }}>
                    <img src={qr} alt="QR de WhatsApp" style={{ width: 240, height: 240 }} />
                  </Box>
                )}
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', justifyContent: 'center', maxWidth: 500 }}>
                  <TextField 
                    label="Teléfono para emparejar" 
                    size="small" 
                    value={pairPhone} 
                    onChange={e => setPairPhone(e.target.value)} 
                  />
                  <Button variant="contained" onClick={requestPairingCode}>Solicitar código</Button>
                </Box>
                {pairCode && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="h6" sx={{ color: '#111b21' }}>Código: {pairCode}</Typography>
                    <Typography variant="caption" sx={{ color: '#667781' }}>Introduce este código en tu teléfono para emparejar.</Typography>
                  </Box>
                )}
              </>
            )}
            {isConnected && (
              <Typography variant="body2" sx={{ color: '#667781' }}>
                Selecciona un chat para comenzar a conversar.
              </Typography>
            )}

          </Box>
        )}
      </Box>
      <Popover open={emojiOpen} anchorEl={emojiAnchorEl} onClose={() => setEmojiAnchorEl(null)} anchorOrigin={{ vertical: 'top', horizontal: 'left' }} transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <Box sx={{ p: 1 }}>
          <Picker 
            data={emojiData} 
            locale="es" 
            theme="light" 
            emojiSize={22}
            navPosition="bottom"
            previewPosition="none"
            onEmojiSelect={(emoji) => { 
              const native = emoji?.native || emoji?.skins?.[0]?.native
              if (native) setReplyText(prev => (prev || '') + native)
              inputRef.current?.focus()
            }}
          />
        </Box>
      </Popover>
    </Box>
  )
}
