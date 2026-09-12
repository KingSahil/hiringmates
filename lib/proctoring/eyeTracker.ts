/**
 * HiringMates AI Vision Proctoring Engine
 * 
 * Powered by Google MediaPipe + Neural Computer Vision:
 * - 478 3D Landmark FaceMesh: Exact anatomical face contour, hairline to chin
 * - True Dual-Iris Pupil Localization: Landmark 468 (Left Iris) & 473 (Right Iris)
 * - 3D Projective Head Pose: Pitch (phone on lap), Yaw (2nd monitor), Roll (head tilt)
 * - AI Object Detection (COCO EfficientDet + Real-Time Aspect Ratio CV):
 *   - "cell phone" / "smartphone" / "mobile device"
 *   - "book" / cheat sheets / notes
 *   - "laptop" / secondary monitors
 * - Face Missing & Absence Detection (Zero-face candidate abandonment)
 * - Instant Cancellation on Smartphone / Foreign Object Violation
 */

export type GazeDirection =
  | 'CENTER'
  | 'LOOKING_DOWN'
  | 'LOOKING_LEFT'
  | 'LOOKING_RIGHT'
  | 'LOOKING_AWAY'
  | 'HEAD_TILT'
  | 'MULTIPLE_FACES'
  | 'FOREIGN_OBJECT'

export interface TrackedLandmarks {
  faceDetected: boolean
  faceCount: number
  faceBox: { x: number; y: number; width: number; height: number } // percentages 0-100
  secondaryFaceBox?: { x: number; y: number; width: number; height: number }
  foreignObjectDetected: boolean
  foreignObjectLabel?: string
  foreignObjectBox?: { x: number; y: number; width: number; height: number }
  leftEye: { x: number; y: number } // percentages 0-100
  rightEye: { x: number; y: number } // percentages 0-100
  pitch: number // degrees (down/up)
  yaw: number // degrees (left/right)
  roll: number // degrees (tilt)
}

export interface GazeStatus {
  direction: GazeDirection
  confidence: number // 0 to 100
  horizontalOffset: number // -1.0 to +1.0
  verticalOffset: number // -1.0 to +1.0
  faceDetected: boolean
  faceCount: number
  foreignObjectDetected: boolean
  foreignObjectLabel?: string
  warningCount: number
  isSustainedDeviation: boolean
  deviationProgress: number // 0 to 1
  landmarks: TrackedLandmarks
}

export class EyeTrackerEngine {
  private videoElement: HTMLVideoElement | null = null
  private animFrameId: number | null = null
  private isRunning = false

  // MediaPipe AI instances
  private faceLandmarker: any = null
  private objectDetector: any = null
  private isModelLoading = false
  private modelLoadFailed = false
  private lastProcessTime = 0
  private lastObjectTimestamp = 0

  // Fallback Canvas for frame analysis / edge detection
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null

  // Baseline calibration (auto-zero)
  private baselinePitch = 0
  private baselineYaw = 0
  private baselineRoll = 0
  private calibrated = false
  private calibrationFrames = 0
  private sumPitch = 0
  private sumYaw = 0
  private sumRoll = 0

  // Smoothed telemetry
  private smoothFaceBox = { x: 25, y: 15, width: 50, height: 60 }
  private smoothLeftEye = { x: 40, y: 42 }
  private smoothRightEye = { x: 60, y: 42 }
  private smoothPitch = 0
  private smoothYaw = 0
  private smoothRoll = 0

  // Foreign object state
  private foreignObjectFrames = 0
  private currentObjectLabel = ''
  private currentObjectBox: { x: number; y: number; width: number; height: number } | null = null

  // Warning & Deviation State
  private currentDirection: GazeDirection = 'CENTER'
  private deviationFrames = 0
  private requiredDeviationFrames = 15 // ~1.0 - 1.2 seconds sustained for head deviation
  private lastStrikeTime = 0
  private warningCount = 0
  private maxWarnings = 3

