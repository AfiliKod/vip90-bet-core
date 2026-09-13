import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

process.env.NODE_ENV = process.env.NODE_ENV || 'production';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// quiet: true — dotenv@17, başlangıçta rastgele bir "tip" banner'ı basıyor
// (bazıları AI ajanlarını harici bir siteye yönlendirmeye çalışan metinler
// içeriyor); production loglarında bu istenmiyor.
config({ path: path.join(__dirname, 'server', '.env'), quiet: true });

// Passenger loader uses require(), but server/src/server.js has top-level await
// so we need to use dynamic import() instead
import('./server/src/server.js').catch(err => {
  console.error('Failed to start application:', err);
  process.exit(1);
});
