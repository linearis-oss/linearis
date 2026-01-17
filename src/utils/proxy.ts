/**
 * Proxy configuration utilities for Linearis CLI
 *
 * Node.js native fetch doesn't respect HTTP_PROXY/HTTPS_PROXY environment
 * variables. This module provides utilities to detect and configure proxy
 * settings using undici's ProxyAgent.
 */

import { ProxyAgent, setGlobalDispatcher } from "undici";

export interface ProxyConfig {
  proxyUrl: string | undefined;
  noProxy: string;
  insecure: boolean;
}

/**
 * Detect proxy configuration from environment variables.
 *
 * Priority order: HTTPS_PROXY > HTTP_PROXY > https_proxy > http_proxy
 */
export function detectProxyConfig(): ProxyConfig {
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy;

  const noProxy = process.env.NO_PROXY || process.env.no_proxy || "";

  const insecure =
    process.env.LINEARIS_PROXY_INSECURE === "1" ||
    process.env.LINEARIS_PROXY_INSECURE === "true";

  return { proxyUrl, noProxy, insecure };
}

/**
 * Configure the global fetch dispatcher to use a proxy.
 *
 * @param config - Proxy configuration from detectProxyConfig()
 * @param warn - Function to output warnings (defaults to console.error)
 */
export function configureProxy(
  config: ProxyConfig,
  warn: (msg: string) => void = console.error
): void {
  if (!config.proxyUrl) {
    return;
  }

  interface ProxyAgentOptions {
    uri: string;
    noProxy?: string;
    proxyTls?: { rejectUnauthorized: boolean };
  }

  const proxyOptions: ProxyAgentOptions = {
    uri: config.proxyUrl,
  };

  if (config.noProxy) {
    proxyOptions.noProxy = config.noProxy;
  }

  if (config.insecure) {
    proxyOptions.proxyTls = { rejectUnauthorized: false };
    warn(
      "[linearis] Warning: LINEARIS_PROXY_INSECURE is enabled. " +
        "TLS certificate verification for proxy connections is disabled."
    );
  }

  setGlobalDispatcher(new ProxyAgent(proxyOptions));
}

/**
 * Initialize proxy support from environment variables.
 * This is the main entry point called at application startup.
 */
export function initializeProxy(): void {
  const config = detectProxyConfig();
  configureProxy(config);
}
