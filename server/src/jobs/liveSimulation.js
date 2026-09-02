import Event from '../models/Event.js';

function nudgeOdds(value) {
  const delta = (Math.random() - 0.5) * 0.1;
  return Math.max(1.01, +(value + delta).toFixed(2));
}

export function startLiveSimulation(io) {
  setInterval(async () => {
    try {
      const liveEvents = await Event.find({ status:'live' });
      for (const event of liveEvents) {
        for (const market of event.markets) {
          for (const odd of market.odds) odd.value = nudgeOdds(odd.value);
        }
        if (event.liveScore.minute < 90) event.liveScore.minute += 1;
        event.markModified('markets');
        event.markModified('liveScore');
        await event.save();
        io.emit('odds:update', { eventId: event._id, markets: event.markets });
        io.emit('score:update', { eventId: event._id, score: event.liveScore });
      }
    } catch(e) { console.error('Simulation error:', e.message); }
  }, 8000);
}
