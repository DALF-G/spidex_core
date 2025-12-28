const prisma = require("../config/db");
const { v4: uuidv4 } = require("uuid");
const { notifyUser } = require("../services/notification.service");

const ALLOWED_STATUSES = ["pending", "processing", "shipped", "completed", "cancelled"];
const COMMISSION_RATE = Number(process.env.COMMISSION_RATE || 0.10);

/**
 * SELLER: Get own profile
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
        created_at: true,
      },
    });

    res.json({ success: true, seller });
  } catch (err) {
    next(err);
  }
};

/**
 * SELLER: Update own profile
 */
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, phone } = req.body;

    const seller = await prisma.users.update({
      where: { id: req.user.id },
      data: { name, phone },
    });

    res.json({ success: true, message: "Profile updated", seller });
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
      where: { seller_id: req.user.id },
      orderBy: { created_at: "desc" },
    });

    res.json({ success: true, orders });
  } catch (err) {
    next(err);
  }
};

/**
 * SELLER: View notifications
 */
exports.getNotifications = async (req, res, next) => {
  try {
    const notifications = await prisma.notifications.findMany({
      where: { user_id: req.user.id },
      orderBy: { created_at: "desc" },
    });

    res.json({ success: true, notifications });
  } catch (err) {
    next(err);
  }
};

/**
 * SELLER: Mark notification as read (ownership enforced)
 */
exports.markNotificationRead = async (req, res, next) => {
  try {
    const { id } = req.params;

    const updated = await prisma.notifications.updateMany({
      where: { id, user_id: req.user.id },
      data: { is_read: true },
    });

    if (!updated.count) {
      return res.status(404).json({ message: "Notification not found" });
    }

    res.json({ success: true, message: "Notification marked as read" });
  } catch (err) {
    next(err);
  }
};

/**
 * SELLER: Update order status (simple)
 */
exports.updateOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({ message: "Invalid order status" });
    }

    const order = await prisma.orders.findFirst({
      where: { id, seller_id: req.user.id },
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (["completed", "cancelled"].includes(order.status)) {
      return res.status(400).json({ message: "Order already finalized" });
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
 * SELLER: Fulfill order (atomic + ledger safe)
 */
exports.fulfillOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const transitions = {
      pending: ["processing", "cancelled"],
      processing: ["shipped", "cancelled"],
      shipped: ["completed"],
    };

    const order = await prisma.orders.findFirst({
      where: { id, seller_id: req.user.id },
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (["completed", "cancelled"].includes(order.status)) {
      return res.status(400).json({ message: "Order already finalized" });
    }

    if (!(transitions[order.status] || []).includes(status)) {
      return res.status(400).json({
        message: `Cannot change order from ${order.status} to ${status}`,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.orders.update({
        where: { id },
        data: { status },
      });

      await tx.audit_logs.create({
        data: {
          id: uuidv4(),
          actor_id: req.user.id,
          action: "ORDER_FULFILLED",
          metadata: { order_id: id, from: order.status, to: status },
        },
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

        const commission = order.total * COMMISSION_RATE;
        const sellerAmount = order.total - commission;
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
 * SELLER: Wallet balance
 */
exports.getBalance = async (req, res, next) => {
  try {
    const account = await prisma.accounts.findFirst({
      where: { owner_id: req.user.id, owner_type: "user" },
    });

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    const sum = await prisma.entries.aggregate({
      where: { account_id: account.id },
      _sum: { amount: true },
    });

    res.json({
      success: true,
      balance: sum._sum.amount || 0,
      currency: account.currency,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * SELLER: Transactions
 */
exports.getTransactions = async (req, res, next) => {
  try {
    const account = await prisma.accounts.findFirst({
      where: { owner_id: req.user.id, owner_type: "user" },
    });

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    const entries = await prisma.entries.findMany({
      where: { account_id: account.id },
      include: {
        transaction: true,
      },
      orderBy: { created_at: "desc" },
    });

    res.json({
      success: true,
      transactions: entries.map((e) => ({
        amount: e.amount,
        type: e.amount > 0 ? "credit" : "debit",
        reference: e.transaction.reference,
        description: e.transaction.description,
        date: e.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * SELLER: Payouts
 */
exports.getPayouts = async (req, res, next) => {
  try {
    const payouts = await prisma.payments.findMany({
      where: {
        provider: "payout",
        status: "success",
        phone: req.user.phone,
      },
      orderBy: { created_at: "desc" },
    });

    res.json({ success: true, payouts });
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
      select: { is_active: true },
    });

    res.json({
      success: true,
      approved: seller.is_active,
      status: seller.is_active ? "approved" : "pending",
    });
  } catch (err) {
    next(err);
  }
};

/**
 * SELLER: Dashboard stats
 */
exports.getSellerStats = async (req, res, next) => {
  try {
    const sellerId = req.user.id;

    const account = await prisma.accounts.findFirst({
      where: { owner_id: sellerId, owner_type: "user" },
    });

    const [
      totalProducts,
      activeProducts,
      orders,
      ledger,
    ] = await Promise.all([
      prisma.products.count({ where: { seller_id: sellerId } }),
      prisma.products.count({ where: { seller_id: sellerId, is_active: true } }),
      prisma.orders.groupBy({
        by: ["status"],
        where: { seller_id: sellerId },
        _count: true,
      }),
      prisma.entries.aggregate({
        where: { account_id: account?.id },
        _sum: { amount: true },
      }),
    ]);

    const orderStats = Object.fromEntries(
      orders.map((o) => [o.status, o._count])
    );

    res.json({
      success: true,
      stats: {
        products: { total: totalProducts, active: activeProducts },
        orders: orderStats,
        earnings: {
          balance: ledger._sum.amount || 0,
          currency: "KES",
        },
      },
    });
  } catch (err) {
    next(err);
  }
};
