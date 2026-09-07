import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

process.env.NODE_ENV = process.env.NODE_ENV || 'production';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, 'server', '.env') });

// Passenger loader uses require(), but server/src/server.js has top-level await
// so we need to use dynamic import() instead
import('./server/src/server.js').catch(err => {
  console.error('Failed to start application:', err);
  process.exit(1);
});
