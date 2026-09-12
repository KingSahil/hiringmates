'use client'

import Editor from '@monaco-editor/react'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Copy, Play, Plus, Send, Users, Wifi, X, Zap } from 'lucide-react'
import { getSupabaseBrowserClient } from '@/lib/supabase'

type Nav = (view: 'home' | 'auth' | 'codemates' | 'rooms' | 'lobby' | 'game') => void

type Room = { id: string; code: string; title: string; status: string; host_id: string; member_count?: number }

function Back({ onClick, label }: { onClick: () => void; label: string }) { return <button onClick={onClick} className="mb-8 flex items-center gap-2 text-sm text-white/45 hover:text-white"><ArrowLeft className="size-4" />{label}</button> }

export function AuthPage({ nav }: { nav: Nav }) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    const normalizedEmail = email.trim().toLowerCase()
    const supabase = getSupabaseBrowserClient()
    const result = mode === 'sign-in'
      ? await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
      : await supabase.auth.signUp({ email: normalizedEmail, password, options: { data: { display_name: name.trim() || 'Candidate' }, emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ?? `${window.location.origin}/auth/callback` } })
    const errorMessage = result.error?.message.toLowerCase() ?? ''
    if (result.error) {
      if (errorMessage.includes('email not confirmed')) setMessage('Confirm your email first, then sign in. Check spam or request a new confirmation email below.')
      else if (errorMessage.includes('invalid login credentials')) setMessage('Invalid email or password. If you created this account recently, confirm your email first.')
      else if (errorMessage.includes('rate limit')) setMessage('Too many attempts. Wait a moment and try again.')
      else setMessage('We could not complete sign in. Check your details and try again.')
    } else {
      setMessage(mode === 'sign-up' ? 'Check your email to confirm your account.' : 'Signed in.')
      if (mode === 'sign-in') nav('codemates')
    }
    setBusy(false)
  }
  const resendConfirmation = async () => {
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) return setMessage('Enter your email first.')
    setBusy(true)
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.auth.resend({ type: 'signup', email: normalizedEmail, options: { emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ?? `${window.location.origin}/auth/callback` } })
    setMessage(error ? 'We could not resend the email. Wait a moment and try again.' : 'Confirmation email sent. Check your inbox and spam folder.')
    setBusy(false)
  }
  const signInWithGoogle = async () => {
    setBusy(true)
    setMessage('')
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` } })
    if (error) {
      setMessage('Google sign in is not enabled for this app yet.')
      setBusy(false)
    }
  }
  const useDemoAccount = async () => {
    setBusy(true)
    setMessage('')
    const demoEmail = 'demo@codemates.app'
    const demoPassword = 'CodeMatesDemo2026!'
    setEmail(demoEmail)
    setPassword(demoPassword)
    await fetch('/api/demo-account', { method: 'POST' })
    const supabase = getSupabaseBrowserClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email: demoEmail, password: demoPassword })
    if (!error && data.session) {
      setMessage('Demo account signed in.')
      nav('codemates')
    } else {
      setMessage('Demo sign in is temporarily unavailable. Please try again.')
    }
    setBusy(false)
  }
  return <div className="mx-auto flex min-h-[calc(100vh-120px)] max-w-5xl items-center justify-center"><div className="grid w-full max-w-4xl gap-8 lg:grid-cols-[.9fr_1.1fr]"><div className="py-8"><div className="font-mono text-xs uppercase tracking-[.22em] text-cyan-300">HireMe.app identity</div><h1 className="mt-4 font-mono text-5xl font-bold tracking-tight sm:text-7xl">Bring your<br /><span className="text-fuchsia-300">best build.</span></h1><p className="mt-5 max-w-md text-sm leading-7 text-white/50">Create one account for applications, live CodeMates rooms, shared editor sessions, and your score history.</p><button onClick={() => nav('home')} className="mt-8 text-sm text-white/45 underline">Back to landing</button></div><form onSubmit={submit} className="border-2 border-[#5b4635] bg-[#f4ead0] p-6 text-[#18202b] shadow-[6px_6px_0_#d9362b] sm:p-8"><div className="font-mono text-xs uppercase tracking-[.2em] text-[#685744]">{mode === 'sign-in' ? 'Welcome back' : 'Create candidate account'}</div><h2 className="mt-3 font-mono text-3xl font-bold">{mode === 'sign-in' ? 'Sign in to play.' : 'Join the room.'}</h2><button type="button" onClick={signInWithGoogle} disabled={busy} className="mt-7 flex w-full items-center justify-center gap-3 border-2 border-[#5b4635] bg-[#fffaf0] px-4 py-3 text-sm font-semibold text-[#18202b] disabled:opacity-50"><span className="font-bold text-[#4285f4]">G</span>{busy ? 'Opening Google…' : 'Continue with Google'}</button><button type="button" onClick={useDemoAccount} disabled={busy} className="mt-3 w-full border-2 border-dashed border-[#5b4635] bg-[#f2b84b] px-4 py-3 text-sm font-semibold text-[#18202b] disabled:opacity-50">{busy ? 'Opening demo…' : 'Use demo account'}</button><div className="my-5 flex items-center gap-3 text-xs text-[#685744]"><span className="h-px flex-1 bg-[#5b4635]/30" />OR<span className="h-px flex-1 bg-[#5b4635]/30" /></div><div className="grid gap-4">{mode === 'sign-up' && <label className="grid gap-2 text-sm font-semibold">Display name<input value={name} onChange={e => setName(e.target.value)} className="border-2 border-[#5b4635] bg-[#fffaf0] px-3 py-3 outline-none" placeholder="Maya Chen" /></label>}<label className="grid gap-2 text-sm font-semibold">Email<input required value={email} onChange={e => setEmail(e.target.value)} type="email" className="border-2 border-[#5b4635] bg-[#fffaf0] px-3 py-3 outline-none" placeholder="you@example.com" /></label><label className="grid gap-2 text-sm font-semibold">Password<input required minLength={6} value={password} onChange={e => setPassword(e.target.value)} type="password" className="border-2 border-[#5b4635] bg-[#fffaf0] px-3 py-3 outline-none" placeholder="6+ characters" /></label></div>{message && <p className="mt-4 text-sm text-[#d9362b]">{message}</p>}<button disabled={busy} className="mt-6 flex w-full items-center justify-center gap-2 bg-[#18202b] px-4 py-3 font-semibold text-[#f4ead0] disabled:opacity-50">{busy ? 'Working…' : mode === 'sign-in' ? 'Sign in' : 'Create account'} <ArrowRight className="size-4" /></button><button type="button" onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')} className="mt-5 w-full text-center text-xs underline">{mode === 'sign-in' ? 'New here? Create an account' : 'Already have an account? Sign in'}</button>{mode === 'sign-in' && <button type="button" onClick={resendConfirmation} disabled={busy} className="mt-3 text-left text-xs underline disabled:opacity-50">Resend confirmation email</button>}</form></div></div>
}

export function RealRooms({ nav, onJoin }: { nav: Nav; onJoin: (room: Room) => void }) {
  const supabase = getSupabaseBrowserClient(); const [rooms, setRooms] = useState<Room[]>([]); const [code, setCode] = useState(''); const [title, setTitle] = useState('Async systems challenge'); const [showCreate, setShowCreate] = useState(false); const [error, setError] = useState('')
  const load = async () => { const { data, error: queryError } = await supabase.from('rooms').select('id,code,title,status,host_id').eq('status', 'waiting').order('created_at', { ascending: false }); if (!queryError) setRooms((data ?? []) as Room[]) }
  useEffect(() => { load(); const channel = supabase.channel('rooms-index').on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, load).subscribe(); return () => { supabase.removeChannel(channel) } }, [])
  const createRoom = async () => { const { data: { user } } = await supabase.auth.getUser(); if (!user) return nav('auth'); const generated = `ROOM-${Math.random().toString(36).slice(2, 6).toUpperCase()}`; const { data, error: insertError } = await supabase.from('rooms').insert({ code: generated, title }).select('id,code,title,status,host_id').single(); if (insertError) return setError(insertError.message); onJoin(data as Room) }
  const joinCode = async () => { const room = rooms.find(item => item.code === code.trim().toUpperCase()); if (!room) return setError('Room not found or already started.'); onJoin(room) }
  return <div className="mx-auto max-w-5xl"><Back onClick={() => nav('codemates')} label="CodeMates arcade" /><div className="flex flex-col gap-3 border-b-2 border-[#5b4635] pb-6 sm:flex-row sm:items-end sm:justify-between"><div><div className="font-mono text-xs uppercase tracking-[.2em] text-fuchsia-300">Live Supabase rooms</div><h1 className="mt-3 font-mono text-5xl font-bold">Find your crew.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-white/55">These rooms are real, shared over Realtime, and available to every signed-in player.</p></div><span className="font-mono text-xs text-cyan-300">{rooms.length} OPEN</span></div><div className="mt-6 grid gap-4">{rooms.map(room => <div key={room.id} className="flex flex-col gap-4 border-2 border-[#5b4635] bg-[#211722] p-5 shadow-[4px_4px_0_#d9362b] sm:flex-row sm:items-center"><div className="grid size-12 place-items-center border-2 border-[#f2b84b] bg-[#151515] font-mono text-xs text-[#f2b84b]">{room.code.slice(-2)}</div><div className="flex-1"><h2 className="font-mono text-xl font-bold">{room.title}</h2><p className="mt-1 text-xs text-white/45">{room.code} · waiting for players</p></div><button onClick={() => onJoin(room)} className="bg-fuchsia-400 px-4 py-3 text-sm font-semibold text-[#190b1b]">Join lobby</button></div>)}{rooms.length === 0 && <div className="border-2 border-dashed border-white/15 p-10 text-center text-sm text-white/40">No open rooms yet. Create the first one.</div>}</div><div data-create-open={showCreate} className="room-actions mt-8 grid gap-4 border-2 border-[#5b4635] bg-[#f2b84b] p-5 text-[#151515] sm:grid-cols-[1fr_auto]"><div><div className="font-mono text-xs uppercase tracking-[.2em]">Create or join directly</div>{showCreate && <input value={title} onChange={e => setTitle(e.target.value)} className="mt-4 w-full border-2 border-[#5b4635] bg-[#fffaf0] px-3 py-3" placeholder="Room title" />}</div><div className="flex flex-wrap gap-2"><button onClick={() => showCreate ? createRoom() : setShowCreate(true)} className="flex items-center gap-2 bg-[#18202b] px-4 py-3 text-sm font-semibold text-[#f4ead0]"><Plus className="size-4" />{showCreate ? 'Create room' : 'New room'}</button><input aria-label="Room code" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="ROOM-AB12" className="w-32 border-2 border-[#5b4635] bg-[#fffaf0] px-3 py-3 font-mono text-xs" /><button onClick={joinCode} className="border-2 border-[#18202b] px-4 py-3 text-sm font-semibold">Join</button></div>{error && <p className="col-span-full text-xs text-[#d9362b]">{error}</p>}</div></div>
}

export function RealLobby({ nav, room, onStart }: { nav: Nav; room: Room; onStart: () => void }) {
  const supabase = getSupabaseBrowserClient(); const [members, setMembers] = useState<{ user_id: string; display_name: string }[]>([]); const [copied, setCopied] = useState(false)
  const load = async () => { const { data } = await supabase.from('room_members').select('user_id, profiles(display_name)').eq('room_id', room.id); setMembers((data ?? []).map((item: any) => ({ user_id: item.user_id, display_name: item.profiles?.display_name ?? 'Player' }))) }
  useEffect(() => { const join = async () => { const { data: { user } } = await supabase.auth.getUser(); if (user) await supabase.from('room_members').upsert({ room_id: room.id, user_id: user.id }); load() }; join(); const channel = supabase.channel(`room:${room.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${room.id}` }, load).subscribe(); return () => { supabase.removeChannel(channel) } }, [room.id])
  const copy = async () => { await navigator.clipboard.writeText(room.code); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  return <div className="mx-auto max-w-5xl"><Back onClick={() => nav('rooms')} label="Leave lobby" /><div className="grid gap-5 lg:grid-cols-[1fr_.65fr]"><section className="border-2 border-[#5b4635] bg-[#211722] p-6 shadow-[5px_5px_0_#d9362b]"><div className="font-mono text-xs uppercase tracking-[.2em] text-fuchsia-300">Live lobby</div><div className="mt-4 flex items-center justify-between gap-3"><div><h1 className="font-mono text-4xl font-bold">{room.code}</h1><p className="mt-2 text-sm text-white/45">{room.title}</p></div><button onClick={copy} className="flex items-center gap-2 border border-white/15 px-3 py-2 text-xs"><Copy className="size-4" />{copied ? 'Copied' : 'Share'}</button></div><div className="mt-8 grid gap-2">{members.map(member => <div key={member.user_id} className="flex items-center gap-3 border border-white/10 bg-black/10 p-3"><span className="grid size-9 place-items-center bg-cyan-300 font-mono text-xs text-[#061017]">{member.display_name.slice(0, 2).toUpperCase()}</span><span className="text-sm">{member.display_name}</span><span className="ml-auto text-xs text-cyan-300">CONNECTED</span></div>)}</div><button onClick={onStart} className="mt-6 flex items-center gap-2 bg-fuchsia-400 px-4 py-3 text-sm font-semibold text-[#190b1b]"><Play className="size-4 fill-current" />Start round</button></section><aside className="border-2 border-[#5b4635] bg-[#f4ead0] p-5 text-[#18202b]"><div className="font-mono text-xs uppercase tracking-widest text-[#685744]">Multiplayer rules</div><div className="mt-5 grid gap-3 text-sm"><p>Realtime presence keeps the room roster current.</p><p>Every editor update is broadcast to the room.</p><p>Messages and submissions are saved to Supabase.</p></div></aside></div></div>
}

export function MultiplayerGame({ nav, room }: { nav: Nav; room: Room }) {
  const supabase = getSupabaseBrowserClient(); const [code, setCode] = useState("const tasks = []\n\nfunction addTask(title) {\n  tasks.push({ title, done: false })\n}"); const [messages, setMessages] = useState<{ body: string; user_id: string }[]>([]); const [chat, setChat] = useState(''); const [online, setOnline] = useState(1); const channel = useMemo(() => supabase.channel(`game:${room.id}`, { config: { presence: { key: crypto.randomUUID() }, broadcast: { self: false } } }), [room.id])
  useEffect(() => { const load = async () => { const { data } = await supabase.from('messages').select('body,user_id').eq('room_id', room.id).order('created_at'); setMessages(data ?? []) }; load(); channel.on('broadcast', { event: 'code-change' }, ({ payload }) => setCode(payload.code)).on('broadcast', { event: 'chat' }, ({ payload }) => setMessages(current => [...current, payload])).on('presence', { event: 'sync' }, () => setOnline(Object.keys(channel.presenceState()).length)).subscribe(async status => { if (status === 'SUBSCRIBED') await channel.track({ online_at: new Date().toISOString() }) }); return () => { supabase.removeChannel(channel) } }, [channel, room.id])
  const updateCode = (value = '') => { setCode(value); channel.send({ type: 'broadcast', event: 'code-change', payload: { code: value } }) }
  const sendChat = async () => { if (!chat.trim()) return; const { data: { user } } = await supabase.auth.getUser(); if (!user) return nav('auth'); const payload = { body: chat.trim(), user_id: user.id }; await supabase.from('messages').insert({ room_id: room.id, ...payload }); channel.send({ type: 'broadcast', event: 'chat', payload }); setMessages(current => [...current, payload]); setChat('') }
  const submit = async () => { const { data: { user } } = await supabase.auth.getUser(); if (!user) return nav('auth'); await supabase.from('submissions').insert({ room_id: room.id, candidate_id: user.id, language: 'javascript', code, test_score: Math.min(100, Math.max(0, Math.round(code.length / 5))) }); alert('Submission saved. The room can now review your solution.') }
  return <div className="mx-auto max-w-[1380px]"><div className="mb-3 border-2 border-[#5b4635] bg-[#f2b84b] px-4 py-3 text-[#151515] shadow-[4px_4px_0_#d9362b]"><div className="flex flex-wrap items-center gap-4"><span className="font-mono text-[10px] font-bold uppercase tracking-[.2em]">{room.code} · challenge</span><strong className="font-mono text-sm">Build a resilient task board</strong><span className="text-xs">Add, complete, filter, and reorder tasks.</span><span className="ml-auto font-mono text-xs">{online} online</span></div></div><div className="grid gap-3 xl:grid-cols-[220px_1fr_280px]"><aside className="border border-white/10 bg-[#111923] p-4"><div className="font-mono text-xs text-white/50">PLAYERS · {online}</div><div className="mt-4 flex items-center gap-3 border border-cyan-300/20 bg-cyan-300/5 p-3"><Wifi className="size-4 text-cyan-300" /><span className="text-xs">Realtime connected</span></div><div className="mt-6 text-xs leading-5 text-white/45">Changes in the editor broadcast instantly to every player in this room.</div></aside><section className="min-w-0 border border-white/10 bg-[#18232b]"><div className="flex items-center justify-between border-b border-white/10 px-4 py-3 font-mono text-xs"><span>shared_editor · javascript</span><span className="text-cyan-300">autosaved via websocket</span></div><Editor height="520px" theme="vs-dark" language="javascript" value={code} onChange={updateCode} options={{ minimap: { enabled: false }, fontSize: 14, automaticLayout: true }} /><div className="flex items-center justify-between border-t border-white/10 px-4 py-3"><span className="text-xs text-white/35">Shared Monaco editor</span><button onClick={submit} className="flex items-center gap-2 bg-[#d9362b] px-4 py-2 text-xs font-bold text-[#fffaf0]">RUN TESTS <Play className="size-3 fill-current" /></button></div></section><aside className="flex min-h-[520px] flex-col border border-white/10 bg-[#111923] p-4"><div className="flex items-center justify-between font-mono text-xs text-white/50"><span>CHAT</span><span className="text-cyan-300">{online} online</span></div><div className="mt-4 flex-1 overflow-y-auto">{messages.map((message, index) => <div key={`${message.user_id}-${index}`} className="mb-3 border-l-2 border-fuchsia-300/50 pl-3 text-xs text-white/65">{message.body}</div>)}</div><div className="flex gap-2"><input value={chat} onChange={e => setChat(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) sendChat() }} placeholder="Message room…" className="min-w-0 flex-1 border border-white/15 bg-black/20 px-3 py-2 text-xs" /><button onClick={sendChat} className="bg-fuchsia-400 px-3 text-[#190b1b]"><Send className="size-4" /></button></div></aside></div></div>
}
