const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const prisma = require("../config/db");
const { notifyUser } = require("../services/notification.service");
const { signToken, signRefreshToken } = require("../utils/jwt");
const {
  createUserWithAccount,
  findUserByEmail,
} = require("../services/user.service");
const { auditLog } = require("../services/audit.service");
const AUDIT = require("../constants/auditActions");

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
      select: { id: true, name: true, role: true, isApprovedSeller: true },
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

    await auditLog({
      req,
      actor: req.user,
      action: AUDIT.SELLER_APPROVED,
      target: seller.name,
      metadata: {
        seller_id: seller.id,
        seller_name: seller.name,
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
      where: { role: "seller", is_active: false },
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
      select: { id: true, role: true, name: true },
    });

    if (!seller || seller.role !== "seller") {
      return res.status(404).json({ message: "Seller not found" });
    }

    await prisma.users.update({
      where: { id: userId },
      data: { isApprovedSeller: false, is_active: false },
    });

    await auditLog({
      req,
      actor: req.user,
      action: AUDIT.SELLER_REJECTED,
      target: seller.name,
      metadata: {
        seller_id: userId,
        seller_name: seller.name,
        reason: reason || null,
      },
    });

    await notifyUser({
      userId,
      title: "Seller Application Rejected",
      message: reason || "Your seller application was rejected.",
    });

    res.json({ success: true, message: "Seller rejected successfully" });
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

    await auditLog({
      req,
      actor: req.user,
      action: newStatus
        ? AUDIT.USER_ACTIVATED
        : AUDIT.USER_SUSPENDED,
      target: user.name,
      metadata: { user_id: userId },
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

    // Prevent self-delete
    if (req.user.id === userId) {
      return res.status(400).json({ message: "You cannot delete yourself" });
    }

    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role === "admin") {
      return res.status(403).json({ message: "Admins cannot be deleted" });
    }

    // 🔒 Atomic delete
    await prisma.$transaction(async (tx) => {
      await tx.refresh_tokens.deleteMany({
        where: { user_id: userId },
      });

      await tx.notifications.deleteMany({
        where: { user_id: userId },
      });

      await tx.entries.deleteMany({
        where: { accounts: { owner_id: userId } },
      });

      await tx.accounts.deleteMany({
        where: { owner_id: userId, owner_type: "user" },
      });

      await tx.users.delete({
        where: { id: userId },
      });
    });

    // 🧾 CENTRALIZED AUDIT LOG
    await auditLog({
      req,
      actor: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
      },
      action: AUDIT.USER_PERMANENT_DELETE,
      target: user.name,
      metadata: {
        deleted_user_id: user.id,
        deleted_user_name: user.name,
        role: user.role,
      },
    });

    res.json({
      success: true,
      message: "User permanently deleted",
    });
  } catch (err) {
    next(err);
  }
};



/**
 * ADMIN: Audit logs
 */
