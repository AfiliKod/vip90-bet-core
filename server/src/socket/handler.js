export function initSocket(io) {
  // Ana namespace — mevcut event/user subscription'ları
  io.on('connection', (socket) => {
    socket.on('subscribe:event', ({ eventId }) => socket.join(`event:${eventId}`));
    socket.on('unsubscribe:event', ({ eventId }) => socket.leave(`event:${eventId}`));

    socket.on('subscribe:user', ({ userId }) => {
      if (userId) socket.join(`user:${userId}`);
    });
    socket.on('unsubscribe:user', ({ userId }) => {
      if (userId) socket.leave(`user:${userId}`);
    });
  });
}
