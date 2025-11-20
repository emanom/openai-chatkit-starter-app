import { NextRequest, NextResponse } from 'next/server';

/**
 * API route to extract query parameters from the Referer header
 * This works because servers can see the full Referer header even when
 * browsers strip query params from document.referrer
 */
export async function GET(request: NextRequest) {
  const referer = request.headers.get('referer') || request.headers.get('referrer');
  
  console.log('[get-parent-params] Referer:', referer);
  console.log('[get-parent-params] Request URL:', request.url);
  console.log('[get-parent-params] Request search params:', request.nextUrl.searchParams.toString());
  
  // Also check the request URL itself for query params (in case they're passed directly)
  const requestParams: Record<string, string> = {};
  request.nextUrl.searchParams.forEach((value, key) => {
    requestParams[key] = value;
  });
  
  if (!referer) {
    return NextResponse.json({ 
      params: requestParams, 
      message: 'No referer header',
      requestUrl: request.url,
      requestParams 
    });
  }

  try {
    const refererUrl = new URL(referer);
    const params: Record<string, string> = {};
    
    refererUrl.searchParams.forEach((value, key) => {
      params[key] = value;
    });

    console.log('[get-parent-params] Extracted params from referer:', params);
    console.log('[get-parent-params] Referer hostname:', refererUrl.hostname);
    
    // Check if referer is from Zapier
    const isZapierReferer = refererUrl.hostname.includes('zapier.app');
    
    return NextResponse.json({ 
      params, 
      referer, 
      refererUrl: refererUrl.href,
      refererHostname: refererUrl.hostname,
      isZapierReferer,
      requestParams,
      requestUrl: request.url
    });
  } catch (e) {
    console.error('[get-parent-params] Error parsing referer:', e);
    return NextResponse.json({ params: {}, error: 'Invalid referer', referer, requestParams });
  }
}

