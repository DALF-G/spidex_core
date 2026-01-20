const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const prisma = require("../config/db");
const { notifyUser } = require("../services/notification.service");
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

    // 1️⃣ Check if any admin exists
    const existingAdmin = await prisma.users.findFirst({
      where: { role: "admin" },
      select: { id: true },
    });

    // 2️⃣ CASE A: NO ADMIN EXISTS (FIRST ADMIN)
    if (!existingAdmin) {
      if (adminSecret !== process.env.ADMIN_SECRET_KEY) {
        return res.status(403).json({
          message: "Invalid admin secret key",
        });
      }
    }

    // 3️⃣ CASE B: ADMIN EXISTS → REQUIRE AUTH ADMIN
    if (existingAdmin) {
      if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({
          message: "Only admins can create another admin",
        });
      }
    }

    // 4️⃣ Duplicate email check
    const existingUser = await prisma.users.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({
        message: "Email already exists",
      });
    }

    // 5️⃣ Hash password
    const password_hash = await bcrypt.hash(password, 12);

    // 6️⃣ Create admin
    const user = await createUserWithAccount({
      name,
      email,
      phone,
      password_hash,
      role: "admin",
    });

    // 7️⃣ Issue tokens ONLY for first admin or self-register
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

    return res.status(201).json({
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
      select: {
        id: true,
        role: true,
        isApprovedSeller: true,
      },
    });

    if (!seller) {
      return res.status(404).json({ message: "User not found" });
    }

    if (seller.role !== "seller") {
      return res.status(400).json({ message: "User is not a seller" });
    }

    if (seller.isApprovedSeller) {
      return res.status(400).json({ message: "Seller already approved" });
    }

    await prisma.users.update({
      where: { id: userId },
      data: { isApprovedSeller: true, is_active: true },
      
    });

    await prisma.audit_logs.create({
      data: {
        id: uuidv4(),
        actor_id: req.user.id,
        action: "SELLER_APPROVED",
        metadata: { seller_id: userId },
      },
    });

    await notifyUser({
      userId,
      title: "Seller Approved 🎉",
      message: "Your seller account has been approved.",
    });

    res.json({ success: true, message: "Seller approved successfully" });
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

// Admin Reject seller
exports.rejectSeller = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body; // optional

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

    // 🧾 Audit rejection (no state change needed; seller remains inactive)
    await prisma.audit_logs.create({
      data: {
        id: uuidv4(),
        actor_id: req.user.id, // admin
        action: "SELLER_REJECTED",
        metadata: {
          seller_id: userId,
          reason: reason || null,
        },
      },
    });

    // 🔔 Notify seller
await notifyUser({
  userId,
  title: "Seller Application Rejected",
  message: reason || "Your seller application was not approved at this time.",
});

    res.json({
      success: true,
      message: "Seller rejected successfully",
    });
  } catch (err) {
    next(err);
  }
};

/**
 * ADMIN: Toggle user active/inactive
 */
exports.toggleUserActive = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, is_active: true, role: true },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const newStatus = !user.is_active;

    await prisma.users.update({
      where: { id: userId },
      data: { is_active: newStatus },
    });

    // Audit
    await prisma.audit_logs.create({
      data: {
        id: uuidv4(),
        actor_id: req.user.id,
        action: newStatus ? "USER_ACTIVATED" : "USER_SUSPENDED",
        metadata: { user_id: userId },
      },
    });

    res.json({
      success: true,
      message: newStatus
        ? "User activated successfully"
        : "User suspended successfully",
    });
  } catch (err) {
    next(err);
  }
};

/**
 * ADMIN: Delete user (soft delete)
 */
exports.deleteUser = async (req, res, next) => {
  try {
    const { userId } = req.params;

    // ❌ Prevent admin from deleting themselves
    if (req.user.id === userId) {
      return res.status(400).json({
        message: "You cannot delete your own account",
      });
    }

    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    /*
      🔥 IMPORTANT:
      If user has relations (orders, products, logs),
      delete them FIRST to avoid FK constraint errors
    */

    // Example (adjust based on schema)
    await prisma.audit_logs.deleteMany({
      where: { actor_id: userId },
    });

    await prisma.orders?.deleteMany({
      where: { user_id: userId },
    });

    await prisma.products?.deleteMany({
      where: { seller_id: userId },
    });

    // 🔥🔥🔥 PERMANENT DELETE
    await prisma.users.delete({
      where: { id: userId },
    });

    // 🧾 Log deletion action (admin action log)
    await prisma.audit_logs.create({
      data: {
        id: uuidv4(),
        actor_id: req.user.id,
        action: "USER_PERMANENTLY_DELETED",
        metadata: {
          deleted_user_id: userId,
          role: user.role,
        },
      },
    });

    return res.status(200).json({
      success: true,
      message: "User permanently deleted",
    });
  } catch (err) {
    next(err);
  }
};


