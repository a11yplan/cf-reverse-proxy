/**
 * Minimal Cloudflare Worker - Smart Routing Proxy
 * Routes:
 *   - check.a11yplan.de/ -> v2.a11yplan.de/public/check/
 *   - API/assets are passed through correctly
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const hostname = url.hostname;
    const pathname = url.pathname;
    const TARGET_DOMAIN = env.TARGET_DOMAIN || 'v2.a11yplan.de';
    
    let targetUrl;
    
    // Determine the routing based on the path pattern
    if (hostname === 'check.a11yplan.de' || hostname.includes('check.')) {
      // Special paths that should go to root
      if (pathname.startsWith('/_nuxt/') || 
          pathname.startsWith('/_ipx/') ||
          pathname.startsWith('/_locales/') ||
          pathname.startsWith('/api/') ||
          pathname === '/favicon.ico') {
        // These go directly to the root
        targetUrl = `https://${TARGET_DOMAIN}${pathname}${url.search}`;
      } else {
        // Everything else goes to /public/check
        targetUrl = `https://${TARGET_DOMAIN}/public/check${pathname}${url.search}`;
      }
    } else if (hostname === 'share.v2.a11yplan.de' || hostname.includes('share.')) {
      // Special paths that should go to root
      if (pathname.startsWith('/_nuxt/') || 
          pathname.startsWith('/_ipx/') ||
          pathname.startsWith('/_locales/') ||
          pathname.startsWith('/api/') ||
          pathname === '/favicon.ico') {
        // These go directly to the root
        targetUrl = `https://${TARGET_DOMAIN}${pathname}${url.search}`;
      } else {
        // Everything else goes to /public/share
        targetUrl = `https://${TARGET_DOMAIN}/public/share${pathname}${url.search}`;
      }
    } else {
      return new Response('Invalid domain', { status: 400 });
    }
    
    // Create new headers
    const headers = new Headers(request.headers);
    headers.set('Host', TARGET_DOMAIN);
    
    // Ensure we have a proper User-Agent
    if (!headers.get('User-Agent')) {
      headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    }
    
    // Forward the request
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: headers,
      body: request.body
    });
    
    // Pass through the response as-is
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  }
};