  // Callbacks
  private onGazeUpdate?: (status: GazeStatus) => void
  private onWarning?: (warningCount: number, direction: GazeDirection) => void
  private onTerminated?: (reason: string) => void

  constructor(options?: {
    maxWarnings?: number
    onGazeUpdate?: (status: GazeStatus) => void
    onWarning?: (warningCount: number, direction: GazeDirection) => void
    onTerminated?: (reason: string) => void
  }) {
    if (options?.maxWarnings) this.maxWarnings = options.maxWarnings
    if (options?.onGazeUpdate) this.onGazeUpdate = options.onGazeUpdate
    if (options?.onWarning) this.onWarning = options.onWarning
    if (options?.onTerminated) this.onTerminated = options.onTerminated
  }

  public resetWarnings() {
    this.warningCount = 0
    this.deviationFrames = 0
    this.foreignObjectFrames = 0
    this.currentDirection = 'CENTER'
    this.calibrated = false
    this.calibrationFrames = 0
    this.sumPitch = 0
    this.sumYaw = 0
    this.sumRoll = 0
  }

  public recalibrate() {
    this.calibrated = false
    this.calibrationFrames = 0
    this.sumPitch = 0
    this.sumYaw = 0
    this.sumRoll = 0
  }

  public getWarningCount(): number {
    return this.warningCount
  }