exports.getAuditLogs = async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const skip = (page - 1) * limit;

    /* ================= FETCH RAW LOGS ================= */
    const [rawLogs, total] = await Promise.all([
      prisma.audit_logs.findMany({
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      }),
      prisma.audit_logs.count(),
    ]);

    /* ================= RESOLVE ACTORS ================= */
    const actorIds = [
      ...new Set(rawLogs.map((l) => l.actor_id).filter(Boolean)),
    ];

    const admins = await prisma.users.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true, email: true },
    });

    const adminMap = Object.fromEntries(
      admins.map((a) => [a.id, a])
    );

    /* ================= BUILD RESPONSE ================= */
    const logs = rawLogs.map((log) => {
      const meta = log.metadata || {};

      const actor = adminMap[log.actor_id]
        ? {
            id: log.actor_id,
            name: adminMap[log.actor_id].name,
            email: adminMap[log.actor_id].email,
          }
        : null;

      const target =
        meta.seller_name ||
        meta.user_name ||
        meta.deleted_user_name ||
        meta.product_title ||
        null;

      return {
        id: log.id,

        // 👤 ACTOR (admin)
        actor,

        // 🔧 ACTION
        action: log.action,

        // 🎯 TARGET (human-readable)
        target,

        // ⚠️ EXTRA INFO
        ip: meta.ip || null,
        device: meta.device || null,

        // 🧾 RAW METADATA (still available)
        metadata: meta,

        // 🕒 TIME
        created_at: log.created_at,
      };
    });

    res.json({
      success: true,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
      logs,
    });
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
      prisma.products.groupBy({ by: ["seller_id"] }).then((r) => r.length),
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

    /* ================= NOTIFICATIONS ================= */
    const unreadNotifications = await prisma.notifications.findMany({
      where: { is_read: false },
      orderBy: { created_at: "desc" },
      take: 10,
      include: {
        users: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    });

    /* ================= ADMIN ACTIVITY ================= */
    const rawActivity = await prisma.audit_logs.findMany({
      where: { actor_id: { not: null } },
      orderBy: { created_at: "desc" },
      take: 10,
    });

    const actorIds = [...new Set(rawActivity.map((l) => l.actor_id))];

    const admins = await prisma.users.findMany({
      where: { id: { in: actorIds }, role: "admin" },
      select: { id: true, name: true },
    });

    const adminMap = Object.fromEntries(
      admins.map((a) => [a.id, a.name])
    );

    const referencedUserIds = new Set();
    rawActivity.forEach((log) => {
      if (log.metadata?.seller_id) referencedUserIds.add(log.metadata.seller_id);
      if (log.metadata?.user_id) referencedUserIds.add(log.metadata.user_id);
      if (log.metadata?.deleted_user_id)
        referencedUserIds.add(log.metadata.deleted_user_id);
    });

    const referencedUsers = await prisma.users.findMany({
      where: { id: { in: [...referencedUserIds] } },
      select: { id: true, name: true },
    });

    const userMap = Object.fromEntries(
      referencedUsers.map((u) => [u.id, u.name])
    );

    const adminActivity = rawActivity
      .filter((log) => adminMap[log.actor_id])
      .map((log) => ({
        id: log.id,
        actor: adminMap[log.actor_id],
        action: log.action,
        metadata: {
          seller_name: log.metadata?.seller_id
            ? userMap[log.metadata.seller_id] || "Unknown Seller"
            : null,
          user_name: log.metadata?.user_id
            ? userMap[log.metadata.user_id] || "Unknown User"
            : null,
          deleted_user_name: log.metadata?.deleted_user_id
            ? userMap[log.metadata.deleted_user_id] || "Unknown User"
            : null,
          reason: log.metadata?.reason || null,
        },
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

    /* ================= TOP SELLERS (SCHEMA CORRECT) ================= */
    const productSales = await prisma.order_items.groupBy({
      by: ["product_id"],
      _sum: {
        price: true,
      },
      orderBy: {
        _sum: {
          price: "desc",
        },
      },
      take: 20,
    });

    const productIds = productSales.map((p) => p.product_id);

    const productsWithSellers = await prisma.products.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        seller_id: true,
      },
    });

    const sellerTotals = {};
    productSales.forEach((p) => {
      const product = productsWithSellers.find(
        (prod) => prod.id === p.product_id
      );
      if (!product?.seller_id) return;

      sellerTotals[product.seller_id] =
        (sellerTotals[product.seller_id] || 0) +
        Number(p._sum.price || 0);
    });

    const sellerIds = Object.keys(sellerTotals);

    const sellerNames = await prisma.users.findMany({
      where: { id: { in: sellerIds } },
      select: { id: true, name: true },
    });

    const sellerNameMap = Object.fromEntries(
      sellerNames.map((s) => [s.id, s.name])
    );

    const topSellers = sellerIds
      .map((id) => ({
        seller_id: id,
        seller_name: sellerNameMap[id] || "Unknown Seller",
        total: sellerTotals[id],
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    /* ================= TOP PRODUCTS ================= */
    const topProducts = await prisma.products.findMany({
      orderBy: { views: "desc" },
      take: 5,
      include: {
        users: {
          select: { id: true, name: true },
        },
      },
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
          audit_logs_count: rawActivity.length,
          pending_payments: 0,
          failed_payments: 0,
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
      select: { id: true, name: true, role: true },
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
        data: { isApprovedSeller: true, is_active: true },
      });
    });

    await auditLog({
      req,
      actor: req.user,
      action: AUDIT.SELLER_VERIFIED,
      target: seller.name,
      metadata: {
        seller_id: sellerId,
        seller_name: seller.name,
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

exports.searchSellers = async (req, res, next) => {
  try {
    const { query } = req.query;

    if (!query || !query.trim()) {
      return res.json({ success: true, sellers: [] });
    }

    const q = query.trim().toLowerCase();

    const sellers = await prisma.users.findMany({
      where: {
        role: "seller",
        OR: [
          { email: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
        ],
      },
      include: {
        seller_profile: true,
      },
      take: 10,
    });

    res.json({ success: true, sellers });
  } catch (err) {
    next(err);
  }
};