/**
 * ADMIN: View audit logs (paginated)
 */
exports.getAuditLogs = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      prisma.audit_logs.findMany({
        skip,
        take: limit,
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          actor_id: true,
          action: true,
          metadata: true,
          created_at: true,
        },
      }),
      prisma.audit_logs.count(),
    ]);

    res.json({
      success: true,
      page,
      limit,
      total,
      logs,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * ADMIN: Dashboard statistics
 */
exports.getAdminStats = async (req, res, next) => {
  try {
    const [
      // 👤 Users (all roles)
      totalUsers,
      activeUsers,
      suspendedUsers,

      // 👮 Admins
      totalAdmins,

      // 🛒 Sellers
      totalSellers,
      activeSellers,
      suspendedSellers,
      pendingSellers,

      // 🧑 Buyers
      totalBuyers,
      activeBuyers,
      suspendedBuyers,

      // 🧾 Audit
      auditCount,
    ] = await Promise.all([
      // Users
      prisma.users.count(),
      prisma.users.count({ where: { is_active: true } }),
      prisma.users.count({ where: { is_active: false } }),

      // Admins
      prisma.users.count({ where: { role: "admin" } }),

      // Sellers
      prisma.users.count({ where: { role: "seller" } }),
      prisma.users.count({ where: { role: "seller", is_active: true } }),
      prisma.users.count({ where: { role: "seller", is_active: false } }),
      prisma.users.count({
        where: { role: "seller", is_active: false },
      }),

      // Buyers
      prisma.users.count({ where: { role: "buyer" } }),
      prisma.users.count({ where: { role: "buyer", is_active: true } }),
      prisma.users.count({ where: { role: "buyer", is_active: false } }),

      // Audit logs
      prisma.audit_logs.count(),
    ]);

    res.json({
      success: true,
      stats: {
        users: {
          total: totalUsers,
          active: activeUsers,
          suspended: suspendedUsers,
        },
        admins: totalAdmins,
        sellers: {
          total: totalSellers,
          active: activeSellers,
          pending: pendingSellers,
          suspended: suspendedSellers,
        },
        buyers: {
          total: totalBuyers,
          active: activeBuyers,
          suspended: suspendedBuyers,
        },
        audit_logs: auditCount,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.refundOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { v4: uuidv4 } = require("uuid");

    const order = await prisma.orders.findUnique({
      where: { id: orderId },
    });

    if (!order || order.status !== "disputed") {
      return res.status(400).json({ message: "Invalid refund request" });
    }

    const sellerAccount = await prisma.accounts.findFirst({
      where: { owner_id: order.seller_id, owner_type: "user" },
    });

    const buyerAccount = await prisma.accounts.findFirst({
      where: { owner_id: order.buyer_id, owner_type: "user" },
    });

    const txId = uuidv4();

    await prisma.transactions.create({
      data: {
        id: txId,
        reference: `REFUND-${order.id}`,
        description: "Order refund",
      },
    });

    // Debit seller
    await prisma.entries.create({
      data: {
        id: uuidv4(),
        transaction_id: txId,
        account_id: sellerAccount.id,
        amount: -order.total,
      },
    });

    // Credit buyer
    await prisma.entries.create({
      data: {
        id: uuidv4(),
        transaction_id: txId,
        account_id: buyerAccount.id,
        amount: order.total,
      },
    });

    await prisma.orders.update({
      where: { id: orderId },
      data: { status: "refunded" },
    });

    res.json({
      success: true,
      message: "Order refunded successfully",
    });
  } catch (err) {
    next(err);
  }
};

exports.getDisputedOrders = async (req, res, next) => {
  try {
    const orders = await prisma.orders.findMany({
      where: { status: "disputed" },
      orderBy: { created_at: "asc" },
    });

    res.json({
      success: true,
      orders,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * ADMIN: View all sellers (approved + pending + suspended)
 */
exports.getAllSellers = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const skip = (page - 1) * limit;

    const [sellers, total] = await Promise.all([
      prisma.users.findMany({
        where: { role: "seller" },
        skip,
        take: limit,
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          is_active: true,        
          isApprovedSeller: true,   
          created_at: true,
        },
      }),
      prisma.users.count({
        where: { role: "seller" },
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


exports.getAllBuyers = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const skip = (page - 1) * limit;

    const [buyers, total] = await Promise.all([
      prisma.users.findMany({
        where: {
          role: "buyer",
        },
        skip,
        take: limit,
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          is_active: true,
          created_at: true,
        },
      }),
      prisma.users.count({
        where: { role: "buyer" },
      }),
    ]);

    res.json({
      success: true,
      page,
      limit,
      total,
      buyers,
    });
  } catch (err) {
    next(err);
  }
};
