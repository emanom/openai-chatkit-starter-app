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
        // Try multiple parameter name variations
        const firstName = refererUrl.searchParams.get('first_name') || 
                         refererUrl.searchParams.get('first-name') ||
                         refererUrl.searchParams.get('firstName') ||
                         refererUrl.searchParams.get('firstname');
        
        console.log('[Middleware] Referer URL:', refererUrl.href);
        console.log('[Middleware] Referer hostname:', refererUrl.hostname);
        console.log('[Middleware] Referer search params:', refererUrl.search);
        console.log('[Middleware] Request hostname:', request.nextUrl.hostname);
        console.log('[Middleware] Extracted firstName from referer:', firstName);
        
        // Check if referer is from Zapier domain (parent page) vs our own domain (iframe)
        const isZapierReferer = refererUrl.hostname.includes('zapier.app');
        const isOwnDomain = refererUrl.hostname === request.nextUrl.hostname || 
                           refererUrl.hostname.includes('amplifyapp.com');
        
        console.log('[Middleware] Is Zapier referer:', isZapierReferer);
        console.log('[Middleware] Is own domain:', isOwnDomain);
        
        // Only use referer if it's from Zapier (parent page), not from our own domain (iframe)
        const sanitizedFirstName = firstName && !firstName.includes('{{') && !firstName.includes('}}') 
          ? firstName 
          : null;

        if (isZapierReferer && sanitizedFirstName) {
          // Set cookie with firstName from referer
          const response = NextResponse.next();
          const cookieOptions = {
            httpOnly: false, // Allow client-side access
            sameSite: 'lax',
            maxAge: 300, // 5 minutes - increased for testing
          } as const;
          response.cookies.set('assistant-first_name', sanitizedFirstName, cookieOptions);
          response.cookies.set('assistant-first-name', sanitizedFirstName, cookieOptions);
          console.log('[Middleware] Set cookie assistant-first_name:', sanitizedFirstName);
          return response;
        } else if (isOwnDomain && firstName && firstName.includes('{{')) {
          console.log('[Middleware] Referer is from own domain with template variable - ignoring');
        } else if (isZapierReferer && !firstName) {
          console.log('[Middleware] Zapier referer found but no firstName in query params (may be stripped by browser)');
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

