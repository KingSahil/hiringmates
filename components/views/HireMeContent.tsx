'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Code2,
  FileCheck,
  History,
  LockKeyhole,
  Maximize,
  Mic,
  MicOff,
  Minimize,
  Monitor,
  Pause,
  Play,
  QrCode,
  Radio,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Timer,
  Trophy,
  UserCheck,
  Video,
  VideoOff,
  XCircle,
  Zap,
} from 'lucide-react'
import { useNavigation } from '@/lib/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { useNotifications } from '@/lib/notifications'
import {
  CodeforcesWinnowingEngine,
  KeystrokeFlightRecorder,
  EnvironmentShield,
  LLM_BENCHMARK_SOLUTIONS,
  SecurityViolation,
  FlightMetrics,
  PlagiarismResult,
} from '@/lib/proctoring/antiCheatEngine'
import { EyeTrackerEngine, GazeDirection, GazeStatus } from '@/lib/proctoring/eyeTracker'

type HireMeStep = 'profile' | 'invite' | 'check' | 'assessment' | 'admin' | 'results'

/** Seconds allowed per multiple-choice question. */
const MCQ_SECONDS = 2 * 60

/**
 * A question as the assessment UI renders it.
 *
 * `timeLimit: 0` means UNTIMED — theory questions have no countdown at all,
 * per product decision. Only MCQs are on the clock.
 */
type AssessmentQuestion = {
  id: string
  kind: 'mcq' | 'theory'
  /** Section label shown in the header and the task list. */
  type: string
  timeLimit: number
  title: string
  options?: string[]
  correct?: number
  placeholder?: string
  defaultValue?: string
  /** Where the prompt came from — the RAG backend, or this file. */
  source: 'rag' | 'fallback'
}

/** One question as the Python backend serialises it. */
type BackendQuestion = {
  id?: string
  kind?: string
  prompt?: string
  options?: string[]
  correct_index?: number | null
}

const THEORY_PLACEHOLDER =
  'Structure your answer: the approach you would take, the trade-offs you weighed, and how you would validate the result.'

/**
 * Map backend questions onto the UI shape.
 *
 * Returns `FALLBACK_QUESTIONS` when nothing usable comes back, so a backend
 * outage degrades to the seeded demo instead of an empty assessment. MCQs with
 * fewer than two options are dropped outright — they cannot be answered.
 */
function mapBackendQuestions(raw: BackendQuestion[]): AssessmentQuestion[] {
  const mapped: AssessmentQuestion[] = []
  raw.forEach((q, i) => {
    const prompt = (q.prompt ?? '').trim()
    if (!prompt) return

    if (q.kind === 'theory') {
      mapped.push({
        id: q.id ?? `q${i + 1}`,
        kind: 'theory',
        type: 'Technical Writing',
        timeLimit: 0,
        title: prompt,
        placeholder: THEORY_PLACEHOLDER,
        source: 'rag',
      })
      return
    }

    const options = (q.options ?? []).filter((o) => typeof o === 'string' && o.trim().length > 0)
    if (options.length < 2) return

    mapped.push({
      id: q.id ?? `q${i + 1}`,
      kind: 'mcq',
      type: `Multiple choice ${mapped.filter((m) => m.kind === 'mcq').length + 1}`,
      timeLimit: MCQ_SECONDS,
      title: prompt,
      options,
      correct: typeof q.correct_index === 'number' ? q.correct_index : undefined,
      source: 'rag',
    })
  })
  return mapped.length > 0 ? mapped : FALLBACK_QUESTIONS
}

/**
 * Seeded demo set. Only shown until the RAG backend serves real questions, or
 * if it is unreachable.
 */
const FALLBACK_QUESTIONS: AssessmentQuestion[] = [
  {
    id: 'fallback-1',
    kind: 'mcq',
    type: 'MCP Protocol',
    timeLimit: MCQ_SECONDS,
    title: 'Model Context Protocol (MCP): How does an MCP client securely discover capabilities and execute tools on an MCP server?',
    options: [
      'Client requests available tool schemas via `tools/list`, validates parameters against JSON Schema, and executes via `tools/call` over JSON-RPC',
      'Client executes arbitrary shell commands on the server host via unauthenticated root SSH without schema negotiation',
      'Client downloads untrusted executable binaries from the server and runs them natively inside the host operating system without sandbox',
      'Client polls plain HTTP REST endpoints without JSON Schema validation, structured error codes, or protocol handshakes',
    ],
    correct: 0,
    source: 'fallback',
  },
  {
    id: 'fallback-2',
    kind: 'theory',
    type: 'Technical Writing',
    timeLimit: 0,
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
    source: 'fallback',
  },
]

