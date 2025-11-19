import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Only process requests to /assistant
  if (request.nextUrl.pathname === '/assistant') {
    const referer = request.headers.get('referer') || request.headers.get('referrer');
    
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        const firstName = refererUrl.searchParams.get('first-name') || refererUrl.searchParams.get('first_name');
        
        if (firstName) {
          // Set cookie with firstName from referer
          const response = NextResponse.next();
          response.cookies.set('assistant-first-name', firstName, {
            httpOnly: false, // Allow client-side access
            sameSite: 'lax',
            maxAge: 60, // 1 minute - just for initial load
          });
          return response;
        }
      } catch (e) {
        // Invalid referer URL, continue normally
      }
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: '/assistant',
};

