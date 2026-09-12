'use client'

import { useState, useEffect, useRef } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Code2,
  LockKeyhole,
  Maximize,
  Mic,
  MicOff,
  Minimize,
  Monitor,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Timer,
  Trophy,
  UserCheck,
  Video,
  VideoOff,
  XCircle,
} from 'lucide-react'
import { useNavigation } from '@/lib/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase'

type HireMeStep = 'profile' | 'invite' | 'check' | 'assessment' | 'admin' | 'results'

const questions = [
  {
    id: 1,
    type: 'MCP Protocol',
    timeLimit: 2 * 60, // 2 minutes (120 seconds)
    title: 'Model Context Protocol (MCP): How does an MCP client securely discover capabilities and execute tools on an MCP server?',
    options: [
      'Client requests available tool schemas via `tools/list`, validates parameters against JSON Schema, and executes via `tools/call` over JSON-RPC',
      'Client executes arbitrary shell commands on the server host via unauthenticated root SSH without schema negotiation',
      'Client downloads untrusted executable binaries from the server and runs them natively inside the host operating system without sandbox',
      'Client polls plain HTTP REST endpoints without JSON Schema validation, structured error codes, or protocol handshakes',
    ],
    correct: 0,
  },
  {
    id: 2,
    type: 'Technical Writing',
    timeLimit: 10 * 60, // 10 minutes (600 seconds)
    title: 'Technical Writing: Design and document an MCP Server architecture for an automated cloud incident response and observability platform.',
    placeholder: 'Write a comprehensive technical specification covering:\n1. Architecture & Protocol Transport (stdio / SSE)\n2. Tool Specifications (JSON Schema for log analysis, metric anomaly alerts, canary rollback)\n3. Security & Access Control (principle of least privilege, token authentication, audit logs)\n4. Error Handling, Rate Limiting & Human-In-The-Loop Guards...',
    defaultValue: `# Technical Architecture: MCP Cloud Incident Response Server

## 1. System Overview & Transport
The incident response server acts as an MCP server bridging AI diagnostic agents with infrastructure observability (Datadog, Prometheus, Kubernetes).
- **Transport**: Server-Sent Events (SSE) over TLS for remote cluster deployment, with standard JSON-RPC 2.0 framing.
- **Role**: Read-heavy automated diagnostics with gated write access for remediation.

## 2. Registered MCP Tools
- \`query_cluster_telemetry\`: Retrieves p99 latency, HTTP 5xx error spikes, and CPU/memory saturation metrics.
- \`fetch_pod_logs\`: Streams logs matching panic or OOM traces with regex filtering.
- \`trigger_canary_rollback\`: Rolls back failing deployments. Requires dual-approval token and human-in-the-loop authorization.

## 3. Security & Sandboxing
- Strict RBAC: All tools execute under scoped read-only service accounts unless remediation privileges are explicitly signed.
- Immutable audit log emitted for every tool invocation.

## 4. Fault Tolerance & Human Escalation
- Tool executions timeout after 15 seconds.
- High-severity incidents automatically escalate to on-call engineers if mitigation confidence is under 90%.`,
  },
]

