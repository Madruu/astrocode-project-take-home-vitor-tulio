const DEFAULT_API_BASE_URL = 'http://localhost:3000';
const PLACEHOLDER = '__API_BASE_URL__';

const injected = (globalThis as { __ASTROCODE_API_BASE_URL__?: string }).__ASTROCODE_API_BASE_URL__;
export const API_BASE_URL =
  injected && injected !== PLACEHOLDER ? injected : DEFAULT_API_BASE_URL;

export function buildApiUrl(path: string): string {
  if (!path.startsWith('/')) {
    throw new Error('API path must start with "/"');
  }
  const base = API_BASE_URL.replace(/\/$/, '');
  return `${base}${path}`;
}
