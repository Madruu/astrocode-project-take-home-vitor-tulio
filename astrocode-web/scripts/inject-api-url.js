/**
 * Injects API_BASE_URL into the built index.html for production deployment.
 * Run after ng build. Reads from process.env.API_BASE_URL.
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexPath = join(__dirname, '../dist/astrocode-web/browser/index.html');
const apiUrl = process.env.API_BASE_URL || 'http://localhost:3000';

let html = readFileSync(indexPath, 'utf8');
html = html.replace(/__API_BASE_URL__/g, apiUrl);
writeFileSync(indexPath, html);

console.log('Injected API_BASE_URL:', apiUrl);