export function HireMeContent() {
  const { setTab } = useNavigation()
  const [step, setStep] = useState<HireMeStep>('invite')

  // Profile state
  const [candidateName, setCandidateName] = useState('Maya Chen')
  const [candidateLinkedin, setCandidateLinkedin] = useState('https://linkedin.com/in/mayachen')
  const [candidateGithub, setCandidateGithub] = useState('https://github.com/mayachen-dev')
  const [candidateSkills, setCandidateSkills] = useState('React, TypeScript, Next.js, Node.js, PostgreSQL')

  // Hardware & Proctoring verification state
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [micStream, setMicStream] = useState<MediaStream | null>(null)
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null)
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedCameraId, setSelectedCameraId] = useState<string>('')
  const [cameraReady, setCameraReady] = useState(false)
  const [micReady, setMicReady] = useState(false)
  const [screenReady, setScreenReady] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [hardwareError, setHardwareError] = useState<string | null>(null)
  const [isRequestingCamera, setIsRequestingCamera] = useState(false)
  const [isRequestingMic, setIsRequestingMic] = useState(false)
  const [isRequestingScreen, setIsRequestingScreen] = useState(false)
  const [consentChecked, setConsentChecked] = useState(false)

  // Proctoring tab-switch & integrity state
  const [tabViolations, setTabViolations] = useState(0)
  const [showTabWarning, setShowTabWarning] = useState(false)
  const [isTerminated, setIsTerminated] = useState(false)
  const [terminationReason, setTerminationReason] = useState('')

  // Per-question countdown timers: Q1 MCP = 2m (120s), Q2 Writing = 10m (600s)
  const [questionTimes, setQuestionTimes] = useState<Record<number, number>>({
    0: 2 * 60,
    1: 10 * 60,
  })

  const videoPreviewRef = useRef<HTMLVideoElement | null>(null)
  const pipVideoRef = useRef<HTMLVideoElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number | null>(null)

  // Fullscreen listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])

  // Enumerate video input devices
  const enumerateCameras = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoInputs = devices.filter((d) => d.kind === 'videoinput')
      setVideoDevices(videoInputs)
      if (videoInputs.length > 0 && !selectedCameraId) {
        setSelectedCameraId(videoInputs[0].deviceId)
      }
    } catch (err) {
      console.warn('Camera enumeration error:', err)
    }
  }

  // Audio analyzer setup
  const setupAudioMeter = (stream: MediaStream) => {
    try {
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {})
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
      }

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioContextClass) return

      const audioCtx = new AudioContextClass()
      audioContextRef.current = audioCtx
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 64
      analyserRef.current = analyser

      const source = audioCtx.createMediaStreamSource(stream)
      source.connect(analyser)

      const dataArray = new Uint8Array(analyser.frequencyBinCount)

      const tick = () => {
        if (!analyserRef.current) return
        analyserRef.current.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i]
        }
        const avg = sum / dataArray.length
        const level = Math.min(100, Math.round((avg / 64) * 100))
        setAudioLevel(level)
        animFrameRef.current = requestAnimationFrame(tick)
      }
      tick()
    } catch (err) {
      console.warn('Audio meter initialization failed:', err)
    }
  }

  // Request / Start Camera with specific or default device
  const startCamera = async (deviceId?: string) => {
    setIsRequestingCamera(true)
    setHardwareError(null)
    try {
      const targetId = deviceId || selectedCameraId
      const constraints: MediaStreamConstraints = {
        video: targetId
          ? { deviceId: { exact: targetId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      setCameraStream(stream)
      setCameraReady(true)

      // Refresh camera labels after permission is given
      await enumerateCameras()
    } catch (err: any) {
      console.error('Camera access error:', err)
      // If exact deviceId failed, try generic fallback
      if (deviceId) {
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
          setCameraStream(fallbackStream)
          setCameraReady(true)
          await enumerateCameras()
          return
        } catch {}
      }
      setCameraReady(false)
      setHardwareError(
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Please allow camera access in your browser settings.'
          : 'Unable to access camera: ' + (err.message || 'Unknown error')
      )
    } finally {
      setIsRequestingCamera(false)
    }
  }

  // Switch camera device
  const switchCamera = async (targetDeviceId?: string) => {
    let nextId = targetDeviceId
    if (!nextId && videoDevices.length > 0) {
      const currentIndex = videoDevices.findIndex((d) => d.deviceId === selectedCameraId)
      const nextIndex = (currentIndex + 1) % videoDevices.length
      nextId = videoDevices[nextIndex]?.deviceId
    }

    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop())
      setCameraStream(null)
      setCameraReady(false)
    }

    if (nextId) {
      setSelectedCameraId(nextId)
    }
    await startCamera(nextId)
  }

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop())
      setCameraStream(null)
      setCameraReady(false)
    }
  }

  // Request Microphone
  const startMicrophone = async () => {
    setIsRequestingMic(true)
    setHardwareError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      })
      setMicStream(stream)
      setMicReady(true)
      setupAudioMeter(stream)
    } catch (err: any) {
      console.error('Microphone access error:', err)
      setMicReady(false)
      setHardwareError(
        err.name === 'NotAllowedError'
          ? 'Microphone permission denied. Please allow microphone access in your browser settings.'
          : 'Unable to access microphone: ' + (err.message || 'Unknown error')
      )
    } finally {
      setIsRequestingMic(false)
    }
  }

  const stopMicrophone = () => {
    if (micStream) {
      micStream.getTracks().forEach((track) => track.stop())
      setMicStream(null)
      setMicReady(false)
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    setAudioLevel(0)
  }

  // Request Screen Share
  const startScreenShare = async () => {
    setIsRequestingScreen(true)
    setHardwareError(null)
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          displaySurface: 'monitor',
        } as any,
        audio: false,
      })
      setScreenStream(stream)
      setScreenReady(true)

      const videoTrack = stream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.onended = () => {
          setScreenReady(false)
          setScreenStream(null)
        }
      }
    } catch (err: any) {
      console.error('Screen share error:', err)
      setScreenReady(false)
      if (err.name !== 'NotAllowedError') {
        setHardwareError('Screen share failed: ' + (err.message || 'Permission denied'))
      }
    } finally {
      setIsRequestingScreen(false)
    }
  }

  const stopScreenShare = () => {
    if (screenStream) {
      screenStream.getTracks().forEach((track) => track.stop())
      setScreenStream(null)
      setScreenReady(false)
    }
  }

  // Toggle Fullscreen
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
        setIsFullscreen(true)
      } else {
        await document.exitFullscreen()
        setIsFullscreen(false)
      }
    } catch (err: any) {
      console.warn('Fullscreen toggle error:', err)
    }
  }

  // Auto-connect Camera & Mic when user enters check step
  useEffect(() => {
    if (step === 'check') {
      if (!cameraStream && !cameraReady) {
        startCamera()
      }
      if (!micStream && !micReady) {
        startMicrophone()
      }
    }
  }, [step])

  // Attach camera stream to preview element
  useEffect(() => {
    if (videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = cameraStream
    }
  }, [cameraStream, step])

  // Attach camera stream to floating PIP element during assessment
  useEffect(() => {
    if (pipVideoRef.current) {
      pipVideoRef.current.srcObject = cameraStream
    }
  }, [cameraStream, step])

  // Handle start assessment
  const handleStartAssessment = async () => {
    if (!consentChecked) return
    if (!document.fullscreenElement) {
      try {
        await document.documentElement.requestFullscreen()
      } catch {}
    }
    // Reset tab violations and timers
    setTabViolations(0)
    setIsTerminated(false)
    setShowTabWarning(false)
    setQuestionTimes({
      0: 2 * 60,
      1: 10 * 60,
    })
    setCurrentQuestion(0)
    setStep('assessment')
  }

  // Tab switching detection listener during assessment
  useEffect(() => {
    if (step !== 'assessment' || isTerminated) return

    let lastEventTime = 0

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        const now = Date.now()
        if (now - lastEventTime < 1500) return
        lastEventTime = now

        setTabViolations((prev) => {
          const nextCount = prev + 1
          if (nextCount === 1) {
            // First tab switch: Give 1 warning and pause
            setIsPaused(true)
            setShowTabWarning(true)
          } else if (nextCount >= 2) {
            // Second tab switch: Terminate the session immediately!
            setIsTerminated(true)
            setShowTabWarning(false)
            setIsPaused(true)
            setTerminationReason('Multiple tab switches detected during active proctoring session.')

            // Stop all active hardware streams
            if (cameraStream) cameraStream.getTracks().forEach((t) => t.stop())
            if (micStream) micStream.getTracks().forEach((t) => t.stop())
            if (screenStream) screenStream.getTracks().forEach((t) => t.stop())
            setCameraReady(false)
            setMicReady(false)
            setScreenReady(false)

            setStep('results')
          }
          return nextCount
        })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [step, isTerminated, cameraStream, micStream, screenStream])

  // Cleanup all streams when component unmounts
  useEffect(() => {
    return () => {
      if (cameraStream) cameraStream.getTracks().forEach((t) => t.stop())
      if (micStream) micStream.getTracks().forEach((t) => t.stop())
      if (screenStream) screenStream.getTracks().forEach((t) => t.stop())
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {})
    }
  }, [cameraStream, micStream, screenStream])

  // Assessment state
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [answers, setAnswers] = useState<Record<number, any>>({ 0: 0 })
  const [isPaused, setIsPaused] = useState(false)

  // Recruiter Admin state
  const [selectedCandidate, setSelectedCandidate] = useState('Maya Chen')

  // Auto-populate candidate from Supabase auth session if available
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
          if (profile?.display_name) {
            name = profile.display_name
          }
        } catch {
          // ignore
        }

        if (name) {
          setCandidateName(name)
          setSelectedCandidate(name)
        }
        if (user.user_metadata?.user_name) {
          setCandidateGithub(`https://github.com/${user.user_metadata.user_name}`)
        }
      }
    }
    fetchUser()
  }, [])

  // Per-question countdown timer loop
  useEffect(() => {
    if (step !== 'assessment' || isPaused || isTerminated) return

    const interval = setInterval(() => {
      setQuestionTimes((prev) => {
        const currentSecs = prev[currentQuestion] ?? 0
        if (currentSecs <= 1) {
          if (currentQuestion < questions.length - 1) {
            // Auto advance from Q1 (MCP) to Q2 (Writing)
            setCurrentQuestion((curr) => curr + 1)
            return { ...prev, [currentQuestion]: 0 }
          } else {
            // Auto submit to results when Q2 timer finishes
            setStep('results')
            return { ...prev, [currentQuestion]: 0 }
          }
        }
        return {
          ...prev,
          [currentQuestion]: currentSecs - 1,
        }
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [step, isPaused, isTerminated, currentQuestion])

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  return (
    <div className="grid-paper min-h-[calc(100vh-60px)] pb-16 pt-6">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Top Header & Breadcrumb / Steps Bar */}
        <div className="mb-6 flex flex-col justify-between gap-3 border-b-2 border-[#171717] pb-5 transition-colors sm:flex-row sm:items-center dark:border-[#2e323b]">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded-md border border-[#171717] bg-[#39d5c8] px-2 py-0.2 text-[10px] font-black uppercase text-[#171717] dark:border-[#000000]">
                HIREME.APP
              </span>
              <span className="text-xs font-bold text-[#171717]/60 dark:text-[#a1a1aa]">
                High-Signal Assessments
              </span>
            </div>
            <h1 className="font-display text-4xl uppercase tracking-tight text-[#171717] sm:text-5xl dark:text-[#f4f4f7]">
              Engineering Assessment
            </h1>
          </div>

          {/* Stepper Navigation */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'invite', label: 'Brief' },
              { id: 'profile', label: 'Profile' },
              { id: 'check', label: 'System' },
              { id: 'assessment', label: 'Assessment' },
              { id: 'admin', label: 'Recruiter' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setStep(item.id as HireMeStep)}
                className={`cursor-pointer rounded-xl border border-[#171717] px-3 py-1 text-xs font-black uppercase transition-all dark:border-[#2e323b] ${
                  step === item.id
                    ? 'bg-[#171717] text-[#fffaf0] shadow-[2px_2px_0_#39d5c8] dark:bg-[#39d5c8] dark:text-[#171717] dark:shadow-[2px_2px_0_#000000]'
                    : 'bg-white text-[#171717] hover:bg-[#e0fbf9] dark:bg-[#15171c] dark:text-[#f4f4f7] dark:hover:bg-[#20242e]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* STEP 1: INVITATION BRIEF */}
        {step === 'invite' && (
          <div className="grid gap-6 md:grid-cols-[1.1fr_.9fr]">
            <div className="rounded-2xl border-2 border-[#171717] bg-white p-6 shadow-hard transition-colors sm:p-7 dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[5px_5px_0_#000000]">
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[#171717] bg-[#ffd84d] px-3 py-0.5 text-xs font-black uppercase text-[#171717] dark:border-[#000000]">
                <Sparkles className="h-3 w-3" /> Senior Frontend & Fullstack
              </div>
              <h2 className="font-display text-4xl uppercase text-[#171717] sm:text-5xl dark:text-[#f4f4f7]">
                Show Us How You Think.
              </h2>
              <p className="mt-2.5 text-xs font-bold leading-relaxed text-[#171717]/75 sm:text-sm dark:text-[#d4d4d8]">
                You’ve been invited to complete a 45-minute technical assessment for{' '}
                <strong className="text-[#171717] underline dark:text-white">Northstar Systems</strong>. No trick trivia.
                Just honest engineering problems modeled after production work.
              </p>

              <div className="mt-5 grid grid-cols-3 gap-2.5">
                <div className="rounded-xl border border-[#171717] bg-[#fffaf0] p-3 text-center shadow-[1px_1px_0_#171717] dark:border-[#2e323b] dark:bg-[#1c1f26] dark:shadow-[1px_1px_0_#000000]">
                  <div className="font-display text-2xl text-[#171717] dark:text-[#f4f4f7]">45 MIN</div>
                  <div className="text-[9px] font-black uppercase text-[#171717]/60 dark:text-[#a1a1aa]">Time Limit</div>
                </div>
                <div className="rounded-xl border border-[#171717] bg-[#fffaf0] p-3 text-center shadow-[1px_1px_0_#171717] dark:border-[#2e323b] dark:bg-[#1c1f26] dark:shadow-[1px_1px_0_#000000]">
                  <div className="font-display text-2xl text-[#171717] dark:text-[#f4f4f7]">4</div>
                  <div className="text-[9px] font-black uppercase text-[#171717]/60 dark:text-[#a1a1aa]">Questions</div>
                </div>
                <div className="rounded-xl border border-[#171717] bg-[#fffaf0] p-3 text-center shadow-[1px_1px_0_#171717] dark:border-[#2e323b] dark:bg-[#1c1f26] dark:shadow-[1px_1px_0_#000000]">
                  <div className="font-display text-2xl text-[#171717] dark:text-[#f4f4f7]">SENIOR</div>
                  <div className="text-[9px] font-black uppercase text-[#171717]/60 dark:text-[#a1a1aa]">Level</div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-2.5">
                <button
                  onClick={() => setStep('profile')}
                  className="btn-neo btn-neo-aqua text-xs"
                >
                  Configure Profile & Start <ArrowRight className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setStep('admin')}
                  className="btn-neo btn-neo-paper text-xs"
                >
                  Recruiter Portal
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="rounded-2xl border-2 border-[#171717] bg-[#39d5c8] p-5 shadow-hard text-[#171717] dark:border-[#000000] dark:shadow-[5px_5px_0_#000000]">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#171717] bg-white dark:border-[#000000]">
                    <Code2 className="h-5 w-5 text-[#171717]" />
                  </div>
                  <div>
                    <h3 className="font-display text-2xl uppercase">Northstar Systems</h3>
                    <p className="text-xs font-bold text-[#171717]/70">Core Infrastructure Team</p>
                  </div>
                </div>

                <div className="my-4 border-t border-[#171717]/20" />

                <h4 className="text-xs font-black uppercase">Before You Begin</h4>
                <ul className="mt-2.5 space-y-2 text-xs font-bold">
                  <li className="flex items-center gap-2">
                    <Timer className="h-3.5 w-3.5" /> Self-paced 45 min timer
                  </li>
                  <li className="flex items-center gap-2">
                    <Video className="h-3.5 w-3.5" /> Webcam & integrity monitoring
                  </li>
                  <li className="flex items-center gap-2">
                    <LockKeyhole className="h-3.5 w-3.5" /> Autosaved answers
                  </li>
                  <li className="flex items-center gap-2">
                    <ShieldCheck className="h-3.5 w-3.5" /> Review by engineering leads
                  </li>
                </ul>
              </div>

              <div className="rounded-2xl border-2 border-[#171717] bg-white p-4 shadow-hard-sm transition-colors dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[3px_3px_0_#000000]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-[#171717] dark:text-[#f4f4f7]">Practice First?</span>
                  <button
                    onClick={() => setTab('codemates')}
                    className="flex cursor-pointer items-center gap-1 text-xs font-black text-[#ff57ce] underline"
                  >
                    Open CodeMates multiplayer <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: PROFILE */}
        {step === 'profile' && (
          <div className="mx-auto max-w-xl rounded-2xl border-2 border-[#171717] bg-white p-6 shadow-hard transition-colors sm:p-7 dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[5px_5px_0_#000000]">
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[#171717] bg-[#39d5c8] px-3 py-0.5 text-[10px] font-black uppercase text-[#171717] dark:border-[#000000]">
              <UserCheck className="h-3 w-3" /> Candidate Details
            </div>
            <h2 className="font-display text-3xl uppercase text-[#171717] sm:text-4xl dark:text-[#f4f4f7]">
              Candidate Profile
            </h2>

            <div className="mt-5 space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-black uppercase text-[#171717] dark:text-[#d4d4d8]">Full Name</label>
                <input
                  type="text"
                  value={candidateName}
                  onChange={(e) => setCandidateName(e.target.value)}
                  className="w-full rounded-xl border border-[#171717] bg-[#fffaf0] p-2.5 text-xs font-bold text-[#171717] outline-none dark:border-[#2e323b] dark:bg-[#1c1f26] dark:text-[#f4f4f7]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-black uppercase text-[#171717] dark:text-[#d4d4d8]">LinkedIn URL</label>
                <input
                  type="url"
                  value={candidateLinkedin}
                  onChange={(e) => setCandidateLinkedin(e.target.value)}
                  className="w-full rounded-xl border border-[#171717] bg-[#fffaf0] p-2.5 text-xs font-bold text-[#171717] outline-none dark:border-[#2e323b] dark:bg-[#1c1f26] dark:text-[#f4f4f7]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-black uppercase text-[#171717] dark:text-[#d4d4d8]">GitHub URL</label>
                <input
                  type="url"
                  value={candidateGithub}
                  onChange={(e) => setCandidateGithub(e.target.value)}
                  className="w-full rounded-xl border border-[#171717] bg-[#fffaf0] p-2.5 text-xs font-bold text-[#171717] outline-none dark:border-[#2e323b] dark:bg-[#1c1f26] dark:text-[#f4f4f7]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-black uppercase text-[#171717] dark:text-[#d4d4d8]">Key Technical Skills</label>
                <textarea
                  rows={2}
                  value={candidateSkills}
                  onChange={(e) => setCandidateSkills(e.target.value)}
                  className="w-full resize-none rounded-xl border border-[#171717] bg-[#fffaf0] p-2.5 text-xs font-bold text-[#171717] outline-none dark:border-[#2e323b] dark:bg-[#1c1f26] dark:text-[#f4f4f7]"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-[#171717]/15 pt-4 dark:border-[#2e323b]">
              <button
                onClick={() => setStep('invite')}
                className="btn-neo btn-neo-paper py-2 text-xs"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <button
                onClick={() => setStep('check')}
                className="btn-neo btn-neo-aqua py-2 text-xs"
              >
                Proceed to Setup <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: SYSTEM CHECK */}
        {step === 'check' && (
          <div className="mx-auto max-w-2xl rounded-2xl border-2 border-[#171717] bg-white p-6 shadow-hard transition-colors sm:p-7 dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[5px_5px_0_#000000]">
            <div className="text-center">
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[#171717] bg-[#ffd84d] px-3 py-0.5 text-[10px] font-black uppercase text-[#171717] dark:border-[#000000]">
                <ShieldCheck className="h-3 w-3" /> Hardware Check
              </div>
              <h2 className="font-display text-3xl uppercase text-[#171717] sm:text-4xl dark:text-[#f4f4f7]">
                Verify Your Setup
              </h2>
              <p className="mt-1 text-xs font-bold text-[#171717]/70 dark:text-[#a1a1aa]">
                Confirm camera, microphone, screen sharing, and full screen mode for verified proctoring.
              </p>
            </div>

            {/* Error Notification */}
            {hardwareError && (
              <div className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-rose-500 bg-rose-50 p-3 text-xs font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{hardwareError}</span>
                </div>
                <button
                  onClick={() => setHardwareError(null)}
                  className="font-mono text-xs underline cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {/* Left: Live Video / Camera Feed */}
              <div className="relative flex aspect-video flex-col items-center justify-center rounded-xl border-2 border-[#171717] bg-[#171717] text-center text-[#fffaf0] dark:border-[#2e323b] overflow-hidden">
                {cameraStream ? (
                  <>
                    <video
                      ref={videoPreviewRef}
                      autoPlay
                      playsInline
                      muted
                      className="h-full w-full object-cover"
                    />
                    {/* Live indicator badge and Camera Switch button */}
                    <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 rounded-md bg-black/80 px-2 py-0.5 text-[10px] font-black text-[#39d5c8] backdrop-blur-xs">
                        <span className="h-2 w-2 rounded-full bg-[#39d5c8] animate-pulse" />
                        LIVE FEED
                      </div>
                      <button
                        onClick={() => switchCamera()}
                        disabled={isRequestingCamera}
                        title="Switch camera device"
                        className="cursor-pointer flex items-center gap-1 rounded-md bg-black/80 px-2 py-1 text-[10px] font-bold text-white hover:text-[#ffd84d] transition-all backdrop-blur-xs"
                      >
                        <RefreshCw className={`h-2.5 w-2.5 ${isRequestingCamera ? 'animate-spin' : ''}`} />
                        <span>Switch Camera</span>
                      </button>
                    </div>
                    {/* Bottom stats overlay */}
                    <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between rounded-md bg-black/80 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur-xs">
                      <span className="text-[#39d5c8]">Camera Calibrated</span>
                      <button
                        onClick={stopCamera}
                        className="cursor-pointer text-xs text-rose-400 hover:underline"
                      >
                        Stop
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="p-4 flex flex-col items-center justify-center">
                    <Video className="mb-2 h-8 w-8 text-[#39d5c8]" />
                    <span className="text-xs font-black uppercase text-[#39d5c8]">
                      Camera Ready
                    </span>
                    <span className="mt-1 text-[10px] text-white/60 mb-3">
                      Calibrated or click Allow below
                    </span>
                    <button
                      onClick={() => startCamera()}
                      disabled={isRequestingCamera}
                      className="cursor-pointer rounded-lg border border-[#39d5c8] bg-[#39d5c8]/20 px-3 py-1 text-[10px] font-black uppercase text-[#39d5c8] hover:bg-[#39d5c8] hover:text-[#171717] transition-all"
                    >
                      {isRequestingCamera ? 'Connecting...' : 'Connect Camera'}
                    </button>
                  </div>
                )}
              </div>

              {/* Right: Interactive Hardware Verification Checklist */}
              <div className="flex flex-col justify-between rounded-xl border-2 border-[#171717] bg-[#fffaf0] p-4 dark:border-[#2e323b] dark:bg-[#1c1f26]">
                <div className="space-y-2">
                  {/* Camera Input with Switch option */}
                  <div className="flex items-center justify-between rounded border border-[#171717] bg-white p-2 text-[11px] font-bold dark:border-[#2e323b] dark:bg-[#15171c] dark:text-[#f4f4f7]">
                    <span className="flex items-center gap-1.5">
                      <Video className="h-3.5 w-3.5 text-[#171717] dark:text-[#39d5c8]" />
                      Camera Input
                    </span>
                    {cameraReady ? (
                      <div className="flex items-center gap-1.5">
                        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <Check className="h-3 w-3" /> Ready
                        </span>
                        <button
                          onClick={() => switchCamera()}
                          disabled={isRequestingCamera}
                          title="Switch camera device"
                          className="cursor-pointer flex items-center gap-1 rounded border border-[#171717] bg-[#ffd84d] px-2 py-0.5 text-[10px] font-black uppercase text-[#171717] hover:brightness-105"
                        >
                          <RefreshCw className={`h-2.5 w-2.5 ${isRequestingCamera ? 'animate-spin' : ''}`} />
                          <span>Switch</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startCamera()}
                        disabled={isRequestingCamera}
                        className="cursor-pointer rounded border border-[#171717] bg-[#ffd84d] px-2 py-0.5 text-[10px] font-black uppercase text-[#171717] hover:brightness-105"
                      >
                        {isRequestingCamera ? 'Testing...' : 'Allow'}
                      </button>
                    )}
                  </div>

                  {/* Device selector if multiple cameras exist */}
                  {videoDevices.length > 1 && cameraReady && (
                    <div className="flex items-center gap-1.5 rounded border border-[#171717]/20 bg-white p-1.5 text-[10px] font-bold dark:border-[#2e323b] dark:bg-[#15171c]">
                      <Camera className="h-3 w-3 text-[#39d5c8] shrink-0" />
                      <select
                        value={selectedCameraId}
                        onChange={(e) => switchCamera(e.target.value)}
                        className="flex-1 bg-transparent text-[10px] font-bold outline-none cursor-pointer text-[#171717] dark:text-[#f4f4f7]"
                      >
                        {videoDevices.map((dev, i) => (
                          <option key={dev.deviceId || i} value={dev.deviceId} className="text-[#171717] dark:bg-[#1c1f26] dark:text-[#f4f4f7]">
                            {dev.label || `Camera ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Microphone Input with Dynamic Sound Wave Visualizer */}
                  <div className="flex items-center justify-between rounded border border-[#171717] bg-white p-2 text-[11px] font-bold dark:border-[#2e323b] dark:bg-[#15171c] dark:text-[#f4f4f7]">
                    <div className="flex items-center gap-1.5">
                      <Mic className="h-3.5 w-3.5 text-[#171717] dark:text-[#39d5c8]" />
                      <span>Microphone Input</span>
                      {micReady && (
                        <div className="flex items-end gap-0.5 h-3 ml-1.5" title={`Audio Level: ${audioLevel}%`}>
                          <div
                            className="w-1 bg-emerald-500 rounded-xs transition-all duration-75"
                            style={{ height: `${Math.max(2, Math.min(12, (audioLevel / 100) * 12))}px` }}
                          />
                          <div
                            className="w-1 bg-emerald-500 rounded-xs transition-all duration-75"
                            style={{ height: `${Math.max(2, Math.min(14, (audioLevel / 100) * 14))}px` }}
                          />
                          <div
                            className="w-1 bg-emerald-500 rounded-xs transition-all duration-75"
                            style={{ height: `${Math.max(2, Math.min(10, (audioLevel / 100) * 10))}px` }}
                          />
                        </div>
                      )}
                    </div>
                    {micReady ? (
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <Check className="h-3 w-3" /> Ready
                      </span>
                    ) : (
                      <button
                        onClick={startMicrophone}
                        disabled={isRequestingMic}
                        className="cursor-pointer rounded border border-[#171717] bg-[#ffd84d] px-2 py-0.5 text-[10px] font-black uppercase text-[#171717] hover:brightness-105"
                      >
                        {isRequestingMic ? 'Testing...' : 'Allow'}
                      </button>
                    )}
                  </div>

                  {/* Screen Share Permissions */}
                  <div className="flex items-center justify-between rounded border border-[#171717] bg-white p-2 text-[11px] font-bold dark:border-[#2e323b] dark:bg-[#15171c] dark:text-[#f4f4f7]">
                    <span className="flex items-center gap-1.5">
                      <Monitor className="h-3.5 w-3.5 text-[#171717] dark:text-[#39d5c8]" />
                      Screen Share
                    </span>
                    {screenReady ? (
                      <div className="flex items-center gap-1.5">
                        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <Check className="h-3 w-3" /> Ready
                        </span>
                        <button
                          onClick={stopScreenShare}
                          className="cursor-pointer text-[9px] text-rose-500 hover:underline"
                        >
                          Stop
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={startScreenShare}
                        disabled={isRequestingScreen}
                        className="cursor-pointer rounded border border-[#171717] bg-[#39d5c8] px-2 py-0.5 text-[10px] font-black uppercase text-[#171717] hover:brightness-105"
                      >
                        {isRequestingScreen ? 'Opening...' : 'Share Screen'}
                      </button>
                    )}
                  </div>

                  {/* Full Screen Mode */}
                  <div className="flex items-center justify-between rounded border border-[#171717] bg-white p-2 text-[11px] font-bold dark:border-[#2e323b] dark:bg-[#15171c] dark:text-[#f4f4f7]">
                    <span className="flex items-center gap-1.5">
                      {isFullscreen ? (
                        <Minimize className="h-3.5 w-3.5 text-[#171717] dark:text-[#39d5c8]" />
                      ) : (
                        <Maximize className="h-3.5 w-3.5 text-[#171717] dark:text-[#39d5c8]" />
                      )}
                      Full Screen
                    </span>
                    {isFullscreen ? (
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <Check className="h-3 w-3" /> Ready
                      </span>
                    ) : (
                      <button
                        onClick={toggleFullscreen}
                        className="cursor-pointer rounded border border-[#171717] bg-[#ffd84d] px-2 py-0.5 text-[10px] font-black uppercase text-[#171717] hover:brightness-105"
                      >
                        Enter
                      </button>
                    )}
                  </div>
                </div>

                <label className="mt-3 flex cursor-pointer items-start gap-2 text-[11px] font-bold text-[#171717] dark:text-[#d4d4d8]">
                  <input
                    type="checkbox"
                    checked={consentChecked}
                    onChange={(e) => setConsentChecked(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 accent-[#171717] dark:accent-[#ffd84d]"
                  />
                  <span>Session integrity monitoring consent.</span>
                </label>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-[#171717]/15 pt-4 dark:border-[#2e323b]">
              <button
                onClick={() => setStep('profile')}
                className="btn-neo btn-neo-paper py-2 text-xs"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <button
                disabled={!consentChecked}
                onClick={handleStartAssessment}
                className="btn-neo btn-neo-lemon py-2 text-xs disabled:opacity-40"
              >
                Start Assessment <Play className="h-3.5 w-3.5 fill-current" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: ASSESSMENT */}
        {step === 'assessment' && (
          <div className="rounded-2xl border-3 border-[#171717] bg-white shadow-hard transition-colors dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[5px_5px_0_#000000]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#171717] bg-[#fffaf0] p-3 transition-colors sm:px-5 dark:border-[#2e323b] dark:bg-[#1c1f26]">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded border border-[#171717] bg-[#ffd84d] font-black text-xs text-[#171717] dark:border-[#000000]">
                  0{currentQuestion + 1}
                </span>
                <span className="text-xs font-black uppercase text-[#171717] dark:text-[#f4f4f7]">
                  Question {currentQuestion + 1} of {questions.length} · {questions[currentQuestion].type}
                </span>
                {tabViolations === 1 && (
                  <span className="flex items-center gap-1 rounded bg-rose-500 px-2 py-0.5 text-[9px] font-black uppercase text-white animate-pulse">
                    <AlertTriangle className="h-2.5 w-2.5" /> 1 Warning Used
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <div
                  className={`flex items-center gap-1.5 rounded-lg border border-[#171717] px-3 py-1 font-mono text-xs font-black transition-colors ${
                    (questionTimes[currentQuestion] ?? 0) <= 30
                      ? 'bg-rose-600 text-white animate-pulse border-rose-800'
                      : 'bg-[#171717] text-[#ffd84d] dark:border-[#000000]'
                  }`}
                >
                  <Timer className="h-3.5 w-3.5" />
                  <span>{formatTimer(questionTimes[currentQuestion] ?? 0)}</span>
                  <span className="ml-1 text-[10px] font-sans font-normal opacity-75">
                    ({currentQuestion === 0 ? '2m MCP' : '10m Writing'})
                  </span>
                </div>

                <button
                  onClick={() => setIsPaused(!isPaused)}
                  className="cursor-pointer rounded-lg border border-[#171717] bg-white px-2.5 py-1 text-xs font-bold text-[#171717] dark:border-[#2e323b] dark:bg-[#15171c] dark:text-[#f4f4f7]"
                >
                  {isPaused ? <Play className="inline h-3 w-3" /> : <Pause className="inline h-3 w-3" />}
                  <span className="ml-1">{isPaused ? 'Resume' : 'Pause'}</span>
                </button>
              </div>
            </div>

            <div className="grid md:grid-cols-[220px_1fr]">
              <div className="border-r-2 border-[#171717] bg-[#fffaf0]/60 p-3 transition-colors dark:border-[#2e323b] dark:bg-[#111317]">
                <div className="mb-2 text-[10px] font-black uppercase tracking-wider text-[#171717]/60 dark:text-[#a1a1aa]">
                  Assessment Tasks
                </div>
                <div className="space-y-1.5">
                  {questions.map((q, idx) => (
                    <button
                      key={q.id}
                      onClick={() => setCurrentQuestion(idx)}
                      className={`flex w-full cursor-pointer items-center justify-between rounded-lg border border-[#171717] p-2 text-left text-xs font-bold transition-all dark:border-[#2e323b] ${
                        currentQuestion === idx
                          ? 'bg-[#39d5c8] text-[#171717] dark:border-[#000000]'
                          : 'bg-white text-[#171717] hover:bg-[#fff0c2] dark:bg-[#1c1f26] dark:text-[#f4f4f7] dark:hover:bg-[#252933]'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="truncate font-black">
                          Q{idx + 1}: {q.type}
                        </span>
                        <span className="font-mono text-[10px] text-[#171717]/70 dark:text-[#a1a1aa]">
                          ⏱️ {formatTimer(questionTimes[idx] ?? 0)} left
                        </span>
                      </div>
                      {answers[idx] !== undefined && (
                        <Check className="h-3.5 w-3.5 text-emerald-800 dark:text-emerald-400" />
                      )}
                    </button>
                  ))}
                </div>

                <div className="mt-6 rounded-lg border border-[#171717]/20 bg-[#ffd84d]/30 p-2.5 text-[10px] font-bold text-[#171717] dark:border-[#2e323b] dark:text-[#f4f4f7]">
                  <div className="flex items-center gap-1 text-[#171717] font-black uppercase dark:text-[#ffd84d]">
                    <ShieldCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400" /> Proctored Session
                  </div>
                  <p className="mt-1 leading-tight text-[#171717]/80 dark:text-[#a1a1aa]">
                    Tab switching is monitored. 1 warning allowed before session termination.
                  </p>
                </div>
              </div>

              <div className="p-5 sm:p-6">
                {isPaused ? (
                  <div className="py-12 text-center">
                    <Radio className="mx-auto h-8 w-8 text-[#ffd84d]" />
                    <h3 className="mt-3 font-display text-2xl uppercase dark:text-[#f4f4f7]">Session Paused</h3>
                    <button
                      onClick={() => setIsPaused(false)}
                      className="btn-neo btn-neo-lemon mt-4 py-2 text-xs"
                    >
                      Resume
                    </button>
                  </div>
                ) : (
                  <div>
                    <h2 className="text-base font-black text-[#171717] sm:text-lg dark:text-[#f4f4f7]">
                      {questions[currentQuestion].title}
                    </h2>

                    <div className="mt-4">
                      {questions[currentQuestion].options ? (
                        <div className="space-y-2">
                          {questions[currentQuestion].options.map((opt, optIdx) => (
                            <button
                              key={opt}
                              onClick={() =>
                                setAnswers({ ...answers, [currentQuestion]: optIdx })
                              }
                              className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-[#171717] p-3 text-left text-xs font-bold transition-all dark:border-[#2e323b] ${
                                answers[currentQuestion] === optIdx
                                  ? 'bg-[#ffd84d] text-[#171717] dark:border-[#000000]'
                                  : 'bg-[#fffaf0] hover:bg-white text-[#171717] dark:bg-[#1c1f26] dark:text-[#f4f4f7] dark:hover:bg-[#252a35]'
                              }`}
                            >
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[#171717] bg-white font-black text-[10px] text-[#171717] dark:border-[#2e323b] dark:bg-[#111317] dark:text-[#f4f4f7]">
                                {String.fromCharCode(65 + optIdx)}
                              </span>
                              <span>{opt}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <textarea
                          rows={12}
                          value={answers[currentQuestion] ?? questions[currentQuestion].defaultValue}
                          placeholder={questions[currentQuestion].placeholder}
                          onChange={(e) =>
                            setAnswers({ ...answers, [currentQuestion]: e.target.value })
                          }
                          className="w-full rounded-xl border-2 border-[#171717] bg-[#171717] p-3.5 font-mono text-xs text-[#fffaf0] outline-none dark:border-[#2e323b]"
                        />
                      )}
                    </div>

                    <div className="mt-6 flex items-center justify-between border-t border-[#171717]/15 pt-4 dark:border-[#2e323b]">
                      <button
                        disabled={currentQuestion === 0}
                        onClick={() => setCurrentQuestion(currentQuestion - 1)}
                        className="btn-neo btn-neo-paper py-1.5 text-xs disabled:opacity-40"
                      >
                        <ArrowLeft className="h-3 w-3" /> Previous
                      </button>

                      {currentQuestion < questions.length - 1 ? (
                        <button
                          onClick={() => setCurrentQuestion(currentQuestion + 1)}
                          className="btn-neo btn-neo-aqua py-1.5 text-xs"
                        >
                          Next Task (Writing) <ArrowRight className="h-3 w-3" />
                        </button>
                      ) : (
                        <button
                          onClick={() => setStep('results')}
                          className="btn-neo btn-neo-lemon py-1.5 text-xs"
                        >
                          Submit Assessment <Send className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab Switching Warning Modal */}
        {showTabWarning && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
            <div className="w-full max-w-lg rounded-2xl border-4 border-[#171717] bg-[#ffd84d] p-6 text-[#171717] shadow-hard-lg dark:border-[#000000]">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-[#171717] bg-[#ff6b6b] text-white">
                  <AlertTriangle className="h-7 w-7" />
                </div>
                <div>
                  <span className="rounded bg-[#171717] px-2 py-0.5 font-mono text-[10px] font-black uppercase text-white">
                    PROCTORING ALERT · 1 OF 1 WARNING
                  </span>
                  <h3 className="font-display text-2xl uppercase tracking-tight sm:text-3xl">
                    Tab Switch Detected!
                  </h3>
                </div>
              </div>

              <div className="mt-4 rounded-xl border-2 border-[#171717] bg-white p-4 text-xs font-bold leading-relaxed text-[#171717] shadow-[2px_2px_0_#171717]">
                <p>
                  You navigated away from this proctored assessment window. Leaving the assessment, switching tabs, or minimizing the active window is strictly monitored.
                </p>
                <p className="mt-2 text-rose-700 font-black">
                  ⚠️ THIS IS YOUR FIRST AND FINAL WARNING. If you switch tabs or leave this window again, your assessment session will be IMMEDIATELY TERMINATED with a disqualification flag sent to the recruitment team.
                </p>
              </div>

              <button
                onClick={() => {
                  setShowTabWarning(false)
                  setIsPaused(false)
                }}
                className="btn-neo btn-neo-ink mt-5 w-full py-3 text-xs uppercase"
              >
                I Understand — Resume Assessment
              </button>
            </div>
          </div>
        )}

        {/* Floating Live Proctor HUD during Assessment */}
        {step === 'assessment' && (
          <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-1.5 pointer-events-auto select-none">
            <div className="w-52 sm:w-60 overflow-hidden rounded-xl border-3 border-[#171717] bg-[#171717] shadow-hard-lg dark:border-[#2e323b] dark:shadow-[4px_4px_0_#000000]">
              <div className="relative aspect-video bg-black">
                {cameraStream ? (
                  <video
                    ref={pipVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center text-[10px] text-white/50">
                    <VideoOff className="h-4 w-4 mb-1 text-rose-400" />
                    <span>Camera Standby</span>
                  </div>
                )}
                {/* Recording indicator */}
                <div className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded bg-black/80 px-1.5 py-0.5 text-[8px] font-black text-rose-400 backdrop-blur-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                  REC
                </div>
                <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded bg-black/80 px-1.5 py-0.5 text-[8px] font-bold text-white backdrop-blur-xs">
                  <ShieldCheck className="h-2.5 w-2.5 text-[#39d5c8]" />
                  <span>PROCTOR LIVE</span>
                </div>
              </div>

              {/* Status bar under PIP */}
              <div className="flex items-center justify-between border-t border-white/10 bg-[#1c1f26] px-2.5 py-1.5 text-[9px] text-white font-bold">
                <span className="flex items-center gap-1">
                  <Monitor className={`h-2.5 w-2.5 ${screenReady ? 'text-[#39d5c8]' : 'text-amber-400'}`} />
                  {screenReady ? 'Screen' : 'Off'}
                </span>
                <span className="flex items-center gap-1">
                  <Mic className={`h-2.5 w-2.5 ${micReady ? 'text-emerald-400' : 'text-rose-400'}`} />
                  <div className="flex gap-0.5 items-end h-2">
                    <div className="w-0.5 bg-emerald-400 rounded-xs" style={{ height: `${Math.max(2, (audioLevel / 100) * 8)}px` }} />
                    <div className="w-0.5 bg-emerald-400 rounded-xs" style={{ height: `${Math.max(2, (audioLevel / 100) * 10)}px` }} />
                    <div className="w-0.5 bg-emerald-400 rounded-xs" style={{ height: `${Math.max(2, (audioLevel / 100) * 7)}px` }} />
                  </div>
                </span>
                <button
                  onClick={() => switchCamera()}
                  disabled={isRequestingCamera}
                  title="Switch / Flip Camera"
                  className="hover:text-[#ffd84d] cursor-pointer flex items-center gap-0.5"
                >
                  <RefreshCw className={`h-2.5 w-2.5 ${isRequestingCamera ? 'animate-spin' : ''}`} />
                  <span className="text-[8px]">Flip</span>
                </button>
                <button
                  onClick={toggleFullscreen}
                  title="Toggle Fullscreen"
                  className="hover:text-[#ffd84d] cursor-pointer"
                >
                  {isFullscreen ? <Minimize className="h-2.5 w-2.5" /> : <Maximize className="h-2.5 w-2.5" />}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: RESULTS */}
        {step === 'results' && (
          <div className="mx-auto max-w-xl rounded-2xl border-3 border-[#171717] bg-white p-6 text-center shadow-hard transition-colors dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[5px_5px_0_#000000]">
            {isTerminated ? (
              <>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-[#171717] bg-[#ff6b6b] text-white dark:border-[#000000]">
                  <XCircle className="h-8 w-8" />
                </div>

                <h2 className="mt-4 font-display text-4xl uppercase text-rose-600 dark:text-rose-400">
                  Session Terminated
                </h2>
                <p className="mt-1 text-xs font-bold text-[#171717]/70 dark:text-[#a1a1aa]">
                  Multiple tab switch violations detected. This assessment was automatically terminated for academic integrity.
                </p>

                <div className="mt-5 grid grid-cols-3 gap-2.5">
                  <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 dark:border-rose-900 dark:bg-rose-950/40">
                    <div className="font-display text-2xl text-rose-600 dark:text-rose-400">0 / 100</div>
                    <div className="text-[9px] font-black uppercase text-rose-700 dark:text-rose-300">Score</div>
                  </div>
                  <div className="rounded-xl border border-[#171717] bg-[#fffaf0] p-3 dark:border-[#2e323b] dark:bg-[#1c1f26]">
                    <div className="font-display text-2xl text-[#171717] dark:text-[#f4f4f7]">
                      {Object.keys(answers).length} / 2
                    </div>
                    <div className="text-[9px] font-black uppercase text-[#171717]/60 dark:text-[#a1a1aa]">Attempted</div>
                  </div>
                  <div className="rounded-xl border border-rose-400 bg-[#ffe6f8] p-3 dark:border-rose-900 dark:bg-rose-950/50">
                    <div className="font-display text-2xl text-rose-600 dark:text-rose-400">TERMINATED</div>
                    <div className="text-[9px] font-black uppercase text-rose-700 dark:text-rose-300">Integrity</div>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-rose-300 bg-rose-50 p-3 text-left text-xs font-bold text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
                  <span className="font-black">Violation Audit Log:</span> 2 tab switch / defocus events occurred during proctored assessment. All webcam and display media captures locked and flagged.
                </div>

                <div className="mt-6 flex justify-center gap-2">
                  <button
                    onClick={() => {
                      setIsTerminated(false)
                      setTabViolations(0)
                      setQuestionTimes({ 0: 2 * 60, 1: 10 * 60 })
                      setStep('invite')
                    }}
                    className="btn-neo btn-neo-lemon py-2 text-xs"
                  >
                    Restart Brief
                  </button>
                  <button
                    onClick={() => setTab('codemates')}
                    className="btn-neo btn-neo-berry py-2 text-xs"
                  >
                    Open CodeMates
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-[#171717] bg-[#ffd84d] dark:border-[#000000]">
                  <Trophy className="h-8 w-8 text-[#171717]" />
                </div>

                <h2 className="mt-4 font-display text-4xl uppercase text-[#171717] dark:text-[#f4f4f7]">
                  Assessment Submitted
                </h2>
                <p className="mt-1 text-xs font-bold text-[#171717]/70 dark:text-[#a1a1aa]">
                  Your responses for MCP Challenge and Technical Writing have been submitted to Northstar Systems.
                </p>

                <div className="mt-5 grid grid-cols-3 gap-2.5">
                  <div className="rounded-xl border border-[#171717] bg-[#e0fbf9] p-3 dark:border-[#000000]">
                    <div className="font-display text-2xl text-[#171717]">96/100</div>
                    <div className="text-[9px] font-black uppercase text-[#171717]/60">Score</div>
                  </div>
                  <div className="rounded-xl border border-[#171717] bg-[#fff0c2] p-3 dark:border-[#000000]">
                    <div className="font-display text-2xl text-[#171717]">2 / 2</div>
                    <div className="text-[9px] font-black uppercase text-[#171717]/60">Finished</div>
                  </div>
                  <div className="rounded-xl border border-[#171717] bg-[#ffe6f8] p-3 dark:border-[#000000]">
                    <div className="font-display text-2xl text-[#ff57ce]">CLEAR</div>
                    <div className="text-[9px] font-black uppercase text-[#171717]/60">Integrity</div>
                  </div>
                </div>

                <div className="mt-6 flex justify-center gap-2">
                  <button
                    onClick={() => setStep('admin')}
                    className="btn-neo btn-neo-aqua py-2 text-xs"
                  >
                    Inspect Scorecard <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setTab('codemates')}
                    className="btn-neo btn-neo-berry py-2 text-xs"
                  >
                    Open CodeMates
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* STEP 6: ADMIN */}
        {step === 'admin' && (
          <div className="rounded-2xl border-2 border-[#171717] bg-white p-5 shadow-hard transition-colors dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[5px_5px_0_#000000]">
            <div className="flex flex-col justify-between gap-3 border-b border-[#171717]/20 pb-4 sm:flex-row sm:items-center dark:border-[#2e323b]">
              <div>
                <h2 className="font-display text-3xl uppercase text-[#171717] dark:text-[#f4f4f7]">
                  Candidate Review
                </h2>
                <p className="text-xs font-bold text-[#171717]/70 dark:text-[#a1a1aa]">
                  Inspect candidate signals and integrity logs.
                </p>
              </div>

              <span className="rounded-lg border border-[#171717] bg-[#ffd84d] px-2.5 py-1 font-mono text-[11px] font-black text-[#171717] dark:border-[#000000]">
                Frontend Role · 3 Evaluated
              </span>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                {[
                  { name: 'Maya Chen', score: 94, integrity: 'Clear', time: '12 min ago' },
                  { name: 'Alex Rivera', score: 88, integrity: 'Review', time: '35 min ago' },
                  { name: 'Jordan Lee', score: 82, integrity: 'Clear', time: '1 hr ago' },
                ].map((c) => (
                  <div
                    key={c.name}
                    onClick={() => setSelectedCandidate(c.name)}
                    className={`flex cursor-pointer items-center justify-between rounded-xl border border-[#171717] p-3 text-xs font-bold transition-all dark:border-[#2e323b] ${
                      selectedCandidate === c.name
                        ? 'bg-[#ffd84d] text-[#171717] dark:border-[#000000]'
                        : 'bg-[#fffaf0] hover:bg-white text-[#171717] dark:bg-[#1c1f26] dark:text-[#f4f4f7] dark:hover:bg-[#252a35]'
                    }`}
                  >
                    <div>
                      <h4 className="font-display text-xl uppercase">{c.name}</h4>
                      <p className="text-[10px] text-[#171717]/70 dark:text-[#a1a1aa]">{c.time}</p>
                    </div>
                    <div className="text-right">
                      <span className="font-display text-xl">{c.score}</span>
                      <span className="block text-[9px] uppercase">{c.integrity}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-[#171717] bg-[#fffaf0] p-4 dark:border-[#2e323b] dark:bg-[#1c1f26]">
                <h3 className="font-display text-2xl uppercase text-[#171717] dark:text-[#f4f4f7]">{selectedCandidate}</h3>
                <div className="my-2 border-t border-[#171717]/15 dark:border-[#2e323b]" />
                <p className="text-xs font-bold text-[#171717] dark:text-[#f4f4f7]">Signal Score: 94/100</p>
                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 mt-1">Integrity: No focus loss</p>
                <div className="mt-4 flex gap-2">
                  <button className="btn-neo btn-neo-ink flex-1 py-1.5 text-xs">
                    Contact
                  </button>
                  <button
                    onClick={() => setStep('invite')}
                    className="btn-neo btn-neo-paper flex-1 py-1.5 text-xs"
                  >
                    Back to Brief
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
