import Event from '../models/Event.js';
import Tenant from '../models/Tenant.js';
import { getIO } from '../services/socketEmitter.js';
import { publishToAllTenants } from '../socket/publish.js';

function nudgeOdds(value) {
  const delta = (Math.random() - 0.5) * 0.1;
  return Math.max(1.01, +(value + delta).toFixed(2));
}

export function startLiveSimulation() {
  setInterval(async () => {
    try {
      const io = getIO();
      if (!io) return;
      const liveEvents = await Event.find({ status:'live' });
      const tenants = await Tenant.find({ status: 'active' }).select('_id').lean();
      for (const event of liveEvents) {
        for (const market of event.markets) {
          for (const odd of market.odds) odd.value = nudgeOdds(odd.value);
        }
        if (event.liveScore.minute < 90) event.liveScore.minute += 1;
        event.markModified('markets');
        event.markModified('liveScore');
        await event.save();
        // Event is shared catalog data: every tenant's clients get the update
        // (single mode without a tenant yet: global broadcast, as today).
        await publishToAllTenants('odds:update', { eventId: event._id, markets: event.markets }, { tenants, io });
        await publishToAllTenants('score:update', { eventId: event._id, score: event.liveScore }, { tenants, io });
      }
    } catch(e) { console.error('Simulation error:', e.message); }
  }, 8000);
}
