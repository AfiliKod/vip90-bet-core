import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { registerSchema, loginSchema } from '../validators/auth.js';
import * as ctrl from '../controllers/auth.js';

const r = Router();

r.post('/register', validate(registerSchema), ctrl.register);
r.post('/login', validate(loginSchema), ctrl.login);
r.post('/refresh', ctrl.refresh);
r.post('/logout', ctrl.logout);

export default r;
