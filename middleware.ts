import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Only process requests to /assistant
  if (request.nextUrl.pathname === '/assistant') {
    const referer = request.headers.get('referer') || request.headers.get('referrer');
    
    // Log for debugging
    console.log('[Middleware] Request to /assistant');
    console.log('[Middleware] Referer header:', referer);
    console.log('[Middleware] Request URL:', request.url);
    console.log('[Middleware] All headers:', Object.fromEntries(request.headers.entries()));
    
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        const firstName = refererUrl.searchParams.get('first-name') || refererUrl.searchParams.get('first_name');
        
        console.log('[Middleware] Extracted firstName from referer:', firstName);
        
        if (firstName && !firstName.includes('{{')) {
          // Set cookie with firstName from referer
          const response = NextResponse.next();
          response.cookies.set('assistant-first-name', firstName, {
            httpOnly: false, // Allow client-side access
            sameSite: 'lax',
            maxAge: 60, // 1 minute - just for initial load
          });
          console.log('[Middleware] Set cookie assistant-first-name:', firstName);
          return response;
        }
      } catch (e) {
        console.error('[Middleware] Error parsing referer:', e);
      }
    } else {
      console.log('[Middleware] No referer header found');
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: '/assistant',
};

