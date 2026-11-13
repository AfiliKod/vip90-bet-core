import NgrDefinition from '../../models/NgrDefinition.js';
import { assertNgrDefinitionNotIssued } from '../services/billingService.js';
import { writePlatformLevelAudit } from '../services/platformAudit.js';
import { createError } from '../../middleware/error.js';

export async function listNgrDefinitions(req, res, next) {
  try {
    const definitions = await NgrDefinition.find().sort({ name: 1, version: -1 }).lean();
    res.json({ definitions });
  } catch (err) {
    next(err);
  }
}

export async function getNgrDefinition(req, res, next) {
  try {
    const definition = await NgrDefinition.findById(req.params.id).lean();
    if (!definition) return next(createError(404, 'NOT_FOUND', 'NGR definition not found'));
    res.json({ definition });
  } catch (err) {
    next(err);
  }
}

function ngrValidationError(err, next) {
  if (err.code?.startsWith?.('ERR_NGR_')) {
    return next(createError(err.status || 400, err.code, err.message));
  }
  return next(err);
}

export async function createNgrDefinition(req, res, next) {
  try {
    const { name, description, ggrComponents, ggrAlreadyNetOf, items } = req.body;
    if (!name) return next(createError(400, 'NAME_IS_REQUIRED', 'name is required'));

    const definition = await NgrDefinition.create({
      name,
      version: 1,
      description,
      ggrComponents,
      ggrAlreadyNetOf,
      items,
      createdBy: req.staff.id,
    });

    await writePlatformLevelAudit(req, 'billing:ngr_definition:create', {
      targetType: 'system',
      targetId: String(definition._id),
      metadata: { name, version: 1 },
    });

    res.status(201).json(definition);
  } catch (err) {
    ngrValidationError(err, next);
  }
}

export async function createNewVersion(req, res, next) {
  try {
    const original = await NgrDefinition.findById(req.params.id);
    if (!original) return next(createError(404, 'NOT_FOUND', 'NGR definition not found'));

    const { description, ggrComponents, ggrAlreadyNetOf, items } = req.body;

    const latest = await NgrDefinition.findOne({ name: original.name }).sort({ version: -1 });
    const nextVersion = (latest?.version || 1) + 1;

    const newDef = await NgrDefinition.create({
      name: original.name,
      version: nextVersion,
      description: description !== undefined ? description : original.description,
      ggrComponents: ggrComponents || original.ggrComponents,
      ggrAlreadyNetOf: ggrAlreadyNetOf || original.ggrAlreadyNetOf,
      items: items || original.items,
      createdBy: req.staff.id,
    });

    await writePlatformLevelAudit(req, 'billing:ngr_definition:new_version', {
      targetType: 'system',
      targetId: String(newDef._id),
      metadata: { name: newDef.name, version: nextVersion },
    });

    res.status(201).json(newDef);
  } catch (err) {
    ngrValidationError(err, next);
  }
}

export async function updateNgrDefinition(req, res, next) {
  try {
    const definition = await NgrDefinition.findById(req.params.id);
    if (!definition) return next(createError(404, 'NOT_FOUND', 'NGR definition not found'));

    await assertNgrDefinitionNotIssued(definition._id, definition.version);

    const { description, ggrComponents, ggrAlreadyNetOf, items, status } = req.body;
    if (description !== undefined) definition.description = description;
    if (ggrComponents !== undefined) definition.ggrComponents = ggrComponents;
    if (ggrAlreadyNetOf !== undefined) definition.ggrAlreadyNetOf = ggrAlreadyNetOf;
    if (items !== undefined) definition.items = items;
    if (status !== undefined) definition.status = status;
    definition.updatedBy = req.staff.id;

    await definition.save();

    await writePlatformLevelAudit(req, 'billing:ngr_definition:update', {
      targetType: 'system',
      targetId: String(definition._id),
      metadata: { name: definition.name, version: definition.version },
    });

    res.json({ definition });
  } catch (err) {
    ngrValidationError(err, next);
  }
}
