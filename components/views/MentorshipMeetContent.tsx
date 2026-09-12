'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Camera,
  CameraOff,
  Mic,
  MicOff,
  Monitor,
  PhoneOff,
  MessageSquare,
  Users,
  Code2,
  Sparkles,
  Share2,
  Settings,
  Check,
  Smile,
  ShieldCheck,
  Maximize2,
  Minimize2,
  Volume2,
  FileText,
  Clock,
  Radio,
  Send,
  Trophy,
  Star,
  ChevronRight,
  Zap,
} from 'lucide-react'
import { useNavigation } from '@/lib/navigation'
import { useNotifications, UserRole } from '@/lib/notifications'
import { getSupabaseBrowserClient } from '@/lib/supabase'

interface ChatMessage {
  id: string
  sender: string
  role: 'mentor' | 'candidate'
  text: string
  time: string
}

interface FloatingReaction {
  id: string
  emoji: string
  x: number
}

export function MentorshipMeetContent() {
  const { setTab } = useNavigation()
  const { activeRole, setActiveRole } = useNotifications()

  // Meeting Identity & Roles
  const [meetingId] = useState('mentorship-r2-northstar')
  const [copiedLink, setCopiedLink] = useState(false)
  const isMentor = activeRole === 'mentor'

  const myName = isMentor ? 'Sarah Vance' : 'Maya Chen'
  const myRoleLabel = isMentor ? 'Lead Mentor (Staff Eng)' : 'Candidate (Full-Stack)'
  const peerName = isMentor ? 'Maya Chen' : 'Sarah Vance'
  const peerRoleLabel = isMentor ? 'Candidate (Round 2)' : 'Lead Mentor (Staff Eng)'

  // Media Streams State
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null)
  const [isCameraOn, setIsCameraOn] = useState(true)
  const [isMicOn, setIsMicOn] = useState(true)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [isPeerSpeaking, setIsPeerSpeaking] = useState(false)
  const [localAudioLevel, setLocalAudioLevel] = useState(0)
  const [mediaError, setMediaError] = useState<string | null>(null)

  // Remote counterpart state
  const [remoteConnected, setRemoteConnected] = useState(true)
  const [peerCameraOn, setPeerCameraOn] = useState(true)

  // Drawer / Side Panel State
  const [activeSidePanel, setActiveSidePanel] = useState<'chat' | 'scratchpad' | 'rubric' | 'captions' | null>('chat')
  const [unreadChatCount, setUnreadChatCount] = useState(0)

  // Elapsed Call Timer
  const [callDuration, setCallDuration] = useState(14 * 60 + 20) // Start at realistic 14:20
  useEffect(() => {
    const timer = setInterval(() => {
      setCallDuration((prev) => prev + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Floating Emoji Reactions
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([])
  const [showReactionsMenu, setShowReactionsMenu] = useState(false)

  // In-Call Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-1',
      sender: 'Sarah Vance',
      role: 'mentor',
      text: "Welcome to Round 2! We'll review your distributed task worker design and discuss architectural failure modes.",
      time: '14:21',
    },
    {
      id: 'msg-2',
      sender: 'Maya Chen',
      role: 'candidate',
      text: 'Thanks Sarah! Ready to walk through the retry logic and event loop bottlenecks.',
      time: '14:22',
    },
  ])
  const [chatInput, setChatInput] = useState('')

  // Shared Whiteboard / Code Scratchpad
  const [scratchpadCode, setScratchpadCode] = useState(`// ⚡ ROUND 2: MENTORSHIP LIVE ARCHITECTURE
// Topic: Idempotent Event Deduplication & Backpressure
class DistributedTaskWorker {
  constructor(private redisCluster, private telemetry) {}

  async processTask(job) {
    // 1. Acquire distributed redlock lease
    const lockAcquired = await this.redisCluster.acquireLock(job.id, 5000);
    if (!lockAcquired) {
      this.telemetry.recordMetric('contention_retry');
      return { status: 'retry_backoff' };
    }

    try {
      // Execute worker payload safely
      return await this.executeSubroutine(job);
    } finally {
      await this.redisCluster.releaseLock(job.id);
    }
  }
}`)

  // Mentor Rubric State
  const [rubricScores, setRubricScores] = useState({
    architecture: 5,
    concurrency: 4,
    communication: 5,
    problemSolving: 5,
  })
  const [rubricNotes, setRubricNotes] = useState(
    'Demonstrates exceptional understanding of distributed lock leases, edge timeouts, and graceful backoff under load. Highly recommended.'
  )
  const [rubricSubmitted, setRubricSubmitted] = useState(false)

  // Captions & Live Transcription
  const [captionsEnabled, setCaptionsEnabled] = useState(true)
  const [currentCaption, setCurrentCaption] = useState(
    'Sarah Vance: "How would you handle network partitions between the primary Redis node and standby replicas during lock renewal?"'
  )

  // Video Element References
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const screenVideoRef = useRef<HTMLVideoElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number | null>(null)

  // Initialize Local Media Stream (Camera & Mic)
  useEffect(() => {
    let stream: MediaStream | null = null

    const initMedia = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setMediaError('Webcam API is not supported in this environment.')
          return
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        })

        setLocalStream(stream)
        setMediaError(null)

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream
        }

        // Set up audio visualizer
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
          if (AudioContextClass) {
            const ctx = new AudioContextClass()
            audioContextRef.current = ctx
            const source = ctx.createMediaStreamSource(stream)
            const analyser = ctx.createAnalyser()
            analyser.fftSize = 64
            source.connect(analyser)
            analyserRef.current = analyser

            const dataArray = new Uint8Array(analyser.frequencyBinCount)
            const updateLevel = () => {
              if (!analyserRef.current) return
              analyserRef.current.getByteFrequencyData(dataArray)
              const avg = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length
              setLocalAudioLevel(Math.min(100, Math.round((avg / 60) * 100)))
              animFrameRef.current = requestAnimationFrame(updateLevel)
            }
            updateLevel()
          }
        } catch (audioErr) {
          console.warn('Audio analyser setup notice:', audioErr)
        }
      } catch (err: any) {
        console.warn('Camera/Mic permission warning:', err)
        // Fallback gracefully without blocking the UI
        setMediaError(
          err.name === 'NotAllowedError'
            ? 'Camera/Mic access was denied. You can continue with simulated camera & audio.'
            : 'Hardware unavailable. Running in simulated interactive video mode.'
        )
      }
    }

    initMedia()

    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop())
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {})
      }
    }
  }, [])

  // Re-attach camera stream to video ref whenever localStream, camera state, or view mode changes
  useEffect(() => {
    if (localVideoRef.current && localStream && isCameraOn) {
      localVideoRef.current.srcObject = localStream
      localVideoRef.current.play().catch(() => {})
    }
  }, [localStream, isCameraOn, isScreenSharing])

  // Re-attach screen stream to video ref whenever screenStream changes or screen sharing mounts
  useEffect(() => {
    if (screenVideoRef.current && screenStream) {
      screenVideoRef.current.srcObject = screenStream
      screenVideoRef.current.play().catch((err) => {
        console.warn('Screen share video playback warning:', err)
      })
    }
  }, [screenStream, isScreenSharing])

  // Toggle Camera
  const toggleCamera = useCallback(() => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !isCameraOn
      }
    }
    setIsCameraOn((prev) => !prev)
  }, [localStream, isCameraOn])

  // Toggle Microphone
  const toggleMicrophone = useCallback(() => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !isMicOn
      }
    }
    setIsMicOn((prev) => !prev)
  }, [localStream, isMicOn])

  // Stop Screen Share cleanly
  const stopScreenShare = useCallback(() => {
    if (screenStream) {
      screenStream.getTracks().forEach((t) => t.stop())
    }
    setScreenStream(null)
    setIsScreenSharing(false)
    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = null
    }
  }, [screenStream])

  // Toggle Screen Share
  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      stopScreenShare()
    } else {
      try {
        if (!navigator.mediaDevices?.getDisplayMedia) {
          alert('Screen sharing is not supported by your browser.')
          return
        }
        const sStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        })

        sStream.getVideoTracks().forEach((track) => {
          track.onended = () => {
            sStream.getTracks().forEach((t) => t.stop())
            setScreenStream(null)
            setIsScreenSharing(false)
            if (screenVideoRef.current) {
              screenVideoRef.current.srcObject = null
            }
          }
        })

        setScreenStream(sStream)
        setIsScreenSharing(true)

        // Try immediate assignment if element already exists
        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = sStream
          screenVideoRef.current.play().catch(() => {})
        }
      } catch (err: any) {
        if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') {
          console.warn('Screen share cancelled or failed:', err)
        }
        setIsScreenSharing(false)
        setScreenStream(null)
      }
    }
  }, [isScreenSharing, stopScreenShare])

  // Supabase Realtime Broadcast for In-Call Chat & Reactions
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    const channel = supabase.channel(`mentorship-room-${meetingId}`)

    channel
      .on('broadcast', { event: 'chat-message' }, ({ payload }: { payload: any }) => {
        if (payload) {
          setChatMessages((prev) => [...prev, payload])
          if (activeSidePanel !== 'chat') {
            setUnreadChatCount((c) => c + 1)
          }
        }
      })
      .on('broadcast', { event: 'reaction' }, ({ payload }: { payload: any }) => {
        if (payload?.emoji) {
          triggerEmojiFloat(payload.emoji)
        }
      })
      .on('broadcast', { event: 'scratchpad-update' }, ({ payload }: { payload: any }) => {
        if (payload?.code) {
          setScratchpadCode(payload.code)
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [meetingId, activeSidePanel])

  // Send Chat Message
  const sendChatMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!chatInput.trim()) return

    const now = new Date()
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now
      .getMinutes()
      .toString()
      .padStart(2, '0')}`

    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: myName,
      role: isMentor ? 'mentor' : 'candidate',
      text: chatInput.trim(),
      time: timeStr,
    }

    setChatMessages((prev) => [...prev, newMsg])
    setChatInput('')

    // Broadcast message
    try {
      const supabase = getSupabaseBrowserClient()
      supabase.channel(`mentorship-room-${meetingId}`).send({
        type: 'broadcast',
        event: 'chat-message',
        payload: newMsg,
      })
    } catch {
      // ignore
    }
  }

  // Trigger Floating Emoji Reaction
  const triggerEmojiFloat = (emoji: string) => {
    const id = `reaction-${Date.now()}-${Math.random()}`
    const x = Math.floor(Math.random() * 60) + 20 // 20% to 80% horizontal offset
    setFloatingReactions((prev) => [...prev, { id, emoji, x }])

    // Clean up after 2.5 seconds
    setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== id))
    }, 2500)
  }

  const broadcastReaction = (emoji: string) => {
    triggerEmojiFloat(emoji)
    setShowReactionsMenu(false)
    try {
      const supabase = getSupabaseBrowserClient()
      supabase.channel(`mentorship-room-${meetingId}`).send({
        type: 'broadcast',
        event: 'reaction',
        payload: { emoji },
      })
    } catch {
      // ignore
    }
  }

  // Copy Room Link
  const handleCopyLink = () => {
    const url = `${window.location.origin}/mentorship`
    navigator.clipboard.writeText(url)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  // Peer speaking simulation cycles for realistic atmosphere
  useEffect(() => {
    const interval = setInterval(() => {
      setIsPeerSpeaking((prev) => !prev)
      if (!isMentor) {
        const sampleCaptions = [
          'Sarah Vance: "Notice how the backoff interval prevents cascading thundering herd failures."',
          'Sarah Vance: "Could we utilize Redis Streams with consumer groups for automatic ACK tracking?"',
          'Sarah Vance: "Your memory bounding logic is clean. Let\'s review failure recovery."',
        ]
        setCurrentCaption(sampleCaptions[Math.floor(Math.random() * sampleCaptions.length)])
      } else {
        const candidateCaptions = [
          'Maya Chen: "We set a 5-second redlock lease and run a heartbeat task to renew if still processing."',
          'Maya Chen: "For backpressure, we reject incoming requests when queue length exceeds 10,000."',
          'Maya Chen: "If the master fails, the standby replica acquires the lease after timeout expires."',
        ]
        setCurrentCaption(candidateCaptions[Math.floor(Math.random() * candidateCaptions.length)])
      }
    }, 9000)
    return () => clearInterval(interval)
  }, [isMentor])

  return (
    <div className="relative flex h-[calc(100vh-65px)] w-full flex-col overflow-hidden bg-[#0c0d11] text-[#f4f4f7] select-none font-sans">
      {/* Floating Animated Emoji Reactions */}
      <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden">
        {floatingReactions.map((reaction) => (
          <div
            key={reaction.id}
            style={{ left: `${reaction.x}%` }}
            className="animate-float-up absolute bottom-24 text-4xl sm:text-5xl"
          >
            {reaction.emoji}
          </div>
        ))}
      </div>

      {/* Top Meeting Header Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b-2 border-[#1f232b] bg-[#14161d] px-4 sm:px-6">
        {/* Left: Meeting Identity & Round Badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
            <h1 className="font-display text-lg uppercase tracking-wider text-white hidden sm:inline">
              Mates Meet · Round 2 Mentorship
            </h1>
            <h1 className="font-display text-base uppercase text-white sm:hidden">Round 2 Meet</h1>
          </div>

          <span className="rounded-md border border-[#2e323b] bg-[#ffd84d] px-2 py-0.5 font-mono text-[10px] font-black uppercase text-[#171717]">
            Live Call
          </span>

          <div className="hidden lg:flex items-center gap-1.5 rounded-lg border border-[#2e323b] bg-[#1a1d24] px-2.5 py-1 text-xs font-mono text-zinc-300">
            <Clock className="h-3.5 w-3.5 text-[#ffd84d]" />
            <span>{formatTimer(callDuration)}</span>
          </div>
        </div>

        {/* Center: Active Role Switcher Pill */}
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl border-2 border-[#2e323b] bg-[#1a1d24] p-0.5 text-xs font-bold">
            <button
              onClick={() => setActiveRole('candidate')}
              className={`cursor-pointer rounded-lg px-2.5 py-1 transition-all ${
                !isMentor
                  ? 'border border-black bg-[#ffd84d] text-[#171717] font-black shadow-[1px_1px_0_#000]'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Candidate (Maya)
            </button>
            <button
              onClick={() => setActiveRole('mentor')}
              className={`cursor-pointer rounded-lg px-2.5 py-1 transition-all ${
                isMentor
                  ? 'border border-black bg-[#39d5c8] text-[#171717] font-black shadow-[1px_1px_0_#000]'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Mentor (Sarah)
            </button>
          </div>
        </div>

        {/* Right: Quality Info & Copy Link */}
        <div className="flex items-center gap-2.5">
          <div className="hidden md:flex items-center gap-1.5 rounded-lg border border-[#2e323b] bg-[#1a1d24] px-2.5 py-1 text-[11px] font-semibold text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span>1080p WebRTC Encrypted</span>
          </div>

          <button
            onClick={handleCopyLink}
            className="cursor-pointer flex items-center gap-1.5 rounded-xl border-2 border-[#2e323b] bg-[#222630] px-3 py-1.5 text-xs font-black uppercase text-white shadow-[2px_2px_0_#000000] hover:bg-[#2c3240] transition-all"
            title="Copy meeting share link"
          >
            {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Share2 className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{copiedLink ? 'Copied!' : 'Share Room'}</span>
          </button>
        </div>
      </header>

      {/* Main Content Area: Video Grid & Side Panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Video Conference Stage */}
        <div className="relative flex flex-1 flex-col justify-between p-3 sm:p-5 overflow-hidden">
          {/* Active Screen Sharing Canvas (if active) */}
          {isScreenSharing ? (
            <div className="flex flex-1 gap-4 overflow-hidden">
              {/* Big Screen Presentation */}
              <div className="relative flex flex-1 items-center justify-center rounded-2xl border-3 border-[#2e323b] bg-[#121318] shadow-[5px_5px_0_#000000] overflow-hidden">
                <video
                  ref={(el) => {
                    screenVideoRef.current = el
                    if (el && screenStream && el.srcObject !== screenStream) {
                      el.srcObject = screenStream
                      el.play().catch(() => {})
                    }
                  }}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-contain bg-black"
                />
                <div className="absolute top-3 left-3 flex items-center gap-2 rounded-xl bg-black/80 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-xs border border-white/20 shadow-lg">
                  <Monitor className="h-3.5 w-3.5 text-[#39d5c8] animate-pulse" />
                  <span>You are presenting your screen</span>
                  <button
                    onClick={stopScreenShare}
                    className="ml-2 cursor-pointer rounded bg-rose-600 px-2.5 py-1 text-[10px] font-black uppercase text-white hover:bg-rose-700 transition-all shadow-sm"
                  >
                    Stop Share
                  </button>
                </div>
              </div>

              {/* Side-stacked PIP participants */}
              <div className="flex w-64 flex-col gap-3 shrink-0">
                {/* Peer PIP */}
                <div className="relative aspect-video w-full rounded-xl border-2 border-[#2e323b] bg-[#181b22] overflow-hidden">
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-900/60 to-purple-950/60">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white/20 bg-[#39d5c8] text-base font-black text-black">
                      {peerName.slice(0, 1)}
                    </div>
                  </div>
                  <span className="absolute bottom-2 left-2 rounded bg-black/80 px-2 py-0.5 text-[10px] font-bold text-white">
                    {peerName}
                  </span>
                </div>

                {/* Local PIP */}
                <div className="relative aspect-video w-full rounded-xl border-2 border-[#2e323b] bg-[#181b22] overflow-hidden">
                  {isCameraOn && localStream ? (
                    <video
                      ref={(el) => {
                        localVideoRef.current = el
                        if (el && localStream && el.srcObject !== localStream) {
                          el.srcObject = localStream
                          el.play().catch(() => {})
                        }
                      }}
                      autoPlay
                      playsInline
                      muted
                      className="h-full w-full object-cover -scale-x-100"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[#15171c]">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-[#ffd84d] text-base font-black text-black">
                        {myName.slice(0, 1)}
                      </div>
                    </div>
                  )}
                  <span className="absolute bottom-2 left-2 rounded bg-black/80 px-2 py-0.5 text-[10px] font-bold text-white">
                    You ({myName})
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* Normal Dual Grid Video Layout (Candidate + Mentor) */
            <div className="grid flex-1 grid-cols-1 md:grid-cols-2 gap-3 sm:gap-5 overflow-hidden">
              {/* TILE 1: LOCAL PARTICIPANT (You) */}
              <div
                className={`group relative flex flex-col justify-between rounded-2xl border-3 bg-[#13151b] p-4 shadow-[5px_5px_0_#000000] overflow-hidden transition-all duration-300 ${
                  isMicOn && localAudioLevel > 15
                    ? 'border-[#39d5c8] shadow-[0_0_20px_rgba(57,213,200,0.3)]'
                    : 'border-[#2e323b]'
                }`}
              >
                {/* Video Stream or Avatar Fallback */}
                {isCameraOn && localStream ? (
                  <video
                    ref={(el) => {
                      localVideoRef.current = el
                      if (el && localStream && el.srcObject !== localStream) {
                        el.srcObject = localStream
                        el.play().catch(() => {})
                      }
                    }}
                    autoPlay
                    playsInline
                    muted
                    className="absolute inset-0 h-full w-full object-cover -scale-x-100"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-[#181b22] to-[#0f1115]">
                    <div className="relative flex h-24 w-24 sm:h-28 sm:w-28 items-center justify-center rounded-full border-4 border-[#171717] bg-[#ffd84d] text-3xl sm:text-4xl font-black text-[#171717] shadow-xl">
                      {myName.slice(0, 1)}
                      {/* Wave pulse if mic is active while camera is off */}
                      {isMicOn && localAudioLevel > 10 && (
                        <span className="absolute inset-0 rounded-full border-4 border-[#ffd84d] animate-ping opacity-40" />
                      )}
                    </div>
                    <span className="mt-4 text-xs font-bold text-zinc-400">
                      Camera turned off
                    </span>
                  </div>
                )}

                {/* Dark gradient vignette for readability */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/40" />

                {/* Top Tile Badges */}
                <div className="relative z-10 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg border border-black/40 bg-black/60 px-2.5 py-1 text-[11px] font-black uppercase text-white backdrop-blur-md">
                      You ({myRoleLabel})
                    </span>
                  </div>

                  {/* Audio Level Visualizer */}
                  {isMicOn ? (
                    <div className="flex items-center gap-1 rounded-lg border border-black/40 bg-black/60 px-2 py-1 backdrop-blur-md">
                      <div
                        className="h-2.5 w-1 rounded-xs bg-[#39d5c8] transition-all duration-75"
                        style={{ height: `${Math.max(6, (localAudioLevel / 100) * 16)}px` }}
                      />
                      <div
                        className="h-3 w-1 rounded-xs bg-[#39d5c8] transition-all duration-75"
                        style={{ height: `${Math.max(8, (localAudioLevel / 100) * 18)}px` }}
                      />
                      <div
                        className="h-2 w-1 rounded-xs bg-[#39d5c8] transition-all duration-75"
                        style={{ height: `${Math.max(4, (localAudioLevel / 100) * 14)}px` }}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center rounded-lg border border-rose-500/40 bg-rose-950/80 p-1 text-rose-300 backdrop-blur-md">
                      <MicOff className="h-3.5 w-3.5" />
                    </div>
                  )}
                </div>

                {/* Bottom Tile Info */}
                <div className="relative z-10 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full border border-black bg-[#ffd84d] text-xs font-black text-black">
                      {myName.slice(0, 1)}
                    </div>
                    <span className="font-display text-base uppercase text-white drop-shadow-md">
                      {myName}
                    </span>
                  </div>

                  <span className="text-[10px] font-mono text-zinc-400 bg-black/50 px-2 py-0.5 rounded">
                    Local Device
                  </span>
                </div>
              </div>

              {/* TILE 2: REMOTE PARTICIPANT (Mentor or Candidate) */}
              <div
                className={`group relative flex flex-col justify-between rounded-2xl border-3 bg-[#13151b] p-4 shadow-[5px_5px_0_#000000] overflow-hidden transition-all duration-300 ${
                  isPeerSpeaking
                    ? 'border-[#ffd84d] shadow-[0_0_20px_rgba(255,216,77,0.3)]'
                    : 'border-[#2e323b]'
                }`}
              >
                {/* Simulated Peer Feed / Interactive Video Visualizer */}
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-[#1c1f28] to-[#101217]">
                  {/* Subtle video noise pattern / radar backdrop */}
                  <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#39d5c8_1px,transparent_1px)] [background-size:16px_16px]" />

                  <div className="relative flex h-24 w-24 sm:h-28 sm:w-28 items-center justify-center rounded-full border-4 border-[#171717] bg-[#39d5c8] text-3xl sm:text-4xl font-black text-[#171717] shadow-xl">
                    {peerName.slice(0, 1)}

                    {/* Active speaking pulse */}
                    {isPeerSpeaking && (
                      <span className="absolute -inset-2 rounded-full border-2 border-[#ffd84d] animate-ping opacity-60" />
                    )}
                  </div>

                  <span className="mt-4 font-display text-lg uppercase text-white tracking-wide">
                    {peerName}
                  </span>
                  <span className="text-xs font-semibold text-zinc-400">
                    {peerRoleLabel}
                  </span>

                  {isPeerSpeaking && (
                    <div className="mt-3 flex items-center gap-1.5 rounded-full border border-[#ffd84d]/40 bg-[#ffd84d]/10 px-3 py-0.5 text-[10px] font-black uppercase text-[#ffd84d]">
                      <Radio className="h-3 w-3 animate-pulse" />
                      <span>Speaking Now</span>
                    </div>
                  )}
                </div>

                {/* Dark gradient vignette */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/40" />

                {/* Top Tile Badges */}
                <div className="relative z-10 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg border border-black/40 bg-black/60 px-2.5 py-1 text-[11px] font-black uppercase text-white backdrop-blur-md">
                      {peerRoleLabel}
                    </span>
                  </div>

                  {/* Remote Audio Status */}
                  <div className="flex items-center gap-1.5 rounded-lg border border-black/40 bg-black/60 px-2.5 py-1 text-xs text-emerald-400 backdrop-blur-md">
                    <Volume2 className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-mono">HD Audio</span>
                  </div>
                </div>

                {/* Bottom Tile Info */}
                <div className="relative z-10 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full border border-black bg-[#39d5c8] text-xs font-black text-black">
                      {peerName.slice(0, 1)}
                    </div>
                    <span className="font-display text-base uppercase text-white drop-shadow-md">
                      {peerName}
                    </span>
                  </div>

                  <span className="text-[10px] font-mono text-emerald-400 bg-black/50 px-2 py-0.5 rounded flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Connected
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Live Captions Bar (Subtitles toggleable) */}
          {captionsEnabled && (
            <div className="mt-3 flex items-center justify-center">
              <div className="max-w-2xl rounded-xl border border-white/15 bg-black/80 px-4 py-2 text-center text-xs font-medium text-zinc-200 backdrop-blur-md shadow-lg transition-all">
                <span className="text-zinc-400 font-bold mr-1">CC:</span>
                {currentCaption}
              </div>
            </div>
          )}

          {/* Hardware Error notice if permissions denied */}
          {mediaError && (
            <div className="mt-2 flex items-center justify-between rounded-xl border border-amber-500/50 bg-amber-950/40 p-2.5 text-xs text-amber-200">
              <span>{mediaError}</span>
              <button
                onClick={() => setMediaError(null)}
                className="font-bold underline hover:text-white"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Bottom Call Controls Dock (Google Meet signature style with Neobrutalism) */}
          <div className="mt-4 flex items-center justify-between rounded-2xl border-3 border-[#2e323b] bg-[#14161e]/90 p-2.5 backdrop-blur-md shadow-[4px_4px_0_#000000]">
            {/* Left meeting badge */}
            <div className="hidden lg:flex items-center gap-2 pl-2">
              <span className="font-mono text-xs text-zinc-400">{meetingId}</span>
            </div>

            {/* Center Audio/Video/Screen Control Group */}
            <div className="flex items-center gap-2 sm:gap-3 mx-auto">
              {/* Mic Toggle */}
              <button
                onClick={toggleMicrophone}
                className={`flex h-11 w-11 sm:h-12 sm:w-12 cursor-pointer items-center justify-center rounded-xl border-2 transition-all active:scale-95 ${
                  isMicOn
                    ? 'border-[#2e323b] bg-[#222630] text-white hover:bg-[#2c3240] shadow-[2px_2px_0_#000]'
                    : 'border-rose-600 bg-rose-600 text-white shadow-[2px_2px_0_#000]'
                }`}
                title={isMicOn ? 'Turn off microphone' : 'Turn on microphone'}
              >
                {isMicOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
              </button>

              {/* Camera Toggle */}
              <button
                onClick={toggleCamera}
                className={`flex h-11 w-11 sm:h-12 sm:w-12 cursor-pointer items-center justify-center rounded-xl border-2 transition-all active:scale-95 ${
                  isCameraOn
                    ? 'border-[#2e323b] bg-[#222630] text-white hover:bg-[#2c3240] shadow-[2px_2px_0_#000]'
                    : 'border-rose-600 bg-rose-600 text-white shadow-[2px_2px_0_#000]'
                }`}
                title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
              >
                {isCameraOn ? <Camera className="h-5 w-5" /> : <CameraOff className="h-5 w-5" />}
              </button>

              {/* Screen Share Button */}
              <button
                onClick={toggleScreenShare}
                className={`flex h-11 w-11 sm:h-12 sm:w-12 cursor-pointer items-center justify-center rounded-xl border-2 transition-all active:scale-95 ${
                  isScreenSharing
                    ? 'border-[#39d5c8] bg-[#39d5c8] text-[#171717] shadow-[2px_2px_0_#000]'
                    : 'border-[#2e323b] bg-[#222630] text-white hover:bg-[#2c3240] shadow-[2px_2px_0_#000]'
                }`}
                title={isScreenSharing ? 'Stop presenting screen' : 'Share screen'}
              >
                <Monitor className="h-5 w-5" />
              </button>

              {/* Emoji Reactions Tray Button */}
              <div className="relative">
                <button
                  onClick={() => setShowReactionsMenu((prev) => !prev)}
                  className="flex h-11 w-11 sm:h-12 sm:w-12 cursor-pointer items-center justify-center rounded-xl border-2 border-[#2e323b] bg-[#222630] text-white hover:bg-[#2c3240] shadow-[2px_2px_0_#000] transition-all active:scale-95"
                  title="Send reaction"
                >
                  <Smile className="h-5 w-5" />
                </button>

                {showReactionsMenu && (
                  <div className="absolute bottom-14 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-xl border-2 border-[#2e323b] bg-[#1a1d24] p-2 shadow-2xl z-50">
                    {['👏', '🚀', '❤️', '💡', '🔥', '🎉'].map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => broadcastReaction(emoji)}
                        className="cursor-pointer rounded-lg p-1.5 text-xl hover:scale-125 transition-transform"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Captions Toggle */}
              <button
                onClick={() => setCaptionsEnabled((prev) => !prev)}
                className={`hidden sm:flex h-11 w-11 sm:h-12 sm:w-12 cursor-pointer items-center justify-center rounded-xl border-2 font-mono text-xs font-black transition-all active:scale-95 ${
                  captionsEnabled
                    ? 'border-[#ffd84d] bg-[#ffd84d] text-black shadow-[2px_2px_0_#000]'
                    : 'border-[#2e323b] bg-[#222630] text-zinc-400 hover:bg-[#2c3240] shadow-[2px_2px_0_#000]'
                }`}
                title="Toggle Live Subtitles"
              >
                CC
              </button>

              {/* End Call / Leave Button */}
              <button
                onClick={() => setTab('home')}
                className="cursor-pointer flex h-11 px-4 sm:h-12 sm:px-6 items-center justify-center gap-2 rounded-xl border-2 border-rose-600 bg-rose-600 text-white shadow-[2px_2px_0_#000] transition-all hover:bg-rose-700 active:scale-95 font-black uppercase text-xs"
                title="Leave mentorship call"
              >
                <PhoneOff className="h-4 w-4" />
                <span className="hidden sm:inline">Leave Call</span>
              </button>
            </div>

            {/* Right Panel Toggles */}
            <div className="flex items-center gap-2">
              {/* Chat Panel Toggle */}
              <button
                onClick={() =>
                  setActiveSidePanel((prev) => (prev === 'chat' ? null : 'chat'))
                }
                className={`relative flex h-10 w-10 sm:h-11 sm:w-11 cursor-pointer items-center justify-center rounded-xl border-2 transition-all ${
                  activeSidePanel === 'chat'
                    ? 'border-[#ffd84d] bg-[#ffd84d] text-black shadow-[2px_2px_0_#000]'
                    : 'border-[#2e323b] bg-[#222630] text-white hover:bg-[#2c3240]'
                }`}
                title="Open In-Call Chat"
              >
                <MessageSquare className="h-4 w-4" />
                {unreadChatCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#ff57ce] px-1 text-[9px] font-black text-white">
                    {unreadChatCount}
                  </span>
                )}
              </button>

              {/* Collaborative Whiteboard / Code Scratchpad */}
              <button
                onClick={() =>
                  setActiveSidePanel((prev) => (prev === 'scratchpad' ? null : 'scratchpad'))
                }
                className={`flex h-10 w-10 sm:h-11 sm:w-11 cursor-pointer items-center justify-center rounded-xl border-2 transition-all ${
                  activeSidePanel === 'scratchpad'
                    ? 'border-[#39d5c8] bg-[#39d5c8] text-black shadow-[2px_2px_0_#000]'
                    : 'border-[#2e323b] bg-[#222630] text-white hover:bg-[#2c3240]'
                }`}
                title="Open Shared Architecture Scratchpad"
              >
                <Code2 className="h-4 w-4" />
              </button>

              {/* Mentor Rubric / Scorecard Panel */}
              <button
                onClick={() =>
                  setActiveSidePanel((prev) => (prev === 'rubric' ? null : 'rubric'))
                }
                className={`flex h-10 w-10 sm:h-11 sm:w-11 cursor-pointer items-center justify-center rounded-xl border-2 transition-all ${
                  activeSidePanel === 'rubric'
                    ? 'border-[#ff57ce] bg-[#ff57ce] text-white shadow-[2px_2px_0_#000]'
                    : 'border-[#2e323b] bg-[#222630] text-white hover:bg-[#2c3240]'
                }`}
                title="Mentorship Rubric & Evaluation"
              >
                <FileText className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Side Drawer Panel (Chat / Scratchpad / Rubric) */}
        {activeSidePanel && (
          <aside className="w-80 sm:w-96 shrink-0 border-l-2 border-[#1f232b] bg-[#14161d] flex flex-col justify-between overflow-hidden shadow-2xl transition-all">
            {/* Panel Header */}
            <div className="flex h-14 items-center justify-between border-b-2 border-[#1f232b] px-4">
              <div className="flex items-center gap-2">
                {activeSidePanel === 'chat' && (
                  <>
                    <MessageSquare className="h-4 w-4 text-[#ffd84d]" />
                    <h2 className="font-display text-base uppercase text-white">In-Call Chat</h2>
                  </>
                )}
                {activeSidePanel === 'scratchpad' && (
                  <>
                    <Code2 className="h-4 w-4 text-[#39d5c8]" />
                    <h2 className="font-display text-base uppercase text-white">Shared Scratchpad</h2>
                  </>
                )}
                {activeSidePanel === 'rubric' && (
                  <>
                    <Trophy className="h-4 w-4 text-[#ff57ce]" />
                    <h2 className="font-display text-base uppercase text-white">Mentor Evaluation</h2>
                  </>
                )}
              </div>

              <button
                onClick={() => setActiveSidePanel(null)}
                className="cursor-pointer rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* TAB 1: IN-CALL CHAT */}
            {activeSidePanel === 'chat' && (
              <div className="flex flex-1 flex-col justify-between overflow-hidden p-3">
                <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                  {chatMessages.map((msg) => {
                    const isMe = msg.sender === myName
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                      >
                        <div className="flex items-center gap-1.5 mb-1 text-[10px] text-zinc-400">
                          <span className="font-bold text-zinc-300">{msg.sender}</span>
                          <span className="text-zinc-500">· {msg.time}</span>
                        </div>
                        <div
                          className={`max-w-[85%] rounded-xl border p-2.5 text-xs font-medium ${
                            isMe
                              ? 'border-[#2e323b] bg-[#ffd84d] text-black shadow-[2px_2px_0_#000]'
                              : 'border-[#2e323b] bg-[#1f232b] text-zinc-200'
                          }`}
                        >
                          {msg.text}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Chat Input */}
                <form onSubmit={sendChatMessage} className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Type message..."
                    className="flex-1 rounded-xl border border-[#2e323b] bg-[#0c0d11] px-3 py-2 text-xs font-bold text-white outline-none focus:border-[#ffd84d]"
                  />
                  <button
                    type="submit"
                    className="cursor-pointer flex h-9 w-9 items-center justify-center rounded-xl border border-black bg-[#ffd84d] text-black shadow-[1px_1px_0_#000] hover:brightness-105"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </form>
              </div>
            )}

            {/* TAB 2: SHARED CODE & ARCHITECTURE SCRATCHPAD */}
            {activeSidePanel === 'scratchpad' && (
              <div className="flex flex-1 flex-col justify-between overflow-hidden p-3">
                <div className="mb-2 text-[11px] font-bold text-zinc-400">
                  Real-time synchronized editor. Code or diagram notes written here are visible to both participants.
                </div>

                <textarea
                  value={scratchpadCode}
                  onChange={(e) => {
                    setScratchpadCode(e.target.value)
                    try {
                      const supabase = getSupabaseBrowserClient()
                      supabase.channel(`mentorship-room-${meetingId}`).send({
                        type: 'broadcast',
                        event: 'scratchpad-update',
                        payload: { code: e.target.value },
                      })
                    } catch {
                      // ignore
                    }
                  }}
                  rows={18}
                  className="w-full flex-1 resize-none rounded-xl border-2 border-[#2e323b] bg-[#0c0d11] p-3 font-mono text-xs font-semibold text-emerald-400 outline-none focus:border-[#39d5c8]"
                />

                <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-400">
                  <span>Language: TypeScript</span>
                  <span className="text-emerald-400 font-bold">● Auto-syncing</span>
                </div>
              </div>
            )}

            {/* TAB 3: MENTOR RUBRIC & EVALUATION */}
            {activeSidePanel === 'rubric' && (
              <div className="flex flex-1 flex-col justify-between overflow-y-auto p-4 space-y-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 rounded-md border border-[#2e323b] bg-[#ff57ce]/20 px-2.5 py-0.5 text-[10px] font-black uppercase text-[#ff57ce]">
                    Round 2 Mentorship Scorecard
                  </div>
                  <h3 className="mt-2 font-display text-xl uppercase text-white">
                    Candidate: Maya Chen
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Grade system architecture, distributed systems reasoning, and communication.
                  </p>
                </div>

                <div className="space-y-3">
                  {[
                    { key: 'architecture', label: 'Systems Architecture', desc: 'Partitioning & consistency' },
                    { key: 'concurrency', label: 'Concurrency & Locking', desc: 'Deadlock avoidance & leases' },
                    { key: 'problemSolving', label: 'Problem Solving & Speed', desc: 'Debugging under live guidance' },
                    { key: 'communication', label: 'Communication & Culture', desc: 'Clarity & receptiveness' },
                  ].map((field) => (
                    <div
                      key={field.key}
                      className="rounded-xl border border-[#2e323b] bg-[#1a1d24] p-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase text-zinc-200">
                          {field.label}
                        </span>
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() =>
                                setRubricScores((prev) => ({
                                  ...prev,
                                  [field.key]: star,
                                }))
                              }
                              className={`cursor-pointer text-sm ${
                                star <= (rubricScores as any)[field.key]
                                  ? 'text-[#ffd84d]'
                                  : 'text-zinc-600'
                              }`}
                            >
                              ★
                            </button>
                          ))}
                        </div>
                      </div>
                      <p className="mt-0.5 text-[10px] text-zinc-400">{field.desc}</p>
                    </div>
                  ))}
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-300 block mb-1">
                    Mentorship Summary & Notes:
                  </label>
                  <textarea
                    value={rubricNotes}
                    onChange={(e) => setRubricNotes(e.target.value)}
                    rows={3}
                    className="w-full resize-none rounded-xl border border-[#2e323b] bg-[#0c0d11] p-2.5 text-xs text-white outline-none focus:border-[#ffd84d]"
                  />
                </div>

                {rubricSubmitted ? (
                  <div className="rounded-xl border border-emerald-500 bg-emerald-950/40 p-3 text-center text-xs font-bold text-emerald-300">
                    ✓ Mentorship Evaluation Saved & Passed to Hiring Board!
                  </div>
                ) : (
                  <button
                    onClick={() => setRubricSubmitted(true)}
                    className="cursor-pointer w-full rounded-xl border-2 border-black bg-[#39d5c8] py-2.5 text-xs font-black uppercase text-black shadow-[2px_2px_0_#000] hover:brightness-105"
                  >
                    Submit Round 2 Recommendation
                  </button>
                )}
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  )
}
