import { NextRequest, NextResponse } from 'next/server';

/**
 * API route to extract query parameters from the Referer header
 * This works because servers can see the full Referer header even when
 * browsers strip query params from document.referrer
 */
export async function GET(request: NextRequest) {
  const referer = request.headers.get('referer') || request.headers.get('referrer');
  const allHeaders = Object.fromEntries(request.headers.entries());
  
  console.log('[get-parent-params] Referer:', referer);
  console.log('[get-parent-params] All headers:', JSON.stringify(allHeaders, null, 2));
  
  if (!referer) {
    return NextResponse.json({ params: {}, message: 'No referer header' });
  }

  try {
    const refererUrl = new URL(referer);
    const params: Record<string, string> = {};
    
    refererUrl.searchParams.forEach((value, key) => {
      params[key] = value;
    });

    console.log('[get-parent-params] Extracted params:', params);
    return NextResponse.json({ params, referer, refererUrl: refererUrl.href });
  } catch (e) {
    console.error('[get-parent-params] Error parsing referer:', e);
    return NextResponse.json({ params: {}, error: 'Invalid referer', referer });
  }
}

