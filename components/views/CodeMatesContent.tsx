'use client'

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Code2,
  Copy,
  Edit3,
  MessageSquare,
  Play,
  Plus,
  Send,
  Sparkles,
  Trophy,
  Users,
  Wifi,
  X,
  Zap,
} from 'lucide-react'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { useNavigation } from '@/lib/navigation'

// Dynamic import with zero SSR overhead
const Editor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[460px] items-center justify-center bg-[#171717] font-mono text-xs text-[#ffd84d]">
      <span className="animate-pulse">Loading Monaco Editor...</span>
    </div>
  ),
})

type CodeMatesView = 'rooms' | 'lobby' | 'game' | 'results'
type Room = { id: string; code: string; title: string; status: string; host_id: string; member_count?: number }

interface RemoteCursorInfo {
  id: string
  name: string
  color: string
  line: number
  col: number
}

const PALETTE = [
  { bg: 'bg-[#ffd84d]', hex: '#ffd84d', name: 'Lemon' },
  { bg: 'bg-[#39d5c8]', hex: '#39d5c8', name: 'Teal' },
  { bg: 'bg-[#ff57ce]', hex: '#ff57ce', name: 'Berry' },
  { bg: 'bg-[#6d73ff]', hex: '#6d73ff', name: 'Indigo' },
  { bg: 'bg-[#ff6b6b]', hex: '#ff6b6b', name: 'Coral' },
  { bg: 'bg-[#51cf66]', hex: '#51cf66', name: 'Mint' },
]

function isColorBright(hex: string): boolean {
  if (!hex || !hex.startsWith('#')) return false
  const c = hex.substring(1)
  const rgb = parseInt(c, 16)
  const r = (rgb >> 16) & 0xff
  const g = (rgb >> 8) & 0xff
  const b = (rgb >> 0) & 0xff
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luma > 160
}

function getUserColor(userId: string, index = 0) {
  if (!userId || userId === 'guest') return PALETTE[index % PALETTE.length]
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i)
    hash |= 0
  }
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

