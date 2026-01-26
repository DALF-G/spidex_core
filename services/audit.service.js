const prisma = require("../config/db");
const { v4: uuidv4 } = require("uuid");

/**
 * CENTRALIZED AUDIT LOGGER (FK SAFE)
 */
exports.auditLog = async ({
  req = null,
  actor = null,
  action,
  target = null,
  metadata = {},
}) => {
  try {
    let actorId = null;
    let actorName = null;
    let actorEmail = null;

    // 🧠 Resolve actor safely
    if (actor?.id) {
      const existingUser = await prisma.users.findUnique({
        where: { id: actor.id },
        select: { id: true, name: true, email: true },
      });

      if (existingUser) {
        actorId = existingUser.id;
        actorName = existingUser.name;
        actorEmail = existingUser.email;
      }
    }

    // 🧾 Capture request context if available
    const ip =
      req?.headers["x-forwarded-for"]?.split(",")[0] ||
      req?.socket?.remoteAddress ||
      null;

    const device = req?.headers["user-agent"] || null;

    await prisma.audit_logs.create({
      data: {
        id: uuidv4(),

        // FK-safe (null allowed)
        actor_id: actorId,
        actor_name: actorName,
        actor_email: actorEmail,

        action,
        target,

        ip,
        device,

        metadata,
      },
    });
  } catch (err) {
    // ❗ NEVER crash the app because of audit logging
    console.error("Audit log failed:", err.message);
  }
};
