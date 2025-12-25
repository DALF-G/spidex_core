const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const prisma = require("../config/db");
const { signToken, signRefreshToken } = require("../utils/jwt");
const {
  createUserWithAccount,
  findUserByEmail,
} = require("../services/user.service");

/**
 * REGISTER ADMIN (ADMIN ONLY)
 */
exports.registerAdmin = async (req, res, next) => {
  try {
    const { name, email, phone, password, adminSecret } = req.body;

    // 🔐 Extra protection
    if (adminSecret !== process.env.ADMIN_SECRET_KEY) {
      return res.status(403).json({ message: "Invalid admin secret key" });
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const password_hash = await bcrypt.hash(password, 12);

    const user = await createUserWithAccount({
      name,
      email,
      phone,
      password_hash,
      role: "admin",
    });

    // Tokens
    const token = signToken({ id: user.id, role: user.role });
    const refreshToken = signRefreshToken({ id: user.id });

    await prisma.refresh_tokens.create({
      data: {
        id: uuidv4(),
        user_id: user.id,
        token: refreshToken,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    res.status(201).json({
      success: true,
      message: "Admin registered successfully",
      token,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
} catch (err) {
    if (err.message.startsWith("Duplicate")) {
      return res.status(400).json({
        message: err.message.replace("Duplicate ", "") + " already exists",
      });
    }
    next(err);
  }
};  

/**
 * ADMIN LOGIN
 */
exports.adminLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // 🚫 Only admins allowed
    if (user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = signToken({
      id: user.id,
      role: user.role,
    });

    const refreshToken = signRefreshToken({
      id: user.id,
    });

    await prisma.refresh_tokens.create({
      data: {
        id: uuidv4(),
        user_id: user.id,
        token: refreshToken,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    res.json({
      success: true,
      token,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * ADMIN: View all users (paginated)
 */
exports.getAllUsers = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      prisma.users.findMany({
        skip,
        take: limit,
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          is_active: true,
          created_at: true,
        },
      }),
      prisma.users.count(),
    ]);

    res.json({
      success: true,
      page,
      limit,
      total,
      users,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * ADMIN: Approve a seller
 */
exports.approveSeller = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const seller = await prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, role: true, is_active: true },
    });

    if (!seller) {
      return res.status(404).json({ message: "User not found" });
    }

    if (seller.role !== "seller") {
      return res.status(400).json({ message: "User is not a seller" });
    }

    if (seller.is_active) {
      return res.status(400).json({ message: "Seller already approved" });
    }

    // ✅ Approve seller
    await prisma.users.update({
      where: { id: userId },
      data: { is_active: true },
    });

    // 🧾 Audit log
    await prisma.audit_logs.create({
      data: {
        id: uuidv4(),
        actor_id: req.user.id, // admin
        action: "SELLER_APPROVED",
        metadata: { seller_id: userId },
      },
    });

    res.json({
      success: true,
      message: "Seller approved successfully",
    });
  } catch (err) {
    next(err);
  }
};

/**
 * ADMIN: View pending sellers
 */
exports.getPendingSellers = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const [sellers, total] = await Promise.all([
      prisma.users.findMany({
        where: {
          role: "seller",
          is_active: false,
        },
        skip,
        take: limit,
        orderBy: { created_at: "asc" },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          created_at: true,
        },
      }),
      prisma.users.count({
        where: {
          role: "seller",
          is_active: false,
        },
      }),
    ]);

    res.json({
      success: true,
      page,
      limit,
      total,
      sellers,
    });
  } catch (err) {
    next(err);
  }
};