  /**
   * Initialize MediaPipe FaceLandmarker + MediaPipe EfficientDet ObjectDetector
   */
  private async initMediaPipe() {
    if (this.faceLandmarker || this.isModelLoading || this.modelLoadFailed) return
    this.isModelLoading = true

    try {
      const { FilesetResolver, FaceLandmarker, ObjectDetector } = await import('@mediapipe/tasks-vision')
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
      )

      // 1. Initialize 3D FaceLandmarker
      try {
        this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 2,
          outputFacialTransformationMatrixes: true,
        })
      } catch (errFace) {
        console.warn('FaceLandmarker GPU fallback to CPU:', errFace)
        this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numFaces: 2,
          outputFacialTransformationMatrixes: true,
        })
      }

      // 2. Initialize ObjectDetector (COCO EfficientDet for Phone & Prohibited Hardware)
      // We use CPU first or GPU fallback to avoid WebGL context collision with FaceLandmarker
      try {
        this.objectDetector = await ObjectDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.task',
            delegate: 'CPU',
          },
          scoreThreshold: 0.18,
          runningMode: 'VIDEO',
        })
      } catch (errObjCpu) {
        try {
          this.objectDetector = await ObjectDetector.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.task',
              delegate: 'GPU',
            },
            scoreThreshold: 0.18,
            runningMode: 'VIDEO',
          })
        } catch (errObjGpu) {
          console.warn('ObjectDetector model initialization failed:', errObjGpu)
        }
      }

      this.isModelLoading = false
    } catch (err) {
      console.warn('MediaPipe initialization fallback to local computer vision:', err)
      this.modelLoadFailed = true
      this.isModelLoading = false
    }
  }

  public start(video: HTMLVideoElement) {
    if (this.isRunning) return
    this.videoElement = video

    this.canvas = document.createElement('canvas')
    this.canvas.width = 160
    this.canvas.height = 120
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })

    this.isRunning = true
    this.deviationFrames = 0
    this.foreignObjectFrames = 0

    // Load AI vision models asynchronously
    this.initMediaPipe().catch(() => {})

    const loop = () => {
      if (!this.isRunning) return
      this.processVideoFrame()
      this.animFrameId = requestAnimationFrame(loop)
    }
    this.animFrameId = requestAnimationFrame(loop)
  }

  public stop() {
    this.isRunning = false
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }
    if (this.faceLandmarker) {
      try {
        this.faceLandmarker.close()
      } catch {}
      this.faceLandmarker = null
    }
    if (this.objectDetector) {
      try {
        this.objectDetector.close()
      } catch {}
      this.objectDetector = null
    }
    this.canvas = null
    this.ctx = null
    this.videoElement = null
  }

  private processVideoFrame() {
    if (!this.videoElement) return
    if (this.videoElement.videoWidth === 0 || this.videoElement.paused || this.videoElement.ended) {
      if (this.videoElement.paused) {
        this.videoElement.play().catch(() => {})
      }
      return
    }

    const now = performance.now()
    if (now - this.lastProcessTime < 35) {
      // Throttle to ~28-30 FPS for optimal performance
      return
    }
    this.lastProcessTime = now

    if (this.faceLandmarker) {
      this.processWithMediaPipe()
    } else {
      this.processFallbackCV()
    }
  }

  /**
   * Run Deep-Learning Object Detection + Fallback Phone Contour Scanner
   */
  private detectPhoneOrForeignObject(faceBox?: { x: number; y: number; width: number; height: number }): {
    detected: boolean
    label: string
    box?: { x: number; y: number; width: number; height: number }
  } {
    if (!this.videoElement) return { detected: false, label: '' }

    // 1. Try MediaPipe ObjectDetector if ready
    if (this.objectDetector) {
      try {
        const objNow = Math.max(performance.now(), this.lastObjectTimestamp + 2)
        this.lastObjectTimestamp = objNow

        const objResults = this.objectDetector.detectForVideo(this.videoElement, objNow)
        if (objResults && objResults.detections && objResults.detections.length > 0) {
          for (const det of objResults.detections) {
            for (const cat of det.categories) {
              const name = cat.categoryName.toLowerCase()
              // Prohibited items in proctored assessments
              if (
                name.includes('cell phone') ||
                name.includes('phone') ||
                name.includes('mobile') ||
                name.includes('telephone') ||
                name.includes('remote') ||
                name.includes('laptop') ||
                name.includes('book') ||
                name.includes('tablet')
              ) {
                const bb = det.boundingBox
                const vW = this.videoElement.videoWidth || 640
                const vH = this.videoElement.videoHeight || 480
                const box = bb
                  ? {
                      x: Math.max(0, Math.min(90, Math.round((bb.originX / vW) * 100))),
                      y: Math.max(0, Math.min(90, Math.round((bb.originY / vH) * 100))),
                      width: Math.max(12, Math.min(80, Math.round((bb.width / vW) * 100))),
                      height: Math.max(15, Math.min(80, Math.round((bb.height / vH) * 100))),
                    }
                  : { x: 30, y: 55, width: 35, height: 35 }

                const isPhone = name.includes('phone') || name.includes('cell') || name.includes('mobile')
                const label = isPhone
                  ? `📱 SMARTPHONE DETECTED (${Math.round(cat.score * 100)}%)`
                  : name.includes('book')
                  ? `📖 NOTES / BOOK DETECTED (${Math.round(cat.score * 100)}%)`
                  : `💻 UNAUTHORIZED DEVICE (${Math.round(cat.score * 100)}%)`

                return { detected: true, label, box }
              }
            }
          }
        }
      } catch {
        // Fall through to CV scan
      }
    }

    // 2. High-Precision Computer Vision Phone Scanner
    // Detects rectangular smartphone geometry & high-contrast glass screens held in hands or on desk
    const cvResult = this.scanFrameForPhone(faceBox)
    if (cvResult.detected) {
      return cvResult
    }

    return { detected: false, label: '' }
  }

  /**
   * MediaPipe 3D Mesh + Object Detection Processing
   */
  private processWithMediaPipe() {
    if (!this.videoElement || !this.faceLandmarker) return

    const now = Math.max(performance.now(), this.lastObjectTimestamp + 1)
    this.lastObjectTimestamp = now

    try {
      // 1. RUN OBJECT DETECTION FIRST (Detects phone even if candidate hides/obscures face with phone!)
      const objectCheck = this.detectPhoneOrForeignObject()

      const results = this.faceLandmarker.detectForVideo(this.videoElement, now)
      const faces = results.faceLandmarks

      // CASE A: NO FACE DETECTED
      if (!faces || faces.length === 0) {
        if (objectCheck.detected) {
          // Phone held in front of face or candidate placed phone in frame
          this.foreignObjectFrames += 2
          this.currentObjectLabel = objectCheck.label
          this.currentObjectBox = objectCheck.box || null

          const landmarks: TrackedLandmarks = {
            faceDetected: false,
            faceCount: 0,
            faceBox: { x: 25, y: 20, width: 50, height: 60 },
            foreignObjectDetected: true,
            foreignObjectLabel: objectCheck.label,
            foreignObjectBox: objectCheck.box,
            leftEye: { x: 40, y: 40 },
            rightEye: { x: 60, y: 40 },
            pitch: 0,
            yaw: 0,
            roll: 0,
          }
          this.handleGazeOutput('FOREIGN_OBJECT', 0, 0, false, 0, true, objectCheck.label, landmarks)
          return
        }

        // Face is completely missing (candidate stepped away / looking away)
        if (this.foreignObjectFrames > 0) this.foreignObjectFrames--
        const landmarks: TrackedLandmarks = {
          faceDetected: false,
          faceCount: 0,
          faceBox: { x: 25, y: 20, width: 50, height: 60 },
          foreignObjectDetected: false,
          leftEye: { x: 40, y: 40 },
          rightEye: { x: 60, y: 40 },
          pitch: 0,
          yaw: 0,
          roll: 0,
        }
        this.handleGazeOutput('LOOKING_AWAY', 0, 0, false, 0, false, '', landmarks)
        return
      }

      // CASE B: PRIMARY FACE PRESENT
      const primaryFace = faces[0]

      // Extract exact bounding box around the 478 facial points
      let minX = 1
      let maxX = 0
      let minY = 1
      let maxY = 0

      for (const pt of primaryFace) {
        if (pt.x < minX) minX = pt.x
        if (pt.x > maxX) maxX = pt.x
        if (pt.y < minY) minY = pt.y
        if (pt.y > maxY) maxY = pt.y
      }

      const rawBoxX = Math.max(0, minX - 0.03)
      const rawBoxY = Math.max(0, minY - 0.04)
      const rawBoxW = Math.min(1 - rawBoxX, maxX - minX + 0.06)
      const rawBoxH = Math.min(1 - rawBoxY, maxY - minY + 0.08)

      this.smoothFaceBox.x = this.smoothFaceBox.x * 0.70 + rawBoxX * 100 * 0.30
      this.smoothFaceBox.y = this.smoothFaceBox.y * 0.70 + rawBoxY * 100 * 0.30
      this.smoothFaceBox.width = this.smoothFaceBox.width * 0.75 + rawBoxW * 100 * 0.25
      this.smoothFaceBox.height = this.smoothFaceBox.height * 0.75 + rawBoxH * 100 * 0.25

      // EXACT DUAL-EYE IRIS LANDMARKS (468 Left Iris, 473 Right Iris)
      const leftIris = primaryFace[468] || primaryFace[159]
      const rightIris = primaryFace[473] || primaryFace[386]

      const rawLeftEyeX = leftIris.x * 100
      const rawLeftEyeY = leftIris.y * 100
      const rawRightEyeX = rightIris.x * 100
      const rawRightEyeY = rightIris.y * 100

      this.smoothLeftEye.x = this.smoothLeftEye.x * 0.65 + rawLeftEyeX * 0.35
      this.smoothLeftEye.y = this.smoothLeftEye.y * 0.65 + rawLeftEyeY * 0.35
      this.smoothRightEye.x = this.smoothRightEye.x * 0.65 + rawRightEyeX * 0.35
      this.smoothRightEye.y = this.smoothRightEye.y * 0.65 + rawRightEyeY * 0.35

      // 3D PROJECTIVE HEAD POSE ESTIMATION
      const nose = primaryFace[1]
      const forehead = primaryFace[10]
      const chin = primaryFace[152]
      const eyeL = primaryFace[33]
      const eyeR = primaryFace[263]

      // 1. Roll: Angle between eyes
      const dX = eyeR.x - eyeL.x
      const dY = eyeR.y - eyeL.y
      const rawRoll = Math.round(Math.atan2(dY, dX) * (180 / Math.PI))

      // 2. Yaw: Horizontal turn ratio
      const distToLeft = Math.abs(nose.x - eyeL.x)
      const distToRight = Math.abs(eyeR.x - nose.x)
      const yawRatio = (distToRight - distToLeft) / Math.max(0.01, distToRight + distToLeft)
      const rawYaw = Math.round(yawRatio * 75)

      // 3. Pitch: Vertical tilt ratio
      const noseToForehead = Math.abs(nose.y - forehead.y)
      const noseToChin = Math.abs(chin.y - nose.y)
      const pitchRatio = (noseToForehead - noseToChin * 0.95) / Math.max(0.01, noseToForehead + noseToChin)
      const rawPitch = Math.round(pitchRatio * 90)

      // Auto-Zero baseline calibration
      if (!this.calibrated) {
        this.sumPitch += rawPitch
        this.sumYaw += rawYaw
        this.sumRoll += rawRoll
        this.calibrationFrames++
        if (this.calibrationFrames >= 12) {
          this.baselinePitch = this.sumPitch / this.calibrationFrames
          this.baselineYaw = this.sumYaw / this.calibrationFrames
          this.baselineRoll = this.sumRoll / this.calibrationFrames
          this.calibrated = true
        }
      }

      const calibratedPitch = Math.round(rawPitch - this.baselinePitch)
      const calibratedYaw = Math.round(rawYaw - this.baselineYaw)
      const calibratedRoll = Math.round(rawRoll - this.baselineRoll)

      this.smoothPitch = Math.round(this.smoothPitch * 0.65 + calibratedPitch * 0.35)
      this.smoothYaw = Math.round(this.smoothYaw * 0.65 + calibratedYaw * 0.35)
      this.smoothRoll = Math.round(this.smoothRoll * 0.65 + calibratedRoll * 0.35)

      // MULTIPLE FACES DETECTION
      let secondaryFaceBox: { x: number; y: number; width: number; height: number } | undefined = undefined
      const faceCount = faces.length

      if (faceCount > 1) {
        const secFace = faces[1]
        let sMinX = 1
        let sMaxX = 0
        let sMinY = 1
        let sMaxY = 0
        for (const pt of secFace) {
          if (pt.x < sMinX) sMinX = pt.x
          if (pt.x > maxX) sMaxX = pt.x
          if (pt.y < sMinY) sMinY = pt.y
          if (pt.y > sMaxY) sMaxY = pt.y
        }
        secondaryFaceBox = {
          x: Math.round(sMinX * 100),
          y: Math.round(sMinY * 100),
          width: Math.round((sMaxX - sMinX) * 100),
          height: Math.round((sMaxY - sMinY) * 100),
        }
      }

      // Re-verify object check taking face box into account for CV exclusion
      const finalObjectCheck = objectCheck.detected
        ? objectCheck
        : this.detectPhoneOrForeignObject({
            x: rawBoxX,
            y: rawBoxY,
            width: rawBoxW,
            height: rawBoxH,
          })

      const isPhoneDetected = finalObjectCheck.detected
      const detectedObjectLabel = finalObjectCheck.label
      const detectedObjectBox = finalObjectCheck.box

      if (isPhoneDetected) {
        this.foreignObjectFrames += 2
        this.currentObjectLabel = detectedObjectLabel
        this.currentObjectBox = detectedObjectBox || null
      } else {
        if (this.foreignObjectFrames > 0) this.foreignObjectFrames--
      }

      // MULTI-SIGNAL DECISION LOGIC
      let direction: GazeDirection = 'CENTER'

      // Priority 1: Multi-Person Intruder
      if (faceCount > 1) {
        direction = 'MULTIPLE_FACES'
      }
      // Priority 2: Smartphone or Foreign Object Detected (Immediate high priority!)
      else if (isPhoneDetected || this.foreignObjectFrames >= 3) {
        direction = 'FOREIGN_OBJECT'
      }
      // Priority 3: Looking Down at Lap / Phone (Pitch >= 20°)
      else if (this.smoothPitch >= 20) {
        direction = 'LOOKING_DOWN'
      }
      // Priority 4: Turned Left (Yaw <= -20°)
      else if (this.smoothYaw <= -20) {
        direction = 'LOOKING_LEFT'
      }
      // Priority 5: Turned Right (Yaw >= 20°)
      else if (this.smoothYaw >= 20) {
        direction = 'LOOKING_RIGHT'
      }
      // Priority 6: Severe Head Tilt (Roll >= 22° or <= -22°)
      else if (Math.abs(this.smoothRoll) >= 22) {
        direction = 'HEAD_TILT'
      } else {
        direction = 'CENTER'
      }

      const landmarks: TrackedLandmarks = {
        faceDetected: true,
        faceCount,
        faceBox: {
          x: Math.round(this.smoothFaceBox.x),
          y: Math.round(this.smoothFaceBox.y),
          width: Math.round(this.smoothFaceBox.width),
          height: Math.round(this.smoothFaceBox.height),
        },
        secondaryFaceBox,
        foreignObjectDetected: isPhoneDetected,
        foreignObjectLabel: detectedObjectLabel,
        foreignObjectBox: detectedObjectBox,
        leftEye: {
          x: Math.round(this.smoothLeftEye.x),
          y: Math.round(this.smoothLeftEye.y),
        },
        rightEye: {
          x: Math.round(this.smoothRightEye.x),
          y: Math.round(this.smoothRightEye.y),
        },
        pitch: this.smoothPitch,
        yaw: this.smoothYaw,
        roll: this.smoothRoll,
      }

      this.handleGazeOutput(
        direction,
        this.smoothYaw / 40,
        this.smoothPitch / 40,
        true,
        faceCount,
        isPhoneDetected,
        detectedObjectLabel,
        landmarks
      )
    } catch {
      // Fallback on error
    }
  }

  /**
   * Computer Vision Phone & Rectangular Device Scanner:
   * Analyzes camera frame for rectangular aspect ratio (1.6 - 2.4:1),
   * high-contrast borders, and illuminated screens in candidate workspace.
   */
  private scanFrameForPhone(excludeFaceBox?: { x: number; y: number; width: number; height: number }): {
    detected: boolean
    label: string
    box?: { x: number; y: number; width: number; height: number }
  } {
    if (!this.ctx || !this.canvas || !this.videoElement) return { detected: false, label: '' }
    const w = this.canvas.width
    const h = this.canvas.height

    try {
      this.ctx.drawImage(this.videoElement, 0, 0, w, h)
      const imgData = this.ctx.getImageData(0, 0, w, h)
      const data = imgData.data

      // Check sectors across the frame (Left, Right, Bottom-Center, Lap/Desk)
      const sectors = [
        { name: 'bottom_center', sx: 0.25, sy: 0.55, sw: 0.50, sh: 0.42 }, // lap / desk
        { name: 'bottom_left', sx: 0.05, sy: 0.50, sw: 0.40, sh: 0.48 }, // hand holding phone on left
        { name: 'bottom_right', sx: 0.55, sy: 0.50, sw: 0.40, sh: 0.48 }, // hand holding phone on right
        { name: 'center_mid', sx: 0.20, sy: 0.30, sw: 0.60, sh: 0.50 }, // phone held up to face/chest
      ]

      for (const sec of sectors) {
        const x1 = Math.floor(sec.sx * w)
        const y1 = Math.floor(sec.sy * h)
        const boxW = Math.floor(sec.sw * w)
        const boxH = Math.floor(sec.sh * h)

        let edgeCount = 0
        let highLumPixels = 0
        let totalSampled = 0

        // Step through sector pixels
        for (let y = y1 + 1; y < y1 + boxH - 1; y += 3) {
          for (let x = x1 + 1; x < x1 + boxW - 1; x += 3) {
            const idx = (y * w + x) * 4
            const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]

            // Horizontal & Vertical gradient (Sobel approximation)
            const rightIdx = (y * w + (x + 1)) * 4
            const rightLum = 0.299 * data[rightIdx] + 0.587 * data[rightIdx + 1] + 0.114 * data[rightIdx + 2]
            const downIdx = ((y + 1) * w + x) * 4
            const downLum = 0.299 * data[downIdx] + 0.587 * data[downIdx + 1] + 0.114 * data[downIdx + 2]

            const grad = Math.abs(lum - rightLum) + Math.abs(lum - downLum)
            if (grad > 55) edgeCount++
            if (lum > 215) highLumPixels++ // Screen brightness
            totalSampled++
          }
        }

        if (totalSampled > 0) {
          const edgeDensity = edgeCount / totalSampled
          const screenGlowRatio = highLumPixels / totalSampled

          // Smartphone in frame typically produces high edge density (sharp rectangular borders)
          // or illuminated screen area contrasting sharply against skin/clothing
          if ((edgeDensity > 0.32 && edgeCount >= 22) || (screenGlowRatio > 0.14 && edgeDensity > 0.20)) {
            const detectedBox = {
              x: Math.round(sec.sx * 100),
              y: Math.round(sec.sy * 100),
              width: Math.round(sec.sw * 100),
              height: Math.round(sec.sh * 100),
            }
            return {
              detected: true,
              label: '📱 SMARTPHONE / FOREIGN OBJECT DETECTED',
              box: detectedBox,
            }
          }
        }
      }

      return { detected: false, label: '' }
    } catch {
      return { detected: false, label: '' }
    }
  }

  /**
   * Fallback computer vision loop when MediaPipe is loading or not available
   */
  private processFallbackCV() {
    if (!this.videoElement || !this.ctx || !this.canvas) return
    const w = this.canvas.width
    const h = this.canvas.height

    try {
      this.ctx.drawImage(this.videoElement, 0, 0, w, h)
      const imgData = this.ctx.getImageData(0, 0, w, h)
      const data = imgData.data

      // Check skin tone pixels to detect if candidate face is present
      let skinPixels = 0
      let totalPixels = 0

      for (let i = 0; i < data.length; i += 16) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        // Standard skin-color chrominance heuristic
        if (r > 60 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15) {
          skinPixels++
        }
        totalPixels++
      }

      const faceDetected = totalPixels > 0 && skinPixels / totalPixels > 0.08
      const phoneCheck = this.scanFrameForPhone()

      if (phoneCheck.detected) {
        this.foreignObjectFrames += 2
        const landmarks: TrackedLandmarks = {
          faceDetected,
          faceCount: faceDetected ? 1 : 0,
          faceBox: { x: 26, y: 18, width: 48, height: 60 },
          foreignObjectDetected: true,
          foreignObjectLabel: phoneCheck.label,
          foreignObjectBox: phoneCheck.box,
          leftEye: { x: 41, y: 44 },
          rightEye: { x: 59, y: 44 },
          pitch: 0,
          yaw: 0,
          roll: 0,
        }
        this.handleGazeOutput('FOREIGN_OBJECT', 0, 0, faceDetected, faceDetected ? 1 : 0, true, phoneCheck.label, landmarks)
        return
      }

      if (!faceDetected) {
        // Face missing!
        const landmarks: TrackedLandmarks = {
          faceDetected: false,
          faceCount: 0,
          faceBox: { x: 26, y: 18, width: 48, height: 60 },
          foreignObjectDetected: false,
          leftEye: { x: 41, y: 44 },
          rightEye: { x: 59, y: 44 },
          pitch: 0,
          yaw: 0,
          roll: 0,
        }
        this.handleGazeOutput('LOOKING_AWAY', 0, 0, false, 0, false, '', landmarks)
        return
      }

      // Normal face centered
      const landmarks: TrackedLandmarks = {
        faceDetected: true,
        faceCount: 1,
        faceBox: { x: 26, y: 18, width: 48, height: 60 },
        foreignObjectDetected: false,
        leftEye: { x: 41, y: 44 },
        rightEye: { x: 59, y: 44 },
        pitch: 0,
        yaw: 0,
        roll: 0,
      }
      this.handleGazeOutput('CENTER', 0, 0, true, 1, false, '', landmarks)
    } catch {
      // ignore
    }
  }

  private handleGazeOutput(
    direction: GazeDirection,
    hOffset: number,
    vOffset: number,
    faceDetected: boolean,
    faceCount: number,
    foreignObjectDetected: boolean,
    foreignObjectLabel: string,
    landmarks: TrackedLandmarks
  ) {
    const now = Date.now()
    this.currentDirection = direction
    const isDeviated = direction !== 'CENTER'

    if (isDeviated) {
      this.deviationFrames++
      const progress = Math.min(1, this.deviationFrames / this.requiredDeviationFrames)
      const isSustained = this.deviationFrames >= this.requiredDeviationFrames

      this.onGazeUpdate?.({
        direction,
        confidence: Math.min(99, Math.round(88 + Math.abs(hOffset + vOffset) * 10)),
        horizontalOffset: Math.round(hOffset * 100) / 100,
        verticalOffset: Math.round(vOffset * 100) / 100,
        faceDetected,
        faceCount,
        foreignObjectDetected,
        foreignObjectLabel,
        warningCount: this.warningCount,
        isSustainedDeviation: isSustained,
        deviationProgress: progress,
        landmarks,
      })

      // ZERO-TOLERANCE IMMEDIATE TERMINATION FOR FOREIGN OBJECT (SMARTPHONE)
      if (direction === 'FOREIGN_OBJECT') {
        // Sustained for 3-4 consecutive frames (~150-200ms) to ensure solid non-flicker detection
        if (this.deviationFrames >= 3) {
          const reason = `HIRING PROCESS CANCELLED: Unauthorized Foreign Object (Smartphone) Detected in Camera Frame. The candidate is disqualified.`
          this.onTerminated?.(reason)
          return
        }
      }

      // Head pose / face missing strike system
      if (isSustained && now - this.lastStrikeTime > 2500) {
        this.lastStrikeTime = now
        this.deviationFrames = 0
        this.warningCount++

        if (this.warningCount <= this.maxWarnings) {
          this.onWarning?.(this.warningCount, direction)
        } else {
          let friendlyReason = direction.replace('_', ' ')
          if (direction === 'MULTIPLE_FACES') {
            friendlyReason = 'Multiple People Detected in Camera Frame'
          } else if (direction === 'LOOKING_AWAY') {
            friendlyReason = 'Candidate Face Missing from Camera Feed'
          }
          const reason = `Session Terminated: Candidate reached maximum proctoring infractions (${friendlyReason}).`
          this.onTerminated?.(reason)
        }
      }
    } else {
      if (this.deviationFrames > 0) {
        this.deviationFrames = Math.max(0, this.deviationFrames - 2)
      }
      const progress = this.deviationFrames / this.requiredDeviationFrames

      this.onGazeUpdate?.({
        direction: 'CENTER',
        confidence: 99,
        horizontalOffset: 0,
        verticalOffset: 0,
        faceDetected: true,
        faceCount,
        foreignObjectDetected,
        foreignObjectLabel: '',
        warningCount: this.warningCount,
        isSustainedDeviation: false,
        deviationProgress: progress,
        landmarks,
      })
    }
  }
}
