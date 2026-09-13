import { NextResponse } from 'next/server'
import { backendUrl } from '@/lib/backend'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const envValue = process.env.BACKEND_BASE_URL ?? '(not set)'
  try {
    const target = `${backendUrl()}/health`
    const start = Date.now()
    const res = await fetch(target, { cache: 'no-store' })
    const elapsed = Date.now() - start
    const data = await res.json().catch(() => ({}))
    return NextResponse.json({
      configured_url: envValue,
      status: res.status,
      elapsed_ms: elapsed,
      backend_health: data,
    })
  } catch (err: any) {
    return NextResponse.json(
      {
        configured_url: envValue,
        error: err?.message,
        cause: err?.cause
          ? {
              name: err.cause.name,
              message: err.cause.message,
              code: err.cause.code,
              errno: err.cause.errno,
              syscall: err.cause.syscall,
              hostname: err.cause.hostname,
            }
          : null,
      },
      { status: 502 },
    )
  }
}
