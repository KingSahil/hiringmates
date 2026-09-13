import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  const errorDescription = url.searchParams.get('error_description')

  let next = url.searchParams.get('next') ?? '/'
  if (!next.startsWith('/')) {
    next = '/'
  }

  const origin = url.origin
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https'

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') || 'https://hiringmates.vercel.app'
  let redirectBase = siteUrl
  if (forwardedHost) {
    redirectBase = `${forwardedProto}://${forwardedHost}`
  } else if (origin && (origin.includes('hiringmates.vercel.app') || origin.includes('vercel.app'))) {
    redirectBase = origin
  }

  if (error || errorDescription) {
    const message = encodeURIComponent(errorDescription || error || 'Authentication failed')
    return NextResponse.redirect(`${redirectBase}/?error=${message}`)
  }

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // Server component / middleware session refresh safe fallback
            }
          },
        },
      }
    )
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    if (exchangeError) {
      return NextResponse.redirect(
        `${redirectBase}/?error=${encodeURIComponent(exchangeError.message)}`
      )
    }
  }

  return NextResponse.redirect(`${redirectBase}${next}`)
}
