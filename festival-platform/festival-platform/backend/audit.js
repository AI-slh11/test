const db = require('./db');

function recordAudit(req, action, entity, entityId, details = {}) {
  const actor = req.user?.code || req.admin?.code || req.auditActor || 'organizer';
  db.prepare('INSERT INTO audit_log (actor, action, entity, entity_id, details) VALUES (?,?,?,?,?)')
    .run(actor, action, entity, entityId == null ? null : String(entityId), JSON.stringify(details));
}

module.exports = { recordAudit };