export function HireMeContent() {
  const { setTab } = useNavigation()
  const { triggerRound2Notification, setActiveRole } = useNotifications()
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

  // Per-question countdown timers. MCQs get MCQ_SECONDS; theory is untimed.
  const [questionTimes, setQuestionTimes] = useState<Record<number, number>>(
    () => Object.fromEntries(FALLBACK_QUESTIONS.map((q, i) => [i, q.timeLimit])),
  )

  // Codeforces Anti-Cheat & Flight Recorder state
  const flightRecorderRef = useRef<KeystrokeFlightRecorder>(new KeystrokeFlightRecorder())
  const winnowingEngineRef = useRef<CodeforcesWinnowingEngine>(new CodeforcesWinnowingEngine())
  const [securityViolations, setSecurityViolations] = useState<SecurityViolation[]>([])
  const [violationToast, setViolationToast] = useState<string | null>(null)
  const [showQrModal, setShowQrModal] = useState(false)
  const [qrCompanionActive, setQrCompanionActive] = useState(false)
  const [multiMonitorDetected, setMultiMonitorDetected] = useState(false)
  const [flightMetrics, setFlightMetrics] = useState<FlightMetrics | null>(null)

  // Recruiter Admin Interactive Replay & Plagiarism State
  const [adminActiveTab, setAdminActiveTab] = useState<'flight' | 'winnowing' | 'certificate'>('flight')
  const [replayPercentage, setReplayPercentage] = useState(100)
  const [isReplaying, setIsReplaying] = useState(false)
  const [replaySpeed, setReplaySpeed] = useState<number>(1)
  const [plagiarismMatrix, setPlagiarismMatrix] = useState<Record<string, PlagiarismResult>>({})
  const [isAuditingPlagiarism, setIsAuditingPlagiarism] = useState(false)
  const [plagiarismLLMReport, setPlagiarismLLMReport] = useState<string>('')

  // Eye & Gaze Tracking State (Looking Down, Left, Right, Away, Tilt, Multiple Faces, Foreign Object)
  const eyeTrackerRef = useRef<EyeTrackerEngine | null>(null)
  const [gazeStatus, setGazeStatus] = useState<GazeStatus>({
    direction: 'CENTER',
    confidence: 98,
    horizontalOffset: 0,
    verticalOffset: 0,
    faceDetected: true,
    faceCount: 1,
    foreignObjectDetected: false,
    warningCount: 0,
    isSustainedDeviation: false,
    deviationProgress: 0,
    landmarks: {
      faceDetected: true,
      faceCount: 1,
      foreignObjectDetected: false,
      faceBox: { x: 25, y: 18, width: 50, height: 60 },
      leftEye: { x: 40, y: 44 },
      rightEye: { x: 60, y: 44 },
      pitch: 0,
      yaw: 0,
      roll: 0,
    },
  })
  const [gazeWarnings, setGazeWarnings] = useState(0)
  const [showGazeWarningModal, setShowGazeWarningModal] = useState(false)
  const [gazeWarningDetail, setGazeWarningDetail] = useState<{ count: number; direction: string }>({ count: 0, direction: '' })

  const videoPreviewRef = useRef<HTMLVideoElement | null>(null)
  const pipVideoRef = useRef<HTMLVideoElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number | null>(null)

  // Screen Details API multi-monitor check
  useEffect(() => {
    try {
      if ((window.screen as any)?.isExtended) {
        setMultiMonitorDetected(true)
      }
    } catch {}
  }, [])

  // Interactive Flight Recorder Replay loop in Admin Review
  useEffect(() => {
    if (!isReplaying) return
    const interval = setInterval(() => {
      setReplayPercentage((prev) => {
        if (prev >= 100) {
          setIsReplaying(false)
          return 100
        }
        return Math.min(100, prev + 2 * replaySpeed)
      })
    }, 120)
    return () => clearInterval(interval)
  }, [isReplaying, replaySpeed])

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
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream
        videoPreviewRef.current.muted = true
        videoPreviewRef.current.play().catch(() => {})
      }

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
          if (videoPreviewRef.current) {
            videoPreviewRef.current.srcObject = fallbackStream
            videoPreviewRef.current.muted = true
            videoPreviewRef.current.play().catch(() => {})
          }
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
    if (videoPreviewRef.current && cameraStream) {
      videoPreviewRef.current.srcObject = cameraStream
      videoPreviewRef.current.muted = true
      videoPreviewRef.current.play().catch(() => {})
    }
  }, [cameraStream, step])

  // Attach camera stream to floating PIP element during assessment
  useEffect(() => {
    if (pipVideoRef.current && cameraStream) {
      pipVideoRef.current.srcObject = cameraStream
      pipVideoRef.current.muted = true
      pipVideoRef.current.play().catch(() => {})
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
    // Reset tab violations, security audit log, and timers
    setTabViolations(0)
    setIsTerminated(false)
    setShowTabWarning(false)
    setShowGazeWarningModal(false)
    setGazeWarnings(0)
    setSecurityViolations([])
    flightRecorderRef.current.reset()
    if (eyeTrackerRef.current) {
      eyeTrackerRef.current.resetWarnings()
    }

    // Pre-seed initial keystroke timeline so flight recorder has telemetry baseline
    const starterText = theoryText || ''
    const chunk = 14
    for (let i = 0; i < Math.min(starterText.length, 280); i += chunk) {
      flightRecorderRef.current.logKeystroke('insert', starterText.slice(i, i + chunk), i, i + chunk)
    }
    setFlightMetrics(flightRecorderRef.current.computeMetrics())

    setQuestionTimes(Object.fromEntries(activeQuestions.map((q, i) => [i, q.timeLimit])))
    setCurrentQuestion(0)
    setStep('assessment')
  }

  // Activate Hardened Environment Shield (DevTools, shortcut traps, split-screen)
  useEffect(() => {
    if (step !== 'assessment' || isTerminated) return

    const shield = new EnvironmentShield((violation) => {
      setSecurityViolations((prev) => [violation, ...prev.slice(0, 19)])
      setViolationToast(`${violation.type}: ${violation.detail}`)
      setTimeout(() => setViolationToast(null), 4500)
    })

    const cleanup = shield.activateShield()
    return () => cleanup()
  }, [step, isTerminated])

  // Real-time Eye & Gaze Tracking loop (Looking Down, Left, Right, Away, Tilt)
  useEffect(() => {
    if ((step !== 'assessment' && step !== 'check') || isTerminated || !cameraStream) {
      if (eyeTrackerRef.current) {
        eyeTrackerRef.current.stop()
        eyeTrackerRef.current = null
      }
      return
    }

    const isAssessment = step === 'assessment'

    const tracker = new EyeTrackerEngine({
      maxWarnings: 3,
      onGazeUpdate: (status) => {
        setGazeStatus(status)
      },
      onWarning: (count, direction) => {
        if (!isAssessment) return // During 'check' step, don't trigger penalty strikes

        // ZERO TOLERANCE: Immediate cancellation for smartphone / foreign object
        if (direction === 'FOREIGN_OBJECT') {
          setIsTerminated(true)
          setShowGazeWarningModal(false)
          setShowTabWarning(false)
          setIsPaused(true)
          setTerminationReason(
            'HIRING PROCESS CANCELLED: An unauthorized smartphone / foreign device was identified in the camera frame by AI Vision Proctoring. The candidate is disqualified from the hiring process.'
          )
          setSecurityViolations((prev) => [
            {
              timestamp: new Date().toLocaleTimeString(),
              type: 'HARDWARE_ANOMALY',
              detail: 'CRITICAL INTEGRITY VIOLATION: Unauthorized Smartphone / Foreign Object detected in camera frame. Hiring process cancelled immediately.',
              severity: 'CRITICAL',
            },
            ...prev,
          ])
          if (cameraStream) cameraStream.getTracks().forEach((t) => t.stop())
          if (micStream) micStream.getTracks().forEach((t) => t.stop())
          if (screenStream) screenStream.getTracks().forEach((t) => t.stop())
          setCameraReady(false)
          setMicReady(false)
          setScreenReady(false)
          setStep('results')
          return
        }

        setGazeWarnings(count)
        setIsPaused(true)
        const friendlyDir =
          direction === 'MULTIPLE_FACES'
            ? 'MULTIPLE PEOPLE DETECTED'
            : direction === 'LOOKING_AWAY'
            ? 'CANDIDATE FACE MISSING'
            : direction.replace('_', ' ')
        setGazeWarningDetail({ count, direction: friendlyDir })
        setShowGazeWarningModal(true)
        setSecurityViolations((prev) => [
          {
            timestamp: new Date().toLocaleTimeString(),
            type: direction === 'MULTIPLE_FACES' ? 'MULTI_MONITOR_DETECTED' : 'VOICE_DETECTED',
            detail: `Proctor Strike #${count} of 3: ${friendlyDir}. Please maintain test integrity.`,
            severity: count >= 3 ? 'CRITICAL' : 'WARNING',
          },
          ...prev,
        ])
      },
      onTerminated: (reason) => {
        if (!isAssessment) return
        setIsTerminated(true)
        setShowGazeWarningModal(false)
        setShowTabWarning(false)
        setIsPaused(true)
        setTerminationReason(reason)

        setSecurityViolations((prev) => [
          {
            timestamp: new Date().toLocaleTimeString(),
            type: 'VOICE_DETECTED',
            detail: `CRITICAL PROCTORING TERMINATION: ${reason}`,
            severity: 'CRITICAL',
          },
          ...prev,
        ])

        if (cameraStream) cameraStream.getTracks().forEach((t) => t.stop())
        if (micStream) micStream.getTracks().forEach((t) => t.stop())
        if (screenStream) screenStream.getTracks().forEach((t) => t.stop())
        setCameraReady(false)
        setMicReady(false)
        setScreenReady(false)

        setStep('results')
      },
    })

    eyeTrackerRef.current = tracker

    let cancelled = false
    const checkVideo = () => {
      if (cancelled) return
      const targetVideo = isAssessment ? pipVideoRef.current : videoPreviewRef.current
      if (targetVideo) {
        if (targetVideo.paused) {
          targetVideo.play().catch(() => {})
        }
        if (targetVideo.readyState >= 2 && targetVideo.videoWidth > 0) {
          tracker.start(targetVideo)
          return
        }
      }
      setTimeout(checkVideo, 150)
    }
    checkVideo()

    return () => {
      cancelled = true
      tracker.stop()
      eyeTrackerRef.current = null
    }
  }, [step, isTerminated, cameraStream, micStream, screenStream])

  // Assessment state
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [answers, setAnswers] = useState<Record<number, any>>({ 0: 0 })
  const [isPaused, setIsPaused] = useState(false)

  // Questions served by the RAG backend. Starts as the seeded demo set and is
  // replaced in place once generation finishes, so a slow or unreachable
  // backend never leaves the candidate staring at an empty assessment.
  const [activeQuestions, setActiveQuestions] = useState<AssessmentQuestion[]>(FALLBACK_QUESTIONS)
  const [ragStatus, setRagStatus] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle')
  const [ragNote, setRagNote] = useState('')
  const [ragStart, setRagStart] = useState(false)
  const ragSessionIdRef = useRef<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // The theory question is not necessarily last nor at index 1 — with backend
  // questions the MCQ count varies, so resolve it by kind instead of position.
  const theoryIndex = activeQuestions.findIndex((q) => q.kind === 'theory')
  const theoryText =
    theoryIndex >= 0
      ? String(answers[theoryIndex] ?? activeQuestions[theoryIndex]?.defaultValue ?? '')
      : ''

  // Submits to the backend for grading. Best-effort: the proctored UI must
  // never block on it, and the results screen is already rendered locally.
  const submitToBackend = useCallback(async () => {
    const sessionId = ragSessionIdRef.current
    if (!sessionId) return
    try {
      const payload = activeQuestions.map((q, i) => {
        const a = answers[i]
        return q.kind === 'mcq'
          ? { question_id: q.id, selected_index: typeof a === 'number' ? a : null, text: '' }
          : { question_id: q.id, selected_index: null, text: String(a ?? '') }
      })
      await fetch('/api/onboarding/answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, answers: payload }),
      })
    } catch {
      /* grading is best-effort */
    }
  }, [activeQuestions, answers])

  const finishAssessment = useCallback(() => {
    void submitToBackend()
    setStep('results')
  }, [submitToBackend])

  // Start generation early — during the invite/check steps — so the pipeline
  // (GitHub extraction + question generation) overlaps with hardware setup.
  useEffect(() => {
    if (step === 'invite' || step === 'check' || step === 'assessment') setRagStart(true)
  }, [step])

  useEffect(() => {
    if (!ragStart) return
    let cancelled = false

    const stopPolling = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }

    const apply = (data: any) => {
      if (cancelled) return false
      if (!Array.isArray(data?.questions) || data.questions.length === 0) return false
      setActiveQuestions(mapBackendQuestions(data.questions))
      setRagStatus('ready')
      stopPolling()
      return true
    }

    const fail = (note: string) => {
      if (cancelled) return
      setRagStatus('failed')
      setRagNote(note)
    }

    ;(async () => {
      setRagStatus('loading')
      try {
        const res = await fetch('/api/onboarding', { method: 'POST' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          fail(
            data?.missing
              ? `${data.message} Missing: ${data.missing.join(', ')}.`
              : data?.message ?? data?.error ?? 'Could not start question generation.',
          )
          return
        }
        ragSessionIdRef.current = data?.id ?? null
        if (apply(data)) return
        if (!ragSessionIdRef.current) {
          fail('Backend did not return a session id.')
          return
        }
        pollRef.current = setInterval(async () => {
          try {
            const pr = await fetch(
              `/api/onboarding?id=${encodeURIComponent(ragSessionIdRef.current as string)}`,
            )
            const pd = await pr.json().catch(() => ({}))
            if (apply(pd)) return
            if (pd?.status === 'failed') {
              stopPolling()
              fail(pd?.error ?? 'Question generation failed.')
            }
          } catch {
            /* transient; keep polling */
          }
        }, 2000)
      } catch {
        fail('Could not reach the onboarding API.')
      }
    })()

    return () => {
      cancelled = true
      stopPolling()
    }
  }, [ragStart])

  // Re-seed the countdowns and index whenever the question set is swapped in.
  useEffect(() => {
    setQuestionTimes(Object.fromEntries(activeQuestions.map((q, i) => [i, q.timeLimit])))
    setCurrentQuestion(0)
  }, [activeQuestions])

  // Run Codeforces AST Winnowing Plagiarism evaluation whenever entering admin or results
  useEffect(() => {
    if (step === 'admin' || step === 'results') {
      const text = answers[1] ?? activeQuestions[1].defaultValue ?? ''
      const vsChatGPT = winnowingEngineRef.current.compareSubmissions(
        text,
        LLM_BENCHMARK_SOLUTIONS.chatgpt_mcp_response,
        'ChatGPT-4o Baseline'
      )
      const vsClaude = winnowingEngineRef.current.compareSubmissions(
        text,
        LLM_BENCHMARK_SOLUTIONS.claude_mcp_response,
        'Claude 3.5 Sonnet Baseline'
      )
      const vsPeer = winnowingEngineRef.current.compareSubmissions(
        text,
        `# Peer Campus Solution\nTransport: SSE over TLS with JSON-RPC 2.0.\nTools: telemetry query, pod crash logs, rollback release.\nSecurity: least privilege with role-based tokens.`,
        'Alex Rivera (Campus Cohort)'
      )
      setPlagiarismMatrix({
        chatgpt: vsChatGPT,
        claude: vsClaude,
        peer: vsPeer,
      })
      setFlightMetrics(flightRecorderRef.current.computeMetrics())

      // Query deep backend LLM forensics
      setIsAuditingPlagiarism(true)
      fetch('/api/plagiarism/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: text,
          language: 'markdown',
          referenceCode: LLM_BENCHMARK_SOLUTIONS.chatgpt_mcp_response,
          referenceName: 'ChatGPT-4o Baseline',
          runLLM: true,
        }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) {
            if (data.llmExplanation) {
              setPlagiarismLLMReport(data.llmExplanation)
            }
            if (data.confidenceScore !== undefined) {
              setPlagiarismMatrix((prev) => ({
                ...prev,
                chatgpt: {
                  ...prev.chatgpt,
                  confidenceScore: data.confidenceScore,
                  verdict: data.verdict ?? prev.chatgpt?.verdict,
                  isAIGenerated: data.isAIGenerated ?? prev.chatgpt?.isAIGenerated,
                  detectedEmojis: data.detectedEmojis ?? prev.chatgpt?.detectedEmojis,
                  flaggedComments: data.flaggedComments ?? prev.chatgpt?.flaggedComments,
                  llmExplanation: data.llmExplanation ?? prev.chatgpt?.llmExplanation,
                },
              }))
            }
          }
        })
        .catch(() => {})
        .finally(() => setIsAuditingPlagiarism(false))
    }
  }, [step, answers])

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

  // Per-question countdown timer loop. Untimed questions (theory) run no clock
  // at all, so their expiry can never auto-submit the assessment.
  useEffect(() => {
    if (step !== 'assessment' || isPaused || isTerminated) return
    const limit = activeQuestions[currentQuestion]?.timeLimit ?? 0
    if (limit <= 0) return

    const interval = setInterval(() => {
      setQuestionTimes((prev) => {
        const currentSecs = prev[currentQuestion] ?? 0
        if (currentSecs <= 1) {
          if (currentQuestion < activeQuestions.length - 1) {
            setCurrentQuestion((curr) => curr + 1)
          } else {
            finishAssessment()
          }
          return { ...prev, [currentQuestion]: 0 }
        }
        return {
          ...prev,
          [currentQuestion]: currentSecs - 1,
        }
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [step, isPaused, isTerminated, currentQuestion, activeQuestions, finishAssessment])

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
                {/* Permanently mounted video element prevents initial black screen lag */}
                <video
                  ref={videoPreviewRef}
                  autoPlay
                  playsInline
                  muted
                  onLoadedMetadata={(e) => {
                    e.currentTarget.play().catch(() => {})
                  }}
                  className={`h-full w-full object-cover ${cameraStream ? 'block' : 'hidden'}`}
                />

                {cameraStream ? (
                  <>
                    {/* Dynamic Primary Face Bounding Box */}
                    {gazeStatus.landmarks && gazeStatus.landmarks.faceDetected && (
                      <div
                        className={`absolute pointer-events-none transition-all duration-75 border-2 rounded-lg ${
                          gazeStatus.direction === 'CENTER'
                            ? 'border-emerald-400/80 shadow-[0_0_10px_rgba(52,211,153,0.35)]'
                            : gazeStatus.direction === 'MULTIPLE_FACES' || gazeStatus.direction === 'FOREIGN_OBJECT'
                            ? 'border-rose-500 bg-rose-500/15 shadow-[0_0_14px_rgba(244,63,94,0.6)] animate-pulse'
                            : 'border-amber-400/90 bg-amber-400/10 shadow-[0_0_12px_rgba(251,191,36,0.4)]'
                        }`}
                        style={{
                          left: `${Math.max(2, Math.min(80, gazeStatus.landmarks.faceBox.x))}%`,
                          top: `${Math.max(2, Math.min(75, gazeStatus.landmarks.faceBox.y))}%`,
                          width: `${Math.max(18, Math.min(85, gazeStatus.landmarks.faceBox.width))}%`,
                          height: `${Math.max(22, Math.min(90, gazeStatus.landmarks.faceBox.height))}%`,
                        }}
                      >
                        <span className="absolute -top-1 -left-1 h-2 w-2 border-t-2 border-l-2 border-inherit" />
                        <span className="absolute -top-1 -right-1 h-2 w-2 border-t-2 border-r-2 border-inherit" />
                        <span className="absolute -bottom-1 -left-1 h-2 w-2 border-b-2 border-l-2 border-inherit" />
                        <span className="absolute -bottom-1 -right-1 h-2 w-2 border-b-2 border-r-2 border-inherit" />

                        {/* Head Pose telemetry badge */}
                        <div className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/90 px-1.5 py-0.5 text-[8px] font-mono font-black text-[#39d5c8] backdrop-blur-xs">
                          P:{gazeStatus.landmarks.pitch}° Y:{gazeStatus.landmarks.yaw}° R:{gazeStatus.landmarks.roll}°
                        </div>
                      </div>
                    )}

                    {/* Secondary Face Bounding Box (Multiple People Detection) */}
                    {gazeStatus.landmarks?.secondaryFaceBox && (
                      <div
                        className="absolute pointer-events-none border-2 border-rose-500 bg-rose-500/20 rounded-lg shadow-[0_0_12px_rgba(244,63,94,0.8)] animate-pulse"
                        style={{
                          left: `${Math.max(0, Math.min(85, gazeStatus.landmarks.secondaryFaceBox.x))}%`,
                          top: `${Math.max(0, Math.min(85, gazeStatus.landmarks.secondaryFaceBox.y))}%`,
                          width: `${Math.max(15, Math.min(50, gazeStatus.landmarks.secondaryFaceBox.width))}%`,
                          height: `${Math.max(15, Math.min(50, gazeStatus.landmarks.secondaryFaceBox.height))}%`,
                        }}
                      >
                        <div className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-rose-600 px-1.5 py-0.5 text-[8px] font-black text-white">
                          ⚠️ INTRUDER / 2ND PERSON
                        </div>
                      </div>
                    )}

                    {/* Foreign Object / Phone Bounding Box */}
                    {gazeStatus.landmarks?.foreignObjectBox && (
                      <div
                        className="absolute pointer-events-none border-2 border-dashed border-rose-400 bg-rose-400/20 rounded-md shadow-[0_0_12px_rgba(244,63,94,0.7)] animate-pulse"
                        style={{
                          left: `${Math.max(0, Math.min(85, gazeStatus.landmarks.foreignObjectBox.x))}%`,
                          top: `${Math.max(0, Math.min(85, gazeStatus.landmarks.foreignObjectBox.y))}%`,
                          width: `${Math.max(15, Math.min(60, gazeStatus.landmarks.foreignObjectBox.width))}%`,
                          height: `${Math.max(12, Math.min(50, gazeStatus.landmarks.foreignObjectBox.height))}%`,
                        }}
                      >
                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-rose-600 px-1.5 py-0.5 text-[8px] font-black text-white">
                          {gazeStatus.landmarks.foreignObjectLabel || '⚠️ SMARTPHONE / OBJECT DETECTED'}
                        </div>
                      </div>
                    )}

                    {/* Dual-Eye Reticles (True Pupil Sclera Tracking) */}
                    {gazeStatus.landmarks && gazeStatus.landmarks.faceDetected && (
                      <>
                        <div
                          className="absolute pointer-events-none transition-all duration-75 text-[#39d5c8]"
                          style={{
                            left: `${Math.max(5, Math.min(95, gazeStatus.landmarks.leftEye.x))}%`,
                            top: `${Math.max(5, Math.min(95, gazeStatus.landmarks.leftEye.y))}%`,
                            transform: 'translate(-50%, -50%)',
                          }}
                        >
                          <div className="h-3 w-3 rounded-full border border-dashed border-[#39d5c8] flex items-center justify-center">
                            <span className="h-1 w-1 bg-[#39d5c8] rounded-full" />
                          </div>
                        </div>
                        <div
                          className="absolute pointer-events-none transition-all duration-75 text-[#39d5c8]"
                          style={{
                            left: `${Math.max(5, Math.min(95, gazeStatus.landmarks.rightEye.x))}%`,
                            top: `${Math.max(5, Math.min(95, gazeStatus.landmarks.rightEye.y))}%`,
                            transform: 'translate(-50%, -50%)',
                          }}
                        >
                          <div className="h-3 w-3 rounded-full border border-dashed border-[#39d5c8] flex items-center justify-center">
                            <span className="h-1 w-1 bg-[#39d5c8] rounded-full" />
                          </div>
                        </div>
                      </>
                    )}

                    {/* Real-time Posture Status Banner on Bottom */}
                    <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between rounded-md bg-black/85 px-2.5 py-1.5 text-[10px] font-bold text-white backdrop-blur-xs">
                      <div className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${
                          gazeStatus.direction === 'CENTER' ? 'bg-emerald-400' : 'bg-amber-400 animate-ping'
                        }`} />
                        <span className={gazeStatus.direction === 'CENTER' ? 'text-emerald-400' : 'text-amber-400 font-black'}>
                          {gazeStatus.direction === 'CENTER'
                            ? '✅ Face & Eyes Centered'
                            : gazeStatus.direction === 'MULTIPLE_FACES'
                            ? '⚠️ Multiple People Detected in Frame!'
                            : gazeStatus.direction === 'FOREIGN_OBJECT'
                            ? '⚠️ Foreign Object / Phone Detected!'
                            : gazeStatus.direction === 'LOOKING_DOWN'
                            ? `⚠️ Head Tilted Down (Pitch: ${gazeStatus.landmarks?.pitch ?? 0}°) · Phone on Lap`
                            : gazeStatus.direction === 'LOOKING_LEFT'
                            ? `⚠️ Head Turned Left (Yaw: ${gazeStatus.landmarks?.yaw ?? 0}°) · 2nd Mon`
                            : gazeStatus.direction === 'LOOKING_RIGHT'
                            ? `⚠️ Head Turned Right (Yaw: ${gazeStatus.landmarks?.yaw ?? 0}°) · 2nd Mon`
                            : gazeStatus.direction === 'HEAD_TILT'
                            ? `⚠️ Head Tilted Sideways (Roll: ${gazeStatus.landmarks?.roll ?? 0}°)`
                            : '❌ Face Missing from Camera'}
                        </span>
                      </div>
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

                  {/* Real-Time Eye & Head Tilt Tracking Verification Card */}
                  {cameraReady && (
                    <div className="rounded border border-[#171717] bg-white p-2 text-[11px] font-bold dark:border-[#2e323b] dark:bg-[#15171c] dark:text-[#f4f4f7]">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <Sparkles className="h-3.5 w-3.5 text-[#39d5c8]" />
                          AI Eye & Head Tilt Tracking
                        </span>
                        <span className={`flex items-center gap-1 text-[10px] font-black ${
                          gazeStatus.direction === 'CENTER' ? 'text-emerald-500 dark:text-emerald-400' : 'text-amber-500 dark:text-amber-400'
                        }`}>
                          {gazeStatus.direction === 'CENTER' ? 'Aligned' : 'Testing Tilt'}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between rounded bg-[#171717]/5 dark:bg-[#1c1f26] px-2 py-1 text-[9px]">
                        <span className="font-mono text-[#171717]/70 dark:text-white/70">
                          {gazeStatus.direction === 'CENTER'
                            ? `Pitch: ${gazeStatus.landmarks?.pitch ?? 0}° | Yaw: ${gazeStatus.landmarks?.yaw ?? 0}° | Roll: ${gazeStatus.landmarks?.roll ?? 0}°`
                            : gazeStatus.direction === 'LOOKING_DOWN'
                            ? `⚠️ Head Tilted Down (${gazeStatus.landmarks?.pitch ?? 0}°) · Phone Sim`
                            : gazeStatus.direction === 'LOOKING_LEFT'
                            ? `⚠️ Turned Left (${gazeStatus.landmarks?.yaw ?? 0}°)`
                            : gazeStatus.direction === 'LOOKING_RIGHT'
                            ? `⚠️ Turned Right (${gazeStatus.landmarks?.yaw ?? 0}°)`
                            : gazeStatus.direction === 'HEAD_TILT'
                            ? `⚠️ Head Tilt (${gazeStatus.landmarks?.roll ?? 0}°)`
                            : 'Face Missing'}
                        </span>
                        <button
                          onClick={() => eyeTrackerRef.current?.recalibrate()}
                          className="font-bold text-[#39d5c8] hover:underline cursor-pointer"
                        >
                          Recenter
                        </button>
                      </div>
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

                  {/* Display Guard (Dual Monitor Detection) */}
                  <div className="flex items-center justify-between rounded border border-[#171717] bg-white p-2 text-[11px] font-bold dark:border-[#2e323b] dark:bg-[#15171c] dark:text-[#f4f4f7]">
                    <span className="flex items-center gap-1.5">
                      <Monitor className="h-3.5 w-3.5 text-[#171717] dark:text-[#39d5c8]" />
                      Display Guard
                    </span>
                    {multiMonitorDetected ? (
                      <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 text-[10px]">
                        <AlertTriangle className="h-3 w-3" /> Multi-Monitor
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-[10px]">
                        <Check className="h-3 w-3" /> Single Screen
                      </span>
                    )}
                  </div>

                  {/* Campus Killer Feature: QR Mobile Desk Cam (Ghost Hunter) */}
                  <div className="flex items-center justify-between rounded border border-[#171717] bg-[#fff0c2] p-2 text-[11px] font-bold dark:border-[#2e323b] dark:bg-[#252a35] dark:text-[#f4f4f7]">
                    <span className="flex items-center gap-1.5">
                      <Smartphone className="h-3.5 w-3.5 text-[#171717] dark:text-[#ffd84d]" />
                      <span>Mobile Desk Cam (QR)</span>
                    </span>
                    {qrCompanionActive ? (
                      <div className="flex items-center gap-1.5">
                        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-[10px]">
                          <Check className="h-3 w-3" /> Paired
                        </span>
                        <button
                          onClick={() => setQrCompanionActive(false)}
                          className="text-[9px] text-rose-500 hover:underline cursor-pointer"
                        >
                          Unpair
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowQrModal(true)}
                        className="cursor-pointer flex items-center gap-1 rounded border border-[#171717] bg-[#ffd84d] px-2 py-0.5 text-[10px] font-black uppercase text-[#171717] hover:brightness-105"
                      >
                        <QrCode className="h-3 w-3" />
                        <span>Pair Phone</span>
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

            {/* Real-time Phone / Foreign Object Warning Banner */}
            {gazeStatus.foreignObjectDetected && (
              <div className="mt-4 rounded-xl border-2 border-rose-500 bg-rose-50 p-3 text-xs font-bold text-rose-800 dark:border-rose-900/80 dark:bg-rose-950/50 dark:text-rose-200 animate-pulse">
                <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-black">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>PROHIBITED OBJECT DETECTED: {gazeStatus.landmarks?.foreignObjectLabel || 'SMARTPHONE'}</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed">
                  A smartphone or unauthorized hardware device was detected in your camera frame. Please put your phone away and clear your workspace before continuing. Having a smartphone present during the assessment will immediately terminate your session and cancel your hiring process.
                </p>
              </div>
            )}

            <div className="mt-6 flex items-center justify-between border-t border-[#171717]/15 pt-4 dark:border-[#2e323b]">
              <button
                onClick={() => setStep('profile')}
                className="btn-neo btn-neo-paper py-2 text-xs"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <button
                disabled={!consentChecked || gazeStatus.foreignObjectDetected}
                onClick={handleStartAssessment}
                className="btn-neo btn-neo-lemon py-2 text-xs disabled:opacity-40"
              >
                {gazeStatus.foreignObjectDetected ? (
                  <span className="flex items-center gap-1.5 text-rose-700 dark:text-rose-300 font-black">
                    <AlertTriangle className="h-3.5 w-3.5" /> Remove Phone to Start
                  </span>
                ) : (
                  <>
                    Start Assessment <Play className="h-3.5 w-3.5 fill-current" />
                  </>
                )}
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
                  Question {currentQuestion + 1} of {activeQuestions.length} · {activeQuestions[currentQuestion].type}
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
                  {activeQuestions.map((q, idx) => (
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

                {/* Codeforces-Grade Anti-Cheat & Flight Recorder HUD */}
                <div className="mt-4 rounded-xl border-2 border-[#171717] bg-[#171717] p-3 text-[10px] font-bold text-white shadow-[2px_2px_0_#39d5c8] dark:border-[#2e323b]">
                  <div className="flex items-center justify-between border-b border-white/15 pb-2">
                    <span className="flex items-center gap-1.5 font-black uppercase text-[#39d5c8]">
                      <ShieldCheck className="h-3.5 w-3.5" /> CF Sandbox
                    </span>
                    <span className="rounded bg-emerald-500/20 px-1.5 py-0.2 text-[8px] font-black text-emerald-400">
                      ARMED
                    </span>
                  </div>

                  <div className="mt-2.5 space-y-1.5 font-mono text-[9px]">
                    <div className="flex items-center justify-between">
                      <span className="text-white/60">Typing Cadence:</span>
                      <span className={flightMetrics?.cadenceGrade === 'AI_INJECTION_FLAG' ? 'text-rose-400 font-bold' : 'text-[#ffd84d]'}>
                        {flightMetrics?.wpm || 62} WPM · {flightMetrics?.cadenceGrade === 'AI_INJECTION_FLAG' ? 'AI Burst' : 'Human'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-white/60">Paste Injections:</span>
                      <span className={flightMetrics?.pasteCount ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                        {flightMetrics?.pasteCount || 0} Detected
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-white/60">Audio VAD:</span>
                      <span className={audioLevel > 55 ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                        {audioLevel} dB ({audioLevel > 55 ? 'Voice' : 'Quiet'})
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-white/60">Display Guard:</span>
                      <span className="text-emerald-400">1 Monitor Locked</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-white/60">Desk Cam (QR):</span>
                      <span className={qrCompanionActive ? 'text-emerald-400' : 'text-white/40'}>
                        {qrCompanionActive ? 'Active Desk' : 'Standby'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-white/60">Gaze Tracking:</span>
                      <span className={gazeStatus.direction === 'CENTER' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                        {gazeStatus.direction === 'CENTER' ? 'Centered' : gazeStatus.direction.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-white/60">Gaze Strikes:</span>
                      <span className={gazeWarnings > 0 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                        {gazeWarnings} / 3
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-5 sm:p-6">
                {/* Real-time security violation toast banner */}
                {violationToast && (
                  <div className="mb-4 flex items-center justify-between rounded-xl border-2 border-rose-600 bg-rose-500/15 p-2.5 text-xs font-black text-rose-600 dark:text-rose-400 animate-pulse">
                    <span className="flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600" />
                      <span>{violationToast}</span>
                    </span>
                    <button
                      onClick={() => setViolationToast(null)}
                      className="cursor-pointer text-[10px] uppercase underline hover:text-rose-700"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

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
                      {activeQuestions[currentQuestion].title}
                    </h2>

                    <div className="mt-4">
                      {activeQuestions[currentQuestion].options ? (
                        <div className="space-y-2">
                          {activeQuestions[currentQuestion].options.map((opt, optIdx) => (
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
                          value={answers[currentQuestion] ?? activeQuestions[currentQuestion].defaultValue}
                          placeholder={activeQuestions[currentQuestion].placeholder}
                          onKeyDown={(e) => {
                            if (e.key === 'Backspace' || e.key === 'Delete') {
                              flightRecorderRef.current.logKeystroke('delete', '', e.currentTarget.selectionStart, e.currentTarget.value.length)
                              setFlightMetrics(flightRecorderRef.current.computeMetrics())
                            }
                          }}
                          onPaste={(e) => {
                            const pasteText = e.clipboardData.getData('text') || ''
                            flightRecorderRef.current.logKeystroke('paste', pasteText, e.currentTarget.selectionStart, e.currentTarget.value.length + pasteText.length)
                            setSecurityViolations((prev) => [
                              {
                                timestamp: new Date().toLocaleTimeString(),
                                type: 'PASTE_BLOCKED',
                                detail: `External paste event intercepted (${pasteText.length} chars). Keystroke Flight Recorder flagged burst score anomaly.`,
                                severity: 'WARNING',
                              },
                              ...prev,
                            ])
                            setViolationToast(`Paste Telemetry Flagged: ${pasteText.length} characters inserted in burst.`)
                            setTimeout(() => setViolationToast(null), 4000)
                            setFlightMetrics(flightRecorderRef.current.computeMetrics())
                          }}
                          onChange={(e) => {
                            const newVal = e.target.value
                            const oldVal = answers[currentQuestion] ?? activeQuestions[currentQuestion].defaultValue ?? ''
                            setAnswers({ ...answers, [currentQuestion]: newVal })

                            const diff = newVal.length - oldVal.length
                            if (diff > 0 && diff < 20) {
                              flightRecorderRef.current.logKeystroke('insert', newVal.slice(-diff), e.target.selectionStart, newVal.length)
                            }
                            setFlightMetrics(flightRecorderRef.current.computeMetrics())
                          }}
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

                      {currentQuestion < activeQuestions.length - 1 ? (
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

        {/* Eye Gaze Deviation Warning Modal (3 Warnings before Auto-Termination) */}
        {showGazeWarningModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
            <div className="w-full max-w-lg rounded-2xl border-4 border-[#171717] bg-[#ffd84d] p-6 text-[#171717] shadow-hard-lg dark:border-[#000000]">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-[#171717] bg-[#ff6b6b] text-white">
                  <AlertTriangle className="h-7 w-7" />
                </div>
                <div>
                  <span className="rounded bg-[#171717] px-2 py-0.5 font-mono text-[10px] font-black uppercase text-white">
                    EYE GAZE ALERT · WARNING {gazeWarningDetail.count} OF 3
                  </span>
                  <h3 className="font-display text-2xl uppercase tracking-tight sm:text-3xl">
                    Gaze Deviation Detected!
                  </h3>
                </div>
              </div>

              <div className="mt-4 rounded-xl border-2 border-[#171717] bg-white p-4 text-xs font-bold leading-relaxed text-[#171717] shadow-[2px_2px_0_#171717]">
                <p>
                  {gazeWarningDetail.direction.includes('MULTIPLE')
                    ? 'The AI proctoring engine detected multiple faces or a second person in your camera frame. You must complete this assessment alone without room companions.'
                    : gazeWarningDetail.direction.includes('FOREIGN')
                    ? 'The AI proctoring engine detected an unauthorized handheld device (smartphone, tablet, or secondary screen) in the proctored testing area.'
                    : `The AI proctoring engine detected sustained gaze deviation (${gazeWarningDetail.direction}) away from the test area for more than 1.5 seconds.`}
                </p>
                <p className="mt-2 text-rose-700 font-black">
                  {gazeWarningDetail.count >= 3
                    ? '⚠️ CRITICAL: THIS IS YOUR 3RD AND FINAL WARNING (3/3). Any further infraction (multi-face, phone, looking down, or turning away) will IMMEDIATELY TERMINATE your session with disqualification.'
                    : `⚠️ WARNING ${gazeWarningDetail.count} OF 3: Online proctoring requires your face to remain centered, single-occupant testing, and zero mobile phone presence. 3 total warnings allowed before automatic session termination.`}
                </p>
              </div>

              <button
                onClick={() => {
                  setShowGazeWarningModal(false)
                  setIsPaused(false)
                }}
                className="btn-neo btn-neo-ink mt-5 w-full py-3 text-xs uppercase"
              >
                I Understand — Refocus Eyes On Screen & Resume
              </button>
            </div>
          </div>
        )}

        {/* Floating Live Proctor HUD during Assessment */}
        {step === 'assessment' && (
          <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-1.5 pointer-events-auto select-none">
            <div className="w-52 sm:w-60 overflow-hidden rounded-xl border-3 border-[#171717] bg-[#171717] shadow-hard-lg dark:border-[#2e323b] dark:shadow-[4px_4px_0_#000000]">
              <div className="relative aspect-video bg-black overflow-hidden">
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

                {/* Dynamic Tracked Face Bounding Box */}
                {gazeStatus.landmarks && gazeStatus.landmarks.faceDetected && (
                  <div
                    className={`absolute pointer-events-none transition-all duration-75 border-2 rounded-lg ${
                      gazeStatus.direction === 'CENTER'
                        ? 'border-emerald-400/80 shadow-[0_0_8px_rgba(52,211,153,0.3)]'
                        : gazeStatus.isSustainedDeviation
                        ? 'border-rose-500 bg-rose-500/20 shadow-[0_0_14px_rgba(244,63,94,0.6)] animate-pulse'
                        : 'border-amber-400/90 bg-amber-400/10 shadow-[0_0_10px_rgba(251,191,36,0.4)]'
                    }`}
                    style={{
                      left: `${Math.max(5, Math.min(75, gazeStatus.landmarks.faceBox.x))}%`,
                      top: `${Math.max(5, Math.min(70, gazeStatus.landmarks.faceBox.y))}%`,
                      width: `${Math.max(20, Math.min(70, gazeStatus.landmarks.faceBox.width))}%`,
                      height: `${Math.max(25, Math.min(80, gazeStatus.landmarks.faceBox.height))}%`,
                    }}
                  >
                    <span className="absolute -top-1 -left-1 h-2 w-2 border-t-2 border-l-2 border-inherit" />
                    <span className="absolute -top-1 -right-1 h-2 w-2 border-t-2 border-r-2 border-inherit" />
                    <span className="absolute -bottom-1 -left-1 h-2 w-2 border-b-2 border-l-2 border-inherit" />
                    <span className="absolute -bottom-1 -right-1 h-2 w-2 border-b-2 border-r-2 border-inherit" />

                    {/* Live Head Pose degree telemetry badge */}
                    <div className="absolute -top-4.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/90 px-1 py-0.5 text-[7px] font-mono font-black text-[#39d5c8] backdrop-blur-xs">
                      P:{gazeStatus.landmarks.pitch}° Y:{gazeStatus.landmarks.yaw}° R:{gazeStatus.landmarks.roll}°
                    </div>
                  </div>
                )}

                {/* Secondary Face Bounding Box (Intruder Detection in Assessment) */}
                {gazeStatus.landmarks?.secondaryFaceBox && (
                  <div
                    className="absolute pointer-events-none border-2 border-rose-500 bg-rose-500/25 rounded-md shadow-[0_0_10px_rgba(244,63,94,0.8)] animate-pulse"
                    style={{
                      left: `${Math.max(0, Math.min(85, gazeStatus.landmarks.secondaryFaceBox.x))}%`,
                      top: `${Math.max(0, Math.min(85, gazeStatus.landmarks.secondaryFaceBox.y))}%`,
                      width: `${Math.max(15, Math.min(50, gazeStatus.landmarks.secondaryFaceBox.width))}%`,
                      height: `${Math.max(15, Math.min(50, gazeStatus.landmarks.secondaryFaceBox.height))}%`,
                    }}
                  >
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-rose-600 px-1 py-0.5 text-[7px] font-black text-white">
                      ⚠️ 2ND PERSON
                    </div>
                  </div>
                )}

                {/* Foreign Object / Phone Bounding Box */}
                {gazeStatus.landmarks?.foreignObjectBox && (
                  <div
                    className="absolute pointer-events-none border-2 border-dashed border-rose-400 bg-rose-400/25 rounded-md shadow-[0_0_10px_rgba(244,63,94,0.8)] animate-pulse"
                    style={{
                      left: `${Math.max(0, Math.min(85, gazeStatus.landmarks.foreignObjectBox.x))}%`,
                      top: `${Math.max(0, Math.min(85, gazeStatus.landmarks.foreignObjectBox.y))}%`,
                      width: `${Math.max(15, Math.min(60, gazeStatus.landmarks.foreignObjectBox.width))}%`,
                      height: `${Math.max(12, Math.min(50, gazeStatus.landmarks.foreignObjectBox.height))}%`,
                    }}
                  >
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-rose-600 px-1.5 py-0.5 text-[7px] font-black text-white">
                      {gazeStatus.landmarks.foreignObjectLabel || '⚠️ PHONE / OBJECT'}
                    </div>
                  </div>
                )}

                {/* Dual-Eye Reticles */}
                {gazeStatus.landmarks && gazeStatus.landmarks.faceDetected && (
                  <>
                    <div
                      className="absolute pointer-events-none transition-all duration-75 text-[#39d5c8]"
                      style={{
                        left: `${Math.max(5, Math.min(95, gazeStatus.landmarks.leftEye.x))}%`,
                        top: `${Math.max(5, Math.min(95, gazeStatus.landmarks.leftEye.y))}%`,
                        transform: 'translate(-50%, -50%)',
                      }}
                    >
                      <div className="h-2.5 w-2.5 rounded-full border border-dashed border-[#39d5c8] flex items-center justify-center">
                        <span className="h-0.5 w-0.5 bg-[#39d5c8] rounded-full" />
                      </div>
                    </div>
                    <div
                      className="absolute pointer-events-none transition-all duration-75 text-[#39d5c8]"
                      style={{
                        left: `${Math.max(5, Math.min(95, gazeStatus.landmarks.rightEye.x))}%`,
                        top: `${Math.max(5, Math.min(95, gazeStatus.landmarks.rightEye.y))}%`,
                        transform: 'translate(-50%, -50%)',
                      }}
                    >
                      <div className="h-2.5 w-2.5 rounded-full border border-dashed border-[#39d5c8] flex items-center justify-center">
                        <span className="h-0.5 w-0.5 bg-[#39d5c8] rounded-full" />
                      </div>
                    </div>
                  </>
                )}

                {/* Real-time Deviation Warning Progress Bar */}
                {gazeStatus.direction !== 'CENTER' && (
                  <div className="absolute top-6 left-1.5 right-1.5 z-10 pointer-events-none">
                    <div className="flex items-center justify-between text-[7px] font-black text-rose-300 mb-0.5 bg-black/70 px-1 py-0.5 rounded backdrop-blur-xs">
                      <span>STRIKE WARNING INCOMING</span>
                      <span>{Math.round((gazeStatus.deviationProgress ?? 0) * 100)}%</span>
                    </div>
                    <div className="h-1 w-full bg-black/80 rounded-full overflow-hidden border border-rose-500/40">
                      <div
                        className="h-full bg-rose-500 transition-all duration-75"
                        style={{ width: `${Math.round((gazeStatus.deviationProgress ?? 0) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Recording indicator */}
                <div className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded bg-black/80 px-1.5 py-0.5 text-[8px] font-black text-rose-400 backdrop-blur-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                  REC
                </div>

                {/* Eye Tracking Reticle HUD badge */}
                <div className="absolute top-1.5 right-1.5 flex items-center gap-1 rounded bg-black/80 px-1.5 py-0.5 text-[8px] font-black backdrop-blur-xs">
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    gazeStatus.direction === 'CENTER' ? 'bg-emerald-400' : 'bg-rose-500 animate-ping'
                  }`} />
                  <span className={gazeStatus.direction === 'CENTER' ? 'text-emerald-400' : 'text-rose-400 font-black'}>
                    {gazeStatus.direction === 'CENTER'
                      ? 'EYES CENTER'
                      : gazeStatus.direction === 'MULTIPLE_FACES'
                      ? '⚠️ MULTIPLE PEOPLE'
                      : gazeStatus.direction === 'FOREIGN_OBJECT'
                      ? '⚠️ PHONE DETECTED'
                      : gazeStatus.direction === 'LOOKING_DOWN'
                      ? '⚠️ TILT DOWN (Phone)'
                      : gazeStatus.direction === 'LOOKING_LEFT'
                      ? '⚠️ TURNED LEFT'
                      : gazeStatus.direction === 'LOOKING_RIGHT'
                      ? '⚠️ TURNED RIGHT'
                      : gazeStatus.direction === 'HEAD_TILT'
                      ? '⚠️ HEAD TILT'
                      : '❌ NO FACE'}
                  </span>
                </div>

                <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded bg-black/80 px-1.5 py-0.5 text-[8px] font-bold text-white backdrop-blur-xs">
                  <ShieldCheck className="h-2.5 w-2.5 text-[#39d5c8]" />
                  <span>PROCTOR LIVE</span>
                </div>

                {/* Gaze Strikes counter in PIP */}
                <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded bg-black/80 px-1.5 py-0.5 text-[8px] font-black text-white backdrop-blur-xs">
                  <span className="text-[#ffd84d]">Gaze:</span>
                  <span className={gazeWarnings > 0 ? 'text-rose-400 font-black' : 'text-emerald-400'}>
                    {gazeWarnings} / 3 Strikes
                  </span>
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
                  onClick={() => eyeTrackerRef.current?.recalibrate()}
                  title="Recenter zero-point posture"
                  className="hover:text-[#ffd84d] cursor-pointer text-[#ffd84d] text-[8px] font-bold"
                >
                  🎯 Recenter
                </button>
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
                  {terminationReason?.includes('Foreign') || terminationReason?.includes('smartphone') || terminationReason?.includes('phone') || terminationReason?.includes('SMARTPHONE') ? (
                    <Smartphone className="h-8 w-8" />
                  ) : (
                    <XCircle className="h-8 w-8" />
                  )}
                </div>

                <h2 className="mt-4 font-display text-4xl uppercase text-rose-600 dark:text-rose-400">
                  {terminationReason?.includes('Foreign') || terminationReason?.includes('smartphone') || terminationReason?.includes('phone') || terminationReason?.includes('SMARTPHONE')
                    ? 'Hiring Process Cancelled'
                    : 'Session Terminated'}
                </h2>
                <p className="mt-1 text-xs font-bold text-[#171717]/70 dark:text-[#a1a1aa]">
                  {terminationReason || 'Academic integrity violations detected. This assessment was automatically terminated.'}
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
                    <div className="font-display text-2xl text-rose-600 dark:text-rose-400">DISQUALIFIED</div>
                    <div className="text-[9px] font-black uppercase text-rose-700 dark:text-rose-300">Integrity</div>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-rose-300 bg-rose-50 p-3 text-left text-xs font-bold text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
                  <span className="font-black">Violation Audit Log:</span>{' '}
                  {terminationReason
                    ? terminationReason
                    : `${tabViolations} tab switch events and ${gazeWarnings} eye gaze deviations recorded. Media captures locked and flagged for recruiter review.`}
                </div>

                <div className="mt-6 flex justify-center gap-2">
                  <button
                    onClick={() => {
                      setIsTerminated(false)
                      setTabViolations(0)
                      setGazeWarnings(0)
                      setShowGazeWarningModal(false)
                      if (eyeTrackerRef.current) eyeTrackerRef.current.resetWarnings()
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

                {/* AI-Code, Emojis & Plagiarism Confidence Audit Card */}
                <div className="mt-5 rounded-xl border-2 border-[#171717] bg-[#fffaf0] p-4 text-left shadow-[2px_2px_0_#171717] dark:border-[#2e323b] dark:bg-[#1c1f26] dark:shadow-[2px_2px_0_#000000]">
                  <div className="flex items-center justify-between border-b border-[#171717]/10 pb-2.5 dark:border-white/10">
                    <div className="flex items-center gap-2">
                      {plagiarismMatrix.chatgpt?.isAIGenerated || plagiarismMatrix.chatgpt?.isPlagiarized ? (
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#171717] bg-[#ff6b6b] text-white">
                          <ShieldAlert className="h-4 w-4" />
                        </div>
                      ) : (
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#171717] bg-[#6ee56b] text-[#171717]">
                          <ShieldCheck className="h-4 w-4" />
                        </div>
                      )}
                      <div>
                        <h4 className="font-display text-sm uppercase text-[#171717] dark:text-[#f4f4f7]">
                          AI-Code & Plagiarism Forensic Scorecard
                        </h4>
                        <span className="text-[9px] font-bold text-[#171717]/60 dark:text-[#a1a1aa]">
                          Open-source Copydetect Winnowing + Backend LLM Confidence
                        </span>
                      </div>
                    </div>

                    {isAuditingPlagiarism ? (
                      <span className="rounded-md border border-[#171717] bg-[#ffd84d] px-2 py-0.5 text-[9px] font-black uppercase text-[#171717] animate-pulse">
                        LLM Auditing...
                      </span>
                    ) : (
                      <span
                        className={`rounded-md border border-[#171717] px-2 py-0.5 text-[9px] font-black uppercase ${
                          plagiarismMatrix.chatgpt?.isAIGenerated || plagiarismMatrix.chatgpt?.isPlagiarized
                            ? 'bg-[#ff6b6b] text-white'
                            : 'bg-[#6ee56b] text-[#171717]'
                        }`}
                      >
                        {plagiarismMatrix.chatgpt?.confidenceScore ?? 96}%{' '}
                        {plagiarismMatrix.chatgpt?.isAIGenerated
                          ? 'AI Generated'
                          : plagiarismMatrix.chatgpt?.isPlagiarized
                          ? 'Plagiarized'
                          : 'Human Original'}
                      </span>
                    )}
                  </div>

                  {/* Confidence Progress */}
                  <div className="mt-3">
                    <div className="flex justify-between text-[10px] font-mono font-bold text-[#171717]/70 dark:text-[#a1a1aa] mb-1">
                      <span>Forensic Confidence:</span>
                      <span className="font-black text-[#171717] dark:text-[#f4f4f7]">
                        {plagiarismMatrix.chatgpt?.confidenceScore ?? 96}%
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          plagiarismMatrix.chatgpt?.isAIGenerated || plagiarismMatrix.chatgpt?.isPlagiarized
                            ? 'bg-rose-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, plagiarismMatrix.chatgpt?.confidenceScore ?? 96)}%` }}
                      />
                    </div>
                  </div>

                  {/* Detected Emojis in candidate answers */}
                  {plagiarismMatrix.chatgpt?.detectedEmojis && plagiarismMatrix.chatgpt.detectedEmojis.length > 0 ? (
                    <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs dark:border-amber-900/40 dark:bg-amber-950/20">
                      <div className="flex items-center gap-1.5 font-black text-amber-900 dark:text-amber-300">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                        <span>AI-Style Emojis Flagged in Submission:</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {plagiarismMatrix.chatgpt.detectedEmojis.map((em, idx) => (
                          <span
                            key={idx}
                            className="rounded border border-amber-400 bg-white px-1.5 py-0.5 font-mono text-xs dark:bg-slate-900"
                          >
                            {em}
                          </span>
                        ))}
                      </div>
                      <span className="mt-1 block text-[10px] text-amber-800/80 dark:text-amber-300/80">
                        LLMs inject decorative emojis into comments & specs (e.g. 🚀, ✨, 💡).
                      </span>
                    </div>
                  ) : (
                    <div className="mt-2.5 flex items-center justify-between text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                      <span className="flex items-center gap-1">
                        <Check className="h-3 w-3" /> No AI emoji or template markers detected
                      </span>
                      <span className="font-mono text-[10px]">Clean Code</span>
                    </div>
                  )}

                  {/* Flagged AI comments */}
                  {plagiarismMatrix.chatgpt?.flaggedComments && plagiarismMatrix.chatgpt.flaggedComments.length > 0 && (
                    <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50/70 p-2 text-xs dark:border-rose-900/30 dark:bg-rose-950/20">
                      <span className="text-[10px] font-black uppercase text-rose-800 dark:text-rose-300 block mb-0.5">
                        Suspicious AI Phrasing ({plagiarismMatrix.chatgpt.flaggedComments.length} occurrences):
                      </span>
                      {plagiarismMatrix.chatgpt.flaggedComments.slice(0, 2).map((fl, i) => (
                        <div key={i} className="text-[10px] font-mono text-rose-700 dark:text-rose-400 truncate">
                          • {fl.detail}: &quot;{fl.lineContent}&quot;
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Forensic findings */}
                  {(plagiarismLLMReport || plagiarismMatrix.chatgpt?.llmExplanation) && (
                    <div className="mt-2.5 rounded-lg border border-[#171717]/10 bg-white p-2 text-[11px] font-bold text-[#171717]/80 dark:border-[#2e323b] dark:bg-[#15171c] dark:text-[#a1a1aa]">
                      <span className="text-[9px] font-black uppercase text-[#171717]/50 dark:text-[#a1a1aa]/70 block">
                        Forensic LLM Finding:
                      </span>
                      <p className="mt-0.5 leading-relaxed">
                        {plagiarismLLMReport || plagiarismMatrix.chatgpt?.llmExplanation}
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  <button
                    onClick={() => {
                      triggerRound2Notification('mentor', candidateName)
                      setActiveRole('candidate')
                      setTab('mentorship')
                    }}
                    className="btn-neo btn-neo-lemon py-2 px-4 text-xs flex items-center gap-1.5"
                  >
                    <Video className="h-3.5 w-3.5 fill-current" />
                    <span>Join Round 2: Mentorship Call</span>
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
                <div className="flex items-center gap-2">
                  <span className="rounded-md border border-[#171717] bg-[#ffd84d] px-2 py-0.5 text-[10px] font-black uppercase text-[#171717] dark:border-[#000000]">
                    CAMPUS TPO SUITE
                  </span>
                  <span className="text-xs font-bold text-[#171717]/60 dark:text-[#a1a1aa]">
                    Codeforces Anti-Cheat & Forensic Playback
                  </span>
                </div>
                <h2 className="mt-1 font-display text-3xl uppercase text-[#171717] dark:text-[#f4f4f7]">
                  Candidate Integrity & Review
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <span className="rounded-lg border border-[#171717] bg-[#39d5c8] px-2.5 py-1 font-mono text-[11px] font-black text-[#171717] dark:border-[#000000]">
                  3 Cohort Candidates Evaluated
                </span>
              </div>
            </div>

            <div className="mt-4 grid gap-5 lg:grid-cols-[290px_minmax(0,1fr)] items-start">
              {/* Left Column: Candidate List */}
              <div className="space-y-2.5">
                {[
                  {
                    name: 'Maya Chen',
                    score: 94,
                    integrity: 'Clear',
                    time: '12 min ago',
                    cadence: 'Organic 96%',
                    plagiarism: '24.2% (Clean)',
                    status: 'CLEAN',
                  },
                  {
                    name: 'Alex Rivera',
                    score: 88,
                    integrity: 'Flagged',
                    time: '35 min ago',
                    cadence: 'AI Burst 42%',
                    plagiarism: '82.4% (Collusion)',
                    status: 'FLAGGED',
                  },
                  {
                    name: 'Jordan Lee',
                    score: 82,
                    integrity: 'Clear',
                    time: '1 hr ago',
                    cadence: 'Organic 91%',
                    plagiarism: '18.6% (Clean)',
                    status: 'CLEAN',
                  },
                ].map((c) => (
                  <div
                    key={c.name}
                    onClick={() => {
                      setSelectedCandidate(c.name)
                      setReplayPercentage(100)
                      setIsReplaying(false)
                    }}
                    className={`cursor-pointer rounded-xl border-2 p-3 text-xs font-bold transition-all ${
                      selectedCandidate === c.name
                        ? 'border-[#171717] bg-white text-[#171717] shadow-[3px_3px_0_#171717] ring-2 ring-[#ffd84d] dark:border-[#ffd84d] dark:bg-[#15171c] dark:text-[#f4f4f7]'
                        : 'border-[#171717]/20 bg-white/70 hover:bg-white text-[#171717] dark:border-[#2e323b] dark:bg-[#1c1f26]/70 dark:text-[#f4f4f7] dark:hover:bg-[#1c1f26]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="font-display text-xl uppercase">{c.name}</h4>
                      <span className="font-display text-xl">{c.score}</span>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px]">
                      <span className={`rounded px-1.5 py-0.5 font-mono font-bold ${
                        c.status === 'FLAGGED' ? 'bg-rose-500 text-white' : 'bg-white/80 text-[#171717] dark:bg-black/40 dark:text-emerald-400'
                      }`}>
                        {c.cadence}
                      </span>
                      <span className={`rounded px-1.5 py-0.5 font-mono font-bold text-right ${
                        c.status === 'FLAGGED' ? 'bg-rose-500 text-white' : 'bg-white/80 text-[#171717] dark:bg-black/40 dark:text-emerald-400'
                      }`}>
                        {c.plagiarism}
                      </span>
                    </div>

                    <div className="mt-1.5 flex items-center justify-between text-[9px] opacity-75">
                      <span>{c.time}</span>
                      <span className="uppercase font-black">{c.integrity}</span>
                    </div>
                  </div>
                ))}

                <div className="mt-4 rounded-xl border border-[#171717]/20 bg-[#e0fbf9] p-3 text-[10px] font-bold text-[#171717] dark:border-[#2e323b] dark:bg-[#15171c] dark:text-[#39d5c8]">
                  <div className="flex items-center gap-1.5 font-black uppercase text-[#171717] dark:text-[#39d5c8]">
                    <ShieldCheck className="h-4 w-4" /> Codeforces Engine Standard
                  </div>
                  <p className="mt-1 leading-relaxed text-[#171717]/80 dark:text-[#a1a1aa]">
                    Plagiarism checks use AST Tokenization + K-Gram Winnowing (Stanford MOSS). Code is invariant to variable renames or comment scrubbing.
                  </p>
                </div>
              </div>

              {/* Right Column: Deep-Dive Forensic Panel */}
              <div className="min-w-0 max-w-full overflow-hidden rounded-xl border-2 border-[#171717] bg-[#fffaf0] p-4 sm:p-5 dark:border-[#2e323b] dark:bg-[#1c1f26]">
                {/* Candidate Summary Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#171717]/15 pb-3 dark:border-[#2e323b]">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-2xl uppercase text-[#171717] dark:text-[#f4f4f7]">
                        {selectedCandidate}
                      </h3>
                      <span className={`rounded px-2 py-0.5 text-[10px] font-black uppercase ${
                        selectedCandidate === 'Alex Rivera'
                          ? 'bg-rose-500 text-white animate-pulse'
                          : 'bg-emerald-500 text-white'
                      }`}>
                        {selectedCandidate === 'Alex Rivera' ? 'Plagiarism Detected' : 'Verified Human'}
                      </span>
                    </div>
                    <p className="text-[11px] font-bold text-[#171717]/70 dark:text-[#a1a1aa]">
                      Assessment: Senior Fullstack & MCP Architecture · Candidate ID #2026-CAMPUS-094
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        triggerRound2Notification('candidate', selectedCandidate)
                        setActiveRole('mentor')
                        setTab('mentorship')
                      }}
                      className="btn-neo btn-neo-aqua py-1.5 px-3 text-xs flex items-center gap-1.5"
                    >
                      <Video className="h-3.5 w-3.5 fill-current" />
                      <span>Round 2 Call</span>
                    </button>
                    <button
                      onClick={() => setStep('invite')}
                      className="btn-neo btn-neo-paper py-1.5 px-2.5 text-xs"
                    >
                      Back
                    </button>
                  </div>
                </div>

                {/* Forensic Tabs: Flight Replay vs AST Winnowing vs Certificate */}
                <div className="mt-3.5 flex flex-wrap gap-1.5 border-b border-[#171717]/15 pb-2.5 dark:border-[#2e323b]">
                  {[
                    { id: 'flight', label: 'Flight Recorder', icon: History },
                    { id: 'winnowing', label: 'AST Plagiarism Matrix', icon: Code2 },
                    { id: 'certificate', label: 'Integrity Certificate', icon: FileCheck },
                  ].map((tabItem) => {
                    const TabIcon = tabItem.icon
                    return (
                      <button
                        key={tabItem.id}
                        onClick={() => setAdminActiveTab(tabItem.id as any)}
                        className={`inline-flex items-center gap-1.5 cursor-pointer rounded-lg px-3 py-1.5 text-xs font-black uppercase transition-all ${
                          adminActiveTab === tabItem.id
                            ? 'border border-[#171717] bg-[#171717] text-[#fffaf0] shadow-xs dark:bg-[#ffd84d] dark:text-[#171717]'
                            : 'text-[#171717]/70 hover:bg-white dark:text-[#a1a1aa] dark:hover:bg-[#252933]'
                        }`}
                      >
                        <TabIcon className="h-3.5 w-3.5 shrink-0" />
                        <span>{tabItem.label}</span>
                      </button>
                    )
                  })}
                </div>

                {/* TAB 1: KEYSTROKE FLIGHT RECORDER & REPLAY */}
                {adminActiveTab === 'flight' && (
                  <div className="mt-4 space-y-4 min-w-0 max-w-full">
                    {/* Replay Controls & Scrubber */}
                    <div className="rounded-xl border-2 border-[#171717] bg-white p-3.5 shadow-[2px_2px_0_#171717] dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[2px_2px_0_#000000] min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setIsReplaying(!isReplaying)}
                            className="btn-neo btn-neo-lemon flex items-center gap-1.5 py-1 px-3 text-xs"
                          >
                            {isReplaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                            <span>{isReplaying ? 'Pause' : 'Play Replay'}</span>
                          </button>

                          <div className="flex items-center gap-0.5 rounded-lg border border-[#171717]/20 p-0.5 text-[10px] font-black dark:border-[#2e323b]">
                            {[1, 2, 5, 10].map((spd) => (
                              <button
                                key={spd}
                                onClick={() => setReplaySpeed(spd)}
                                className={`rounded px-1.5 py-0.5 cursor-pointer ${
                                  replaySpeed === spd
                                    ? 'bg-[#171717] text-white dark:bg-[#39d5c8] dark:text-[#171717]'
                                    : 'text-[#171717]/70 dark:text-[#a1a1aa]'
                                }`}
                              >
                                {spd}x
                              </button>
                            ))}
                          </div>
                        </div>

                        <span className="font-mono text-xs font-black text-[#171717] dark:text-[#ffd84d]">
                          Position: {replayPercentage}%
                        </span>
                      </div>

                      {/* Scrubber slider */}
                      <div className="mt-3 min-w-0 w-full">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={replayPercentage}
                          onChange={(e) => {
                            setReplayPercentage(Number(e.target.value))
                            setIsReplaying(false)
                          }}
                          className="w-full accent-[#171717] cursor-pointer dark:accent-[#ffd84d]"
                        />
                        <div className="flex justify-between font-mono text-[9px] text-[#171717]/60 dark:text-[#a1a1aa] mt-1 gap-1">
                          <span>00:00 (Start)</span>
                          <span>04:12 (Draft)</span>
                          <span>08:45 (Refactor)</span>
                          <span>10:00 (Submit)</span>
                        </div>
                      </div>
                    </div>

                    {/* Dynamic Reconstructed Code View (Strict Non-Overflow) */}
                    <div className="rounded-xl border-2 border-[#171717] bg-[#121418] p-3.5 text-white dark:border-[#2e323b] min-w-0 max-w-full overflow-hidden">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2 text-[10px]">
                        <span className="font-mono font-bold text-[#39d5c8] flex items-center gap-1.5">
                          <Code2 className="h-3.5 w-3.5 shrink-0" /> Replay Snapshot · {replayPercentage}% Timeline
                        </span>
                        <span className="font-mono text-white/60 truncate max-w-full">
                          {selectedCandidate === 'Alex Rivera' ? '⚠️ Instant 0ms Paste Injection Flagged' : '✓ Organic Human Inter-Keystroke Latency'}
                        </span>
                      </div>

                      <pre className="mt-3 max-h-56 w-full max-w-full overflow-x-auto overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-black/40 p-3 font-mono text-xs text-[#fffaf0] leading-relaxed select-text border border-white/10">
                        {selectedCandidate === 'Alex Rivera' ? (
                          replayPercentage < 15 ? (
                            '# Drafting...'
                          ) : (
                            `# Technical Architecture: MCP Incident Response Server\n// [SUSPICIOUS BURST: 412 characters injected in 0.04s via external clipboard]\nTransport: Server-Sent Events over TLS\nTools: query_cluster_telemetry, fetch_pod_logs, trigger_canary_rollback\nSecurity: Scoped service accounts, principle of least privilege, audit logs.`
                          )
                        ) : (
                          flightRecorderRef.current.replayAtPercentage(replayPercentage).text ||
                          (answers[1] ?? activeQuestions[1].defaultValue ?? '')
                        )}
                      </pre>
                    </div>

                    {/* Telemetry Stats Grid (Clean 4-col responsive) */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 min-w-0">
                      <div className="rounded-xl border border-[#171717] bg-white p-2.5 text-center dark:border-[#2e323b] dark:bg-[#15171c] min-w-0">
                        <div className="text-[10px] font-black uppercase text-[#171717]/60 dark:text-[#a1a1aa] truncate">
                          Typing Speed
                        </div>
                        <div className="font-display text-base sm:text-lg text-[#171717] dark:text-[#f4f4f7] truncate">
                          {selectedCandidate === 'Alex Rivera' ? '184 WPM' : `${flightMetrics?.wpm || 64} WPM`}
                        </div>
                      </div>

                      <div className="rounded-xl border border-[#171717] bg-white p-2.5 text-center dark:border-[#2e323b] dark:bg-[#15171c] min-w-0">
                        <div className="text-[10px] font-black uppercase text-[#171717]/60 dark:text-[#a1a1aa] truncate">
                          Backspaces
                        </div>
                        <div className="font-display text-base sm:text-lg text-[#171717] dark:text-[#f4f4f7] truncate">
                          {selectedCandidate === 'Alex Rivera' ? '0 Backspaces' : `${flightMetrics?.backspacesCount || 24} Fixed`}
                        </div>
                      </div>

                      <div className="rounded-xl border border-[#171717] bg-white p-2.5 text-center dark:border-[#2e323b] dark:bg-[#15171c] min-w-0">
                        <div className="text-[10px] font-black uppercase text-[#171717]/60 dark:text-[#a1a1aa] truncate">
                          Paste Injections
                        </div>
                        <div className={`font-display text-base sm:text-lg truncate ${selectedCandidate === 'Alex Rivera' ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {selectedCandidate === 'Alex Rivera' ? '2 Detected' : '0 Clean'}
                        </div>
                      </div>

                      <div className="rounded-xl border border-[#171717] bg-white p-2.5 text-center dark:border-[#2e323b] dark:bg-[#15171c] min-w-0">
                        <div className="text-[10px] font-black uppercase text-[#171717]/60 dark:text-[#a1a1aa] truncate">
                          Origin Flag
                        </div>
                        <div className={`font-display text-xs sm:text-sm mt-0.5 uppercase truncate font-black ${selectedCandidate === 'Alex Rivera' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {selectedCandidate === 'Alex Rivera' ? 'AI Burst' : 'Organic'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: CODEFORCES AST WINNOWING PLAGIARISM */}
                {adminActiveTab === 'winnowing' && (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-xl border border-[#171717]/20 bg-white p-3.5 dark:border-[#2e323b] dark:bg-[#15171c]">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-[#6d73ff]" />
                        <h4 className="font-display text-lg uppercase text-[#171717] dark:text-[#f4f4f7]">
                          AST Normalisation
                        </h4>
                      </div>
                      <p className="mt-1 text-xs font-bold leading-relaxed text-[#171717]/70 dark:text-[#a1a1aa]">
                        All candidate code is stripped of comments, literals, and variable identifiers (mapped into canonical AST tokens: V1, V2, LOP, CND). K-Gram rolling hashes are winnowed to generate cryptographic structural fingerprints.
                      </p>

                      {/* Comparison Rows */}
                      <div className="mt-4 space-y-3">
                        {/* vs ChatGPT-4o */}
                        <div className="rounded-lg border border-[#171717]/15 p-3 dark:border-[#2e323b]">
                          <div className="flex items-center justify-between text-xs font-black">
                            <span className="text-[#171717] dark:text-[#f4f4f7]">Comparison vs ChatGPT-4o Baseline Model:</span>
                            <span className={selectedCandidate === 'Alex Rivera' ? 'text-rose-600 font-mono text-sm' : 'text-emerald-600 font-mono text-sm'}>
                              {selectedCandidate === 'Alex Rivera' ? '86.5% HIGH MATCH' : `${plagiarismMatrix.chatgpt?.similarityScore || 24.2}% (Clean)`}
                            </span>
                          </div>
                          <div className="mt-2 h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                            <div
                              className={`h-full transition-all duration-500 ${
                                selectedCandidate === 'Alex Rivera' ? 'bg-rose-500 w-[86.5%]' : 'bg-emerald-500 w-[24.2%]'
                              }`}
                            />
                          </div>
                          <div className="mt-1 flex justify-between text-[9px] font-mono text-[#171717]/60 dark:text-[#a1a1aa]">
                            <span>Token Fingerprint Overlap: {selectedCandidate === 'Alex Rivera' ? '41/48 hashes' : '11/48 hashes'}</span>
                            <span>Threshold: &gt; 70% Flagged</span>
                          </div>
                        </div>

                        {/* vs Claude 3.5 Sonnet */}
                        <div className="rounded-lg border border-[#171717]/15 p-3 dark:border-[#2e323b]">
                          <div className="flex items-center justify-between text-xs font-black">
                            <span className="text-[#171717] dark:text-[#f4f4f7]">Comparison vs Claude 3.5 Sonnet Baseline:</span>
                            <span className="text-emerald-600 font-mono text-sm">
                              {plagiarismMatrix.claude?.similarityScore || 18.5}% (Clean)
                            </span>
                          </div>
                          <div className="mt-2 h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                            <div className="h-full bg-emerald-500 w-[18.5%] transition-all duration-500" />
                          </div>
                          <div className="mt-1 flex justify-between text-[9px] font-mono text-[#171717]/60 dark:text-[#a1a1aa]">
                            <span>Token Fingerprint Overlap: 8/46 hashes</span>
                            <span>Status: Independent logic</span>
                          </div>
                        </div>

                        {/* vs Campus Cohort Peer */}
                        <div className="rounded-lg border border-[#171717]/15 p-3 dark:border-[#2e323b]">
                          <div className="flex items-center justify-between text-xs font-black">
                            <span className="text-[#171717] dark:text-[#f4f4f7]">Comparison vs Campus Cohort (Alex Rivera):</span>
                            <span className={selectedCandidate === 'Alex Rivera' ? 'text-rose-600 font-mono text-sm' : 'text-emerald-600 font-mono text-sm'}>
                              {selectedCandidate === 'Alex Rivera' ? 'COLLUSION CLUSTER DETECTED' : '28.1% (Diverse Code)'}
                            </span>
                          </div>
                          <div className="mt-2 h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                            <div
                              className={`h-full transition-all duration-500 ${
                                selectedCandidate === 'Alex Rivera' ? 'bg-rose-500 w-[82.4%]' : 'bg-emerald-500 w-[28.1%]'
                              }`}
                            />
                          </div>
                          <div className="mt-1 flex justify-between text-[9px] font-mono text-[#171717]/60 dark:text-[#a1a1aa]">
                            <span>Structural Subtree Equivalence: {selectedCandidate === 'Alex Rivera' ? 'Exact AST Branch Match' : 'Zero Collusion'}</span>
                            <span>Cluster Ring: {selectedCandidate === 'Alex Rivera' ? 'Ring #1 (Hostel Node)' : 'Isolated Node'}</span>
                          </div>
                        </div>
                      </div>

                      {/* AI Code Markers & Emojis Audit Section */}
                      <div className="mt-4 rounded-lg border border-[#171717]/20 bg-[#fffaf0] p-3 dark:border-[#2e323b] dark:bg-[#1c1f26]">
                        <div className="flex items-center justify-between">
                          <span className="font-display text-xs uppercase text-[#171717] dark:text-[#f4f4f7]">
                            AI-Code & Emoji Scanner
                          </span>
                          <span className="rounded bg-[#39d5c8]/20 px-2 py-0.5 text-[9px] font-black uppercase text-[#171717] dark:text-[#39d5c8]">
                            Copydetect Heuristics
                          </span>
                        </div>

                        <div className="mt-2 text-xs font-bold space-y-2">
                          <div className="flex items-center justify-between border-b border-[#171717]/10 pb-1.5 dark:border-white/10">
                            <span className="text-[11px] text-[#171717]/70 dark:text-[#a1a1aa]">Detected Emojis in Code/Comments:</span>
                            <span className="font-mono text-xs">
                              {selectedCandidate === 'Alex Rivera' ? (
                                <span className="rounded bg-rose-100 px-1.5 py-0.5 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400">
                                  🚀 ✨ 🤖 (3 Flagged)
                                </span>
                              ) : (
                                <span className="text-emerald-600 dark:text-emerald-400">0 (Clean)</span>
                              )}
                            </span>
                          </div>

                          <div className="flex items-center justify-between border-b border-[#171717]/10 pb-1.5 dark:border-white/10">
                            <span className="text-[11px] text-[#171717]/70 dark:text-[#a1a1aa]">Formulaic Step-by-Step Comments:</span>
                            <span className="font-mono text-xs">
                              {selectedCandidate === 'Alex Rivera' ? (
                                <span className="text-rose-600 dark:text-rose-400 font-bold">5 patterns flagged</span>
                              ) : (
                                <span className="text-emerald-600 dark:text-emerald-400 font-bold">0 patterns</span>
                              )}
                            </span>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-[#171717]/70 dark:text-[#a1a1aa]">Overall Integrity Verdict:</span>
                            <span className={`font-mono text-xs font-black ${selectedCandidate === 'Alex Rivera' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                              {selectedCandidate === 'Alex Rivera' ? '88.5% AI / Plagiarized' : '96.2% Organic Human'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Normalized Code Token Sample */}
                    <div className="rounded-xl border border-[#171717] bg-[#171717] p-3 font-mono text-xs text-white">
                      <div className="text-[10px] font-bold text-[#39d5c8] uppercase">
                        Codeforces Normalized Abstract Syntax Token Stream:
                      </div>
                      <div className="mt-1 text-[11px] text-[#ffd84d] break-all leading-tight opacity-90">
                        {winnowingEngineRef.current.normalizeCode(answers[1] ?? activeQuestions[1].defaultValue ?? '').slice(0, 180)}...
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: CAMPUS PLACEMENT INTEGRITY CERTIFICATE */}
                {adminActiveTab === 'certificate' && (
                  <div className="mt-4 rounded-xl border-4 border-[#171717] bg-white p-6 shadow-hard dark:border-[#2e323b] dark:bg-[#15171c]">
                    <div className="flex items-center justify-between border-b-2 border-[#171717] pb-4 dark:border-white/10">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-[#6d73ff]">
                          INSTITUTIONAL ACCREDITATION
                        </span>
                        <h4 className="font-display text-2xl uppercase text-[#171717] dark:text-[#f4f4f7]">
                          Campus Placement Integrity Certificate
                        </h4>
                      </div>
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-[#171717] bg-[#ffd84d] dark:border-[#000000]">
                        <ShieldCheck className="h-7 w-7 text-[#171717]" />
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-bold">
                      <div className="rounded-lg border border-[#171717]/15 p-2.5 dark:border-[#2e323b]">
                        <span className="text-[10px] text-[#171717]/60 dark:text-[#a1a1aa] uppercase block">Candidate Name</span>
                        <span className="text-sm font-black text-[#171717] dark:text-white">{selectedCandidate}</span>
                      </div>
                      <div className="rounded-lg border border-[#171717]/15 p-2.5 dark:border-[#2e323b]">
                        <span className="text-[10px] text-[#171717]/60 dark:text-[#a1a1aa] uppercase block">Cryptographic Session SHA-256</span>
                        <span className="font-mono text-[10px] text-[#6d73ff] truncate block">e3b0c44298fc1c149afbf4c8996fb92427ae41e4</span>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2 text-xs font-bold">
                      <div className="flex items-center justify-between border-b border-[#171717]/10 py-1.5 dark:border-[#2e323b]">
                        <span className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-emerald-600" /> Fullscreen Enforcement & Tab Lock
                        </span>
                        <span className="font-mono text-emerald-600">PASS (100% Locked)</span>
                      </div>
                      <div className="flex items-center justify-between border-b border-[#171717]/10 py-1.5 dark:border-[#2e323b]">
                        <span className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-emerald-600" /> Display Guard (Dual-Monitor Screening)
                        </span>
                        <span className="font-mono text-emerald-600">PASS (Single Display)</span>
                      </div>
                      <div className="flex items-center justify-between border-b border-[#171717]/10 py-1.5 dark:border-[#2e323b]">
                        <span className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-emerald-600" /> Mobile Desk Cam QR Companion (Lap Shield)
                        </span>
                        <span className="font-mono text-emerald-600">PASS (Active Desk View)</span>
                      </div>
                      <div className="flex items-center justify-between border-b border-[#171717]/10 py-1.5 dark:border-[#2e323b]">
                        <span className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-emerald-600" /> Keystroke Biometrics & Burst Entropy
                        </span>
                        <span className="font-mono text-emerald-600">
                          {selectedCandidate === 'Alex Rivera' ? 'FAIL (Burst Paste)' : 'PASS (96% Organic Human)'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-b border-[#171717]/10 py-1.5 dark:border-[#2e323b]">
                        <span className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-emerald-600" /> Codeforces AST Winnowing Similarity
                        </span>
                        <span className={`font-mono ${selectedCandidate === 'Alex Rivera' ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {selectedCandidate === 'Alex Rivera' ? 'FLAGGED (82.4% Collusion)' : 'PASS (24.2% Clean)'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1.5">
                        <span className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-emerald-600" /> AI Eye & Gaze Tracking Compliance
                        </span>
                        <span className={`font-mono ${selectedCandidate === 'Alex Rivera' ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {selectedCandidate === 'Alex Rivera' ? 'REVIEW (3 Gaze Deviations)' : 'PASS (98% Gaze Centered)'}
                        </span>
                      </div>
                    </div>

                    <div className="mt-5 flex gap-2">
                      <button
                        onClick={() => alert(`Official Campus Placement Verification Certificate for ${selectedCandidate} exported with Cryptographic Hash.`)}
                        className="btn-neo btn-neo-lemon flex-1 py-2 text-xs flex items-center justify-center gap-1.5"
                      >
                        <FileCheck className="h-3.5 w-3.5" />
                        <span>Download Verifiable Certificate</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* QR Mobile Companion Cam Modal (Campus Zero-Hardware Feature) */}
        {showQrModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-2xl border-4 border-[#171717] bg-[#fffaf0] p-6 text-[#171717] shadow-hard-lg dark:border-[#2e323b] dark:bg-[#15171c] dark:text-[#f4f4f7]">
              <div className="flex items-center justify-between border-b-2 border-[#171717] pb-3 dark:border-white/10">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5 text-[#6d73ff]" />
                  <h3 className="font-display text-xl uppercase">Mobile Desk Cam (QR)</h3>
                </div>
                <button
                  onClick={() => setShowQrModal(false)}
                  className="cursor-pointer text-xs font-black uppercase hover:text-rose-500"
                >
                  ✕ Close
                </button>
              </div>

              <div className="mt-4 text-center">
                <p className="text-xs font-bold leading-relaxed text-[#171717]/80 dark:text-[#a1a1aa]">
                  Zero Hardware Setup: Scan this QR code using your smartphone camera to connect an instant side-angle desk and keyboard view. Prevents lap phones or off-screen prompting!
                </p>

                {/* SVG Simulated QR Code */}
                <div className="mx-auto my-4 flex h-48 w-48 items-center justify-center rounded-2xl border-3 border-[#171717] bg-white p-3 shadow-[3px_3px_0_#171717] dark:border-white/20">
                  <svg viewBox="0 0 100 100" className="h-full w-full">
                    {/* QR Code Matrix Elements */}
                    <rect x="5" y="5" width="28" height="28" fill="#171717" />
                    <rect x="9" y="9" width="20" height="20" fill="white" />
                    <rect x="13" y="13" width="12" height="12" fill="#171717" />

                    <rect x="67" y="5" width="28" height="28" fill="#171717" />
                    <rect x="71" y="9" width="20" height="20" fill="white" />
                    <rect x="75" y="13" width="12" height="12" fill="#171717" />

                    <rect x="5" y="67" width="28" height="28" fill="#171717" />
                    <rect x="9" y="71" width="20" height="20" fill="white" />
                    <rect x="13" y="75" width="12" height="12" fill="#171717" />

                    {/* QR Data Pattern */}
                    <rect x="40" y="8" width="6" height="6" fill="#171717" />
                    <rect x="50" y="8" width="6" height="6" fill="#171717" />
                    <rect x="40" y="20" width="6" height="6" fill="#171717" />
                    <rect x="50" y="26" width="6" height="6" fill="#171717" />
                    <rect x="10" y="42" width="6" height="6" fill="#171717" />
                    <rect x="25" y="42" width="6" height="6" fill="#171717" />
                    <rect x="40" y="42" width="18" height="18" fill="#6d73ff" />
                    <rect x="65" y="42" width="8" height="8" fill="#171717" />
                    <rect x="80" y="42" width="8" height="8" fill="#171717" />
                    <rect x="40" y="70" width="6" height="6" fill="#171717" />
                    <rect x="50" y="80" width="6" height="6" fill="#171717" />
                    <rect x="70" y="70" width="14" height="14" fill="#171717" />
                  </svg>
                </div>

                <div className="rounded-xl border border-[#171717]/15 bg-[#fff0c2] p-2.5 text-[11px] font-bold text-[#171717]">
                  <span>🔐 WebRTC P2P Session ID:</span>{' '}
                  <span className="font-mono font-black">HM-CAMPUS-702X</span>
                </div>

                <button
                  onClick={() => {
                    setQrCompanionActive(true)
                    setShowQrModal(false)
                  }}
                  className="btn-neo btn-neo-lemon mt-4 w-full py-2.5 text-xs uppercase"
                >
                  Simulate Phone Connected (Pair Desk Cam)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
