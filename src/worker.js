/**
 * Cloudflare Worker - Multi-Domain Reverse Proxy
 * Routes:
 *   - check.a11yplan.de/* -> v2.a11yplan.de/public/check/*
 *   - share.v2.a11yplan.de/* -> v2.a11yplan.de/public/share/*
 */

export default {
  async fetch(request, env, ctx) {
    const startTime = Date.now();
    
    try {
      const url = new URL(request.url);
      const hostname = url.hostname;
      const pathname = url.pathname;
      
      // Determine target URL based on hostname
      let targetUrl;
      let targetBase;
      
      const TARGET_DOMAIN = env.TARGET_DOMAIN || 'v2.a11yplan.de';
      
      // Route based on source domain
      if (hostname === 'check.a11yplan.de' || hostname.includes('check.')) {
        // check.a11yplan.de/* -> v2.a11yplan.de/public/check/*
        // Special handling for Nuxt.js assets
        if (pathname.startsWith('/_nuxt/')) {
          // _nuxt assets should be served from the root, not from /public/check
          targetUrl = `https://${TARGET_DOMAIN}${pathname}${url.search}`;
        } else {
          targetBase = `https://${TARGET_DOMAIN}/public/check`;
          // Keep everything after the first slash (including empty path)
          const subPath = pathname === '/' ? '' : pathname;
          targetUrl = `${targetBase}${subPath}${url.search}`;
        }
        
      } else if (hostname === 'share.v2.a11yplan.de' || hostname.includes('share.')) {
        // share.v2.a11yplan.de/* -> v2.a11yplan.de/public/share/*
        // Special handling for Nuxt.js assets
        if (pathname.startsWith('/_nuxt/')) {
          // _nuxt assets should be served from the root, not from /public/share
          targetUrl = `https://${TARGET_DOMAIN}${pathname}${url.search}`;
        } else {
          targetBase = `https://${TARGET_DOMAIN}/public/share`;
          // Keep everything after the first slash (including empty path)
          const subPath = pathname === '/' ? '' : pathname;
          targetUrl = `${targetBase}${subPath}${url.search}`;
        }
        
      } else {
        // Unknown domain - return error
        return new Response('Invalid domain configuration', { 
          status: 400,
          headers: { 
            'Content-Type': 'text/plain',
            'Cache-Control': 'no-cache'
          }
        });
      }
      
      // Prepare headers - Handle Vercel bot protection
      const headers = new Headers();
      
      // Copy original headers but skip CF-specific ones
      for (const [key, value] of request.headers.entries()) {
        if (!key.toLowerCase().startsWith('cf-') && 
            key.toLowerCase() !== 'host' &&
            key.toLowerCase() !== 'x-forwarded-for' &&
            key.toLowerCase() !== 'x-real-ip') {
          headers.set(key, value);
        }
      }
      
      // Set proper host header
      headers.set('Host', TARGET_DOMAIN.replace('https://', '').replace('http://', ''));
      
      // Add user agent if missing (Vercel requires this)
      if (!headers.get('User-Agent')) {
        headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      }
      
      // Add standard browser headers to pass Vercel's bot check
      // Use appropriate Accept header based on the resource type
      if (pathname.endsWith('.js') || pathname.endsWith('.mjs')) {
        headers.set('Accept', '*/*');
        headers.set('Sec-Fetch-Dest', 'script');
      } else if (pathname.endsWith('.css')) {
        headers.set('Accept', 'text/css,*/*;q=0.1');
        headers.set('Sec-Fetch-Dest', 'style');
      } else if (pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/i)) {
        headers.set('Accept', 'image/webp,image/apng,image/*,*/*;q=0.8');
        headers.set('Sec-Fetch-Dest', 'image');
      } else {
        headers.set('Accept', headers.get('Accept') || 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8');
        headers.set('Sec-Fetch-Dest', 'document');
      }
      
      headers.set('Accept-Language', headers.get('Accept-Language') || 'en-US,en;q=0.5');
      headers.set('Accept-Encoding', 'gzip, deflate, br');
      headers.set('Sec-Fetch-Mode', pathname.startsWith('/_nuxt/') ? 'cors' : 'navigate');
      headers.set('Sec-Fetch-Site', 'same-origin');
      
      // Add X-Forwarded headers for the origin server
      const clientIP = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '';
      if (clientIP) {
        headers.set('X-Forwarded-For', clientIP);
        headers.set('X-Real-IP', clientIP.split(',')[0].trim());
      }
      headers.set('X-Forwarded-Proto', 'https');
      headers.set('X-Forwarded-Host', hostname);
      
      // Forward the request with credentials
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: headers,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
        // Follow redirects to handle Vercel's potential redirects
        redirect: 'follow',
        // Important: include credentials for Vercel
        credentials: 'include'
      });
      
      // Create new response with cleaned headers
      const responseHeaders = new Headers(response.headers);
      
      // Remove Vercel-specific headers that shouldn't be exposed
      responseHeaders.delete('x-vercel-id');
      responseHeaders.delete('x-vercel-cache');
      responseHeaders.delete('x-vercel-deployment-url');
      
      // Handle cookies properly for Vercel bot protection
      const setCookieHeaders = response.headers.getAll('set-cookie');
      if (setCookieHeaders.length > 0) {
        responseHeaders.delete('set-cookie');
        setCookieHeaders.forEach(cookie => {
          // Adjust cookie domain to match the proxy domain
          const adjustedCookie = cookie
            .replace(/domain=[^;]+;?/gi, `domain=${hostname.split('.').slice(-2).join('.')};`)
            .replace(/secure;?/gi, 'secure;')
            .replace(/samesite=none;?/gi, 'samesite=lax;');
          responseHeaders.append('set-cookie', adjustedCookie);
        });
      }
      
      const modifiedResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });
      
      // Add CORS headers if needed (optional)
      if (env.ENABLE_CORS === 'true') {
        modifiedResponse.headers.set('Access-Control-Allow-Origin', '*');
        modifiedResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        modifiedResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      }
      
      // Add cache control for successful responses (optional)
      if (response.status === 200 && request.method === 'GET') {
        modifiedResponse.headers.set('Cache-Control', 'public, max-age=3600');
      }
      
      // Log for debugging (visible in Cloudflare dashboard)
      console.log(JSON.stringify({
        method: request.method,
        path: url.pathname,
        status: response.status,
        duration: Date.now() - startTime,
        target: targetUrl
      }));
      
      return modifiedResponse;
      
    } catch (error) {
      console.error('Proxy error:', error.message, error.stack);
      
      // Return user-friendly error
      return new Response(`Service temporarily unavailable`, { 
        status: 503,
        headers: { 
          'Content-Type': 'text/plain',
          'Retry-After': '60'
        }
      });
    }
  }
};