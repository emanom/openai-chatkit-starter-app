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
    
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        const firstName = refererUrl.searchParams.get('first-name') || refererUrl.searchParams.get('first_name');
        
        console.log('[Middleware] Referer URL:', refererUrl.href);
        console.log('[Middleware] Referer hostname:', refererUrl.hostname);
        console.log('[Middleware] Request hostname:', request.nextUrl.hostname);
        console.log('[Middleware] Extracted firstName from referer:', firstName);
        
        // Check if referer is from Zapier domain (parent page) vs our own domain (iframe)
        const isZapierReferer = refererUrl.hostname.includes('zapier.app');
        const isOwnDomain = refererUrl.hostname === request.nextUrl.hostname || 
                           refererUrl.hostname.includes('amplifyapp.com');
        
        console.log('[Middleware] Is Zapier referer:', isZapierReferer);
        console.log('[Middleware] Is own domain:', isOwnDomain);
        
        // Only use referer if it's from Zapier (parent page), not from our own domain (iframe)
        if (isZapierReferer && firstName && !firstName.includes('{{')) {
          // Set cookie with firstName from referer
          const response = NextResponse.next();
          response.cookies.set('assistant-first-name', firstName, {
            httpOnly: false, // Allow client-side access
            sameSite: 'lax',
            maxAge: 60, // 1 minute - just for initial load
          });
          console.log('[Middleware] Set cookie assistant-first-name:', firstName);
          return response;
        } else if (isOwnDomain && firstName && firstName.includes('{{')) {
          console.log('[Middleware] Referer is from own domain with template variable - ignoring');
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

