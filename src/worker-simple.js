/**
 * Cloudflare Worker - Simplified Reverse Proxy
 * Routes:
 *   - check.a11yplan.de/* -> v2.a11yplan.de/public/check/*
 *   - share.v2.a11yplan.de/* -> v2.a11yplan.de/public/share/*
 * 
 * Optimized version for when /public path is allowed in Vercel
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
      const TARGET_DOMAIN = env.TARGET_DOMAIN || 'v2.a11yplan.de';
      
      // Route based on source domain
      if (hostname === 'check.a11yplan.de' || hostname.includes('check.')) {
        // check.a11yplan.de/* -> v2.a11yplan.de/public/check/*
        const subPath = pathname === '/' ? '' : pathname;
        targetUrl = `https://${TARGET_DOMAIN}/public/check${subPath}${url.search}`;
        
      } else if (hostname === 'share.v2.a11yplan.de' || hostname.includes('share.')) {
        // share.v2.a11yplan.de/* -> v2.a11yplan.de/public/share/*
        const subPath = pathname === '/' ? '' : pathname;
        targetUrl = `https://${TARGET_DOMAIN}/public/share${subPath}${url.search}`;
        
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
      
      // Prepare clean headers
      const headers = new Headers();
      
      // Copy relevant headers from the original request
      const headersToForward = [
        'accept',
        'accept-language',
        'accept-encoding',
        'content-type',
        'content-length',
        'user-agent',
        'referer',
        'origin'
      ];
      
      for (const header of headersToForward) {
        const value = request.headers.get(header);
        if (value) {
          headers.set(header, value);
        }
      }
      
      // Set required headers
      headers.set('Host', TARGET_DOMAIN);
      
      // Add X-Forwarded headers for logging/analytics
      const clientIP = request.headers.get('CF-Connecting-IP') || '';
      if (clientIP) {
        headers.set('X-Forwarded-For', clientIP);
        headers.set('X-Real-IP', clientIP);
      }
      headers.set('X-Forwarded-Proto', 'https');
      headers.set('X-Forwarded-Host', hostname);
      
      // Forward the request
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: headers,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
        redirect: 'follow'
      });
      
      // Create response with original headers
      const modifiedResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
      
      // Add CORS headers if needed
      if (env.ENABLE_CORS === 'true') {
        modifiedResponse.headers.set('Access-Control-Allow-Origin', '*');
        modifiedResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        modifiedResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      }
      
      // Add cache control for successful GET responses
      if (response.status === 200 && request.method === 'GET') {
        // Cache for 1 hour by default, adjust as needed
        modifiedResponse.headers.set('Cache-Control', 'public, max-age=3600');
      }
      
      // Log request for debugging (visible in Cloudflare dashboard)
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        method: request.method,
        hostname: hostname,
        path: url.pathname,
        target: targetUrl,
        status: response.status,
        duration: `${Date.now() - startTime}ms`
      }));
      
      return modifiedResponse;
      
    } catch (error) {
      console.error('Proxy error:', error.message, error.stack);
      
      // Return user-friendly error
      return new Response('Service temporarily unavailable', { 
        status: 503,
        headers: { 
          'Content-Type': 'text/plain',
          'Cache-Control': 'no-cache',
          'Retry-After': '60'
        }
      });
    }
  }
};