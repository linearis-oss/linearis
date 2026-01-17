import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { detectProxyConfig } from "../../src/utils/proxy.js";

/**
 * Unit tests for proxy configuration detection
 *
 * Tests the detectProxyConfig function which reads proxy settings
 * from environment variables.
 */

describe("detectProxyConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
    delete process.env.HTTPS_PROXY;
    delete process.env.HTTP_PROXY;
    delete process.env.https_proxy;
    delete process.env.http_proxy;
    delete process.env.NO_PROXY;
    delete process.env.no_proxy;
    delete process.env.LINEARIS_PROXY_INSECURE;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("proxy URL detection", () => {
    it("should return undefined when no proxy is configured", () => {
      const config = detectProxyConfig();
      expect(config.proxyUrl).toBeUndefined();
    });

    it("should detect HTTPS_PROXY", () => {
      process.env.HTTPS_PROXY = "http://proxy.example.com:8080";
      const config = detectProxyConfig();
      expect(config.proxyUrl).toBe("http://proxy.example.com:8080");
    });

    it("should detect HTTP_PROXY", () => {
      process.env.HTTP_PROXY = "http://proxy.example.com:8080";
      const config = detectProxyConfig();
      expect(config.proxyUrl).toBe("http://proxy.example.com:8080");
    });

    it("should detect lowercase https_proxy", () => {
      process.env.https_proxy = "http://proxy.example.com:8080";
      const config = detectProxyConfig();
      expect(config.proxyUrl).toBe("http://proxy.example.com:8080");
    });

    it("should detect lowercase http_proxy", () => {
      process.env.http_proxy = "http://proxy.example.com:8080";
      const config = detectProxyConfig();
      expect(config.proxyUrl).toBe("http://proxy.example.com:8080");
    });

    it("should prioritize HTTPS_PROXY over HTTP_PROXY", () => {
      process.env.HTTPS_PROXY = "http://https-proxy.example.com:8080";
      process.env.HTTP_PROXY = "http://http-proxy.example.com:8080";
      const config = detectProxyConfig();
      expect(config.proxyUrl).toBe("http://https-proxy.example.com:8080");
    });

    it("should prioritize uppercase over lowercase", () => {
      process.env.HTTPS_PROXY = "http://uppercase.example.com:8080";
      process.env.https_proxy = "http://lowercase.example.com:8080";
      const config = detectProxyConfig();
      expect(config.proxyUrl).toBe("http://uppercase.example.com:8080");
    });

    it("should handle proxy URL with authentication", () => {
      process.env.HTTPS_PROXY = "http://user:pass@proxy.example.com:8080";
      const config = detectProxyConfig();
      expect(config.proxyUrl).toBe("http://user:pass@proxy.example.com:8080");
    });
  });

  describe("NO_PROXY detection", () => {
    it("should return empty string when NO_PROXY is not set", () => {
      const config = detectProxyConfig();
      expect(config.noProxy).toBe("");
    });

    it("should detect NO_PROXY", () => {
      process.env.NO_PROXY = "localhost,127.0.0.1,.local";
      const config = detectProxyConfig();
      expect(config.noProxy).toBe("localhost,127.0.0.1,.local");
    });

    it("should detect lowercase no_proxy", () => {
      process.env.no_proxy = "localhost,127.0.0.1";
      const config = detectProxyConfig();
      expect(config.noProxy).toBe("localhost,127.0.0.1");
    });

    it("should prioritize uppercase NO_PROXY", () => {
      process.env.NO_PROXY = "uppercase.local";
      process.env.no_proxy = "lowercase.local";
      const config = detectProxyConfig();
      expect(config.noProxy).toBe("uppercase.local");
    });
  });

  describe("insecure mode detection", () => {
    it("should default to secure mode", () => {
      const config = detectProxyConfig();
      expect(config.insecure).toBe(false);
    });

    it("should detect LINEARIS_PROXY_INSECURE=1", () => {
      process.env.LINEARIS_PROXY_INSECURE = "1";
      const config = detectProxyConfig();
      expect(config.insecure).toBe(true);
    });

    it("should detect LINEARIS_PROXY_INSECURE=true", () => {
      process.env.LINEARIS_PROXY_INSECURE = "true";
      const config = detectProxyConfig();
      expect(config.insecure).toBe(true);
    });

    it("should not enable insecure mode for other values", () => {
      process.env.LINEARIS_PROXY_INSECURE = "yes";
      const config = detectProxyConfig();
      expect(config.insecure).toBe(false);
    });

    it("should not enable insecure mode for empty string", () => {
      process.env.LINEARIS_PROXY_INSECURE = "";
      const config = detectProxyConfig();
      expect(config.insecure).toBe(false);
    });
  });
});
