const { v4: uuidv4 } = require("uuid");
const prisma = require("../config/db");

/**
 * Create user + ledger account atomically
 */
async function createUserWithAccount({
  name,
  email,
  phone,
  password_hash,
  role,
}) {
  // 🛡️ HARD GUARDS (NO LOGIC CHANGE)
  if (
    typeof email !== "string" ||
    typeof phone !== "string" ||
    !email.trim() ||
    !phone.trim()
  ) {
    const err = new Error("Invalid email or phone");
    err.statusCode = 400;
    throw err;
  }

  // ✅ normalize once, consistently
  const safeEmail = email.trim().toLowerCase();
  const safePhone = phone.trim();

  // 🔍 PRE-CHECKS (SAFE)
  const emailExists = await prisma.users.findUnique({
    where: { email: safeEmail },
    select: { id: true },
  });

  if (emailExists) {
    const err = new Error("email already exists");
    err.statusCode = 409;
    throw err;
  }

  const phoneExists = await prisma.users.findUnique({
    where: { phone: safePhone },
    select: { id: true },
  });

  if (phoneExists) {
    const err = new Error("phone already exists");
    err.statusCode = 409;
    throw err;
  }

  // ✅ TRANSACTION (SAFE, ATOMIC)
  return prisma.$transaction(async (tx) => {
    const userId = uuidv4();

    const user = await tx.users.create({
      data: {
        id: userId,
        name: name?.trim(),
        email: safeEmail,
        phone: safePhone,
        password_hash,
        role,

        // ✅ ALL USERS ACTIVE ON CREATE
        is_active: true,

        // ✅ SELLERS START UNAPPROVED (BUT CAN LOGIN)
        ...(role === "seller" && { isApprovedSeller: false }),
      },
    });

    // 💰 Ledger account
    await tx.accounts.create({
      data: {
        id: uuidv4(),
        owner_id: userId,
        owner_type: "user",
        currency: "KES",
      },
    });

    // 🧾 Audit log (does NOT break anything)
    await tx.audit_logs.create({
      data: {
        id: uuidv4(),
        actor_id: userId,
        action: "USER_CREATED",
        metadata: {
          email: safeEmail,
          role,
        },
      },
    });

    return user;
  });
}

/**
 * Find user by email (SAFE)
 */
async function findUserByEmail(email) {
  if (typeof email !== "string" || !email.trim()) {
    return null; // 🛡️ prevents Prisma crash
  }

  return prisma.users.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
}

module.exports = {
  createUserWithAccount,
  findUserByEmail,
};
