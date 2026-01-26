const prisma = require("../config/db");
const { getRequestMeta } = require("../utils/requestMeta");

/**
 * Central audit logger
 * @param {Object} params
 */
const auditLog = async ({
  req,
  actorId,
  actorName,
  actorEmail,
  action,
  target,
  metadata = {},
}) => {
  try {
    const { ip, device, location } = getRequestMeta(req);

    await prisma.audit_logs.create({
      data: {
        actor: {
          connect: { id: actorId },
        },
        actor_name: actorName,
        actor_email: actorEmail,

        action,
        target,

        ip,
        device,
        country: location.country,
        city: location.city,

        metadata,
      },
    });
  } catch (error) {
    // ❗ Never crash the app because of logs
    console.error("AUDIT LOG FAILED:", error.message);
  }
};

module.exports = { auditLog };