import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const formUrl = searchParams.get('url');

  if (!formUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    // Fetch the form HTML from Zapier
    const response = await fetch(formUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch form: ${response.status}` },
        { status: response.status }
      );
    }

    let html = await response.text();
    
    // Parse the form URL to get the base domain
    const formUrlObj = new URL(formUrl);
    const baseUrl = `${formUrlObj.protocol}//${formUrlObj.host}`;
    
    // Rewrite relative URLs to absolute URLs pointing to Zapier
    // Fix src, href, action, and data attributes
    html = html.replace(
      /(src|href|action|data-src|data-href)="([^"]+)"/gi,
      (match, attr, url) => {
        // Skip if already absolute or protocol-relative
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//') || url.startsWith('data:') || url.startsWith('javascript:')) {
          return match;
        }
        // Make relative URLs absolute
        const absoluteUrl = url.startsWith('/') 
          ? `${baseUrl}${url}` 
          : `${baseUrl}/${url}`;
        return `${attr}="${absoluteUrl}"`;
      }
    );
    
    // Also fix URLs in style attributes and inline styles
    html = html.replace(
      /url\((['"]?)([^'")]+)\1\)/gi,
      (match, quote, url) => {
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//') || url.startsWith('data:')) {
          return match;
        }
        const absoluteUrl = url.startsWith('/') 
          ? `${baseUrl}${url}` 
          : `${baseUrl}/${url}`;
        return `url(${quote}${absoluteUrl}${quote})`;
      }
    );

    // Return the HTML with appropriate headers
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('[proxy-zapier-form] Error fetching form:', error);
    return NextResponse.json(
      { error: 'Failed to fetch form' },
      { status: 500 }
    );
  }
}

