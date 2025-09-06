import { describe, it, expect, beforeAll } from 'vitest';
import worker from './worker.js';

describe('Cloudflare Worker Reverse Proxy for a11yplan.de', () => {
  const env = {
    TARGET_DOMAIN: 'v2.a11yplan.de',
    ENABLE_CORS: 'false',
  };

  describe('check.a11yplan.de routing', () => {
    it('should proxy root path to /public/check', async () => {
      const request = new Request('https://check.a11yplan.de/');
      
      global.fetch = async (url, options) => {
        expect(url).toBe('https://v2.a11yplan.de/public/check');
        expect(options.headers.get('Host')).toBe('v2.a11yplan.de');
        
        return new Response('Check page', {
          status: 200,
          headers: new Headers({ 'Content-Type': 'text/html' }),
        });
      };

      const response = await worker.fetch(request, env, {});
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toBe('Check page');
    });

    it('should proxy check subdomain with path', async () => {
      const request = new Request('https://check.a11yplan.de/some/path');
      
      global.fetch = async (url, options) => {
        expect(url).toBe('https://v2.a11yplan.de/public/check/some/path');
        expect(options.headers.get('Host')).toBe('v2.a11yplan.de');
        
        return new Response('Success', {
          status: 200,
          headers: new Headers({ 'Content-Type': 'text/plain' }),
        });
      };

      const response = await worker.fetch(request, env, {});
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toBe('Success');
    });

    it('should preserve query parameters for check domain', async () => {
      const request = new Request('https://check.a11yplan.de/test?foo=bar&baz=qux');
      
      global.fetch = async (url) => {
        expect(url).toBe('https://v2.a11yplan.de/public/check/test?foo=bar&baz=qux');
        return new Response('OK', { status: 200 });
      };

      const response = await worker.fetch(request, env, {});
      expect(response.status).toBe(200);
    });
  });

  describe('share.v2.a11yplan.de routing', () => {
    it('should proxy share subdomain with ID', async () => {
      const request = new Request('https://share.v2.a11yplan.de/ID123');
      
      global.fetch = async (url, options) => {
        expect(url).toBe('https://v2.a11yplan.de/public/share/ID123');
        expect(options.headers.get('Host')).toBe('v2.a11yplan.de');
        
        return new Response('Share content', {
          status: 200,
          headers: new Headers({ 'Content-Type': 'text/html' }),
        });
      };

      const response = await worker.fetch(request, env, {});
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toBe('Share content');
    });

    it('should proxy share subdomain with nested paths', async () => {
      const request = new Request('https://share.v2.a11yplan.de/ID123/nested/path');
      
      global.fetch = async (url) => {
        expect(url).toBe('https://v2.a11yplan.de/public/share/ID123/nested/path');
        return new Response('OK', { status: 200 });
      };

      const response = await worker.fetch(request, env, {});
      expect(response.status).toBe(200);
    });

    it('should handle POST requests with body on share domain', async () => {
      const body = JSON.stringify({ test: 'data' });
      const request = new Request('https://share.v2.a11yplan.de/ID123', {
        method: 'POST',
        body: body,
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      global.fetch = async (url, options) => {
        expect(url).toBe('https://v2.a11yplan.de/public/share/ID123');
        expect(options.method).toBe('POST');
        expect(await options.body).toBe(body);
        return new Response('Created', { status: 201 });
      };

      const response = await worker.fetch(request, env, {});
      expect(response.status).toBe(201);
    });
  });

  describe('Invalid domain handling', () => {
    it('should return 400 for unknown domains', async () => {
      const request = new Request('https://unknown.domain.com/test');
      const response = await worker.fetch(request, env, {});
      
      expect(response.status).toBe(400);
      const text = await response.text();
      expect(text).toBe('Invalid domain configuration');
    });
  });

  describe('CORS handling', () => {
    it('should add CORS headers when enabled', async () => {
      const corsEnv = { ...env, ENABLE_CORS: 'true' };
      const request = new Request('https://check.a11yplan.de/test');
      
      global.fetch = async () => new Response('OK', { status: 200 });

      const response = await worker.fetch(request, corsEnv, {});
      
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, PUT, DELETE, OPTIONS');
    });

    it('should not add CORS headers when disabled', async () => {
      const request = new Request('https://share.v2.a11yplan.de/ID123');
      
      global.fetch = async () => new Response('OK', { status: 200 });

      const response = await worker.fetch(request, env, {});
      
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });
  });

  describe('Error handling', () => {
    it('should handle fetch errors gracefully', async () => {
      const request = new Request('https://check.a11yplan.de/test');
      
      global.fetch = async () => {
        throw new Error('Network error');
      };

      const response = await worker.fetch(request, env, {});
      
      expect(response.status).toBe(503);
      const text = await response.text();
      expect(text).toBe('Service temporarily unavailable');
      expect(response.headers.get('Retry-After')).toBe('60');
    });
  });

  describe('Header management', () => {
    it('should remove Cloudflare-specific headers', async () => {
      const request = new Request('https://share.v2.a11yplan.de/ID123', {
        headers: {
          'cf-ray': 'should-be-removed',
          'cf-visitor': 'should-be-removed',
          'cf-connecting-ip': '1.2.3.4',
          'Authorization': 'Bearer token',
        },
      });
      
      global.fetch = async (url, options) => {
        expect(options.headers.get('cf-ray')).toBeNull();
        expect(options.headers.get('cf-visitor')).toBeNull();
        expect(options.headers.get('Authorization')).toBe('Bearer token');
        expect(options.headers.get('X-Forwarded-For')).toBe('1.2.3.4');
        return new Response('OK', { status: 200 });
      };

      await worker.fetch(request, env, {});
    });
  });
});