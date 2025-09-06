/**
 * Cloudflare Worker - Advanced Vercel Bot Protection Handler
 * Handles Vercel's bot protection with cookie persistence
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
        targetBase = `https://${TARGET_DOMAIN}/public/check`;
        const subPath = pathname === '/' ? '' : pathname;
        targetUrl = `${targetBase}${subPath}${url.search}`;
        
      } else if (hostname === 'share.v2.a11yplan.de' || hostname.includes('share.')) {
        targetBase = `https://${TARGET_DOMAIN}/public/share`;
        const subPath = pathname === '/' ? '' : pathname;
        targetUrl = `${targetBase}${subPath}${url.search}`;
        
      } else {
        return new Response('Invalid domain configuration', { 
          status: 400,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
      
      // Prepare headers with full browser emulation
      const headers = new Headers();
      
      // Get client cookies and forward them
      const cookieString = request.headers.get('Cookie');
      if (cookieString) {
        // Forward existing cookies but adjust domain
        headers.set('Cookie', cookieString);
      }
      
      // Copy original headers selectively
      const allowedHeaders = [
        'accept', 'accept-language', 'content-type', 'content-length',
        'authorization', 'cache-control', 'if-modified-since', 'if-none-match',
        'range', 'referer', 'user-agent'
      ];
      
      for (const [key, value] of request.headers.entries()) {
        if (allowedHeaders.includes(key.toLowerCase())) {
          headers.set(key, value);
        }
      }
      
      // Override with browser-like headers for Vercel
      headers.set('Host', TARGET_DOMAIN.replace('https://', '').replace('http://', ''));
      headers.set('User-Agent', request.headers.get('User-Agent') || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      headers.set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8');
      headers.set('Accept-Language', 'en-US,en;q=0.9,de;q=0.8');
      headers.set('Accept-Encoding', 'gzip, deflate, br');
      headers.set('Cache-Control', 'no-cache');
      headers.set('Pragma', 'no-cache');
      headers.set('Sec-Ch-Ua', '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"');
      headers.set('Sec-Ch-Ua-Mobile', '?0');
      headers.set('Sec-Ch-Ua-Platform', '"macOS"');
      headers.set('Sec-Fetch-Dest', 'document');
      headers.set('Sec-Fetch-Mode', 'navigate');
      headers.set('Sec-Fetch-Site', 'none');
      headers.set('Sec-Fetch-User', '?1');
      headers.set('Upgrade-Insecure-Requests', '1');
      
      // Add connection headers
      headers.set('Connection', 'keep-alive');
      headers.set('DNT', '1');
      
      // Add X-Forwarded headers
      const clientIP = request.headers.get('CF-Connecting-IP') || '';
      if (clientIP) {
        headers.set('X-Forwarded-For', clientIP);
        headers.set('X-Real-IP', clientIP);
      }
      headers.set('X-Forwarded-Proto', 'https');
      headers.set('X-Forwarded-Host', hostname);
      
      // Add custom bypass header if configured
      if (env.BYPASS_TOKEN) {
        headers.set('X-Bypass-Token', env.BYPASS_TOKEN);
      }
      
      // First request - might get challenged
      let response = await fetch(targetUrl, {
        method: request.method,
        headers: headers,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
        redirect: 'manual'
      });
      
      // Check if we got a Vercel challenge (usually 307 or specific headers)
      if (response.status === 307 || response.headers.get('x-vercel-protection-bypass')) {
        // Handle Vercel's protection redirect
        const location = response.headers.get('location');
        if (location) {
          // Follow the redirect with cookies
          const challengeCookies = response.headers.getAll('set-cookie');
          if (challengeCookies.length > 0) {
            const cookieHeader = challengeCookies.map(c => c.split(';')[0]).join('; ');
            headers.set('Cookie', cookieHeader);
          }
          
          // Make second request with challenge cookies
          response = await fetch(location.startsWith('http') ? location : `https://${TARGET_DOMAIN}${location}`, {
            method: 'GET',
            headers: headers,
            redirect: 'follow'
          });
        }
      }
      
      // Create response with proper headers
      const responseHeaders = new Headers(response.headers);
      
      // Clean up Vercel headers
      const vercelHeaders = ['x-vercel-id', 'x-vercel-cache', 'x-vercel-deployment-url', 'x-vercel-protection-bypass'];
      vercelHeaders.forEach(h => responseHeaders.delete(h));
      
      // Handle Set-Cookie headers - adjust domain
      const setCookies = response.headers.getAll('set-cookie');
      if (setCookies.length > 0) {
        responseHeaders.delete('set-cookie');
        setCookies.forEach(cookie => {
          // Parse and adjust cookie domain
          let adjustedCookie = cookie;
          
          // Remove or adjust domain attribute
          if (cookie.includes('domain=')) {
            const rootDomain = hostname.split('.').slice(-2).join('.');
            adjustedCookie = cookie.replace(/domain=[^;]+/gi, `domain=.${rootDomain}`);
          }
          
          // Ensure secure flag for HTTPS
          if (!adjustedCookie.includes('secure')) {
            adjustedCookie += '; secure';
          }
          
          // Adjust SameSite if needed
          if (adjustedCookie.includes('samesite=none')) {
            adjustedCookie = adjustedCookie.replace('samesite=none', 'samesite=lax');
          }
          
          responseHeaders.append('set-cookie', adjustedCookie);
        });
      }
      
      // Add CORS if needed
      if (env.ENABLE_CORS === 'true') {
        responseHeaders.set('Access-Control-Allow-Origin', '*');
        responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        responseHeaders.set('Access-Control-Allow-Credentials', 'true');
      }
      
      // Log for debugging
      console.log(JSON.stringify({
        method: request.method,
        path: url.pathname,
        status: response.status,
        duration: Date.now() - startTime,
        target: targetUrl,
        hasChallenge: response.status === 307,
        cookies: setCookies.length
      }));
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });
      
    } catch (error) {
      console.error('Proxy error:', error.message, error.stack);
      
      return new Response(`Service temporarily unavailable: ${error.message}`, { 
        status: 503,
        headers: { 
          'Content-Type': 'text/plain',
          'Retry-After': '60'
        }
      });
    }
  }
};