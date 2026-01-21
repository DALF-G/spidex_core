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
 * REGISTER ADMIN
 * - First admin: uses ADMIN_SECRET_KEY
 * - Next admins: admin-only
 */
exports.registerAdmin = async (req, res, next) => {
  try {
    const { name, email, phone, password, adminSecret } = req.body;

    const existingAdmin = await prisma.users.findFirst({
      where: { role: "admin" },
      select: { id: true },
    });

    if (!existingAdmin) {
      if (adminSecret !== process.env.ADMIN_SECRET_KEY) {
        return res.status(403).json({ message: "Invalid admin secret key" });
      }
    } else {
      if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({
          message: "Only admins can create another admin",
        });
      }
    }

    const existingUser = await prisma.users.findUnique({
      where: { email },
    });

    if (existingUser) {
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
    if (!user || user.role !== "admin") {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

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
 * ADMIN: View all users
 */
exports.getAllUsers = async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 20, 100);
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
          isApprovedSeller: true,
          created_at: true,
        },
      }),
      prisma.users.count(),
    ]);

    res.json({ success: true, page, limit, total, users });
  } catch (err) {
    next(err);
  }
};

/**
 * ADMIN: Approve seller
 */
exports.approveSeller = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const seller = await prisma.users.findUnique({
      where: { id: userId },
    });

    if (!seller || seller.role !== "seller") {
      return res.status(404).json({ message: "Seller not found" });
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
 * ADMIN: Pending sellers
 */
exports.getPendingSellers = async (req, res, next) => {
  try {
    const sellers = await prisma.users.findMany({
      where: {
        role: "seller",
        is_active: false,
      },
      orderBy: { created_at: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        created_at: true,
      },
    });

    res.json({ success: true, sellers });
  } catch (err) {
    next(err);
  }
};

/**
 * ADMIN: Reject seller
 */
exports.rejectSeller = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    const seller = await prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        isApprovedSeller: true,
        is_active: true,
      },
    });

    if (!seller || seller.role !== "seller") {
      return res.status(404).json({ message: "Seller not found" });
    }

    // ❗ Mark seller as REJECTED (persist state)
    await prisma.users.update({
      where: { id: userId },
      data: {
        isApprovedSeller: false,
        is_active: false,
      },
    });

    // 🧾 Audit
    await prisma.audit_logs.create({
      data: {
        id: uuidv4(),
        actor_id: req.user.id,
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
      message: reason || "Your seller application was rejected.",
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
 * ADMIN: Toggle user active
 */
exports.toggleUserActive = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await prisma.users.findUnique({
      where: { id: userId },
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    const newStatus = !user.is_active;

    await prisma.users.update({
      where: { id: userId },
      data: { is_active: newStatus },
    });

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
      message: newStatus ? "User activated" : "User suspended",
    });
  } catch (err) {
    next(err);
  }
};

/**
 * ADMIN: Permanent delete user (transaction safe)
 */
exports.deleteUser = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (req.user.id === userId) {
      return res.status(400).json({ message: "You cannot delete yourself" });
    }

    const user = await prisma.users.findUnique({
      where: { id: userId },
    });

    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role === "admin") {
      return res.status(403).json({ message: "Admins cannot be deleted" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.refresh_tokens.deleteMany({ where: { user_id: userId } });
      await tx.notifications.deleteMany({ where: { user_id: userId } });
      await tx.entries.deleteMany({
        where: { accounts: { owner_id: userId } },
      });
      await tx.accounts.deleteMany({
        where: { owner_id: userId, owner_type: "user" },
      });
      await tx.users.delete({ where: { id: userId } });
    });

    await prisma.audit_logs.create({
      data: {
        id: uuidv4(),
        actor_id: req.user.id,
        action: "USER_PERMANENTLY_DELETED",
        metadata: { deleted_user_id: userId, role: user.role },
      },
    });

    res.json({ success: true, message: "User permanently deleted" });
  } catch (err) {
    next(err);
  }
};

/**
 * ADMIN: Audit logs
 */
exports.getAuditLogs = async (req, res, next) => {
  try {
    const logs = await prisma.audit_logs.findMany({
      orderBy: { created_at: "desc" },
    });

    res.json({ success: true, logs });
  } catch (err) {
    next(err);
  }
};

let cachedStats = null;
let lastFetch = 0;
const CACHE_TTL = 30 * 1000; // 30 seconds

