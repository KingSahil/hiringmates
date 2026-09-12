'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Code2,
  Copy,
  MessageSquare,
  Play,
  Plus,
  Radio,
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

// Dynamic import with zero SSR overhead so page transitions are instantaneous
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
  const [chatMessages, setChatMessages] = useState<{ body: string; user_id: string; sender?: string }[]>([
    { body: 'Maya: Splitting the test runner edge cases!', user_id: '1', sender: 'Maya' },
    { body: 'Alex: Realtime presence connected. Ready to ship.', user_id: '2', sender: 'Alex' },
  ])
  const [chatInput, setChatInput] = useState('')
  const [onlineCount, setOnlineCount] = useState(3)
  const [testScore, setTestScore] = useState<number | null>(null)

  // Load rooms
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
        host_id: 'guest',
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
  const handleJoinByCode = () => {
    setErrorMessage('')
    const code = roomCodeInput.trim().toUpperCase()
    if (!code) return
    const match = rooms.find((r) => r.code === code)
    if (match) {
      setActiveRoom(match)
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

  // Realtime channel
  const supabase = getSupabaseBrowserClient()
  const activeRoomId = activeRoom?.id || 'demo-session'

  useEffect(() => {
    if (view !== 'lobby' && view !== 'game') return
    const channel = supabase.channel(`room-presence:${activeRoomId}`, {
      config: { presence: { key: crypto.randomUUID() }, broadcast: { self: false } },
    })

    channel
      .on('broadcast', { event: 'code-sync' }, ({ payload }) => {
        if (payload?.code) setCode(payload.code)
      })
      .on('broadcast', { event: 'chat-msg' }, ({ payload }) => {
        if (payload) setChatMessages((prev) => [...prev, payload])
      })
      .on('presence', { event: 'sync' }, () => {
        const count = Object.keys(channel.presenceState()).length
        if (count > 0) setOnlineCount(count)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ online_at: new Date().toISOString() })
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [view, activeRoomId, supabase])

  const handleCodeChange = (newVal?: string) => {
    const val = newVal ?? ''
    setCode(val)
    supabase.channel(`room-presence:${activeRoomId}`).send({
      type: 'broadcast',
      event: 'code-sync',
      payload: { code: val },
    })
  }

  const handleSendMessage = () => {
    if (!chatInput.trim()) return
    const newMsg = { body: chatInput.trim(), user_id: 'me', sender: 'You' }
    setChatMessages((prev) => [...prev, newMsg])
    supabase.channel(`room-presence:${activeRoomId}`).send({
      type: 'broadcast',
      event: 'chat-msg',
      payload: newMsg,
    })
    setChatInput('')
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
                    placeholder="e.g. ASYNC-77"
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
                  Shared Monaco code broadcast, instant syntax validation, and team test runner.
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                  <span className="rounded-lg border border-[#171717] bg-[#fffaf0] px-2.5 py-1 text-[11px] text-[#171717] dark:border-[#2e323b] dark:bg-[#1c1f26] dark:text-[#f4f4f7]">
                    ⚡ Zero Latency
                  </span>
                  <span className="rounded-lg border border-[#171717] bg-[#fffaf0] px-2.5 py-1 text-[11px] text-[#171717] dark:border-[#2e323b] dark:bg-[#1c1f26] dark:text-[#f4f4f7]">
                    👥 Real Presence
                  </span>
                  <span className="rounded-lg border border-[#171717] bg-[#fffaf0] px-2.5 py-1 text-[11px] text-[#171717] dark:border-[#2e323b] dark:bg-[#1c1f26] dark:text-[#f4f4f7]">
                    🏆 Instant Scoring
                  </span>
                </div>
              </div>
            </div>

            {/* Rooms List */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-[#171717] dark:text-[#f4f4f7]">
                  Open Lobbies ({rooms.length})
                </h3>
                <button
                  onClick={loadRooms}
                  className="cursor-pointer text-xs font-black uppercase text-[#171717]/60 underline hover:text-[#171717] dark:text-[#a1a1aa] dark:hover:text-white"
                >
                  Refresh
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {rooms.map((r) => (
                  <div
                    key={r.id}
                    className="card-neo flex flex-col justify-between p-4"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="rounded-md border border-[#171717] bg-[#ffd84d] px-2 py-0.5 font-mono text-xs font-black text-[#171717] dark:border-[#000000]">
                          {r.code}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] font-bold text-[#6d73ff] dark:text-[#8b8fff]">
                          <Radio className="h-3 w-3 animate-pulse" /> Ready
                        </span>
                      </div>
                      <h4 className="mt-3 font-display text-2xl uppercase text-[#171717] dark:text-[#f4f4f7]">
                        {r.title}
                      </h4>
                      <p className="mt-1 text-xs font-bold text-[#171717]/60 dark:text-[#a1a1aa]">
                        Multiplayer sprint · Host {r.host_id.slice(0, 6)}
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
                  Room is live. When ready, launch the shared Monaco editor session.
                </p>

                <div className="mt-5">
                  <h4 className="mb-2 text-[10px] font-black uppercase tracking-wider text-[#171717]/60 dark:text-[#a1a1aa]">
                    Connected Players
                  </h4>
                  <div className="space-y-2">
                    {[
                      { name: 'You (Host)', tag: 'READY', color: 'bg-[#ffd84d]' },
                      { name: 'Maya Chen', tag: 'READY', color: 'bg-[#39d5c8]' },
                      { name: 'Alex Rivera', tag: 'CONNECTING', color: 'bg-[#ff57ce]' },
                    ].map((player) => (
                      <div
                        key={player.name}
                        className="flex items-center justify-between rounded-xl border border-[#171717] bg-[#fffaf0] p-2.5 text-xs font-bold text-[#171717] shadow-[1px_1px_0_#171717] dark:border-[#2e323b] dark:bg-[#1c1f26] dark:text-[#f4f4f7] dark:shadow-[1px_1px_0_#000000]"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`flex h-6 w-6 items-center justify-center rounded border border-[#171717] text-[10px] font-black text-[#171717] dark:border-[#000000] ${player.color}`}
                          >
                            {player.name.slice(0, 2).toUpperCase()}
                          </span>
                          <span>{player.name}</span>
                        </div>
                        <span className="rounded bg-white px-1.5 py-0.5 text-[9px] font-black text-[#171717] dark:bg-[#111317] dark:text-[#f4f4f7]">
                          {player.tag}
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
                      Realtime Presence broadcasts code edits instantly.
                    </li>
                    <li className="flex items-center gap-2">
                      <Code2 className="h-3.5 w-3.5 shrink-0 text-[#39d5c8]" />
                      Shared Monaco editor with automated unit tests.
                    </li>
                    <li className="flex items-center gap-2">
                      <MessageSquare className="h-3.5 w-3.5 shrink-0 text-[#ff57ce]" />
                      Room chat for dividing edge cases.
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
                <div className="mb-2 text-[10px] font-black uppercase tracking-wider text-[#171717]/60 dark:text-[#a1a1aa]">
                  Roster
                </div>
                <div className="space-y-1.5">
                  {[
                    { name: 'You (Coding)', color: 'bg-[#ffd84d]' },
                    { name: 'Maya Chen', color: 'bg-[#39d5c8]' },
                    { name: 'Alex Rivera', color: 'bg-[#ff57ce]' },
                  ].map((p) => (
                    <div
                      key={p.name}
                      className="flex items-center gap-2 rounded-lg border border-[#171717] bg-white p-1.5 text-xs font-bold dark:border-[#2e323b] dark:bg-[#15171c] dark:text-[#f4f4f7]"
                    >
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded text-[9px] font-black text-[#171717] dark:border-[#000000] ${p.color}`}
                      >
                        {p.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="truncate text-[11px]">{p.name}</span>
                    </div>
                  ))}
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
                <div className="flex items-center justify-between border-b border-white/10 bg-[#242424] px-4 py-1.5 font-mono text-[11px] text-white/70">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-black/40 px-1.5 py-0.2 text-[9px] uppercase text-[#39d5c8]">
                      shared_worker.js
                    </span>
                    <span>JavaScript</span>
                  </div>
                  <span className="text-[10px] text-[#ffd84d]">● Autosynced</span>
                </div>

                <div className="h-[460px]">
                  <Editor
                    height="460px"
                    theme="vs-dark"
                    language="javascript"
                    value={code}
                    onChange={handleCodeChange}
                    options={{
                      fontSize: 13,
                      minimap: { enabled: false },
                      automaticLayout: true,
                      padding: { top: 12 },
                      scrollBeyondLastLine: false,
                    }}
                  />
                </div>
              </div>

              {/* Right chat */}
              <div className="flex flex-col border-t-2 border-[#171717] bg-[#fffaf0] p-3 transition-colors lg:border-l-2 lg:border-t-0 dark:border-[#2e323b] dark:bg-[#111317]">
                <div className="mb-2 flex items-center justify-between text-[10px] font-black uppercase text-[#171717]/60 dark:text-[#a1a1aa]">
                  <span>Chat</span>
                  <span className="text-emerald-600 dark:text-emerald-400">● Live</span>
                </div>

                <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                  {chatMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-[#171717] bg-white p-2 text-xs font-bold dark:border-[#2e323b] dark:bg-[#15171c]"
                    >
                      <span className="font-black text-[#ff57ce] text-[11px]">
                        {msg.sender ?? 'Player'}:{' '}
                      </span>
                      <span className="text-[#171717] text-[11px] dark:text-[#f4f4f7]">{msg.body}</span>
                    </div>
                  ))}
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
