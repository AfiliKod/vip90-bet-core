import 'dotenv/config';

// Global console timing patch
['log', 'warn', 'error', 'info'].forEach(method => {
  const orig = console[method].bind(console);
  console[method] = (...args) => {
    const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
    orig(`[${ts}]`, ...args);
  };
});
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createApp, corsOptions } from './app.js';
import { connectDB } from './db.js';
import { initSocket } from './socket/handler.js';
import { startoddsSourceLiveSync } from './jobs/oddsSourceLiveSync.js';
import { startoddsSourceUpcomingSync } from './jobs/oddsSourceUpcomingSync.js';
import { startStatusTransition } from './jobs/statusTransition.js';
import { startCleanupJob } from './jobs/cleanup.js';
const app = createApp();
const httpServer = createServer(app);
export const io = new Server(httpServer, { cors: corsOptions });

const PORT = process.env.PORT || 3001;
connectDB()
  .then(async () => {
    httpServer.listen(PORT, () => console.log(`Server :${PORT} üzerinde çalışıyor`));
    initSocket(io);
    startCleanupJob();
    startStatusTransition(io);
    startoddsSourceLiveSync(io);
    startoddsSourceUpcomingSync(io);
  })
  .catch(err => {
    console.error('DB bağlantı hatası:', err.message);
    process.exit(1);
  });
