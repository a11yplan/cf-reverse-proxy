/**
 * Cloudflare Worker - Simple Redirect Approach for Vercel
 * Alternative approach using 301/302 redirects instead of proxying
 * This might work better with Vercel's bot protection
 */

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const hostname = url.hostname;
      const pathname = url.pathname;
      
      const TARGET_DOMAIN = env.TARGET_DOMAIN || 'v2.a11yplan.de';
      const USE_PERMANENT_REDIRECT = env.USE_PERMANENT_REDIRECT === 'true';
      
      let targetUrl;
      
      // Route based on source domain
      if (hostname === 'check.a11yplan.de' || hostname.includes('check.')) {
        const subPath = pathname === '/' ? '' : pathname;
        targetUrl = `https://${TARGET_DOMAIN}/public/check${subPath}${url.search}`;
        
      } else if (hostname === 'share.v2.a11yplan.de' || hostname.includes('share.')) {
        const subPath = pathname === '/' ? '' : pathname;
        targetUrl = `https://${TARGET_DOMAIN}/public/share${subPath}${url.search}`;
        
      } else {
        return new Response('Invalid domain configuration', { 
          status: 400,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
      
      // Return redirect response
      return Response.redirect(targetUrl, USE_PERMANENT_REDIRECT ? 301 : 302);
      
    } catch (error) {
      console.error('Redirect error:', error.message);
      return new Response('Service error', { status: 500 });
    }
  }
};