/* =========================
   ADMIN STATS
========================= */
exports.getAdminStats = async (req, res, next) => {
  try {
    // Serve cache if valid
    if (cachedStats && Date.now() - lastFetch < CACHE_TTL) {
      return res.json(cachedStats);
    }

    /* ================= USERS ================= */
    const [
      totalUsers,
      activeUsers,
      suspendedUsers,
      adminCount,
      buyerCount,
      sellerCount,
    ] = await Promise.all([
      prisma.users.count(),
      prisma.users.count({ where: { is_active: true } }),
      prisma.users.count({ where: { is_active: false } }),
      prisma.users.count({ where: { role: "admin" } }),
      prisma.users.count({ where: { role: "buyer" } }),
      prisma.users.count({ where: { role: "seller" } }),
    ]);

    /* ================= SELLERS ================= */
    const [
      approvedSellers,
      pendingSellers,
      suspendedSellers,
      verifiedSellers,
      sellersWithProducts,
      sellersWithoutProducts,
    ] = await Promise.all([
      prisma.users.count({
        where: { role: "seller", isApprovedSeller: true },
      }),
      prisma.users.count({
        where: { role: "seller", isApprovedSeller: false },
      }),
      prisma.users.count({
        where: {
          role: "seller",
          isApprovedSeller: true,
          is_active: false,
        },
      }),
      prisma.seller_profiles.count({ where: { is_verified: true } }),
      prisma.products
        .groupBy({ by: ["seller_id"] })
        .then((r) => r.length),
      prisma.users.count({
        where: { role: "seller", products: { none: {} } },
      }),
    ]);

    /* ================= ORDERS ================= */
    const [
      totalOrders,
      ordersByStatus,
      disputedOrdersCount,
    ] = await Promise.all([
      prisma.orders.count(),
      prisma.orders.groupBy({
        by: ["status"],
        _count: true,
      }),
      prisma.orders.count({ where: { status: "disputed" } }),
    ]);

    /* ================= REVENUE ================= */
    const completedOrders = await prisma.orders.aggregate({
      where: { status: "completed" },
      _sum: { total: true },
    });

    const todayRevenue = await prisma.orders.aggregate({
      where: {
        status: "completed",
        created_at: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
      _sum: { total: true },
    });

    const monthRevenue = await prisma.orders.aggregate({
      where: {
        status: "completed",
        created_at: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
      _sum: { total: true },
    });

    // GMV BY MONTH
    const rawMonthly = await prisma.orders.groupBy({
      by: ["created_at"],
      where: { status: "completed" },
      _sum: { total: true },
    });

    const gmvByMonth = rawMonthly.map((o) => ({
      month: o.created_at.toISOString().slice(0, 7),
      total: o._sum.total || 0,
    }));

    /* ================= MARKETPLACE ================= */
    const [
      totalProducts,
      activeProducts,
      inactiveProducts,
      productViews,
      buyerVisits,
    ] = await Promise.all([
      prisma.products.count(),
      prisma.products.count({ where: { is_active: true } }),
      prisma.products.count({ where: { is_active: false } }),
      prisma.product_views.count(),
      prisma.buyer_visits.count(),
    ]);

    /* ================= SYSTEM ================= */
    const [
      auditLogs,
      pendingPayments,
      failedPayments,
      unreadNotifications,
    ] = await Promise.all([
      prisma.audit_logs.count(),
      prisma.payments.count({ where: { status: "pending" } }),
      prisma.payments.count({ where: { status: "failed" } }),
      prisma.notifications.findMany({
        where: { is_read: false },
        orderBy: { created_at: "desc" },
        take: 10,
      }),
    ]);

    /* ================= ADMIN ACTIVITY ================= */
    const rawActivity = await prisma.audit_logs.findMany({
      where: { actor_id: { not: null } },
      orderBy: { created_at: "desc" },
      take: 10,
    });
    
    /* Get unique actor IDs */
    const actorIds = [
      ...new Set(rawActivity.map((l) => l.actor_id).filter(Boolean)),
    ];
    
    /* Fetch admins only */
    const admins = await prisma.users.findMany({
      where: {
        id: { in: actorIds },
        role: "admin",
      },
      select: {
        id: true,
        name: true,
      },
    });
    
    /* Map admin id → name */
    const adminMap = Object.fromEntries(
      admins.map((a) => [a.id, a.name])
    );
    
    /* Human-readable admin activity */
    const adminActivity = rawActivity
      .filter((log) => adminMap[log.actor_id])
      .map((log) => ({
        id: log.id,
        actor: adminMap[log.actor_id],
        action: log.action,
        metadata: log.metadata || {},
        created_at: log.created_at,
      }));
    
    /* ================= SELLER RISK ================= */
    const sellers = await prisma.users.findMany({
      where: { role: "seller" },
      select: {
        id: true,
        name: true,
        products: { select: { id: true } },
        orders: {
          where: { status: "disputed" },
          select: { id: true },
        },
      },
    });

    const risk = sellers.map((s) => ({
      seller_id: s.id,
      name: s.name,
      disputes: s.orders.length,
      products: s.products.length,
      risk_score:
        s.orders.length * 3 + (s.products.length === 0 ? 5 : 0),
    }));

    /* ================= TOP SELLERS / PRODUCTS ================= */
    const topSellers = await prisma.orders.groupBy({
      by: ["buyer_id"],
      _sum: { total: true },
      orderBy: { _sum: { total: "desc" } },
      take: 5,
    });

    const topProducts = await prisma.products.findMany({
      orderBy: { views: "desc" },
      take: 5,
    });

    const response = {
      success: true,
      stats: {
        users: {
          total: totalUsers,
          active: activeUsers,
          suspended: suspendedUsers,
          admins: adminCount,
          buyers: buyerCount,
          sellers: sellerCount,
        },
        sellers: {
          total: sellerCount,
          approved: approvedSellers,
          pending: pendingSellers,
          suspended: suspendedSellers,
          verified: verifiedSellers,
          with_products: sellersWithProducts,
          without_products: sellersWithoutProducts,
        },
        orders: {
          total: totalOrders,
          by_status: ordersByStatus,
          disputed: disputedOrdersCount,
        },
        revenue: {
          total: completedOrders._sum.total || 0,
          today: todayRevenue._sum.total || 0,
          this_month: monthRevenue._sum.total || 0,
          by_month: gmvByMonth,
        },
        marketplace: {
          products: {
            total: totalProducts,
            active: activeProducts,
            inactive: inactiveProducts,
          },
          product_views: productViews,
          buyer_visits: buyerVisits,
        },
        system: {
          audit_logs_count: auditLogs,
          pending_payments: pendingPayments,
          failed_payments: failedPayments,
          notifications: unreadNotifications,
          admin_activity: adminActivity,
        },
        
        risk,
        top_sellers: topSellers,
        top_products: topProducts,
      },
    };

    cachedStats = response;
    lastFetch = Date.now();

    res.json(response);
  } catch (err) {
    next(err);
  }
};


/**
 * ADMIN: Refund disputed order (LEDGER SAFE)
 */
exports.refundOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const order = await prisma.orders.findUnique({
      where: { id: orderId },
    });

    if (!order || order.status !== "disputed") {
      return res.status(400).json({ message: "Invalid refund request" });
    }

    await prisma.$transaction(async (tx) => {
      const txId = uuidv4();

      await tx.transactions.create({
        data: {
          id: txId,
          reference: `REFUND-${order.id}`,
          description: "Order refund",
        },
      });

      const sellerAccount = await tx.accounts.findFirst({
        where: { owner_id: order.seller_id, owner_type: "user" },
      });

      const buyerAccount = await tx.accounts.findFirst({
        where: { owner_id: order.buyer_id, owner_type: "user" },
      });

      await tx.entries.createMany({
        data: [
          {
            id: uuidv4(),
            transaction_id: txId,
            account_id: sellerAccount.id,
            amount: -order.total,
          },
          {
            id: uuidv4(),
            transaction_id: txId,
            account_id: buyerAccount.id,
            amount: order.total,
          },
        ],
      });

      await tx.orders.update({
        where: { id: orderId },
        data: { status: "refunded" },
      });
    });

    res.json({ success: true, message: "Order refunded successfully" });
  } catch (err) {
    next(err);
  }
};

