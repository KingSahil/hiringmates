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
import { useAuth } from '@/lib/auth'
import { isMentor as isMentorEmail } from '@/lib/portal'

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

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
}

export function MentorshipMeetContent() {
  const { setTab } = useNavigation()
  const { activeRole, setActiveRole } = useNotifications()
  const { user, isAuthorized } = useAuth()

  // Meeting Identity & Roles
  const [meetingId] = useState(() => {
    if (typeof window !== 'undefined') {
      const fromUrl = new URLSearchParams(window.location.search).get('meeting')
      if (fromUrl) return fromUrl
    }
    return 'mentorship-r2-northstar'
  })
  const [copiedLink, setCopiedLink] = useState(false)
  const isMentor = isAuthorized ? isMentorEmail(user?.email) : activeRole === 'mentor'

  // Dynamic names with fallback
  const myName =
    user?.user_metadata?.display_name ||
    user?.user_metadata?.full_name ||
    (user?.email ? user.email.split('@')[0] : isMentor ? 'Sarah Vance' : 'Maya Chen')
  const myRoleLabel = isMentor ? 'Lead Mentor (Staff Eng)' : 'Candidate (Full-Stack)'

  const [remotePeerName, setRemotePeerName] = useState<string>('')
  const [remotePeerRole, setRemotePeerRole] = useState<string>('')

  const peerName = remotePeerName || (isMentor ? 'Maya Chen' : 'Sarah Vance')
  const peerRoleLabel = remotePeerRole || (isMentor ? 'Candidate (Round 2)' : 'Lead Mentor (Staff Eng)')

  // Media Streams State
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)

  const [isCameraOn, setIsCameraOn] = useState(true)
  const [isMicOn, setIsMicOn] = useState(true)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [isPeerSpeaking, setIsPeerSpeaking] = useState(false)
  const [localAudioLevel, setLocalAudioLevel] = useState(0)
  const [mediaError, setMediaError] = useState<string | null>(null)

  // Remote counterpart state
  const [remoteConnected, setRemoteConnected] = useState(false)
  const [peerCameraOn, setPeerCameraOn] = useState(true)
  const [peerMicOn, setPeerMicOn] = useState(true)
  const [connectionStatus, setConnectionStatus] = useState<'waiting' | 'connecting' | 'connected' | 'failed'>('waiting')

  // Client unique ID for polite WebRTC negotiation
  const [clientId] = useState(() =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `client-${Math.random().toString(36).slice(2, 9)}`
  )

  // Drawer / Side Panel State
  const [activeSidePanel, setActiveSidePanel] = useState<'chat' | 'scratchpad' | 'rubric' | 'captions' | null>('chat')
  const [unreadChatCount, setUnreadChatCount] = useState(0)

  // Elapsed Call Timer
  const [callDuration, setCallDuration] = useState(0)
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
      sender: 'System',
      role: 'mentor',
      text: `Private mentorship session initialized (${meetingId}). Realtime WebRTC signaling active.`,
      time: 'Now',
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
    'Real-time P2P encrypted session established. Both audio, video, and code scratchpad are connected.'
  )

  // Element & WebRTC References
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null)
  const screenVideoRef = useRef<HTMLVideoElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number | null>(null)

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([])
  const channelRef = useRef<any>(null)
  const makingOfferRef = useRef<boolean>(false)

  // 1. Initialize Local Media Stream (Camera & Mic)
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

        // Setup audio visualizer for local mic
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
        setMediaError(
          err.name === 'NotAllowedError'
            ? 'Camera/Mic access was denied. You can continue with screen share and audio.'
            : 'Hardware unavailable. Running in simulated interactive mode.'
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

  // 2. Setup WebRTC Peer Connection Factory
  const getOrCreatePeerConnection = useCallback(() => {
    if (peerConnectionRef.current) return peerConnectionRef.current

    const pc = new RTCPeerConnection(RTC_CONFIG)
    peerConnectionRef.current = pc

    // Add local tracks if available
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        try {
          pc.addTrack(track, localStream)
        } catch {
          // ignore duplicate track
        }
      })
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'webrtc-ice',
          payload: { candidate: event.candidate, senderId: clientId },
        })
      }
    }

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        const stream = event.streams[0]
        setRemoteStream(stream)
        setRemoteConnected(true)
        setConnectionStatus('connected')

        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream
          remoteVideoRef.current.play().catch(() => {})
        }
      }
    }

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState
      if (state === 'connected') {
        setConnectionStatus('connected')
        setRemoteConnected(true)
      } else if (state === 'connecting') {
        setConnectionStatus('connecting')
      } else if (state === 'disconnected' || state === 'failed') {
        setConnectionStatus('failed')
      } else if (state === 'closed') {
        setConnectionStatus('waiting')
        setRemoteStream(null)
      }
    }

    return pc
  }, [localStream, clientId])

  // 3. Keep local stream tracks synced to peer connection
  useEffect(() => {
    if (!localStream || !peerConnectionRef.current) return
    const pc = peerConnectionRef.current
    const senders = pc.getSenders()

    localStream.getTracks().forEach((track) => {
      const existing = senders.find((s) => s.track?.kind === track.kind)
      if (existing) {
        existing.replaceTrack(track).catch(() => {})
      } else {
        try {
          pc.addTrack(track, localStream)
        } catch {
          // ignore
        }
      }
    })
  }, [localStream])

  // 4. Remote audio activity detector (Authentic remote speaking pulse)
  useEffect(() => {
    if (!remoteStream || remoteStream.getAudioTracks().length === 0) return
    let animId: number
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioContextClass) return
      const ctx = new AudioContextClass()
      const source = ctx.createMediaStreamSource(remoteStream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 64
      source.connect(analyser)

      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      const checkAudio = () => {
        analyser.getByteFrequencyData(dataArray)
        const avg = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length
        setIsPeerSpeaking(avg > 18)
        animId = requestAnimationFrame(checkAudio)
      }
      checkAudio()

      return () => {
        cancelAnimationFrame(animId)
        ctx.close().catch(() => {})
      }
    } catch {
      // fallback
    }
  }, [remoteStream])

  // 5. Hot-swap video track when screen share starts or stops
  useEffect(() => {
    if (!peerConnectionRef.current) return
    const pc = peerConnectionRef.current
    const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video')
    if (videoSender) {
      const trackToUse =
        isScreenSharing && screenStream
          ? screenStream.getVideoTracks()[0]
          : localStream && isCameraOn
          ? localStream.getVideoTracks()[0]
          : null

      if (trackToUse) {
        videoSender.replaceTrack(trackToUse).catch(() => {})
      }
    }
  }, [isScreenSharing, screenStream, localStream, isCameraOn])

  // 6. Supabase Realtime WebRTC Signaling Channel
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    const channelTopic = `mentorship-room-${meetingId}`
    const channel = supabase.channel(channelTopic, {
      config: { broadcast: { self: false } },
    })
    channelRef.current = channel

    const createAndSendOffer = async (pc: RTCPeerConnection) => {
      try {
        makingOfferRef.current = true
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        })
        await pc.setLocalDescription(offer)
        channel.send({
          type: 'broadcast',
          event: 'webrtc-offer',
          payload: {
            sdp: pc.localDescription,
            senderId: clientId,
            senderName: myName,
            senderRole: myRoleLabel,
          },
        })
      } catch (err) {
        console.warn('Error creating WebRTC offer:', err)
      } finally {
        makingOfferRef.current = false
      }
    }

    channel
      // A new peer entered the room
      .on('broadcast', { event: 'webrtc-join' }, async ({ payload }: any) => {
        if (!payload || payload.clientId === clientId) return
        if (payload.name) setRemotePeerName(payload.name)
        if (payload.role) setRemotePeerRole(payload.role)

        // Greet back with our presence
        channel.send({
          type: 'broadcast',
          event: 'webrtc-peer-ready',
          payload: { clientId, name: myName, role: myRoleLabel, isCameraOn, isMicOn },
        })

        // Deterministic initiator: Mentor initiates, or compare clientIds if roles match
        const shouldInitiate = isMentor || (!payload.isMentor && clientId > payload.clientId)
        if (shouldInitiate) {
          const pc = getOrCreatePeerConnection()
          setConnectionStatus('connecting')
          await createAndSendOffer(pc)
        }
      })
      // Peer greeted us back
      .on('broadcast', { event: 'webrtc-peer-ready' }, async ({ payload }: any) => {
        if (!payload || payload.clientId === clientId) return
        if (payload.name) setRemotePeerName(payload.name)
        if (payload.role) setRemotePeerRole(payload.role)
        if (typeof payload.isCameraOn === 'boolean') setPeerCameraOn(payload.isCameraOn)
        if (typeof payload.isMicOn === 'boolean') setPeerMicOn(payload.isMicOn)

        const shouldInitiate = isMentor || (!payload.isMentor && clientId > payload.clientId)
        if (shouldInitiate) {
          const pc = getOrCreatePeerConnection()
          setConnectionStatus('connecting')
          await createAndSendOffer(pc)
        }
      })
      // Incoming SDP Offer
      .on('broadcast', { event: 'webrtc-offer' }, async ({ payload }: any) => {
        if (!payload || payload.senderId === clientId || !payload.sdp) return
        if (payload.senderName) setRemotePeerName(payload.senderName)
        if (payload.senderRole) setRemotePeerRole(payload.senderRole)

        try {
          const pc = getOrCreatePeerConnection()
          setConnectionStatus('connecting')
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))

          // Drain queued ICE candidates
          while (pendingCandidatesRef.current.length > 0) {
            const cand = pendingCandidatesRef.current.shift()
            if (cand) await pc.addIceCandidate(new RTCIceCandidate(cand))
          }

          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)

          channel.send({
            type: 'broadcast',
            event: 'webrtc-answer',
            payload: { sdp: pc.localDescription, senderId: clientId, senderName: myName },
          })
        } catch (err) {
          console.warn('Error handling WebRTC offer:', err)
        }
      })
      // Incoming SDP Answer
      .on('broadcast', { event: 'webrtc-answer' }, async ({ payload }: any) => {
        if (!payload || payload.senderId === clientId || !payload.sdp) return
        if (payload.senderName) setRemotePeerName(payload.senderName)

        try {
          const pc = getOrCreatePeerConnection()
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))

          // Drain queued ICE candidates
          while (pendingCandidatesRef.current.length > 0) {
            const cand = pendingCandidatesRef.current.shift()
            if (cand) await pc.addIceCandidate(new RTCIceCandidate(cand))
          }
        } catch (err) {
          console.warn('Error handling WebRTC answer:', err)
        }
      })
      // Incoming ICE Candidate
      .on('broadcast', { event: 'webrtc-ice' }, async ({ payload }: any) => {
        if (!payload || payload.senderId === clientId || !payload.candidate) return

        try {
          const pc = getOrCreatePeerConnection()
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate))
          } else {
            pendingCandidatesRef.current.push(payload.candidate)
          }
        } catch (err) {
          console.warn('Error adding ICE candidate:', err)
        }
      })
      // Peer media state updates
      .on('broadcast', { event: 'peer-media-state' }, ({ payload }: any) => {
        if (!payload || payload.senderId === clientId) return
        if (typeof payload.isCameraOn === 'boolean') setPeerCameraOn(payload.isCameraOn)
        if (typeof payload.isMicOn === 'boolean') setPeerMicOn(payload.isMicOn)
      })
      // Peer exited call
      .on('broadcast', { event: 'peer-leave' }, ({ payload }: any) => {
        if (!payload || payload.senderId === clientId) return
        setConnectionStatus('waiting')
        setRemoteStream(null)
        setRemoteConnected(false)
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null
      })
      // In-Call Chat Messages
      .on('broadcast', { event: 'chat-message' }, ({ payload }: any) => {
        if (payload) {
          setChatMessages((prev) => [...prev, payload])
          if (activeSidePanel !== 'chat') {
            setUnreadChatCount((c) => c + 1)
          }
        }
      })
      // Floating Emoji Reactions
      .on('broadcast', { event: 'reaction' }, ({ payload }: any) => {
        if (payload?.emoji) {
          triggerEmojiFloat(payload.emoji)
        }
      })
      // Collaborative Scratchpad Code
      .on('broadcast', { event: 'scratchpad-update' }, ({ payload }: any) => {
        if (payload?.code) {
          setScratchpadCode(payload.code)
        }
      })
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          // Announce presence to room
          channel.send({
            type: 'broadcast',
            event: 'webrtc-join',
            payload: { clientId, name: myName, role: myRoleLabel, isMentor, isCameraOn, isMicOn },
          })
        }
      })

    return () => {
      try {
        channel.send({
          type: 'broadcast',
          event: 'peer-leave',
          payload: { senderId: clientId },
        })
      } catch {
        // ignore
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close()
        peerConnectionRef.current = null
      }
      channelRef.current = null
      supabase.removeChannel(channel)
    }
  }, [meetingId, clientId, myName, myRoleLabel, isMentor, getOrCreatePeerConnection, isCameraOn, isMicOn, activeSidePanel])

  // Re-attach camera stream to local video ref
  useEffect(() => {
    if (localVideoRef.current && localStream && isCameraOn) {
      localVideoRef.current.srcObject = localStream
      localVideoRef.current.play().catch(() => {})
    }
  }, [localStream, isCameraOn, isScreenSharing])

  // Re-attach screen stream to video ref
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
    const nextState = !isCameraOn
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = nextState
      }
    }
    setIsCameraOn(nextState)

    channelRef.current?.send({
      type: 'broadcast',
      event: 'peer-media-state',
      payload: { isCameraOn: nextState, isMicOn, senderId: clientId },
    })
  }, [localStream, isCameraOn, isMicOn, clientId])

  // Toggle Microphone
  const toggleMicrophone = useCallback(() => {
    const nextState = !isMicOn
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = nextState
      }
    }
    setIsMicOn(nextState)

    channelRef.current?.send({
      type: 'broadcast',
      event: 'peer-media-state',
      payload: { isCameraOn, isMicOn: nextState, senderId: clientId },
    })
  }, [localStream, isCameraOn, isMicOn, clientId])

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
    const x = Math.floor(Math.random() * 60) + 20
    setFloatingReactions((prev) => [...prev, { id, emoji, x }])

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
    const url = `${window.location.origin}/mentorship?meeting=${encodeURIComponent(meetingId)}`
    navigator.clipboard.writeText(url)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

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
            <span
              className={`flex h-3 w-3 rounded-full ${
                connectionStatus === 'connected'
                  ? 'bg-emerald-500 animate-pulse'
                  : connectionStatus === 'connecting'
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-zinc-500'
              }`}
            />
            <h1 className="font-display text-lg uppercase tracking-wider text-white hidden sm:inline">
              Mates Meet · Round 2 Mentorship
            </h1>
            <h1 className="font-display text-base uppercase text-white sm:hidden">Round 2 Meet</h1>
          </div>

          <span className="rounded-md border border-[#2e323b] bg-[#ffd84d] px-2 py-0.5 font-mono text-[10px] font-black uppercase text-[#171717]">
            {connectionStatus === 'connected' ? 'Live P2P' : connectionStatus === 'connecting' ? 'Connecting' : 'Ready'}
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
              Candidate
            </button>
            <button
              onClick={() => setActiveRole('mentor')}
              className={`cursor-pointer rounded-lg px-2.5 py-1 transition-all ${
                isMentor
                  ? 'border border-black bg-[#39d5c8] text-[#171717] font-black shadow-[1px_1px_0_#000]'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Mentor
            </button>
          </div>
        </div>

        {/* Right: Quality Info & Copy Link */}
        <div className="flex items-center gap-2.5">
          <div className="hidden md:flex items-center gap-1.5 rounded-lg border border-[#2e323b] bg-[#1a1d24] px-2.5 py-1 text-[11px] font-semibold text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span>WebRTC P2P Direct</span>
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
          {/* Active Screen Sharing Canvas */}
          {isScreenSharing ? (
            <div className="flex flex-1 gap-4 overflow-hidden">
              {/* Screen Presentation */}
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
                  {peerCameraOn && remoteStream ? (
                    <video
                      ref={(el) => {
                        if (el && remoteStream && el.srcObject !== remoteStream) {
                          el.srcObject = remoteStream
                          el.play().catch(() => {})
                        }
                      }}
                      autoPlay
                      playsInline
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-900/60 to-purple-950/60">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white/20 bg-[#39d5c8] text-base font-black text-black">
                        {peerName.slice(0, 1)}
                      </div>
                    </div>
                  )}
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
                      {isMicOn && localAudioLevel > 10 && (
                        <span className="absolute inset-0 rounded-full border-4 border-[#ffd84d] animate-ping opacity-40" />
                      )}
                    </div>
                    <span className="mt-4 text-xs font-bold text-zinc-400">
                      Camera turned off
                    </span>
                  </div>
                )}

                {/* Dark gradient vignette */}
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

              {/* TILE 2: REMOTE PARTICIPANT (WebRTC Real Video Stream) */}
              <div
                className={`group relative flex flex-col justify-between rounded-2xl border-3 bg-[#13151b] p-4 shadow-[5px_5px_0_#000000] overflow-hidden transition-all duration-300 ${
                  isPeerSpeaking
                    ? 'border-[#ffd84d] shadow-[0_0_20px_rgba(255,216,77,0.3)]'
                    : 'border-[#2e323b]'
                }`}
              >
                {/* Real Live Remote Video or Avatar Fallback */}
                {peerCameraOn && remoteStream ? (
                  <video
                    ref={(el) => {
                      remoteVideoRef.current = el
                      if (el && remoteStream && el.srcObject !== remoteStream) {
                        el.srcObject = remoteStream
                        el.play().catch(() => {})
                      }
                    }}
                    autoPlay
                    playsInline
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-[#1c1f28] to-[#101217]">
                    <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#39d5c8_1px,transparent_1px)] [background-size:16px_16px]" />

                    <div className="relative flex h-24 w-24 sm:h-28 sm:w-28 items-center justify-center rounded-full border-4 border-[#171717] bg-[#39d5c8] text-3xl sm:text-4xl font-black text-[#171717] shadow-xl">
                      {peerName.slice(0, 1)}
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

                    {connectionStatus === 'waiting' && (
                      <span className="mt-3 rounded-full bg-black/60 border border-white/20 px-3 py-1 text-[10px] font-mono text-zinc-300">
                        Waiting for counterpart to join...
                      </span>
                    )}
                    {connectionStatus === 'connecting' && (
                      <span className="mt-3 rounded-full bg-amber-500/20 border border-amber-500/40 px-3 py-1 text-[10px] font-mono text-amber-300 animate-pulse">
                        Connecting WebRTC P2P...
                      </span>
                    )}
                    {connectionStatus === 'connected' && !peerCameraOn && (
                      <span className="mt-2 text-xs font-bold text-zinc-400">
                        Camera turned off
                      </span>
                    )}
                  </div>
                )}

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
                    {peerMicOn ? <Volume2 className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5 text-rose-400" />}
                    <span className="text-[10px] font-mono">{peerMicOn ? 'HD Audio' : 'Muted'}</span>
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
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        connectionStatus === 'connected'
                          ? 'bg-emerald-400 animate-pulse'
                          : connectionStatus === 'connecting'
                          ? 'bg-amber-400 animate-pulse'
                          : 'bg-zinc-500'
                      }`}
                    />
                    {connectionStatus === 'connected'
                      ? 'P2P Live'
                      : connectionStatus === 'connecting'
                      ? 'Connecting'
                      : 'Waiting'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Live Captions Bar */}
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

          {/* Bottom Call Controls Dock */}
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
                title="Open Scratchpad"
              >
                <Code2 className="h-4 w-4" />
              </button>

              {/* Mentor Rubric Evaluation Panel */}
              <button
                onClick={() =>
                  setActiveSidePanel((prev) => (prev === 'rubric' ? null : 'rubric'))
                }
                className={`flex h-10 w-10 sm:h-11 sm:w-11 cursor-pointer items-center justify-center rounded-xl border-2 transition-all ${
                  activeSidePanel === 'rubric'
                    ? 'border-[#6d73ff] bg-[#6d73ff] text-white shadow-[2px_2px_0_#000]'
                    : 'border-[#2e323b] bg-[#222630] text-white hover:bg-[#2c3240]'
                }`}
                title="Open Rubric Evaluation"
              >
                <FileText className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Drawer / Side Panel (Chat / Scratchpad / Rubric) */}
        {activeSidePanel && (
          <aside className="relative flex w-80 sm:w-96 flex-col border-l-2 border-[#1f232b] bg-[#14161e] p-4 text-white shadow-2xl z-20 animate-in slide-in-from-right duration-200">
            {/* Side Panel Header */}
            <div className="flex items-center justify-between border-b border-[#2e323b] pb-3">
              <div className="flex items-center gap-2">
                {activeSidePanel === 'chat' && <MessageSquare className="h-4 w-4 text-[#ffd84d]" />}
                {activeSidePanel === 'scratchpad' && <Code2 className="h-4 w-4 text-[#39d5c8]" />}
                {activeSidePanel === 'rubric' && <FileText className="h-4 w-4 text-[#6d73ff]" />}
                <h3 className="font-display text-base uppercase tracking-wider">
                  {activeSidePanel === 'chat' && 'In-Call Chat'}
                  {activeSidePanel === 'scratchpad' && 'Architecture Board'}
                  {activeSidePanel === 'rubric' && 'Evaluation Rubric'}
                </h3>
              </div>

              <button
                onClick={() => setActiveSidePanel(null)}
                className="cursor-pointer rounded-lg p-1 text-zinc-400 hover:bg-[#222630] hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* TAB CONTENT: CHAT */}
            {activeSidePanel === 'chat' && (
              <div className="flex flex-1 flex-col justify-between overflow-hidden pt-3">
                <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                  {chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`rounded-xl border p-3 text-xs ${
                        msg.role === 'mentor'
                          ? 'border-[#39d5c8]/30 bg-[#1c242c]'
                          : 'border-[#2e323b] bg-[#1a1d24]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-white flex items-center gap-1.5">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              msg.role === 'mentor' ? 'bg-[#39d5c8]' : 'bg-[#ffd84d]'
                            }`}
                          />
                          {msg.sender}
                        </span>
                        <span className="text-[10px] text-zinc-400">{msg.time}</span>
                      </div>
                      <p className="text-zinc-200 leading-relaxed">{msg.text}</p>
                    </div>
                  ))}
                </div>

                <form onSubmit={sendChatMessage} className="mt-3 flex gap-2 pt-2 border-t border-[#2e323b]">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Send a message to room..."
                    className="flex-1 rounded-xl border border-[#2e323b] bg-[#1a1d24] px-3 py-2 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-[#39d5c8]"
                  />
                  <button
                    type="submit"
                    className="cursor-pointer flex h-9 w-9 items-center justify-center rounded-xl bg-[#ffd84d] text-black hover:bg-[#ffe270] transition"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </form>
              </div>
            )}

            {/* TAB CONTENT: ARCHITECTURE SCRATCHPAD */}
            {activeSidePanel === 'scratchpad' && (
              <div className="flex flex-1 flex-col overflow-hidden pt-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-mono text-zinc-400">
                    Live synchronized with room
                  </span>
                  <span className="rounded bg-[#39d5c8]/20 px-1.5 py-0.5 text-[9px] font-bold text-[#39d5c8]">
                    Realtime Synced
                  </span>
                </div>
                <textarea
                  value={scratchpadCode}
                  onChange={(e) => {
                    const newVal = e.target.value
                    setScratchpadCode(newVal)
                    try {
                      const supabase = getSupabaseBrowserClient()
                      supabase.channel(`mentorship-room-${meetingId}`).send({
                        type: 'broadcast',
                        event: 'scratchpad-update',
                        payload: { code: newVal },
                      })
                    } catch {
                      // ignore
                    }
                  }}
                  className="flex-1 resize-none rounded-xl border border-[#2e323b] bg-[#0c0e12] p-3 font-mono text-xs text-[#39d5c8] outline-none focus:border-[#39d5c8]"
                  spellCheck={false}
                />
              </div>
            )}

            {/* TAB CONTENT: RUBRIC */}
            {activeSidePanel === 'rubric' && (
              <div className="flex flex-1 flex-col overflow-y-auto pt-3 space-y-4 pr-1">
                <div>
                  <h4 className="text-xs font-black uppercase text-zinc-300 mb-1">
                    Systems Architecture
                  </h4>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((score) => (
                      <button
                        key={score}
                        onClick={() =>
                          setRubricScores((prev) => ({ ...prev, architecture: score }))
                        }
                        className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition ${
                          rubricScores.architecture === score
                            ? 'border-[#6d73ff] bg-[#6d73ff] text-white'
                            : 'border-[#2e323b] bg-[#1a1d24] text-zinc-400'
                        }`}
                      >
                        {score}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-black uppercase text-zinc-300 mb-1">
                    Concurrency & State
                  </h4>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((score) => (
                      <button
                        key={score}
                        onClick={() =>
                          setRubricScores((prev) => ({ ...prev, concurrency: score }))
                        }
                        className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition ${
                          rubricScores.concurrency === score
                            ? 'border-[#6d73ff] bg-[#6d73ff] text-white'
                            : 'border-[#2e323b] bg-[#1a1d24] text-zinc-400'
                        }`}
                      >
                        {score}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-black uppercase text-zinc-300 mb-1">
                    Communication & Trade-offs
                  </h4>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((score) => (
                      <button
                        key={score}
                        onClick={() =>
                          setRubricScores((prev) => ({ ...prev, communication: score }))
                        }
                        className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition ${
                          rubricScores.communication === score
                            ? 'border-[#6d73ff] bg-[#6d73ff] text-white'
                            : 'border-[#2e323b] bg-[#1a1d24] text-zinc-400'
                        }`}
                      >
                        {score}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-black uppercase text-zinc-300 mb-1 block">
                    Mentor Feedback & Notes
                  </label>
                  <textarea
                    value={rubricNotes}
                    onChange={(e) => setRubricNotes(e.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-[#2e323b] bg-[#1a1d24] p-3 text-xs text-white outline-none focus:border-[#6d73ff]"
                  />
                </div>

                <button
                  onClick={() => setRubricSubmitted(true)}
                  className="w-full py-2.5 rounded-xl bg-[#6d73ff] text-white font-black uppercase text-xs tracking-wider shadow-[2px_2px_0_#000] hover:bg-[#5d63f0] transition active:translate-y-0.5"
                >
                  {rubricSubmitted ? '✓ Evaluation Submitted' : 'Submit Mentor Evaluation'}
                </button>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  )
}
