import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy endpoint for Zapier to pass parameters to the assistant iframe
 * 
 * Usage in Zapier:
 * <iframe src="https://main.d2xcz3k9ugtvab.amplifyapp.com/api/assistant-proxy?first_name={{query.first_name}}"></iframe>
 * 
 * This endpoint will:
 * 1. Extract the first_name parameter (legacy aliases supported)
 * 2. Set it as a cookie
 * 3. Redirect to /assistant with the parameter in the URL
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const firstName =
    searchParams.get('first_name') ||
    searchParams.get('first-name') ||
    searchParams.get('firstName') ||
    searchParams.get('firstname');
  const sanitizedFirstName =
    firstName && !firstName.includes('{{') && !firstName.includes('}}') ? firstName : null;
  
  console.log('[assistant-proxy] Received request with firstName:', firstName);
  console.log('[assistant-proxy] All params:', Object.fromEntries(searchParams.entries()));
  
  // Build redirect URL to /assistant
  const assistantUrl = new URL('/assistant', request.url);
  
  // If we have a valid firstName (not a template variable), add it to the URL
  if (sanitizedFirstName) {
    assistantUrl.searchParams.set('first_name', sanitizedFirstName);
    
    // Also set a cookie for redundancy
    const response = NextResponse.redirect(assistantUrl);
    const cookieOptions = {
      httpOnly: false,
      sameSite: 'lax',
      maxAge: 300, // 5 minutes
    };
    response.cookies.set('assistant-first_name', sanitizedFirstName, cookieOptions);
    response.cookies.set('assistant-first-name', sanitizedFirstName, cookieOptions);
    
    console.log('[assistant-proxy] Redirecting to:', assistantUrl.toString());
    return response;
  } else {
    // If it's a template variable or missing, just redirect without parameter
    console.log('[assistant-proxy] No valid firstName, redirecting without parameter');
    return NextResponse.redirect(assistantUrl);
  }
}

