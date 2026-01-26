const prisma = require("../config/db");
const { v4: uuidv4 } = require("uuid");
const { notifyUser } = require("../services/notification.service");

const ALLOWED_STATUSES = [
  "pending",
  "processing",
  "shipped",
  "completed",
  "cancelled",
];

const COMMISSION_RATE = Number(process.env.COMMISSION_RATE || 0.10);

const STATUS_TRANSITIONS = {
  pending: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["completed"],
};

/**
 * SELLER: Get user account profile
 */
exports.getProfile = async (req, res, next) => {
  try {
    const seller = await prisma.users.findUnique({
      where: { id: req.user.id },
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
    });

    res.json({ success: true, seller });
  } catch (err) {
    next(err);
  }
};



/**
 * SELLER: Update user account profile (SAFE)
 */
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, phone } = req.body;

    const data = {};
    if (name !== undefined) data.name = name;
    if (phone !== undefined) data.phone = phone;

    const seller = await prisma.users.update({
      where: { id: req.user.id },
      data,
    });

    res.json({ success: true, message: "Profile updated", seller });
  } catch (err) {
    next(err);
  }
};

/**
 * SELLER: Get company profile
 */
exports.getSellerProfile = async (req, res, next) => {
  try {
    const profile = await prisma.seller_profiles.findUnique({
      where: { user_id: req.user.id },
    });

    res.json({
      success: true,
      profile,
      documents: {
        kra_certificate: profile?.kra_certificate || null,
      },
    });
  } catch (err) {
    next(err);
  }
};


/**
 * SELLER: Create / Update company profile
 */
exports.upsertSellerProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const {
      company_name,
      kra_pin,
      company_location,
      phone_primary,
      phone_secondary,
      website,
      description,
    } = req.body;

    if (!company_name || !kra_pin || !company_location || !phone_primary) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    const profile = await prisma.seller_profiles.upsert({
      where: { user_id: userId },
      update: {
        company_name,
        kra_pin,
        company_location,
        phone_primary,
        phone_secondary,
        website,
        description,
      },
      create: {
        user_id: userId,
        company_name,
        kra_pin,
        company_location,
        phone_primary,
        phone_secondary,
        website,
        description,
      },
    });

    await prisma.audit_logs.create({
      data: {
        id: uuidv4(),
        actor_id: userId,
        action: "SELLER_PROFILE_UPDATED",
        metadata: { seller_id: userId },
      },
    });

    res.json({ success: true, profile });
  } catch (err) {
    next(err);
  }
};

/**
 * SELLER: View own orders
 */
exports.getOrders = async (req, res, next) => {
  try {
    const orders = await prisma.orders.findMany({
      where: {
        order_items: {
          some: {
            products: { seller_id: req.user.id },
          },
        },
      },
      include: {
        order_items: { include: { products: true } },
      },
      orderBy: { created_at: "desc" },
    });

    res.json({ success: true, orders });
  } catch (err) {
    next(err);
  }
};

/**
 * SELLER: Update order status (WITH TRANSITION VALIDATION)
 */
exports.updateOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({ message: "Invalid order status" });
    }

    const order = await prisma.orders.findFirst({
      where: {
        id,
        order_items: {
          some: {
            products: { seller_id: req.user.id },
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (!(STATUS_TRANSITIONS[order.status] || []).includes(status)) {
      return res.status(400).json({
        message: `Cannot change order from ${order.status} to ${status}`,
      });
    }

    const updatedOrder = await prisma.orders.update({
      where: { id },
      data: { status },
    });

    await prisma.audit_logs.create({
      data: {
        id: uuidv4(),
        actor_id: req.user.id,
        action: "ORDER_STATUS_UPDATED",
        metadata: { order_id: id, status },
      },
    });

    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    next(err);
  }
};

/**
 * SELLER: Fulfill order (ledger safe)
 */
exports.fulfillOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const order = await prisma.orders.findFirst({
      where: {
        id,
        order_items: {
          some: {
            products: { seller_id: req.user.id },
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (!(STATUS_TRANSITIONS[order.status] || []).includes(status)) {
      return res.status(400).json({
        message: `Cannot change order from ${order.status} to ${status}`,
      });
    }

    const total = Number(order.total);

    const result = await prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.orders.update({
        where: { id },
        data: { status },
      });

      if (status === "completed") {
        const sellerAccount = await tx.accounts.findFirst({
          where: { owner_id: req.user.id, owner_type: "user" },
        });

        const platformAccount = await tx.accounts.findFirst({
          where: { owner_type: "platform" },
        });

        if (!sellerAccount || !platformAccount) {
          throw new Error("Ledger accounts not configured");
        }

        const commission = total * COMMISSION_RATE;
        const sellerAmount = total - commission;
        const txId = uuidv4();

        await tx.transactions.create({
          data: {
            id: txId,
            reference: `ORDER-${order.id}`,
            description: "Order completed payout",
          },
        });

        await tx.entries.createMany({
          data: [
            {
              id: uuidv4(),
              transaction_id: txId,
              account_id: sellerAccount.id,
              amount: sellerAmount,
            },
            {
              id: uuidv4(),
              transaction_id: txId,
              account_id: platformAccount.id,
              amount: commission,
            },
          ],
        });
      }

      return updatedOrder;
    });

    await notifyUser({
      userId: order.buyer_id,
      title: "Order Update",
      message: `Your order is now ${status}.`,
    });

    res.json({ success: true, order: result });
  } catch (err) {
    next(err);
  }
};

/**
 * SELLER: Approval status
 */
exports.checkApprovalStatus = async (req, res, next) => {
  try {
    const seller = await prisma.users.findUnique({
      where: { id: req.user.id },
      select: { isApprovedSeller: true, is_active: true },
    });

    res.json({
      success: true,
      approved: seller.isApprovedSeller,
      status: !seller.isApprovedSeller
        ? "pending"
        : seller.is_active
        ? "approved"
        : "suspended",
    });
  } catch (err) {
    next(err);
  }
};

/**
 * SELLER: Upload KRA certificate (SAFE UPSERT)
 */
exports.uploadKraCertificate = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "File required" });
    }

    const profile = await prisma.seller_profiles.upsert({
      where: { user_id: req.user.id },
      update: {
        kra_certificate: req.file.path,
        is_verified: false,
      },
      create: {
        user_id: req.user.id,
        kra_certificate: req.file.path,
        is_verified: false,
      },
    });

    res.json({ success: true, profile });
  } catch (err) {
    next(err);
  }
};

/**
 * SELLER: Dashboard charts
 */
exports.getSellerDashboardCharts = async (req, res, next) => {
  try {
    const sellerId = req.user.id;

    const ordersByStatus = await prisma.orders.groupBy({
      by: ["status"],
      where: {
        order_items: {
          some: {
            products: { seller_id: sellerId },
          },
        },
      },
      _count: true,
    });

    const monthlySales = await prisma.orders.findMany({
      where: {
        status: "completed",
        order_items: {
          some: {
            products: { seller_id: sellerId },
          },
        },
      },
      select: {
        total: true,
        created_at: true,
      },
    });

    res.json({
      success: true,
      charts: {
        ordersByStatus,
        monthlySales,
      },
    });
  } catch (err) {
    next(err);
  }
};
