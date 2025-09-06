# Cloudflare Worker Reverse Proxy for a11yplan.de

A Cloudflare Worker that acts as a reverse proxy for multiple a11yplan.de subdomains:
- `check.a11yplan.de/*` → `v2.a11yplan.de/public/check/*`
- `share.v2.a11yplan.de/*` → `v2.a11yplan.de/public/share/*`

## Features

- ✅ Multi-domain routing support
- ✅ Preserves all path segments and query parameters
- ✅ Header forwarding and cleaning
- ✅ Error handling with user-friendly messages
- ✅ Optional CORS support
- ✅ Request logging for debugging
- ✅ Cache control for performance
- ✅ Support for all HTTP methods

## Setup Instructions

### Prerequisites

- Node.js 16+ installed
- Cloudflare account (free tier works)
- Domain configured in Cloudflare

### Installation

1. Clone this repository:
```bash
git clone <repository-url>
cd cf-reverse-proxy
```

2. Install dependencies:
```bash
npm install
# or using bun
bun install
```

3. Login to Cloudflare:
```bash
npx wrangler login
```

### Configuration

1. The `wrangler.toml` is pre-configured for a11yplan.de:
   - `TARGET_DOMAIN`: Set to `v2.a11yplan.de`
   - `ENABLE_CORS`: Set to `"false"` (change if needed)

2. No additional configuration needed unless you want to change the target domain.

### Development

Run the worker locally:
```bash
npm run dev
# or
bun run dev
```

The worker will be available at `http://localhost:8787`

Test locally:
```bash
# Test check domain routing
curl -H "Host: check.a11yplan.de" http://localhost:8787/
curl -H "Host: check.a11yplan.de" http://localhost:8787/some-path

# Test share domain routing
curl -H "Host: share.v2.a11yplan.de" http://localhost:8787/ID123
curl -H "Host: share.v2.a11yplan.de" http://localhost:8787/ID123/nested/path?param=value
```

### Deployment

#### Deploy to Cloudflare:
```bash
npm run deploy
# or for specific environment
npm run deploy:staging
npm run deploy:production
```

#### Set up Custom Domains:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **Workers & Pages**
3. Click on your worker (`a11yplan-proxy`)
4. Go to **Settings** → **Triggers**
5. Click **Add Custom Domain**
6. Add both domains:
   - `check.a11yplan.de`
   - `share.v2.a11yplan.de`
7. Save

#### DNS Configuration:

If the domains are in the same Cloudflare account, the custom domains will handle DNS automatically.

If they're in different accounts, add these DNS records:

**For check.a11yplan.de:**
```
check  CNAME  a11yplan-proxy.<your-subdomain>.workers.dev
```

**For share.v2.a11yplan.de:**
```
share  CNAME  a11yplan-proxy.<your-subdomain>.workers.dev
```

Make sure the proxy (orange cloud) is ON for both records.

### Environment Variables

Set these in the Cloudflare dashboard under **Workers & Pages** → Your Worker → **Settings** → **Variables**:

| Variable | Description | Default |
|----------|-------------|---------|
| `TARGET_DOMAIN` | The domain to proxy requests to | `v2.a11yplan.de` |
| `ENABLE_CORS` | Enable CORS headers | `false` |

### Monitoring

View real-time logs:
```bash
npm run tail
# or
npx wrangler tail
```

Check metrics in Cloudflare Dashboard:
- Workers & Pages → Your Worker → Analytics

### Testing

After deployment, test both proxy routes:

```bash
# Test check.a11yplan.de routing
curl -v https://check.a11yplan.de/
# Should proxy to: https://v2.a11yplan.de/public/check/

curl -v https://check.a11yplan.de/some-path?param=value
# Should proxy to: https://v2.a11yplan.de/public/check/some-path?param=value

# Test share.v2.a11yplan.de routing
curl -v https://share.v2.a11yplan.de/ID123
# Should proxy to: https://v2.a11yplan.de/public/share/ID123

curl -v https://share.v2.a11yplan.de/ID123/nested/path?foo=bar
# Should proxy to: https://v2.a11yplan.de/public/share/ID123/nested/path?foo=bar
```

### Advanced Configuration

#### Multiple Environments

The project supports multiple environments (staging, production):

```bash
# Deploy to staging
npm run deploy:staging

# Deploy to production  
npm run deploy:production
```

#### Rate Limiting

Add rate limiting in the Cloudflare dashboard:
1. Go to **Workers & Pages** → Your Worker
2. Navigate to **Settings** → **Security**
3. Configure rate limiting rules

#### Caching

The worker adds cache headers for successful GET requests. Modify the cache duration in `src/worker.js`:

```javascript
modifiedResponse.headers.set('Cache-Control', 'public, max-age=3600');
```

## Troubleshooting

### Common Issues

1. **"Invalid domain configuration" error**
   - The worker only accepts requests from `check.a11yplan.de` or `share.v2.a11yplan.de`
   - Check that custom domains are properly configured

2. **503 Service Unavailable**
   - Check that `TARGET_DOMAIN` is set correctly (should be `v2.a11yplan.de`)
   - Verify the target server is accessible

3. **DNS not resolving**
   - Ensure custom domains are added in Cloudflare Workers settings
   - Wait 5-10 minutes for DNS propagation

4. **CORS errors**
   - Set `ENABLE_CORS` to `"true"` in environment variables

5. **Path not forwarding correctly**
   - The worker preserves all paths and query parameters
   - Check the console logs in Cloudflare dashboard for the actual target URL

### Vercel Bot Protection Issues

If you see "Wir überprüfen Ihren Browser - fehlgeschlagen" (browser check failed), this is Vercel's bot protection. The worker includes headers to bypass this, but if issues persist:

#### Option 1: Use the Enhanced Worker (default)
The main worker (`src/worker.js`) includes:
- Browser-like User-Agent headers
- Proper cookie handling
- Security headers that Vercel expects

#### Option 2: Use Simple Redirect (alternative)
If proxying doesn't work, try the redirect approach:
```bash
# Edit wrangler.toml to use the redirect worker
main = "src/worker-redirect.js"

# Deploy
bun run deploy
```

This will use 302 redirects instead of proxying, which bypasses Vercel's bot check but changes the URL in the browser.

#### Option 3: Whitelist Cloudflare IPs
In your Vercel project settings:
1. Go to Project Settings → Functions
2. Add Cloudflare's IP ranges to the allowlist
3. Or disable bot protection for `/public/*` routes

#### Option 4: Add Custom Headers
Set these environment variables in Cloudflare dashboard:
- `BYPASS_BOT_CHECK`: Custom header your Vercel app recognizes
- `SECRET_TOKEN`: Shared secret between Cloudflare and Vercel

### Debug Mode

Enable verbose logging by checking the logs:
```bash
npx wrangler tail
```

## Performance

- **Free tier**: 100,000 requests/day
- **Response time**: ~50ms added latency (depends on region)
- **Global coverage**: Deployed to 200+ Cloudflare edge locations

## Security Considerations

- The worker strips Cloudflare-specific headers before forwarding
- Adds proper `X-Forwarded-*` headers for the origin server
- Returns generic error messages to avoid information leakage
- Consider adding authentication if needed

## License

MIT