import { evaluateGates } from '../services/scopeTelemetry.js';
import { evaluateCapacity } from '../../services/capacityMetrics.js';

export async function getScopeGates(req, res, next) {
  try {
    res.json(await evaluateGates());
  } catch (error) {
    next(error);
  }
}

export async function getCapacity(req, res, next) {
  try {
    res.json(await evaluateCapacity());
  } catch (error) {
    next(error);
  }
}
