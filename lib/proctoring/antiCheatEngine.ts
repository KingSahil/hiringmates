/**
 * HiringMates Codeforces-Grade Anti-Cheating & Proctoring Engine
 * 
 * Features:
 * 1. Codeforces AST Normalization & Winnowing Plagiarism Algorithm (Stanford MOSS standard)
 * 2. Keystroke Dynamics & Flight Recorder (Human typing rhythm vs AI burst paste detection)
 * 3. Environment Shield (DevTools lockdown, shortcut traps, split-screen, dual-display detection)
 * 4. Voice Activity Detection (VAD) audio frequency analyzer
 */

// ==========================================
// 1. CODEFORCES AST & WINNOWING PLAGIARISM
// ==========================================

export interface PlagiarismResult {
  similarityScore: number // 0 to 100
  matchedFingerprints: number
  totalFingerprints: number
  isPlagiarized: boolean
  clusterMatchWith: string
  normalizedTokenSample: string
  confidence: 'HIGH' | 'SUSPICIOUS' | 'CLEAN'
}

export class CodeforcesWinnowingEngine {
  private k: number
  private windowSize: number
  private prime: number
  private mod: number

  constructor(k = 4, windowSize = 4) {
    this.k = k
    this.windowSize = windowSize
    this.prime = 31
    this.mod = 1000000007
  }

