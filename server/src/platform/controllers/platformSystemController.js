import { evaluateGates } from '../services/scopeTelemetry.js';

export async function getScopeGates(req, res, next) {
  try {
    res.json(await evaluateGates());
  } catch (error) {
    next(error);
  }
}
