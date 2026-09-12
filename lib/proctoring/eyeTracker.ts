/**
 * HiringMates Real-Time Eye & Gaze Tracking Engine
 * Inspired by WebGazer.js and OpenCV pupil centroid differential tracking.
 * 
 * Features:
 * - Real-time webcam frame canvas analysis
 * - Pupil centroid calculation & gaze vector estimation
 * - Detects: CENTER, LOOKING_DOWN (phone in lap), LOOKING_LEFT, LOOKING_RIGHT, LOOKING_AWAY
 * - Anti-false-positive temporal accumulator (1.8s threshold)
 * - 3-warning strike manager with auto-termination callback
 */

export type GazeDirection = 'CENTER' | 'LOOKING_DOWN' | 'LOOKING_LEFT' | 'LOOKING_RIGHT' | 'LOOKING_AWAY'

export interface GazeStatus {
  direction: GazeDirection
  confidence: number // 0 to 100
  horizontalOffset: number // -1.0 (far left) to +1.0 (far right)
  verticalOffset: number // -1.0 (far up) to +1.0 (far down)
  faceDetected: boolean
  warningCount: number
  isSustainedDeviation: boolean
}

export class EyeTrackerEngine {
  private videoElement: HTMLVideoElement | null = null
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private animFrameId: number | null = null
  private isRunning = false

  // Tracking state
  private currentDirection: GazeDirection = 'CENTER'
  private deviationStartTime = 0
  private lastStrikeTime = 0
  private warningCount = 0
  private maxWarnings = 3
  private sustainedDurationMs = 1800 // 1.8 seconds continuous deviation required to strike

  // Callbacks
  private onGazeUpdate?: (status: GazeStatus) => void
  private onWarning?: (warningCount: number, direction: GazeDirection) => void
  private onTerminated?: (reason: string) => void

  constructor(options?: {
    maxWarnings?: number
    sustainedDurationMs?: number
    onGazeUpdate?: (status: GazeStatus) => void
    onWarning?: (warningCount: number, direction: GazeDirection) => void
    onTerminated?: (reason: string) => void
  }) {
    if (options?.maxWarnings) this.maxWarnings = options.maxWarnings
    if (options?.sustainedDurationMs) this.sustainedDurationMs = options.sustainedDurationMs
    if (options?.onGazeUpdate) this.onGazeUpdate = options.onGazeUpdate
    if (options?.onWarning) this.onWarning = options.onWarning
    if (options?.onTerminated) this.onTerminated = options.onTerminated
  }

  public resetWarnings() {
    this.warningCount = 0
    this.deviationStartTime = 0
    this.currentDirection = 'CENTER'
  }

  public getWarningCount(): number {
    return this.warningCount
  }

