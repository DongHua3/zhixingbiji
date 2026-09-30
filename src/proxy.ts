import { NextResponse, type NextRequest } from 'next/server'

function isTokenValid(token?: string): boolean {
  if (!token) return false
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return false
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'))
    return payload.exp && payload.exp * 1000 > Date.now()
  } catch {
    return false
  }
}

export async function proxy(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value
  const isAuthenticated = isTokenValid(token)

  // 保护仪表盘和核心业务路由
  const protectedRoutes = [
    '/dashboard', 
    '/notes', 
    '/favorites', 
    '/square', 
    '/convert',
    '/ai-settings',
    '/profile',
    '/settings'
  ]
  const isProtectedRoute = protectedRoutes.some((route) =>
    request.nextUrl.pathname.startsWith(route)
  )

  if (!isAuthenticated && isProtectedRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // 已登录用户访问登录页则重定向到仪表盘
  if (isAuthenticated && request.nextUrl.pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
