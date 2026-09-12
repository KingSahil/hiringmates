import { NextResponse } from 'next/server'
import { backendUrl } from '@/lib/backend'
import { CodeforcesWinnowingEngine, LLM_BENCHMARK_SOLUTIONS } from '@/lib/proctoring/antiCheatEngine'

/**
 * Plagiarism & AI-code detection API route.
 *
 * Proxies to Python RAG backend (/plagiarism/check) with isomorphic client-side engine fallback.
 */
export async function POST(request: Request) {
  let body: {
    code?: string
    language?: string
    referenceCode?: string
    referenceName?: string
    runLLM?: boolean
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const code = body.code ?? ''
  const language = body.language ?? 'javascript'
  const referenceCode = body.referenceCode ?? LLM_BENCHMARK_SOLUTIONS.chatgpt_mcp_response
  const referenceName = body.referenceName ?? 'ChatGPT-4o Baseline'
  const runLLM = body.runLLM ?? true

  // 1. Attempt to query the Python backend
  try {
    const backendRes = await fetch(`${backendUrl()}/plagiarism/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        language,
        reference_code: referenceCode,
        reference_name: referenceName,
        run_llm: runLLM,
      }),
      cache: 'no-store',
    })

    if (backendRes.ok) {
      const data = await backendRes.json()
      return NextResponse.json({
        similarityScore: data.similarity_score,
        confidenceScore: data.confidence_score,
        verdict: data.verdict,
        isPlagiarized: data.is_plagiarized,
        isAIGenerated: data.is_ai_generated,
        detectedEmojis: data.detected_emojis,
        flaggedComments: data.flagged_comments,
        overlapFingerprints: data.overlap_fingerprints,
        totalFingerprints: data.total_fingerprints,
        referenceMatched: data.reference_matched,
        llmExplanation: data.llm_explanation,
        astTokensSample: data.ast_tokens_sample,
        source: 'backend-llm',
      })
    }
  } catch {
    // Backend unreachable or not running — gracefully proceed with isomorphic engine
  }

  // 2. Isomorphic Fallback Engine (runs Codeforces / copydetect token winnowing)
  const engine = new CodeforcesWinnowingEngine()
  const result = engine.compareSubmissions(code, referenceCode, referenceName)

  return NextResponse.json({
    similarityScore: result.similarityScore,
    confidenceScore: result.confidenceScore,
    verdict: result.verdict,
    isPlagiarized: result.isPlagiarized,
    isAIGenerated: result.isAIGenerated,
    detectedEmojis: result.detectedEmojis,
    flaggedComments: result.flaggedComments,
    overlapFingerprints: result.matchedFingerprints,
    totalFingerprints: result.totalFingerprints,
    referenceMatched: result.clusterMatchWith,
    llmExplanation: result.llmExplanation,
    astTokensSample: result.normalizedTokenSample,
    source: 'isomorphic-engine',
  })
}
