import { NextRequest, NextResponse } from 'next/server';

/**
 * API route to extract query parameters from the Referer header
 * This works because servers can see the full Referer header even when
 * browsers strip query params from document.referrer
 */
export async function GET(request: NextRequest) {
  const referer = request.headers.get('referer');
  
  if (!referer) {
    return NextResponse.json({ params: {} });
  }

  try {
    const refererUrl = new URL(referer);
    const params: Record<string, string> = {};
    
    refererUrl.searchParams.forEach((value, key) => {
      params[key] = value;
    });

    return NextResponse.json({ params, referer });
  } catch (e) {
    console.error('[get-parent-params] Error parsing referer:', e);
    return NextResponse.json({ params: {}, error: 'Invalid referer' });
  }
}

