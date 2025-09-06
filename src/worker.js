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
        targetBase = `https://${TARGET_DOMAIN}/public/check`;
        // Keep everything after the first slash (including empty path)
        const subPath = pathname === '/' ? '' : pathname;
        targetUrl = `${targetBase}${subPath}${url.search}`;
        
      } else if (hostname === 'share.v2.a11yplan.de' || hostname.includes('share.')) {
        // share.v2.a11yplan.de/* -> v2.a11yplan.de/public/share/*
        targetBase = `https://${TARGET_DOMAIN}/public/share`;
        // Keep everything after the first slash (including empty path)
        const subPath = pathname === '/' ? '' : pathname;
        targetUrl = `${targetBase}${subPath}${url.search}`;
        
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
      
      // Prepare headers - remove Cloudflare-specific headers
      const headers = new Headers(request.headers);
      headers.set('Host', TARGET_DOMAIN.replace('https://', '').replace('http://', ''));
      headers.delete('cf-ray');
      headers.delete('cf-visitor');
      headers.delete('cf-connecting-ip');
      headers.delete('cf-ipcountry');
      
      // Add X-Forwarded headers for the origin server
      headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '');
      headers.set('X-Forwarded-Proto', 'https');
      headers.set('X-Real-IP', request.headers.get('CF-Connecting-IP') || '');
      
      // Forward the request
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: headers,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
        // Preserve the redirect mode
        redirect: 'manual'
      });
      
      // Create new response
      const modifiedResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
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