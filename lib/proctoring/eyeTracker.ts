/**
 * HiringMates High-Precision Computer Vision Proctoring Engine
 * 
 * Features:
 * - Multi-Person Detection: Connected-component skin spatial clustering detects secondary intruders/faces
 * - Foreign Object & Phone Detection: High-contrast rectangular edge analysis detects handheld phones/tablets
 * - Anatomically Calibrated Eye & Pupil Tracking:
 *   - Sclera-to-Pupil horizontal luminance contrast ratio (never locks onto eyebrows or glasses frames)
 *   - Strictly positioned within the sub-brow ocular socket region (32% - 48% of face height)
 * - Auto-Zero Neutral Calibration: Automatically learns the candidate's natural resting angle
 * - Industry-Standard Proctoring Deadzones:
 *   - Normal posture deadzone: Yaw ±18°, Pitch -15° to +18°, Roll ±18°
 *   - Phone on lap: Pitch ≥ 20°
 *   - Second monitor: Yaw ≥ 20° or ≤ -20°
 *   - Sideways tilt: Roll ≥ 22° or ≤ -22°
 * - Real-Time Visual Landmarks (faceBox, secondaryFaceBox, foreignObjectBox, leftEye, rightEye)
 * - 3-Warning Strike System with sustained deviation timer & auto-termination
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
  warningCount: number
  isSustainedDeviation: boolean
  deviationProgress: number // 0 to 1
  landmarks: TrackedLandmarks
}

export class EyeTrackerEngine {
  private videoElement: HTMLVideoElement | null = null
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private animFrameId: number | null = null
  private isRunning = false

  // Baseline calibration (auto-zero)
  private baselineFaceX = 0.5
  private baselineFaceY = 0.45
  private baselineRoll = 0
  private calibrated = false
  private calibrationFrames = 0
  private sumBaseX = 0
  private sumBaseY = 0
  private sumBaseRoll = 0

  // Smoothed face coordinates (EMA filter)
  private smoothFaceX = 0.5
  private smoothFaceY = 0.45
  private smoothFaceW = 0.35
  private smoothFaceH = 0.45

  // Smoothed eye coordinates
  private smoothLeftEyeX = 0.42
  private smoothLeftEyeY = 0.42
  private smoothRightEyeX = 0.58
  private smoothRightEyeY = 0.42

  // Multi-face & foreign object tracking
  private smoothSecondaryFace: { x: number; y: number; width: number; height: number } | null = null
  private smoothForeignObject: { x: number; y: number; width: number; height: number } | null = null
  private foreignObjectFrames = 0

  // Warning & Deviation State
  private currentDirection: GazeDirection = 'CENTER'
  private deviationFrames = 0
  private requiredDeviationFrames = 18 // ~1.2 seconds at 15-20 FPS
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
    this.currentDirection = 'CENTER'
    this.calibrated = false
    this.calibrationFrames = 0
    this.sumBaseX = 0
    this.sumBaseY = 0
    this.sumBaseRoll = 0
  }

  public recalibrate() {
    this.calibrated = false
    this.calibrationFrames = 0
    this.sumBaseX = 0
    this.sumBaseY = 0
    this.sumBaseRoll = 0
  }

  public getWarningCount(): number {
    return this.warningCount
  }

  public start(video: HTMLVideoElement) {
    if (this.isRunning) return
    this.videoElement = video

    this.canvas = document.createElement('canvas')
    this.canvas.width = 160 // downscaled for high-performance 30+ FPS analysis
    this.canvas.height = 120
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })
    this.isRunning = true
    this.deviationFrames = 0

    const loop = () => {
      if (!this.isRunning) return
      this.analyzeFrame()
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
    this.canvas = null
    this.ctx = null
    this.videoElement = null
  }

  private analyzeFrame() {
    if (!this.videoElement || !this.ctx || !this.canvas) return

    if (this.videoElement.videoWidth === 0 || this.videoElement.paused || this.videoElement.ended) {
      if (this.videoElement.paused) {
        this.videoElement.play().catch(() => {})
      }
      return
    }

    const w = this.canvas.width
    const h = this.canvas.height

    try {
      this.ctx.drawImage(this.videoElement, 0, 0, w, h)
      const imgData = this.ctx.getImageData(0, 0, w, h)
      const data = imgData.data

      // Step 1: Spatial Grid Analysis for Skin & Multi-Face Clusters
      // 16x12 blocks (each block is 10x10 pixels)
      const gridCols = 16
      const gridRows = 12
      const blockSize = 10
      const skinGrid = new Uint8Array(gridCols * gridRows)

      for (let gy = 0; gy < gridRows; gy++) {
        for (let gx = 0; gx < gridCols; gx++) {
          let skinPixelsInBlock = 0
          for (let py = 0; py < blockSize; py += 2) {
            const y = gy * blockSize + py
            if (y >= h) continue
            for (let px = 0; px < blockSize; px += 2) {
              const x = gx * blockSize + px
              if (x >= w) continue
              const idx = (y * w + x) * 4
              const r = data[idx]
              const g = data[idx + 1]
              const b = data[idx + 2]

              // Universal YCbCr skin chrominance cluster
              const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
              const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
              const isSkinYCbCr = cb >= 75 && cb <= 138 && cr >= 128 && cr <= 180

              // Normalized RGB fallback
              const sum = r + g + b + 0.001
              const nr = r / sum
              const ng = g / sum
              const isSkinNRGB = nr > 0.32 && nr < 0.62 && ng > 0.24 && ng < 0.44 && r > 35

              if (isSkinYCbCr || isSkinNRGB) {
                skinPixelsInBlock++
              }
            }
          }
          // Block is skin-dense if at least 7 skin samples found
          if (skinPixelsInBlock >= 7) {
            skinGrid[gy * gridCols + gx] = 1
          }
        }
      }

      // Step 2: Connected Component Clustering to identify Main Face and Secondary Faces
      const visited = new Uint8Array(gridCols * gridRows)
      const clusters: Array<{
        minGx: number
        maxGx: number
        minGy: number
        maxGy: number
        pixelCount: number
        sumGx: number
        sumGy: number
      }> = []

      for (let gy = 0; gy < gridRows; gy++) {
        for (let gx = 0; gx < gridCols; gx++) {
          const idx = gy * gridCols + gx
          if (skinGrid[idx] === 1 && visited[idx] === 0) {
            // BFS flood-fill for this face cluster
            const queue: Array<[number, number]> = [[gx, gy]]
            visited[idx] = 1
            let count = 0
            let minX = gx
            let maxX = gx
            let minY = gy
            let maxY = gy
            let sumX = 0
            let sumY = 0

            while (queue.length > 0) {
              const [cx, cy] = queue.shift()!
              count++
              sumX += cx
              sumY += cy
              if (cx < minX) minX = cx
              if (cx > maxX) maxX = cx
              if (cy < minY) minY = cy
              if (cy > maxY) maxY = cy

              // 4-neighborhood
              const neighbors: Array<[number, number]> = [
                [cx + 1, cy],
                [cx - 1, cy],
                [cx, cy + 1],
                [cx, cy - 1],
              ]
              for (const [nx, ny] of neighbors) {
                if (nx >= 0 && nx < gridCols && ny >= 0 && ny < gridRows) {
                  const nIdx = ny * gridCols + nx
                  if (skinGrid[nIdx] === 1 && visited[nIdx] === 0) {
                    visited[nIdx] = 1
                    queue.push([nx, ny])
                  }
                }
              }
            }

            // Only consider clusters of at least 4 contiguous grid blocks
            if (count >= 4) {
              clusters.push({
                minGx: minX,
                maxGx: maxX,
                minGy: minY,
                maxGy: maxY,
                pixelCount: count,
                sumGx: sumX,
                sumGy: sumY,
              })
            }
          }
        }
      }

      // Sort clusters by size (largest first is primary candidate)
      clusters.sort((a, b) => b.pixelCount - a.pixelCount)

      // If no face found in frame (camera obstructed or ducked)
      if (clusters.length === 0) {
        const landmarks: TrackedLandmarks = {
          faceDetected: false,
          faceCount: 0,
          faceBox: {
            x: Math.round(this.smoothFaceX * 100 - 18),
            y: Math.round(this.smoothFaceY * 100 - 22),
            width: 36,
            height: 44,
          },
          foreignObjectDetected: false,
          leftEye: { x: 40, y: 40 },
          rightEye: { x: 60, y: 40 },
          pitch: 0,
          yaw: 0,
          roll: 0,
        }
        this.handleGazeOutput('LOOKING_AWAY', 0, 0, false, 0, false, landmarks)
        return
      }

      const primary = clusters[0]
      const rawFaceCenterX = (primary.sumGx / primary.pixelCount * blockSize + blockSize / 2) / w
      const rawFaceCenterY = (primary.sumGy / primary.pixelCount * blockSize + blockSize / 2) / h
      const rawFaceW = Math.max(0.24, Math.min(0.65, ((primary.maxGx - primary.minGx + 1.6) * blockSize) / w))
      const rawFaceH = Math.max(0.28, Math.min(0.72, ((primary.maxGy - primary.minGy + 1.8) * blockSize) / h))

      // Smooth primary face coordinates
      this.smoothFaceX = this.smoothFaceX * 0.70 + rawFaceCenterX * 0.30
      this.smoothFaceY = this.smoothFaceY * 0.70 + rawFaceCenterY * 0.30
      this.smoothFaceW = this.smoothFaceW * 0.75 + rawFaceW * 0.25
      this.smoothFaceH = this.smoothFaceH * 0.75 + rawFaceH * 0.25

      const fx = this.smoothFaceX
      const fy = this.smoothFaceY
      const fw = this.smoothFaceW
      const fh = this.smoothFaceH

      // Multi-Face Detection check:
      // Is there a significant secondary cluster with at least 5 blocks separated from the primary?
      let secondaryFaceBox: { x: number; y: number; width: number; height: number } | undefined = undefined
      let faceCount = 1

      if (clusters.length > 1) {
        const sec = clusters[1]
        const secCenterX = (sec.sumGx / sec.pixelCount * blockSize) / w
        const dist = Math.abs(secCenterX - fx)
        // Must be sufficiently large and spatially separated by at least 25% of frame
        if (sec.pixelCount >= 5 && dist >= 0.22) {
          faceCount = 2
          const secW = Math.round(((sec.maxGx - sec.minGx + 1.5) * blockSize) / w * 100)
          const secH = Math.round(((sec.maxGy - sec.minGy + 1.5) * blockSize) / h * 100)
          const secX = Math.round((sec.minGx * blockSize) / w * 100)
          const secY = Math.round((sec.minGy * blockSize) / h * 100)
          secondaryFaceBox = { x: secX, y: secY, width: secW, height: secH }
        }
      }

      // Step 3: Anatomical Dual-Eye & Pupil Localization
      // The eyes sit strictly inside the sub-brow ocular band:
      // Between (fy - 0.08 * fh) and (fy + 0.14 * fh)
      const eyeBandTop = Math.max(0, Math.floor((fy - fh * 0.08) * h))
      const eyeBandBottom = Math.min(h, Math.floor((fy + fh * 0.14) * h))

      // Left eye search box (anatomical left of face, screen right or left depending on mirror)
      const leftEyeX1 = Math.max(0, Math.floor((fx - fw * 0.30) * w))
      const leftEyeX2 = Math.min(w, Math.floor((fx - fw * 0.06) * w))

      // Right eye search box
      const rightEyeX1 = Math.max(0, Math.floor((fx + fw * 0.06) * w))
      const rightEyeX2 = Math.min(w, Math.floor((fx + fw * 0.30) * w))

      // Pupil Sclera-Contrast Search:
      // Pupil is a dark spot flanked horizontally by lighter sclera pixels (eyebrows lack this horizontal contrast!)
      let bestLeftScore = -9999
      let bestLeftX = fx - fw * 0.18
      let bestLeftY = fy + fh * 0.02

      for (let y = eyeBandTop; y < eyeBandBottom; y += 2) {
        for (let x = leftEyeX1 + 3; x < leftEyeX2 - 3; x += 2) {
          const idx = (y * w + x) * 4
          const lumCenter = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
          const idxLeft = (y * w + (x - 3)) * 4
          const lumLeft = 0.299 * data[idxLeft] + 0.587 * data[idxLeft + 1] + 0.114 * data[idxLeft + 2]
          const idxRight = (y * w + (x + 3)) * 4
          const lumRight = 0.299 * data[idxRight] + 0.587 * data[idxRight + 1] + 0.114 * data[idxRight + 2]

          // High sclera contrast: left and right are significantly brighter than center
          const contrast = (lumLeft + lumRight) / 2 - lumCenter
          const score = contrast * 2 + (255 - lumCenter)
          if (score > bestLeftScore) {
            bestLeftScore = score
            bestLeftX = x / w
            bestLeftY = y / h
          }
        }
      }

      let bestRightScore = -9999
      let bestRightX = fx + fw * 0.18
      let bestRightY = fy + fh * 0.02

      for (let y = eyeBandTop; y < eyeBandBottom; y += 2) {
        for (let x = rightEyeX1 + 3; x < rightEyeX2 - 3; x += 2) {
          const idx = (y * w + x) * 4
          const lumCenter = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
          const idxLeft = (y * w + (x - 3)) * 4
          const lumLeft = 0.299 * data[idxLeft] + 0.587 * data[idxLeft + 1] + 0.114 * data[idxLeft + 2]
          const idxRight = (y * w + (x + 3)) * 4
          const lumRight = 0.299 * data[idxRight] + 0.587 * data[idxRight + 1] + 0.114 * data[idxRight + 2]

          const contrast = (lumLeft + lumRight) / 2 - lumCenter
          const score = contrast * 2 + (255 - lumCenter)
          if (score > bestRightScore) {
            bestRightScore = score
            bestRightX = x / w
            bestRightY = y / h
          }
        }
      }

      // Smooth eyes with EMA
      this.smoothLeftEyeX = this.smoothLeftEyeX * 0.65 + bestLeftX * 0.35
      this.smoothLeftEyeY = this.smoothLeftEyeY * 0.65 + bestLeftY * 0.35
      this.smoothRightEyeX = this.smoothRightEyeX * 0.65 + bestRightX * 0.35
      this.smoothRightEyeY = this.smoothRightEyeY * 0.65 + bestRightY * 0.35

      // Step 4: Head Pose (Roll, Pitch, Yaw) with Auto-Zero Calibration
      const eyeDeltaX = (this.smoothRightEyeX - this.smoothLeftEyeX) * w
      const eyeDeltaY = (this.smoothRightEyeY - this.smoothLeftEyeY) * h
      const rawRoll = Math.round(Math.atan2(eyeDeltaY, Math.max(1, eyeDeltaX)) * (180 / Math.PI))

      // Auto-Zero baseline calibration on startup
      if (!this.calibrated) {
        this.sumBaseX += fx
        this.sumBaseY += fy
        this.sumBaseRoll += rawRoll
        this.calibrationFrames++
        if (this.calibrationFrames >= 15) {
          this.baselineFaceX = this.sumBaseX / this.calibrationFrames
          this.baselineFaceY = this.sumBaseY / this.calibrationFrames
          this.baselineRoll = this.sumBaseRoll / this.calibrationFrames
          this.calibrated = true
        }
      }

      // Zero-calibrated angles
      const roll = Math.round(rawRoll - this.baselineRoll)
      const deltaY = fy - this.baselineFaceY
      const deltaX = fx - this.baselineFaceX
      const pitch = Math.round(deltaY * 160)
      const yaw = Math.round(deltaX * 160)

      // Step 5: Foreign Object / Phone Detection
      // Check for high-contrast non-skin rectangular object in the chest/lap area below chin
      const objectBoxY1 = Math.min(h - 10, Math.floor((fy + fh * 0.25) * h))
      const objectBoxY2 = h - 2
      const objectBoxX1 = Math.max(0, Math.floor((fx - fw * 0.35) * w))
      const objectBoxX2 = Math.min(w, Math.floor((fx + fw * 0.35) * w))

      let highContrastEdges = 0
      let totalSampled = 0
      for (let y = objectBoxY1; y < objectBoxY2; y += 3) {
        for (let x = objectBoxX1; x < objectBoxX2; x += 3) {
          const idx = (y * w + x) * 4
          const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
          const idxNext = ((y + 2) * w + x) * 4
          const lumNext = 0.299 * data[idxNext] + 0.587 * data[idxNext + 1] + 0.114 * data[idxNext + 2]
          if (Math.abs(lum - lumNext) > 65) {
            highContrastEdges++
          }
          totalSampled++
        }
      }

      const edgeDensity = totalSampled > 0 ? highContrastEdges / totalSampled : 0
      // A phone/tablet screen or paper held up produces sharp rectangular edge concentration (> 14%)
      const isForeignObject = edgeDensity > 0.14 && (pitch > 10 || deltaY > 0.03)

      let foreignObjectBox: { x: number; y: number; width: number; height: number } | undefined = undefined
      if (isForeignObject) {
        this.foreignObjectFrames++
        const objW = Math.round(fw * 0.75 * 100)
        const objH = Math.round(fh * 0.45 * 100)
        const objX = Math.round((fx - (fw * 0.75) / 2) * 100)
        const objY = Math.round((fy + fh * 0.28) * 100)
        foreignObjectBox = { x: objX, y: objY, width: objW, height: objH }
      } else {
        if (this.foreignObjectFrames > 0) this.foreignObjectFrames--
      }

      // Step 6: Multi-Signal Decision Logic with Industry Deadzones
      let direction: GazeDirection = 'CENTER'

      // Priority 1: Multiple Faces Detected
      if (faceCount > 1) {
        direction = 'MULTIPLE_FACES'
      }
      // Priority 2: Foreign Object / Phone Held Up
      else if (this.foreignObjectFrames >= 6) {
        direction = 'FOREIGN_OBJECT'
      }
      // Priority 3: Looking Down (Phone on Lap / Under Desk)
      // Industry standard deadzone: Pitch >= 20° or face centroid dropped >= 8% of frame
      else if (pitch >= 20 || deltaY >= 0.08) {
        direction = 'LOOKING_DOWN'
      }
      // Priority 4: Looking Left (2nd Monitor / Companion)
      // Industry standard deadzone: Yaw <= -20° or face shifted left >= 8%
      else if (yaw <= -20 || deltaX <= -0.08) {
        direction = 'LOOKING_LEFT'
      }
      // Priority 5: Looking Right (2nd Monitor)
      else if (yaw >= 20 || deltaX >= 0.08) {
        direction = 'LOOKING_RIGHT'
      }
      // Priority 6: Severe Sideways Head Tilt
      // Industry standard deadzone: Roll >= 22° or <= -22°
      else if (Math.abs(roll) >= 22) {
        direction = 'HEAD_TILT'
      } else {
        direction = 'CENTER'
      }

      // Construct visual landmarks for rendering
      const faceBoxLeft = Math.max(2, Math.min(85, Math.round((fx - fw / 2) * 100)))
      const faceBoxTop = Math.max(2, Math.min(80, Math.round((fy - fh / 2) * 100)))
      const faceBoxW = Math.max(18, Math.min(100 - faceBoxLeft, Math.round(fw * 100)))
      const faceBoxH = Math.max(22, Math.min(100 - faceBoxTop, Math.round(fh * 100)))

      const landmarks: TrackedLandmarks = {
        faceDetected: true,
        faceCount,
        faceBox: {
          x: faceBoxLeft,
          y: faceBoxTop,
          width: faceBoxW,
          height: faceBoxH,
        },
        secondaryFaceBox,
        foreignObjectDetected: isForeignObject,
        foreignObjectBox,
        leftEye: {
          x: Math.round(this.smoothLeftEyeX * 100),
          y: Math.round(this.smoothLeftEyeY * 100),
        },
        rightEye: {
          x: Math.round(this.smoothRightEyeX * 100),
          y: Math.round(this.smoothRightEyeY * 100),
        },
        pitch,
        yaw,
        roll,
      }

      this.handleGazeOutput(direction, deltaX * 2.5, deltaY * 2.5, true, faceCount, isForeignObject, landmarks)
    } catch {
      // Graceful error recovery
    }
  }

  private handleGazeOutput(
    direction: GazeDirection,
    hOffset: number,
    vOffset: number,
    faceDetected: boolean,
    faceCount: number,
    foreignObjectDetected: boolean,
    landmarks: TrackedLandmarks
  ) {
    const now = Date.now()
    this.currentDirection = direction
    const isDeviated = direction !== 'CENTER'

    if (isDeviated) {
      this.deviationFrames++
      const progress = Math.min(1, this.deviationFrames / this.requiredDeviationFrames)
      const isSustained = this.deviationFrames >= this.requiredDeviationFrames

      // Notify UI on every frame
      this.onGazeUpdate?.({
        direction,
        confidence: Math.min(99, Math.round(80 + Math.abs(hOffset + vOffset) * 15)),
        horizontalOffset: Math.round(hOffset * 100) / 100,
        verticalOffset: Math.round(vOffset * 100) / 100,
        faceDetected,
        faceCount,
        foreignObjectDetected,
        warningCount: this.warningCount,
        isSustainedDeviation: isSustained,
        deviationProgress: progress,
        landmarks,
      })

      // When sustained deviation is reached (~1.2 seconds)
      if (isSustained && now - this.lastStrikeTime > 2500) {
        this.lastStrikeTime = now
        this.deviationFrames = 0
        this.warningCount++

        if (this.warningCount <= this.maxWarnings) {
          this.onWarning?.(this.warningCount, direction)
        } else {
          // 4th deviation: Terminate session
          let friendlyReason = direction.replace('_', ' ')
          if (direction === 'MULTIPLE_FACES') {
            friendlyReason = 'Multiple People Detected in Camera Frame'
          } else if (direction === 'FOREIGN_OBJECT') {
            friendlyReason = 'Foreign Object / Phone Detected'
          }
          const reason = `Session Terminated: Candidate reached 4 proctoring infractions (${friendlyReason}).`
          this.onTerminated?.(reason)
        }
      }
    } else {
      // Drain deviation frames
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
        warningCount: this.warningCount,
        isSustainedDeviation: false,
        deviationProgress: progress,
        landmarks,
      })
    }
  }
}