  /**
   * Starts tracking webcam video feed
   */
  public start(video: HTMLVideoElement) {
    if (this.isRunning) return
    this.videoElement = video
    this.canvas = document.createElement('canvas')
    this.canvas.width = 160 // downscaled for 30+ FPS efficiency
    this.canvas.height = 120
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })
    this.isRunning = true
    this.deviationStartTime = 0

    const processLoop = () => {
      if (!this.isRunning) return
      this.analyzeFrame()
      this.animFrameId = requestAnimationFrame(processLoop)
    }
    this.animFrameId = requestAnimationFrame(processLoop)
  }

  public stop() {
    this.isRunning = false
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }
    this.canvas = null
    this.ctx = null
    this.videoElement = null
  }

  /**
   * Computer vision frame analysis:
   * 1. Extracts luminance and brightness gradients
   * 2. Isolates upper-face eye band
   * 3. Calculates pupil centroid coordinates relative to eye bounding box
   */
  private analyzeFrame() {
    if (!this.videoElement || !this.ctx || !this.canvas) return
    if (this.videoElement.readyState < 2) return

    const width = this.canvas.width
    const height = this.canvas.height

    try {
      this.ctx.drawImage(this.videoElement, 0, 0, width, height)
      const frame = this.ctx.getImageData(0, 0, width, height)
      const data = frame.data

      // Check for presence of candidate face
      let totalLuma = 0
      let skinPixels = 0
      for (let i = 0; i < data.length; i += 16) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        const luma = 0.299 * r + 0.587 * g + 0.114 * b
        totalLuma += luma

        // Simplified skin tone gamut check in RGB space
        if (r > 60 && g > 40 && b > 20 && r > b && r - g > 10) {
          skinPixels++
        }
      }

      const totalSamples = data.length / 16
      const skinRatio = skinPixels / totalSamples

      if (skinRatio < 0.08) {
        // Face is completely missing or camera covered
        this.evaluateGaze('LOOKING_AWAY', 0, 0, false)
        return
      }

      // Eye Region of Interest (ROI): Upper middle band (25% to 55% vertical height)
      const eyeMinY = Math.floor(height * 0.25)
      const eyeMaxY = Math.floor(height * 0.55)
      const eyeMinX = Math.floor(width * 0.20)
      const eyeMaxX = Math.floor(width * 0.80)

      let darkestVal = 255
      let pupilSumX = 0
      let pupilSumY = 0
      let pupilCount = 0

      // First pass: locate darkest cluster (pupil / iris)
      for (let y = eyeMinY; y < eyeMaxY; y += 2) {
        for (let x = eyeMinX; x < eyeMaxX; x += 2) {
          const idx = (y * width + x) * 4
          const luma = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
          if (luma < darkestVal) {
            darkestVal = luma
          }
        }
      }

      // Second pass: centroid of pupil region (pixels within threshold of darkest)
      const pupilThreshold = darkestVal + 30
      for (let y = eyeMinY; y < eyeMaxY; y += 2) {
        for (let x = eyeMinX; x < eyeMaxX; x += 2) {
          const idx = (y * width + x) * 4
          const luma = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
          if (luma <= pupilThreshold) {
            pupilSumX += x
            pupilSumY += y
            pupilCount++
          }
        }
      }

      if (pupilCount === 0) {
        this.evaluateGaze('CENTER', 0, 0, true)
        return
      }

      const avgPupilX = pupilSumX / pupilCount
      const avgPupilY = pupilSumY / pupilCount

      // Normalize offsets: -1.0 to +1.0
      const centerX = (eyeMinX + eyeMaxX) / 2
      const centerY = (eyeMinY + eyeMaxY) / 2
      const hRange = (eyeMaxX - eyeMinX) / 2
      const vRange = (eyeMaxY - eyeMinY) / 2

      const hOffset = Math.max(-1, Math.min(1, (avgPupilX - centerX) / hRange))
      const vOffset = Math.max(-1, Math.min(1, (avgPupilY - centerY) / vRange))

      // Gaze classification thresholds:
      // In webcams (mirrored):
      // hOffset < -0.32: looking to candidate's right (our left)
      // hOffset > +0.32: looking to candidate's left (our right)
      // vOffset > +0.28: looking down towards desk/lap/phone
      let direction: GazeDirection = 'CENTER'

      if (vOffset > 0.28) {
        direction = 'LOOKING_DOWN'
      } else if (hOffset < -0.35) {
        direction = 'LOOKING_LEFT'
      } else if (hOffset > 0.35) {
        direction = 'LOOKING_RIGHT'
      } else {
        direction = 'CENTER'
      }

      this.evaluateGaze(direction, hOffset, vOffset, true)
    } catch {
      // Fallback
    }
  }

  /**
   * Debounces eye direction and triggers strikes upon sustained deviation
   */
  private evaluateGaze(direction: GazeDirection, hOffset: number, vOffset: number, faceDetected: boolean) {
    const now = Date.now()
    this.currentDirection = direction

    const isDeviation = direction !== 'CENTER'

    if (isDeviation) {
      if (this.deviationStartTime === 0) {
        this.deviationStartTime = now
      }

      const elapsed = now - this.deviationStartTime
      const isSustained = elapsed >= this.sustainedDurationMs

      // Fire status update to UI
      this.onGazeUpdate?.({
        direction,
        confidence: Math.round(Math.min(99, 70 + Math.abs(hOffset + vOffset) * 25)),
        horizontalOffset: Math.round(hOffset * 100) / 100,
        verticalOffset: Math.round(vOffset * 100) / 100,
        faceDetected,
        warningCount: this.warningCount,
        isSustainedDeviation: isSustained,
      })

      // Trigger warning strike if sustained and not recently struck (cooldown 3.5s)
      if (isSustained && now - this.lastStrikeTime > 3500) {
        this.lastStrikeTime = now
        this.warningCount++

        if (this.warningCount <= this.maxWarnings) {
          this.onWarning?.(this.warningCount, direction)
        } else {
          // Exceeded 3 warnings: Instant Disqualification
          const reason = `Session Terminated: Exceeded 3 eye gaze deviation warnings (${direction.replace('_', ' ')} detected).`
          this.onTerminated?.(reason)
        }
      }
    } else {
      // Returned to center
      this.deviationStartTime = 0
      this.onGazeUpdate?.({
        direction: 'CENTER',
        confidence: 96,
        horizontalOffset: hOffset,
        verticalOffset: vOffset,
        faceDetected: true,
        warningCount: this.warningCount,
        isSustainedDeviation: false,
      })
    }
  }
}
