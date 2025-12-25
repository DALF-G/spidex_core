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
  // 🔍 PRE-CHECKS (explicit & reliable)
  const emailExists = await prisma.users.findUnique({
    where: { email },
    select: { id: true },
  });

  if (emailExists) {
    const err = new Error("email already exists");
    err.statusCode = 409;
    throw err;
  }

  const phoneExists = await prisma.users.findUnique({
    where: { phone },
    select: { id: true },
  });

  if (phoneExists) {
    const err = new Error("phone already exists");
    err.statusCode = 409;
    throw err;
  }

  // ✅ TRANSACTION (unchanged logic)
  return prisma.$transaction(async (tx) => {
    const userId = uuidv4();

    const user = await tx.users.create({
      data: {
        id: userId,
        name,
        email,
        phone,
        password_hash,
        role,
        is_active: role === "seller" ? false : true,
      },
    });

    await tx.accounts.create({
      data: {
        id: uuidv4(),
        owner_id: userId,
        owner_type: "user",
        currency: "KES",
      },
    });

    await tx.audit_logs.create({
      data: {
        id: uuidv4(),
        actor_id: userId,
        action: "USER_CREATED",
        metadata: { email, role },
      },
    });

    return user;
  });
}

/**
 * Find user by email
 */
async function findUserByEmail(email) {
  return prisma.users.findUnique({
    where: { email },
  });
}

module.exports = {
  createUserWithAccount,
  findUserByEmail,
};