/**
 * ADMIN: Disputed orders
 */
exports.getDisputedOrders = async (req, res, next) => {
  try {
    const orders = await prisma.orders.findMany({
      where: { status: "disputed" },
      orderBy: { created_at: "asc" },
    });

    res.json({ success: true, orders });
  } catch (err) {
    next(err);
  }
};

exports.closeDispute = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    await prisma.orders.update({
      where: { id: orderId },
      data: { status: "completed" },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
/**
 * ADMIN: Sellers list + profiles
 */
exports.getAllSellerProfiles = async (req, res, next) => {
  try {
    const sellers = await prisma.users.findMany({
      where: { role: "seller" },
      include: { seller_profile: true },
      orderBy: { created_at: "desc" },
    });

    res.json({ success: true, sellers });
  } catch (err) {
    next(err);
  }
};

exports.getSellerProfileById = async (req, res, next) => {
  try {
    const seller = await prisma.users.findUnique({
      where: { id: req.params.sellerId },
      include: { seller_profile: true },
    });

    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    res.json({ success: true, seller });
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
        where: { role: "buyer" },
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
      prisma.users.count({ where: { role: "buyer" } }),
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

exports.verifySeller = async (req, res, next) => {
  try {
    const { sellerId } = req.params;

    const seller = await prisma.users.findUnique({
      where: { id: sellerId },
      select: { id: true, role: true },
    });

    if (!seller || seller.role !== "seller") {
      return res.status(404).json({ message: "Seller not found" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.seller_profiles.update({
        where: { user_id: sellerId },
        data: { is_verified: true },
      });

      await tx.users.update({
        where: { id: sellerId },
        data: {
          isApprovedSeller: true,
          is_active: true,
        },
      });
    });

    await prisma.audit_logs.create({
      data: {
        id: uuidv4(),
        actor_id: req.user.id,
        action: "SELLER_VERIFIED",
        metadata: { seller_id: sellerId },
      },
    });

    await notifyUser({
      userId: sellerId,
      title: "Seller Verified ✅",
      message: "Your seller account has been verified and approved.",
    });

    res.json({
      success: true,
      message: "Seller verified and approved successfully",
    });
  } catch (err) {
    next(err);
  }
};