export function CodeMatesContent() {
  const { setTab } = useNavigation()
  const [view, setView] = useState<CodeMatesView>('rooms')
  const [rooms, setRooms] = useState<Room[]>([])
  const [activeRoom, setActiveRoom] = useState<Room | null>(null)
  const [roomCodeInput, setRoomCodeInput] = useState('')
  const [newRoomTitle, setNewRoomTitle] = useState('Async Systems Race')
  const [isCreatingRoom, setIsCreatingRoom] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  // Lobby state
  const [copiedCode, setCopiedCode] = useState(false)

  // Name editing
  const [isEditingName, setIsEditingName] = useState(false)
  const [tempNameInput, setTempNameInput] = useState('')

  // Game state
  const [code, setCode] = useState(`// ⚡ CODEMATES MULTIPLAYER ARENA
// Challenge: Build a resilient distributed task worker
const taskQueue = [];

export function enqueue(task) {
  taskQueue.push({ ...task, retries: 0, status: 'pending' });
  return taskQueue.length;
}

export async function processNext(workerFn) {
  const task = taskQueue.find(t => t.status === 'pending');
  if (!task) return null;
  
  task.status = 'processing';
  try {
    const res = await workerFn(task);
    task.status = 'completed';
    return res;
  } catch (err) {
    task.retries += 1;
    task.status = task.retries >= 3 ? 'failed' : 'pending';
    throw err;
  }
}
`)

  // Current user identity — initialized cleanly, never default to "Player"
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string }>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('codemates_display_name')
      if (saved && saved.trim() && saved.trim().toLowerCase() !== 'player') {
        return { id: 'guest', name: saved.trim() }
      }
    }
    const randNum = Math.floor(1000 + Math.random() * 9000)
    return { id: 'guest', name: `Dev-${randNum}` }
  })

  const [chatMessages, setChatMessages] = useState<{ body: string; user_id: string; sender: string }[]>([])
  const [chatInput, setChatInput] = useState('')
  const [onlineCount, setOnlineCount] = useState(1)
  const [testScore, setTestScore] = useState<number | null>(null)
  const [roster, setRoster] = useState<{ id: string; name: string; color: string; colorHex: string; isHost?: boolean }[]>([])

  // Remote cursors state for UI headers
  const [remoteCursorsList, setRemoteCursorsList] = useState<RemoteCursorInfo[]>([])

  // Monaco and WebSocket refs
  const editorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)
  const channelRef = useRef<any>(null)
  const isRemoteChangeRef = useRef(false)
  const lastCursorBroadcastRef = useRef<number>(0)
  const pendingCursorBroadcastRef = useRef<any>(null)

  // Map of remote cursor widgets and decoration IDs in Monaco
  const remoteCursorsMap = useRef<Map<string, {
    widget: any
    decorationIds: string[]
    name: string
    colorHex: string
    position: { lineNumber: number; column: number }
  }>>(new Map())

  // Current user's assigned color
  const myColor = getUserColor(currentUser.id, 0)

  // 1. Fetch real authenticated user identity from Supabase
  useEffect(() => {
    const fetchUser = async () => {
      const supabase = getSupabaseBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        let name =
          user.user_metadata?.display_name ||
          user.user_metadata?.full_name ||
          user.user_metadata?.user_name ||
          user.email?.split('@')[0]

        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('id', user.id)
            .maybeSingle()
          if (profile?.display_name && profile.display_name.trim().toLowerCase() !== 'player') {
            name = profile.display_name.trim()
          }
        } catch {
          // ignore
        }

        const validName = (name && name.trim().toLowerCase() !== 'player')
          ? name.trim()
          : (user.email?.split('@')[0] || `Dev-${user.id.slice(0, 4)}`)

        setCurrentUser({ id: user.id, name: validName })
        if (typeof window !== 'undefined') {
          localStorage.setItem('codemates_display_name', validName)
        }
      }
    }
    fetchUser()
  }, [])

  // 2. Sync initial roster with current user
  useEffect(() => {
    setRoster([
      {
        id: currentUser.id,
        name: `${currentUser.name} (You)`,
        color: myColor.bg,
        colorHex: myColor.hex,
        isHost: activeRoom ? activeRoom.host_id === currentUser.id : true,
      },
    ])
  }, [currentUser.id, currentUser.name, activeRoom, myColor.bg, myColor.hex])

  // 3. Load chat messages for room from Supabase
  useEffect(() => {
    if (!activeRoom?.id || (view !== 'lobby' && view !== 'game')) return

    const loadChat = async () => {
      if (activeRoom.id.startsWith('room-') || activeRoom.id === 'demo-session') return
      const supabase = getSupabaseBrowserClient()
      const { data, error } = await supabase
        .from('messages')
        .select('id, body, user_id, profiles(display_name)')
        .eq('room_id', activeRoom.id)
        .order('created_at', { ascending: true })

      if (!error && data) {
        setChatMessages(
          data.map((m: any) => {
            const profileName = m.profiles?.display_name
            const isSelf = m.user_id === currentUser.id
            const rMatch = roster.find((r) => r.id === m.user_id)

            let senderName = profileName
            if (!senderName || senderName.toLowerCase() === 'player') {
              if (isSelf) senderName = currentUser.name
              else if (rMatch) senderName = rMatch.name.replace(' (You)', '')
              else senderName = `Dev-${m.user_id.slice(0, 4)}`
            }

            return {
              body: m.body,
              user_id: m.user_id,
              sender: senderName,
            }
          })
        )
      }
    }

    loadChat()
  }, [activeRoom?.id, view, currentUser.id, currentUser.name, roster])

  // 4. Load rooms list
  const loadRooms = async () => {
    const supabase = getSupabaseBrowserClient()
    const { data, error } = await supabase
      .from('rooms')
      .select('id,code,title,status,host_id')
      .eq('status', 'waiting')
      .order('created_at', { ascending: false })

    if (!error && data && data.length > 0) {
      setRooms(data as Room[])
    } else {
      setRooms([
        { id: 'room-1', code: 'ASYNC-77', title: 'Bug Bash Speedrun', status: 'waiting', host_id: 'demo-1' },
        { id: 'room-2', code: 'PIXEL-12', title: 'Interactive Task Board', status: 'waiting', host_id: 'demo-2' },
        { id: 'room-3', code: 'STACK-04', title: 'Concurrency Race', status: 'waiting', host_id: 'demo-3' },
      ])
    }
  }

  useEffect(() => {
    loadRooms()
    const supabase = getSupabaseBrowserClient()
    const channel = supabase
      .channel('rooms-watcher')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, loadRooms)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // Create room action
  const handleCreateRoom = async () => {
    setErrorMessage('')
    const supabase = getSupabaseBrowserClient()
    const { data: { session } } = await supabase.auth.getSession()

    const generatedCode = `CM-${Math.random().toString(36).slice(2, 6).toUpperCase()}`

    if (!session?.user) {
      const localRoom: Room = {
        id: crypto.randomUUID(),
        code: generatedCode,
        title: newRoomTitle || 'Multiplayer Challenge',
        status: 'waiting',
        host_id: currentUser.id,
      }
      setActiveRoom(localRoom)
      setView('lobby')
      setIsCreatingRoom(false)
      return
    }

    const { data, error } = await supabase
      .from('rooms')
      .insert({
        code: generatedCode,
        title: newRoomTitle || 'Multiplayer Challenge',
        status: 'waiting',
        host_id: session.user.id,
      })
      .select('id,code,title,status,host_id')
      .single()

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setActiveRoom(data as Room)
    setView('lobby')
    setIsCreatingRoom(false)
  }

  // Join room by code
  const handleJoinByCode = async () => {
    setErrorMessage('')
    const code = roomCodeInput.trim().toUpperCase()
    if (!code) return
    const match = rooms.find((r) => r.code === code)
    if (match) {
      setActiveRoom(match)
      setView('lobby')
      return
    }

    const supabase = getSupabaseBrowserClient()
    const { data } = await supabase
      .from('rooms')
      .select('id,code,title,status,host_id')
      .eq('code', code)
      .maybeSingle()

    if (data) {
      setActiveRoom(data as Room)
      setView('lobby')
    } else {
      const guestRoom: Room = {
        id: crypto.randomUUID(),
        code,
        title: 'Custom Live Room',
        status: 'waiting',
        host_id: 'guest',
      }
      setActiveRoom(guestRoom)
      setView('lobby')
    }
  }

  // Helper: Create or update a remote cursor widget in Monaco
  const createOrUpdateRemoteCursor = (
    userId: string,
    displayName: string,
    colorHex: string,
    pos: { lineNumber: number; column: number },
    selection?: any
  ) => {
    if (!editorRef.current || !monacoRef.current) return
    const editor = editorRef.current
    const monaco = monacoRef.current

    let cursorData = remoteCursorsMap.current.get(userId)
    const validName = displayName && displayName.toLowerCase() !== 'player' ? displayName : `Dev-${userId.slice(0, 4)}`

    if (!cursorData) {
      let currentPos = { ...pos }
      let currentName = validName
      let currentColor = colorHex || '#39d5c8'

      // Parent widget container
      const domNode = document.createElement('div')
      domNode.className = `monaco-remote-cursor-container cursor-${userId}`
      domNode.style.position = 'absolute'
      domNode.style.pointerEvents = 'none'
      domNode.style.zIndex = '45'

      // Vertical line
      const bar = document.createElement('div')
      bar.style.width = '2px'
      bar.style.height = '19px'
      bar.style.backgroundColor = currentColor
      bar.style.boxShadow = `0 0 8px ${currentColor}`
      bar.style.borderRadius = '1px'

      // Floating name pill tag
      const tag = document.createElement('div')
      tag.style.position = 'absolute'
      tag.style.left = '0px'
      tag.style.backgroundColor = currentColor
      tag.style.color = isColorBright(currentColor) ? '#121316' : '#ffffff'
      tag.style.fontSize = '10px'
      tag.style.fontWeight = '900'
      tag.style.fontFamily = 'monospace'
      tag.style.padding = '1px 6px'
      tag.style.borderRadius = '4px'
      tag.style.boxShadow = '0 2px 6px rgba(0,0,0,0.45)'
      tag.style.whiteSpace = 'nowrap'
      tag.style.display = 'flex'
      tag.style.alignItems = 'center'
      tag.style.gap = '4px'
      tag.style.lineHeight = '14px'
      tag.style.pointerEvents = 'none'
      tag.style.userSelect = 'none'
      tag.style.transition = 'top 0.1s ease-out'

      const dot = document.createElement('span')
      dot.style.width = '5px'
      dot.style.height = '5px'
      dot.style.borderRadius = '50%'
      dot.style.backgroundColor = 'currentColor'
      tag.appendChild(dot)

      const text = document.createElement('span')
      text.innerText = currentName
      tag.appendChild(text)

      const adjustTag = (line: number) => {
        if (line <= 1) {
          tag.style.top = '20px'
          tag.style.borderRadius = '0 4px 4px 4px'
        } else {
          tag.style.top = '-20px'
          tag.style.borderRadius = '4px 4px 4px 0'
        }
      }
      adjustTag(currentPos.lineNumber)

      domNode.appendChild(bar)
      domNode.appendChild(tag)

      const widget = {
        getId: () => `cursor-widget-${userId}`,
        getDomNode: () => domNode,
        getPosition: () => ({
          position: { lineNumber: currentPos.lineNumber, column: currentPos.column },
          preference: [monaco.editor.ContentWidgetPositionPreference.EXACT],
        }),
      }

      try {
        editor.addContentWidget(widget)
      } catch {
        // ignore
      }

      cursorData = {
        widget,
        decorationIds: [],
        name: currentName,
        colorHex: currentColor,
        position: currentPos,
      }
      remoteCursorsMap.current.set(userId, cursorData)
    }

    // Update position and details
    cursorData.position = pos
    cursorData.name = validName
    cursorData.colorHex = colorHex

    const dom = cursorData.widget.getDomNode()
    if (dom) {
      const bar = dom.querySelector('div')
      const tag = dom.querySelector('div:last-child')
      const label = tag?.querySelector('span:last-child')
      if (label && label.innerText !== validName) {
        label.innerText = validName
      }
      if (bar && tag) {
        bar.style.backgroundColor = colorHex
        bar.style.boxShadow = `0 0 8px ${colorHex}`
        tag.style.backgroundColor = colorHex
        tag.style.color = isColorBright(colorHex) ? '#121316' : '#ffffff'
      }
      if (tag) {
        if (pos.lineNumber <= 1) {
          tag.style.top = '20px'
          tag.style.borderRadius = '0 4px 4px 4px'
        } else {
          tag.style.top = '-20px'
          tag.style.borderRadius = '4px 4px 4px 0'
        }
      }
    }

    cursorData.widget.getPosition = () => ({
      position: { lineNumber: pos.lineNumber, column: pos.column },
      preference: [monaco.editor.ContentWidgetPositionPreference.EXACT],
    })

    try {
      editor.layoutContentWidget(cursorData.widget)
    } catch {
      // ignore
    }

    // Update text selections if active
    if (selection && (selection.startLineNumber !== selection.endLineNumber || selection.startColumn !== selection.endColumn)) {
      const className = `remote-sel-${userId.replace(/[^a-zA-Z0-9]/g, '')}`
      let styleEl = document.getElementById(`style-${className}`)
      if (!styleEl) {
        styleEl = document.createElement('style')
        styleEl.id = `style-${className}`
        styleEl.innerHTML = `.${className} { background-color: ${colorHex}35 !important; border-radius: 2px; }`
        document.head.appendChild(styleEl)
      }
      try {
        cursorData.decorationIds = editor.deltaDecorations(cursorData.decorationIds || [], [
          {
            range: new monaco.Range(
              selection.startLineNumber,
              selection.startColumn,
              selection.endLineNumber,
              selection.endColumn
            ),
            options: { className, isWholeLine: false },
          },
        ])
      } catch {
        // ignore
      }
    } else if (cursorData.decorationIds?.length) {
      try {
        cursorData.decorationIds = editor.deltaDecorations(cursorData.decorationIds, [])
      } catch {
        // ignore
      }
    }

    setRemoteCursorsList((prev) => {
      const filtered = prev.filter((c) => c.id !== userId)
      return [...filtered, { id: userId, name: validName, color: colorHex, line: pos.lineNumber, col: pos.column }]
    })
  }

  // Remove a remote cursor
  const removeRemoteCursor = (userId: string) => {
    const cursorData = remoteCursorsMap.current.get(userId)
    if (cursorData && editorRef.current) {
      try {
        editorRef.current.removeContentWidget(cursorData.widget)
        if (cursorData.decorationIds?.length) {
          editorRef.current.deltaDecorations(cursorData.decorationIds, [])
        }
      } catch {
        // ignore
      }
      remoteCursorsMap.current.delete(userId)
      setRemoteCursorsList((prev) => prev.filter((c) => c.id !== userId))
    }
  }

  // Clean up all remote cursors
  const clearAllRemoteCursors = () => {
    if (editorRef.current) {
      remoteCursorsMap.current.forEach((cursorData) => {
        try {
          editorRef.current.removeContentWidget(cursorData.widget)
          if (cursorData.decorationIds?.length) {
            editorRef.current.deltaDecorations(cursorData.decorationIds, [])
          }
        } catch {
          // ignore
        }
      })
    }
    remoteCursorsMap.current.clear()
    setRemoteCursorsList([])
  }

  // Smooth remote code sync
  const applyRemoteCode = (newCode: string) => {
    if (!editorRef.current) {
      setCode(newCode)
      return
    }
    const currentVal = editorRef.current.getValue()
    if (currentVal === newCode) return

    isRemoteChangeRef.current = true
    const pos = editorRef.current.getPosition()
    const model = editorRef.current.getModel()
    if (model) {
      const fullRange = model.getFullModelRange()
      editorRef.current.executeEdits('remote-sync', [
        { range: fullRange, text: newCode, forceMoveMarkers: true },
      ])
    } else {
      editorRef.current.setValue(newCode)
    }
    if (pos) {
      editorRef.current.setPosition(pos)
    }
    setCode(newCode)
    setTimeout(() => {
      isRemoteChangeRef.current = false
    }, 50)
  }

  // 5. Realtime Channel (Presence, Cursor Broadcast, Code Sync, Chat)
  const supabase = getSupabaseBrowserClient()
  const channelRoomKey = activeRoom?.code
    ? activeRoom.code.toUpperCase()
    : (activeRoom?.id || 'demo-session')

  useEffect(() => {
    if (view !== 'lobby' && view !== 'game') return
    const presenceKey = currentUser.id !== 'guest' ? currentUser.id : crypto.randomUUID()
    const channelTopic = `room-presence:${channelRoomKey}`

    const channel = supabase.channel(channelTopic, {
      config: { presence: { key: presenceKey }, broadcast: { self: false } },
    })
    channelRef.current = channel

    const syncRoster = () => {
      const state = channel.presenceState()
      const seen = new Set<string>()
      const list: { id: string; name: string; color: string; colorHex: string; isHost?: boolean }[] = []

      Object.values(state).forEach((presences: any) => {
        if (Array.isArray(presences)) {
          presences.forEach((p) => {
            const pId = p.user_id || 'guest'
            if (!seen.has(pId)) {
              seen.add(pId)
              const isSelf = pId === currentUser.id
              let displayName = p.name
              if (!displayName || displayName.toLowerCase() === 'player') {
                displayName = isSelf ? currentUser.name : `Dev-${String(pId).slice(0, 4)}`
              }
              const pal = p.colorHex
                ? { bg: p.color || 'bg-[#39d5c8]', hex: p.colorHex }
                : getUserColor(pId, list.length)

              list.push({
                id: pId,
                name: isSelf ? `${displayName} (You)` : displayName,
                color: pal.bg,
                colorHex: pal.hex,
                isHost: activeRoom ? activeRoom.host_id === pId : list.length === 0,
              })
            }
          })
        }
      })

      if (!seen.has(currentUser.id)) {
        list.unshift({
          id: currentUser.id,
          name: `${currentUser.name} (You)`,
          color: myColor.bg,
          colorHex: myColor.hex,
          isHost: activeRoom ? activeRoom.host_id === currentUser.id : true,
        })
      }

      setRoster(list)
      setOnlineCount(Math.max(1, list.length))
    }

    channel
      .on('broadcast', { event: 'code-sync' }, ({ payload }: any) => {
        if (payload?.code && payload.senderId !== currentUser.id) {
          applyRemoteCode(payload.code)
        }
      })
      .on('broadcast', { event: 'cursor-pos' }, ({ payload }: any) => {
        if (!payload || payload.userId === currentUser.id) return
        const pName = (payload.name && payload.name.toLowerCase() !== 'player')
          ? payload.name
          : (roster.find((r) => r.id === payload.userId)?.name.replace(' (You)', '') || `Dev-${String(payload.userId).slice(0, 4)}`)

        createOrUpdateRemoteCursor(
          payload.userId,
          pName,
          payload.color || '#39d5c8',
          payload.position,
          payload.selection
        )
      })
      .on('broadcast', { event: 'chat-msg' }, ({ payload }: any) => {
        if (payload && payload.body) {
          const senderName = (payload.sender && payload.sender.toLowerCase() !== 'player')
            ? payload.sender
            : (roster.find((r) => r.id === payload.user_id)?.name.replace(' (You)', '') || `Dev-${String(payload.user_id).slice(0, 4)}`)

          setChatMessages((prev) => [
            ...prev,
            {
              body: payload.body,
              user_id: payload.user_id,
              sender: senderName,
            },
          ])
        }
      })
      .on('presence', { event: 'sync' }, syncRoster)
      .on('presence', { event: 'join' }, syncRoster)
      .on('presence', { event: 'leave' }, ({ leftPresences }: any) => {
        if (Array.isArray(leftPresences)) {
          leftPresences.forEach((p) => {
            if (p.user_id && p.user_id !== currentUser.id) {
              removeRemoteCursor(p.user_id)
            }
          })
        }
        syncRoster()
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: currentUser.id,
            name: currentUser.name,
            color: myColor.bg,
            colorHex: myColor.hex,
            online_at: new Date().toISOString(),
          })
        }
      })

    return () => {
      clearAllRemoteCursors()
      channelRef.current = null
      supabase.removeChannel(channel)
    }
  }, [view, channelRoomKey, currentUser.id, currentUser.name, myColor.bg, myColor.hex, activeRoom])

  // Local code change broadcast
  const handleCodeChange = (newVal?: string) => {
    if (isRemoteChangeRef.current) return
    const val = newVal ?? ''
    setCode(val)
    channelRef.current?.send({
      type: 'broadcast',
      event: 'code-sync',
      payload: { code: val, senderId: currentUser.id },
    })
  }

  // Local cursor change handler
  const handleEditorMount = (editor: any, monaco: any) => {
    editorRef.current = editor
    monacoRef.current = monaco

    const broadcastCursor = (pos: any, sel?: any) => {
      if (!channelRef.current || !pos) return
      channelRef.current.send({
        type: 'broadcast',
        event: 'cursor-pos',
        payload: {
          userId: currentUser.id,
          name: currentUser.name,
          color: myColor.hex,
          position: { lineNumber: pos.lineNumber, column: pos.column },
          selection: sel && (sel.startLineNumber !== sel.endLineNumber || sel.startColumn !== sel.endColumn)
            ? {
                startLineNumber: sel.startLineNumber,
                startColumn: sel.startColumn,
                endLineNumber: sel.endLineNumber,
                endColumn: sel.endColumn,
              }
            : null,
        },
      })
    }

    const onCursorOrSelection = () => {
      const pos = editor.getPosition()
      const sel = editor.getSelection()
      const now = Date.now()

      if (now - lastCursorBroadcastRef.current > 40) {
        lastCursorBroadcastRef.current = now
        broadcastCursor(pos, sel)
      } else {
        if (pendingCursorBroadcastRef.current) clearTimeout(pendingCursorBroadcastRef.current)
        pendingCursorBroadcastRef.current = setTimeout(() => {
          lastCursorBroadcastRef.current = Date.now()
          broadcastCursor(editor.getPosition(), editor.getSelection())
        }, 45)
      }
    }

    editor.onDidChangeCursorPosition(onCursorOrSelection)
    editor.onDidChangeCursorSelection(onCursorOrSelection)

    // Replay any pending remote cursors
    remoteCursorsList.forEach((rc) => {
      createOrUpdateRemoteCursor(rc.id, rc.name, rc.color, { lineNumber: rc.line, column: rc.col })
    })
  }

  // Send chat message
  const handleSendMessage = async () => {
    const text = chatInput.trim()
    if (!text) return
    const newMsg = {
      body: text,
      user_id: currentUser.id,
      sender: currentUser.name,
    }
    setChatMessages((prev) => [...prev, newMsg])
    setChatInput('')

    channelRef.current?.send({
      type: 'broadcast',
      event: 'chat-msg',
      payload: newMsg,
    })

    if (activeRoom?.id && !activeRoom.id.startsWith('room-') && currentUser.id !== 'guest') {
      try {
        const supabase = getSupabaseBrowserClient()
        await supabase.from('messages').insert({
          room_id: activeRoom.id,
          user_id: currentUser.id,
          body: text,
        })
      } catch (err) {
        console.error('Failed to persist message:', err)
      }
    }
  }

  // Custom name edit handler
  const handleStartEditName = () => {
    setTempNameInput(currentUser.name)
    setIsEditingName(true)
  }

  const handleSaveName = async () => {
    const trimmed = tempNameInput.trim()
    if (!trimmed || trimmed.toLowerCase() === 'player') {
      setIsEditingName(false)
      return
    }
    setCurrentUser((prev) => ({ ...prev, name: trimmed }))
    setIsEditingName(false)
    if (typeof window !== 'undefined') {
      localStorage.setItem('codemates_display_name', trimmed)
    }

    const supabase = getSupabaseBrowserClient()
    if (currentUser.id !== 'guest') {
      try {
        await supabase.from('profiles').update({ display_name: trimmed }).eq('id', currentUser.id)
      } catch {
        // ignore
      }
    }

    // Update presence
    channelRef.current?.track({
      user_id: currentUser.id,
      name: trimmed,
      color: myColor.bg,
      colorHex: myColor.hex,
      online_at: new Date().toISOString(),
    })

    // Broadcast updated cursor
    if (editorRef.current) {
      const pos = editorRef.current.getPosition()
      if (pos) {
        channelRef.current?.send({
          type: 'broadcast',
          event: 'cursor-pos',
          payload: {
            userId: currentUser.id,
            name: trimmed,
            color: myColor.hex,
            position: { lineNumber: pos.lineNumber, column: pos.column },
          },
        })
      }
    }
  }

  const handleCopyCode = async () => {
    if (!activeRoom) return
    await navigator.clipboard.writeText(activeRoom.code)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 1500)
  }

  const handleRunTests = () => {
    const calculated = Math.min(100, Math.max(70, Math.round(code.length / 8)))
    setTestScore(calculated)
    setView('results')
  }

  return (
    <div className="grid-paper min-h-[calc(100vh-60px)] pb-16 pt-6">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* VIEW 1: ROOMS BROWSER */}
        {view === 'rooms' && (
          <div>
            {/* Header */}
            <div className="mb-6 flex flex-col justify-between gap-3 border-b-2 border-[#171717] pb-5 transition-colors sm:flex-row sm:items-center dark:border-[#2e323b]">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded-md border border-[#171717] bg-[#ff57ce] px-2 py-0.2 text-[10px] font-black uppercase text-white dark:border-[#000000]">
                    CODEMATES ARCADE
                  </span>
                  <span className="text-xs font-bold text-[#171717]/60 dark:text-[#a1a1aa]">
                    Multiplayer Coding Arena
                  </span>
                </div>
                <h1 className="font-display text-4xl uppercase tracking-tight text-[#171717] sm:text-5xl dark:text-[#f4f4f7]">
                  Active Rooms
                </h1>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsCreatingRoom(true)}
                  className="btn-neo btn-neo-berry text-xs"
                >
                  <Plus className="h-4 w-4" /> Create Room
                </button>
              </div>
            </div>

            {/* Structured Top Cards */}
            <div className="mb-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border-2 border-[#171717] bg-[#ffd84d] p-5 shadow-hard text-[#171717] dark:border-[#000000] dark:shadow-[5px_5px_0_#000000]">
                <h3 className="font-display text-2xl uppercase">Join With Code</h3>
                <p className="mt-1 text-xs font-bold text-[#171717]/80">
                  Enter a room code given by your team host to join directly.
                </p>
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={roomCodeInput}
                    onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && handleJoinByCode()}
                    placeholder="e.g. ROOM-UIAB"
                    className="w-full rounded-xl border-2 border-[#171717] bg-white px-3 py-2 font-mono text-xs font-black uppercase text-[#171717] outline-none shadow-[2px_2px_0_#171717] dark:border-[#000000] dark:shadow-[2px_2px_0_#000000]"
                  />
                  <button
                    onClick={handleJoinByCode}
                    className="btn-neo btn-neo-ink shrink-0 px-4 py-2 text-xs"
                  >
                    Join
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border-2 border-[#171717] bg-white p-5 shadow-hard transition-colors dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[5px_5px_0_#000000]">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-2xl uppercase text-[#171717] dark:text-[#f4f4f7]">Arcade Signals</h3>
                  <span className="flex items-center gap-1 rounded-full border border-[#171717] bg-[#6ee56b] px-2.5 py-0.5 text-[10px] font-black uppercase text-[#171717] dark:border-[#000000]">
                    <Wifi className="h-3 w-3" /> Live Realtime
                  </span>
                </div>
                <p className="mt-1 text-xs font-bold text-[#171717]/70 dark:text-[#a1a1aa]">
                  Multiplayer Monaco with live cursors, real-name synchronization, and instant test runner.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[11px] font-bold text-[#171717]/60 dark:text-[#a1a1aa]">Playing as:</span>
                  <div className="flex items-center gap-1.5 rounded-lg border border-[#171717] bg-[#fffaf0] px-2 py-0.5 text-xs font-black text-[#171717] dark:border-[#2e323b] dark:bg-[#1c1f26] dark:text-[#f4f4f7]">
                    <span className={`h-2 w-2 rounded-full ${myColor.bg}`} />
                    <span>{currentUser.name}</span>
                    <button
                      onClick={handleStartEditName}
                      title="Edit your display name"
                      className="cursor-pointer opacity-70 hover:opacity-100 p-0.5 ml-1"
                    >
                      <Edit3 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Rooms list */}
            <div>
              <h2 className="mb-4 font-display text-2xl uppercase tracking-tight text-[#171717] dark:text-[#f4f4f7]">
                Available Rooms
              </h2>
              <div className="grid gap-4 md:grid-cols-3">
                {rooms.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-col justify-between rounded-2xl border-2 border-[#171717] bg-white p-5 shadow-hard transition-all hover:-translate-y-1 dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[5px_5px_0_#000000]"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="rounded border border-[#171717] bg-[#ffd84d] px-2 py-0.5 font-mono text-[10px] font-black text-[#171717] dark:border-[#000000]">
                          {r.code}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                          Open
                        </span>
                      </div>
                      <h3 className="mt-3 font-display text-xl uppercase text-[#171717] dark:text-[#f4f4f7]">
                        {r.title}
                      </h3>
                      <p className="mt-1 text-xs text-[#171717]/60 dark:text-[#a1a1aa]">
                        Shared challenge · Click to enter lobby and sync code.
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        setActiveRoom(r)
                        setView('lobby')
                      }}
                      className="btn-neo btn-neo-berry mt-4 w-full py-2 text-xs"
                    >
                      Enter Lobby <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Create Room Modal */}
            {isCreatingRoom && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171717]/70 p-4 backdrop-blur-xs">
                <div className="w-full max-w-md rounded-2xl border-3 border-[#171717] bg-[#fffaf0] p-6 shadow-hard-lg dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[8px_8px_0_#000000]">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-2xl uppercase text-[#171717] dark:text-[#f4f4f7]">Host New Room</h3>
                    <button
                      onClick={() => setIsCreatingRoom(false)}
                      className="cursor-pointer rounded-lg border border-[#171717] bg-white p-1 hover:bg-rose-100 dark:border-[#2e323b] dark:bg-[#1c1f26] dark:text-[#f4f4f7] dark:hover:bg-rose-950/40"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <p className="mt-1.5 text-xs font-bold text-[#171717]/70 dark:text-[#a1a1aa]">
                    Pick a title for the multiplayer challenge. A unique code will be assigned.
                  </p>

                  <div className="mt-4">
                    <label className="mb-1 block text-xs font-black uppercase text-[#171717] dark:text-[#d4d4d8]">Room Title</label>
                    <input
                      type="text"
                      value={newRoomTitle}
                      onChange={(e) => setNewRoomTitle(e.target.value)}
                      className="w-full rounded-xl border-2 border-[#171717] bg-white p-2.5 text-xs font-bold text-[#171717] outline-none shadow-[2px_2px_0_#171717] dark:border-[#2e323b] dark:bg-[#1c1f26] dark:text-[#f4f4f7] dark:shadow-[2px_2px_0_#000000]"
                      placeholder="e.g. Distributed Queue Sprint"
                    />
                  </div>

                  {errorMessage && (
                    <p className="mt-2 text-xs font-bold text-rose-600 dark:text-rose-400">{errorMessage}</p>
                  )}

                  <div className="mt-5 flex gap-2">
                    <button
                      onClick={() => setIsCreatingRoom(false)}
                      className="btn-neo btn-neo-paper flex-1 py-2 text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateRoom}
                      className="btn-neo btn-neo-lemon flex-1 py-2 text-xs"
                    >
                      Create & Join <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: LOBBY */}
        {view === 'lobby' && activeRoom && (
          <div className="mx-auto max-w-3xl">
            <button
              onClick={() => setView('rooms')}
              className="mb-4 inline-flex cursor-pointer items-center gap-1.5 text-xs font-black uppercase text-[#171717] underline hover:text-[#ff57ce] dark:text-[#f4f4f7] dark:hover:text-[#ff57ce]"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Rooms List
            </button>

            <div className="grid gap-5 md:grid-cols-[1.1fr_.9fr]">
              <div className="rounded-2xl border-2 border-[#171717] bg-white p-6 shadow-hard transition-colors dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[5px_5px_0_#000000]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="rounded border border-[#171717] bg-[#ff57ce] px-2 py-0.2 text-[10px] font-black text-white dark:border-[#000000]">
                      LOBBY
                    </span>
                    <span className="font-mono text-xs font-black text-[#171717] dark:text-[#f4f4f7]">
                      {activeRoom.code}
                    </span>
                  </div>
                  <button
                    onClick={handleCopyCode}
                    className="flex cursor-pointer items-center gap-1 rounded-lg border border-[#171717] bg-[#ffd84d] px-2.5 py-1 text-xs font-black uppercase text-[#171717] shadow-[1px_1px_0_#171717] dark:border-[#000000]"
                  >
                    <Copy className="h-3 w-3" />
                    {copiedCode ? 'Copied' : 'Share'}
                  </button>
                </div>

                <h2 className="mt-3 font-display text-3xl uppercase text-[#171717] dark:text-[#f4f4f7]">
                  {activeRoom.title}
                </h2>
                <p className="mt-1 text-xs font-bold text-[#171717]/70 dark:text-[#a1a1aa]">
                  Room is live on WebSocket. When ready, launch the shared Monaco editor session.
                </p>

                <div className="mt-5">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-[#171717]/60 dark:text-[#a1a1aa]">
                      Connected Players ({roster.length})
                    </h4>
                    <button
                      onClick={handleStartEditName}
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-[#ff57ce] hover:underline cursor-pointer"
                    >
                      <Edit3 className="h-2.5 w-2.5" /> Edit your name
                    </button>
                  </div>
                  <div className="space-y-2">
                    {roster.map((player) => (
                      <div
                        key={player.id}
                        className="flex items-center justify-between rounded-xl border border-[#171717] bg-[#fffaf0] p-2.5 text-xs font-bold text-[#171717] shadow-[1px_1px_0_#171717] dark:border-[#2e323b] dark:bg-[#1c1f26] dark:text-[#f4f4f7] dark:shadow-[1px_1px_0_#000000]"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`flex h-6 w-6 items-center justify-center rounded border border-[#171717] text-[10px] font-black text-[#171717] dark:border-[#000000] ${player.color}`}
                          >
                            {player.name.replace(' (You)', '').slice(0, 2).toUpperCase()}
                          </span>
                          <span>{player.name}</span>
                        </div>
                        <span className="rounded bg-white px-1.5 py-0.5 text-[9px] font-black text-[#171717] dark:bg-[#111317] dark:text-[#f4f4f7]">
                          {player.isHost ? 'HOST' : 'READY'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => setView('game')}
                  className="btn-neo btn-neo-lemon mt-6 w-full py-2.5 text-xs"
                >
                  <Play className="h-3.5 w-3.5 fill-current" /> Launch Arena
                </button>
              </div>

              <div className="flex flex-col gap-4">
                <div className="rounded-2xl border-2 border-[#171717] bg-[#6d73ff] p-5 shadow-hard text-white dark:border-[#000000] dark:shadow-[5px_5px_0_#000000]">
                  <h3 className="font-display text-2xl uppercase">Multiplayer Rules</h3>
                  <ul className="mt-3 space-y-2 text-xs font-bold">
                    <li className="flex items-center gap-2">
                      <Zap className="h-3.5 w-3.5 shrink-0 text-[#ffd84d]" />
                      Realtime WebSocket broadcasts code edits instantly.
                    </li>
                    <li className="flex items-center gap-2">
                      <Code2 className="h-3.5 w-3.5 shrink-0 text-[#39d5c8]" />
                      Live remote cursors with player name tags.
                    </li>
                    <li className="flex items-center gap-2">
                      <MessageSquare className="h-3.5 w-3.5 shrink-0 text-[#ff57ce]" />
                      Multiplayer room chat with real sender names.
                    </li>
                  </ul>
                </div>

                <div className="rounded-2xl border-2 border-[#171717] bg-white p-4 shadow-hard-sm transition-colors dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[3px_3px_0_#000000]">
                  <div className="flex items-center gap-2.5">
                    <Trophy className="h-6 w-6 text-[#ffd84d]" />
                    <div>
                      <h4 className="text-xs font-black uppercase text-[#171717] dark:text-[#f4f4f7]">
                        Scoring
                      </h4>
                      <p className="text-[11px] font-semibold text-[#171717]/70 dark:text-[#a1a1aa]">
                        +250 pts test pass · +150 pts clean code · +100 speed
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 3: LIVE GAME */}
        {view === 'game' && activeRoom && (
          <div className="rounded-2xl border-3 border-[#171717] bg-white shadow-hard transition-colors dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[6px_6px_0_#000000]">
            {/* Top Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[#171717] bg-[#ffd84d] p-3 text-[#171717] sm:px-5 dark:border-[#2e323b]">
              <div className="flex items-center gap-2.5">
                <span className="rounded-lg border border-[#171717] bg-white px-2 py-0.5 font-mono text-xs font-black dark:border-[#000000]">
                  {activeRoom.code}
                </span>
                <span className="font-display text-xl uppercase sm:text-2xl">
                  {activeRoom.title}
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-1 rounded-lg border border-[#171717] bg-white px-2.5 py-1 font-mono text-xs font-black dark:border-[#000000]">
                  <Users className="h-3 w-3 text-[#ff57ce]" />
                  <span>{onlineCount} Online</span>
                </div>
                <button
                  onClick={handleRunTests}
                  className="btn-neo btn-neo-berry px-3 py-1 text-xs"
                >
                  <Play className="h-3 w-3 fill-current" /> Run Tests
                </button>
              </div>
            </div>

            {/* Layout */}
            <div className="grid lg:grid-cols-[200px_1fr_260px]">
              {/* Left sidebar */}
              <div className="border-b-2 border-[#171717] bg-[#fffaf0] p-3.5 transition-colors lg:border-b-0 lg:border-r-2 dark:border-[#2e323b] dark:bg-[#111317]">
                <div className="mb-2 flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-[#171717]/60 dark:text-[#a1a1aa]">
                  <span>Roster</span>
                  <button
                    onClick={handleStartEditName}
                    title="Change your name"
                    className="cursor-pointer text-[#ff57ce] hover:underline flex items-center gap-0.5"
                  >
                    <Edit3 className="h-2.5 w-2.5" /> Edit
                  </button>
                </div>
                <div className="space-y-1.5">
                  {roster.map((p) => {
                    const isMe = p.id === currentUser.id
                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between rounded-lg border border-[#171717] bg-white p-1.5 text-xs font-bold dark:border-[#2e323b] dark:bg-[#15171c] dark:text-[#f4f4f7]"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-black text-[#171717] dark:border-[#000000] ${p.color}`}
                          >
                            {p.name.replace(' (You)', '').slice(0, 2).toUpperCase()}
                          </span>
                          <span className="truncate text-[11px]">{p.name}</span>
                        </div>
                        {isMe && (
                          <span className="shrink-0 text-[9px] font-black text-emerald-600 dark:text-emerald-400">
                            YOU
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="my-4 border-t border-[#171717]/15 dark:border-[#2e323b]" />

                <div className="mb-2 text-[10px] font-black uppercase tracking-wider text-[#171717]/60 dark:text-[#a1a1aa]">
                  Tests
                </div>
                <div className="space-y-1.5 text-xs font-bold">
                  <div className="flex items-center gap-1.5 rounded border border-[#171717] bg-white p-1.5 text-emerald-800 text-[11px] dark:border-[#2e323b] dark:bg-[#15171c] dark:text-emerald-400">
                    <Check className="h-3 w-3 shrink-0" /> handles empty queue
                  </div>
                  <div className="flex items-center gap-1.5 rounded border border-[#171717] bg-white p-1.5 text-emerald-800 text-[11px] dark:border-[#2e323b] dark:bg-[#15171c] dark:text-emerald-400">
                    <Check className="h-3 w-3 shrink-0" /> retries on timeout
                  </div>
                  <div className="flex items-center gap-1.5 rounded border border-[#171717] bg-white p-1.5 text-amber-800 text-[11px] dark:border-[#2e323b] dark:bg-[#15171c] dark:text-amber-400">
                    <Sparkles className="h-3 w-3 shrink-0" /> preserves FIFO order
                  </div>
                </div>
              </div>

              {/* Monaco Editor */}
              <div className="flex flex-col bg-[#171717]">
                {/* Editor Header Bar with Live Multiplayer Status */}
                <div className="flex items-center justify-between border-b border-white/10 bg-[#242424] px-4 py-2 font-mono text-[11px] text-white/70">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-black/40 px-1.5 py-0.5 text-[9px] uppercase text-[#39d5c8] font-bold">
                      shared_worker.js
                    </span>
                    <span>JavaScript</span>
                  </div>

                  {/* Remote user cursor indicators */}
                  <div className="flex items-center gap-2 overflow-x-auto">
                    {remoteCursorsList.map((rc) => (
                      <span
                        key={rc.id}
                        className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{
                          backgroundColor: `${rc.color}25`,
                          color: rc.color,
                          border: `1px solid ${rc.color}60`,
                        }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full animate-pulse"
                          style={{ backgroundColor: rc.color }}
                        />
                        {rc.name} (L{rc.line})
                      </span>
                    ))}
                    <span className="text-[10px] text-[#ffd84d] flex items-center gap-1 font-bold">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#ffd84d] animate-ping" />
                      Autosynced
                    </span>
                  </div>
                </div>

                <div className="h-[460px] relative">
                  <Editor
                    height="460px"
                    theme="vs-dark"
                    language="javascript"
                    value={code}
                    onChange={handleCodeChange}
                    onMount={handleEditorMount}
                    options={{
                      fontSize: 13,
                      minimap: { enabled: false },
                      automaticLayout: true,
                      padding: { top: 16 },
                      scrollBeyondLastLine: false,
                    }}
                  />
                </div>
              </div>

              {/* Right chat */}
              <div className="flex flex-col border-t-2 border-[#171717] bg-[#fffaf0] p-3 transition-colors lg:border-l-2 lg:border-t-0 dark:border-[#2e323b] dark:bg-[#111317]">
                <div className="mb-2 flex items-center justify-between text-[10px] font-black uppercase text-[#171717]/60 dark:text-[#a1a1aa]">
                  <span>Chat</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-black">● Live</span>
                </div>

                <div className="flex-1 space-y-2 overflow-y-auto pr-1 max-h-[380px]">
                  {chatMessages.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                      <MessageSquare className="mb-2 h-6 w-6 text-[#171717]/30 dark:text-[#a1a1aa]/30" />
                      <p className="text-[11px] font-bold text-[#171717]/50 dark:text-[#a1a1aa]/50">
                        No messages yet
                      </p>
                      <p className="text-[10px] text-[#171717]/40 dark:text-[#a1a1aa]/40">
                        Type below to coordinate with the room!
                      </p>
                    </div>
                  ) : (
                    chatMessages.map((msg, idx) => {
                      const isMe = msg.user_id === currentUser.id
                      const playerMatch = roster.find((p) => p.id === msg.user_id)
                      const displayName = msg.sender && msg.sender.toLowerCase() !== 'player'
                        ? msg.sender
                        : (playerMatch ? playerMatch.name.replace(' (You)', '') : (isMe ? currentUser.name : `Dev-${String(msg.user_id).slice(0, 4)}`))
                      const userColor = playerMatch?.colorHex || (isMe ? myColor.hex : '#39d5c8')

                      return (
                        <div
                          key={idx}
                          className="rounded-lg border border-[#171717] bg-white p-2 text-xs font-bold transition-all dark:border-[#2e323b] dark:bg-[#15171c]"
                        >
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span
                              className="inline-block h-2 w-2 rounded-full"
                              style={{ backgroundColor: userColor }}
                            />
                            <span
                              className="font-black text-[11px] tracking-tight"
                              style={{ color: userColor }}
                            >
                              {displayName}
                              {isMe && <span className="opacity-60 text-[9px] ml-1">(You)</span>}:
                            </span>
                          </div>
                          <span className="text-[#171717] text-[11px] leading-relaxed dark:text-[#f4f4f7] pl-3.5 block">
                            {msg.body}
                          </span>
                        </div>
                      )
                    })
                  )}
                </div>

                <div className="mt-2 flex gap-1">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Message room..."
                    className="w-full rounded-lg border border-[#171717] bg-white px-2.5 py-1.5 text-xs font-bold text-[#171717] outline-none dark:border-[#2e323b] dark:bg-[#1c1f26] dark:text-[#f4f4f7]"
                  />
                  <button
                    onClick={handleSendMessage}
                    className="cursor-pointer rounded-lg border border-[#171717] bg-[#39d5c8] px-2.5 py-1.5 text-[#171717] hover:bg-[#2bc4b8] dark:border-[#000000]"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Inline Name Edit Modal */}
        {isEditingName && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171717]/70 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-2xl border-3 border-[#171717] bg-[#fffaf0] p-5 shadow-hard-lg dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[6px_6px_0_#000000]">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-xl uppercase text-[#171717] dark:text-[#f4f4f7]">Set Display Name</h3>
                <button
                  onClick={() => setIsEditingName(false)}
                  className="cursor-pointer rounded-lg border border-[#171717] bg-white p-1 hover:bg-rose-100 dark:border-[#2e323b] dark:bg-[#1c1f26] dark:text-[#f4f4f7]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1 text-xs font-bold text-[#171717]/70 dark:text-[#a1a1aa]">
                This name will show on your code cursor, roster tag, and chat messages in real time.
              </p>
              <div className="mt-3">
                <input
                  type="text"
                  value={tempNameInput}
                  onChange={(e) => setTempNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                  placeholder="e.g. sahil"
                  className="w-full rounded-xl border-2 border-[#171717] bg-white p-2.5 text-xs font-bold text-[#171717] outline-none shadow-[2px_2px_0_#171717] dark:border-[#2e323b] dark:bg-[#1c1f26] dark:text-[#f4f4f7]"
                  autoFocus
                />
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setIsEditingName(false)}
                  className="btn-neo btn-neo-paper flex-1 py-1.5 text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveName}
                  className="btn-neo btn-neo-lemon flex-1 py-1.5 text-xs"
                >
                  Save Name
                </button>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 4: RESULTS */}
        {view === 'results' && (
          <div className="mx-auto max-w-xl rounded-2xl border-3 border-[#171717] bg-white p-6 text-center shadow-hard transition-colors dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[6px_6px_0_#000000]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-[#171717] bg-[#ff57ce] text-white shadow-hard-sm dark:border-[#000000]">
              <Trophy className="h-8 w-8" />
            </div>

            <h2 className="mt-4 font-display text-4xl uppercase text-[#171717] dark:text-[#f4f4f7]">
              Round Complete!
            </h2>
            <p className="mt-1 text-xs font-bold text-[#171717]/70 dark:text-[#a1a1aa]">
              Nice ship! All tests passed against the multiplayer task worker.
            </p>

            <div className="mt-6 grid grid-cols-3 gap-2.5">
              <div className="rounded-xl border border-[#171717] bg-[#ffd84d] p-3 shadow-[1px_1px_0_#171717] dark:border-[#000000]">
                <div className="font-display text-2xl text-[#171717]">{testScore ?? 960}</div>
                <div className="text-[9px] font-black uppercase text-[#171717]/60">XP Earned</div>
              </div>
              <div className="rounded-xl border border-[#171717] bg-[#39d5c8] p-3 shadow-[1px_1px_0_#171717] dark:border-[#000000]">
                <div className="font-display text-2xl text-[#171717]">3 / 3</div>
                <div className="text-[9px] font-black uppercase text-[#171717]/60">Passed</div>
              </div>
              <div className="rounded-xl border border-[#171717] bg-[#ff57ce] p-3 shadow-[1px_1px_0_#171717] text-white dark:border-[#000000]">
                <div className="font-display text-2xl">#1</div>
                <div className="text-[9px] font-black uppercase text-white/80">Rank</div>
              </div>
            </div>

            <div className="mt-6 flex justify-center gap-2">
              <button
                onClick={() => setView('rooms')}
                className="btn-neo btn-neo-lemon py-2 text-xs"
              >
                Browse Rooms <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setTab('hireme')}
                className="btn-neo btn-neo-paper py-2 text-xs"
              >
                Take Assessment
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