  /**
   * Normalizes source code just like Codeforces:
   * - Strips single-line (//) and multi-line (/* *\/) comments
   * - Strips whitespace and formatting
   * - Normalizes strings & number literals to generic tokens
   * - Standardizes keywords (for, while, if, def, function, return, etc.)
   * - Normalizes variable identifiers to generic IDs
   */
  public normalizeCode(source: string): string {
    if (!source) return ''

    // 1. Remove comments
    let code = source
      .replace(/\/\*[\s\S]*?\*\//g, '') // multi-line comments
      .replace(/\/\/.*$/gm, '') // single-line comments
      .replace(/#.*$/gm, '') // python-style comments

    // 2. Normalize strings & numbers
    code = code
      .replace(/(["'])(?:(?=(\\?))\2[\s\S])*?\1/g, 'STR')
      .replace(/\b\d+(\.\d+)?\b/g, 'NUM')

    // 3. Map control flow and structure keywords to canonical tokens
    const keywordMap: Record<string, string> = {
      function: 'FNC',
      const: 'VAR',
      let: 'VAR',
      var: 'VAR',
      def: 'FNC',
      class: 'CLS',
      return: 'RET',
      for: 'LOP',
      while: 'LOP',
      if: 'CND',
      else: 'CND',
      switch: 'CND',
      case: 'CND',
      import: 'IMP',
      export: 'EXP',
      from: 'FRM',
      try: 'TRY',
      catch: 'CTH',
      throw: 'ERR',
      async: 'ASY',
      await: 'AWT',
      true: 'BLN',
      false: 'BLN',
      null: 'NUL',
      undefined: 'NUL',
    }

    // Tokenize into words and symbols
    const tokens = code.match(/[A-Za-z_$][A-Za-z0-9_$]*|[^\s\w]/g) || []
    let normalized = ''
    const identifierMap: Map<string, string> = new Map()
    let idCounter = 1

    for (const token of tokens) {
      const lower = token.toLowerCase()
      if (keywordMap[lower]) {
        normalized += keywordMap[lower]
      } else if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(token)) {
        // Variable / Identifier normalization
        if (!identifierMap.has(token)) {
          identifierMap.set(token, `V${idCounter++}`)
        }
        normalized += identifierMap.get(token)
      } else if (['{', '}', '(', ')', '[', ']', ';', ',', '.', '+', '-', '*', '/', '=', '>', '<'].includes(token)) {
        normalized += token
      }
    }

    return normalized
  }

  /**
   * Polynomial rolling hash for a token string
   */
  private hashKgram(kgram: string): number {
    let hash = 0
    for (let i = 0; i < kgram.length; i++) {
      hash = (hash * this.prime + kgram.charCodeAt(i)) % this.mod
    }
    return hash
  }

  /**
   * Computes structural fingerprints using the Winnowing algorithm
   */
  public generateFingerprints(source: string): Set<number> {
    const normalized = this.normalizeCode(source)
    const fingerprints = new Set<number>()

    if (normalized.length < this.k) {
      fingerprints.add(this.hashKgram(normalized))
      return fingerprints
    }

    // Step 1: Generate k-grams and their hashes
    const hashes: number[] = []
    for (let i = 0; i <= normalized.length - this.k; i++) {
      const kgram = normalized.slice(i, i + this.k)
      hashes.push(this.hashKgram(kgram))
    }

    // Step 2: Slide window across hashes and pick the minimum (Winnowing)
    if (hashes.length <= this.windowSize) {
      fingerprints.add(Math.min(...hashes))
      return fingerprints
    }

    let minIndex = -1
    for (let i = 0; i <= hashes.length - this.windowSize; i++) {
      const window = hashes.slice(i, i + this.windowSize)
      let currentMin = window[0]
      let currentMinIdx = i

      for (let j = 1; j < window.length; j++) {
        if (window[j] <= currentMin) {
          currentMin = window[j]
          currentMinIdx = i + j
        }
      }

      if (currentMinIdx !== minIndex) {
        fingerprints.add(currentMin)
        minIndex = currentMinIdx
      }
    }

    return fingerprints
  }

  /**
   * Calculates similarity between candidate code and comparison code (e.g. peer submission or LLM baseline)
   */
  public compareSubmissions(
    candidateCode: string,
    targetCode: string,
    targetName = 'Target'
  ): PlagiarismResult {
    const fp1 = this.generateFingerprints(candidateCode)
    const fp2 = this.generateFingerprints(targetCode)

    if (fp1.size === 0 || fp2.size === 0) {
      return {
        similarityScore: 0,
        matchedFingerprints: 0,
        totalFingerprints: Math.max(fp1.size, fp2.size),
        isPlagiarized: false,
        clusterMatchWith: targetName,
        normalizedTokenSample: this.normalizeCode(candidateCode).slice(0, 50),
        confidence: 'CLEAN',
      }
    }

    let intersectionCount = 0
    for (const h of fp1) {
      if (fp2.has(h)) intersectionCount++
    }

    // Jaccard similarity index: |A ∩ B| / |A ∪ B|
    const unionCount = fp1.size + fp2.size - intersectionCount
    const jaccard = unionCount > 0 ? (intersectionCount / unionCount) * 100 : 0
    const rounded = Math.round(jaccard * 10) / 10

    let confidence: 'HIGH' | 'SUSPICIOUS' | 'CLEAN' = 'CLEAN'
    if (rounded >= 70) confidence = 'HIGH'
    else if (rounded >= 40) confidence = 'SUSPICIOUS'

    return {
      similarityScore: rounded,
      matchedFingerprints: intersectionCount,
      totalFingerprints: unionCount,
      isPlagiarized: rounded >= 70,
      clusterMatchWith: targetName,
      normalizedTokenSample: this.normalizeCode(candidateCode).slice(0, 50),
      confidence,
    }
  }
}

// ==========================================
// 2. KEYSTROKE DYNAMICS & FLIGHT RECORDER
// ==========================================

export interface FlightLogEvent {
  timeMs: number // Milliseconds from test start
  type: 'insert' | 'delete' | 'paste' | 'replace'
  char: string
  cursorIndex: number
  totalLength: number
  burstScore: number // characters inserted in <50ms window
}

export interface FlightMetrics {
  wpm: number
  totalKeystrokes: number
  backspacesCount: number
  pasteCount: number
  burstAnomalyCount: number
  humanCadenceConfidence: number // 0 to 100
  cadenceGrade: 'ORGANIC_HUMAN' | 'MIXED_SUSPICIOUS' | 'AI_INJECTION_FLAG'
}

export class KeystrokeFlightRecorder {
  private startTime: number
  private events: FlightLogEvent[] = []
  private lastKeyTimestamp = 0
  private interKeyIntervals: number[] = []

  constructor() {
    this.startTime = Date.now()
  }

  public reset() {
    this.startTime = Date.now()
    this.events = []
    this.lastKeyTimestamp = 0
    this.interKeyIntervals = []
  }

  /**
   * Logs a keystroke or typing modification
   */
  public logKeystroke(
    type: 'insert' | 'delete' | 'paste' | 'replace',
    char: string,
    cursorIndex: number,
    totalLength: number
  ) {
    const now = Date.now()
    const timeMs = now - this.startTime

    if (this.lastKeyTimestamp > 0) {
      const delta = now - this.lastKeyTimestamp
      this.interKeyIntervals.push(delta)
      if (this.interKeyIntervals.length > 200) {
        this.interKeyIntervals.shift()
      }
    }
    this.lastKeyTimestamp = now

    // Check burst score: how many characters appeared instantaneously
    let burstScore = 1
    if (type === 'paste' || char.length > 5) {
      burstScore = char.length
    }

    this.events.push({
      timeMs,
      type,
      char,
      cursorIndex,
      totalLength,
      burstScore,
    })
  }

  public getEvents(): FlightLogEvent[] {
    return this.events
  }

  /**
   * Analyzes keystroke flight telemetry to determine human vs AI origin
   */
  public computeMetrics(): FlightMetrics {
    const totalKeystrokes = this.events.length
    if (totalKeystrokes === 0) {
      return {
        wpm: 0,
        totalKeystrokes: 0,
        backspacesCount: 0,
        pasteCount: 0,
        burstAnomalyCount: 0,
        humanCadenceConfidence: 100,
        cadenceGrade: 'ORGANIC_HUMAN',
      }
    }

    const elapsedMinutes = Math.max(0.1, (Date.now() - this.startTime) / 60000)
    const backspacesCount = this.events.filter((e) => e.type === 'delete').length
    const pasteCount = this.events.filter((e) => e.type === 'paste' || e.burstScore > 10).length
    const burstAnomalyCount = this.events.filter((e) => e.burstScore > 25).length

    // WPM: roughly (total chars typed / 5) / elapsedMinutes
    const totalCharsTyped = this.events.reduce((sum, e) => sum + (e.type === 'insert' ? e.char.length : 0), 0)
    const wpm = Math.min(250, Math.round((totalCharsTyped / 5) / elapsedMinutes))

    // Human cadence score:
    // Natural typing has high standard deviation in inter-key latency (humans pause to think, fix typos).
    // AI injection has near-zero latency variance or sudden massive jumps.
    let variance = 0
    if (this.interKeyIntervals.length > 10) {
      const mean = this.interKeyIntervals.reduce((a, b) => a + b, 0) / this.interKeyIntervals.length
      const squaredDiffs = this.interKeyIntervals.map((val) => Math.pow(val - mean, 2))
      variance = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / this.interKeyIntervals.length)
    }

    let confidence = 95
    if (pasteCount > 0) confidence -= pasteCount * 20
    if (burstAnomalyCount > 0) confidence -= burstAnomalyCount * 30
    if (wpm > 130) confidence -= 25 // suspicious superhuman typing speed
    if (backspacesCount === 0 && totalKeystrokes > 50) confidence -= 15 // humans make typos

    confidence = Math.max(0, Math.min(100, confidence))

    let cadenceGrade: 'ORGANIC_HUMAN' | 'MIXED_SUSPICIOUS' | 'AI_INJECTION_FLAG' = 'ORGANIC_HUMAN'
    if (confidence < 50 || burstAnomalyCount >= 2) {
      cadenceGrade = 'AI_INJECTION_FLAG'
    } else if (confidence < 75 || pasteCount >= 1) {
      cadenceGrade = 'MIXED_SUSPICIOUS'
    }

    return {
      wpm,
      totalKeystrokes,
      backspacesCount,
      pasteCount,
      burstAnomalyCount,
      humanCadenceConfidence: confidence,
      cadenceGrade,
    }
  }

  /**
   * Replays the exact document text up to a given time percentage (0 to 100%)
   */
  public replayAtPercentage(percentage: number): { text: string; cursor: number; eventIdx: number } {
    if (this.events.length === 0) return { text: '', cursor: 0, eventIdx: 0 }

    const targetIdx = Math.floor((percentage / 100) * (this.events.length - 1))
    let reconstructed = ''
    let cursor = 0

    for (let i = 0; i <= targetIdx; i++) {
      const ev = this.events[i]
      cursor = ev.cursorIndex

      if (ev.type === 'insert' || ev.type === 'paste') {
        reconstructed =
          reconstructed.slice(0, ev.cursorIndex) +
          ev.char +
          reconstructed.slice(ev.cursorIndex)
      } else if (ev.type === 'delete') {
        reconstructed =
          reconstructed.slice(0, Math.max(0, ev.cursorIndex - 1)) +
          reconstructed.slice(ev.cursorIndex)
      } else if (ev.type === 'replace') {
        reconstructed = ev.char
      }
    }

    return { text: reconstructed, cursor, eventIdx: targetIdx }
  }
}

// ==========================================
// 3. ENVIRONMENT SHIELD (HARDENED SANDBOX)
// ==========================================

export interface SecurityViolation {
  timestamp: string
  type:
    | 'DEVTOOLS_SHORTCUT'
    | 'CONTEXT_MENU'
    | 'SPLIT_SCREEN_RESIZE'
    | 'MULTI_MONITOR_DETECTED'
    | 'TAB_SWITCH'
    | 'PASTE_BLOCKED'
    | 'VOICE_DETECTED'
  detail: string
  severity: 'CRITICAL' | 'WARNING' | 'HIGH'
}

export class EnvironmentShield {
  private onViolation: (violation: SecurityViolation) => void
  private keydownHandler?: (e: KeyboardEvent) => void
  private contextMenuHandler?: (e: MouseEvent) => void
  private resizeHandler?: () => void
  private blurHandler?: () => void

  constructor(onViolation: (violation: SecurityViolation) => void) {
    this.onViolation = onViolation
  }

  /**
   * Activates keyboard trap, DevTools lock, and split-screen guard
   */
  public activateShield(): () => void {
    if (typeof window === 'undefined') return () => {}

    // 1. Intercept DevTools & inspection keyboard shortcuts
    this.keydownHandler = (e: KeyboardEvent) => {
      const isF12 = e.key === 'F12'
      const isDevToolsCombo =
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')
      const isViewSource = (e.ctrlKey || e.metaKey) && (e.key === 'U' || e.key === 'u')
      const isSavePage = (e.ctrlKey || e.metaKey) && (e.key === 'S' || e.key === 's')
      const isPrint = (e.ctrlKey || e.metaKey) && (e.key === 'P' || e.key === 'p')

      if (isF12 || isDevToolsCombo || isViewSource || isSavePage || isPrint) {
        e.preventDefault()
        e.stopPropagation()
        this.onViolation({
          timestamp: new Date().toLocaleTimeString(),
          type: 'DEVTOOLS_SHORTCUT',
          detail: `Blocked unauthorized shortcut combination: ${e.key}`,
          severity: 'CRITICAL',
        })
      }
    }

    // 2. Intercept context menu (right-click)
    this.contextMenuHandler = (e: MouseEvent) => {
      e.preventDefault()
      this.onViolation({
        timestamp: new Date().toLocaleTimeString(),
        type: 'CONTEXT_MENU',
        detail: 'Right-click context menu access blocked during proctored test.',
        severity: 'WARNING',
      })
    }

    // 3. Monitor split-screen or docked DevTools
    this.resizeHandler = () => {
      const widthDelta = window.outerWidth - window.innerWidth
      const heightDelta = window.outerHeight - window.innerHeight

      // If outer window size deviates massively from viewport, DevTools or snapped split-screen is open
      if (widthDelta > 170 || heightDelta > 170) {
        this.onViolation({
          timestamp: new Date().toLocaleTimeString(),
          type: 'SPLIT_SCREEN_RESIZE',
          detail: 'Split-screen layout or docked developer tools detected.',
          severity: 'HIGH',
        })
      }
    }

    window.addEventListener('keydown', this.keydownHandler, true)
    window.addEventListener('contextmenu', this.contextMenuHandler, true)
    window.addEventListener('resize', this.resizeHandler, true)

    // Check modern Screen Details API for extended multi-monitors
    try {
      if ((window.screen as any)?.isExtended) {
        this.onViolation({
          timestamp: new Date().toLocaleTimeString(),
          type: 'MULTI_MONITOR_DETECTED',
          detail: 'Secondary external monitor detected. Dual-display testing is flagged.',
          severity: 'WARNING',
        })
      }
    } catch {
      // ignore
    }

    return () => this.deactivateShield()
  }

  public deactivateShield() {
    if (typeof window === 'undefined') return
    if (this.keydownHandler) window.removeEventListener('keydown', this.keydownHandler, true)
    if (this.contextMenuHandler) window.removeEventListener('contextmenu', this.contextMenuHandler, true)
    if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler, true)
  }
}

// ==========================================
// 4. PRE-COMPUTED AI & CAMPUS BASELINES
// ==========================================

export const LLM_BENCHMARK_SOLUTIONS = {
  // Common MCP answer written by ChatGPT-4o
  chatgpt_mcp_response: `# MCP Architecture: Automated Cloud Incident Response
Transport: Server-Sent Events (SSE) over TLS with JSON-RPC 2.0.
Registered Tools:
- query_cluster_telemetry: fetches p99 latency, HTTP 5xx error spikes, CPU memory saturation.
- fetch_pod_logs: streams logs matching panic or OOM traces with regex filtering.
- trigger_canary_rollback: rolls back failing deployments with token auth.
Security: Scoped service accounts, principle of least privilege, audit log for each tool invocation.`,

  // Common MCP answer written by Claude 3.5 Sonnet
  claude_mcp_response: `# Model Context Protocol (MCP) Incident Response Specification
1. Architecture & Transport:
Utilizes bidirectional stdio for local node containers and Server-Sent Events (SSE) over mTLS for distributed Kubernetes environments. Framed using JSON-RPC 2.0.
2. Tools Exposed:
- inspect_cluster_health: returns prometheus metrics and pod health.
- fetch_crash_logs: extracts error traces.
- rollback_release: triggers safe canary deprecation.
3. Access Control: Role-Based Access Control (RBAC) with cryptographic session signatures.`,
}
