const prisma = require("../config/db");
const { v4: uuidv4 } = require("uuid");
const EDITABLE_STATUSES = ["pending"];

/**
 * BUYER: Get profile
 */
exports.getProfile = async (req, res, next) => {
  try {
    const buyer = await prisma.users.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        created_at: true,
      },
    });

    res.json({ success: true, buyer });
  } catch (err) {
    next(err);
  }
};

/**
 * BUYER: Update profile
 */
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, phone } = req.body;

    const buyer = await prisma.users.update({
      where: { id: req.user.id },
      data: { name, phone },
    });

    res.json({
      success: true,
      message: "Profile updated",
      buyer,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * BUYER: Create order (checkout)
 */
exports.createOrder = async (req, res, next) => {
  try {
    const { items } = req.body;
    // items = [{ product_id, quantity }]

    if (!items || !items.length) {
      return res.status(400).json({ message: "No items provided" });
    }

    let total = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await prisma.products.findUnique({
        where: { id: item.product_id },
      });

      if (!product || !product.is_active) {
        return res.status(400).json({ message: "Invalid product" });
      }

      total += product.price * item.quantity;

      orderItems.push({
        id: uuidv4(),
        product_id: product.id,
        quantity: item.quantity,
        price: product.price,
        subtotal: product.price * item.quantity, 
      });
    }

    const order = await prisma.orders.create({
      data: {
        id: uuidv4(),
        buyer_id: req.user.id,
        total,
        status: "pending",
        order_items: {
          create: orderItems,
        },
      },
    });

    res.status(201).json({
      success: true,
      order,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * BUYER: View own orders
 */
exports.getMyOrders = async (req, res, next) => {
  try {
    const orders = await prisma.orders.findMany({
      where: {
        buyer_id: req.user.id,
        status: { not: "cart" }, // 🔥 hide carts
      },
      include: {
        order_items: {
          include: {
            products: true, // ✅ MATCH frontend
          },
        },
      },
      orderBy: { created_at: "desc" },
    });

    res.json({ success: true, orders });
  } catch (err) {
    next(err);
  }
};


/**
 * BUYER: View single order
 */
exports.getOrderById = async (req, res, next) => {
  try {
    const order = await prisma.orders.findUnique({
      where: { id: req.params.id },
      include: {
        order_items: {
          include: {
            products: true,
          },
        },
      },
    });

    if (!order || order.buyer_id !== req.user.id) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json({ success: true, order });
  } catch (err) {
    next(err);
  }
};


/**
 * BUYER: Raise dispute
 */
exports.raiseDispute = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const { id } = req.params;

    const order = await prisma.orders.findUnique({
      where: { id },
    });

    if (!order || order.buyer_id !== req.user.id) {
      return res.status(404).json({ message: "Order not found" });
    }

    await prisma.orders.update({
      where: { id },
      data: { status: "disputed" },
    });

    await prisma.audit_logs.create({
      data: {
        id: uuidv4(),
        actor_id: req.user.id,
        action: "ORDER_DISPUTED",
        metadata: { order_id: id, reason },
      },
    });

    res.json({
      success: true,
      message: "Dispute raised",
    });
  } catch (err) {
    next(err);
  }
};

/**
 * BUYER: View notifications
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

exports.updateOrder = async (req, res, next) => {
  try {
    const { items } = req.body;
    const { id } = req.params;

    if (!items || !items.length) {
      return res.status(400).json({ message: "No items provided" });
    }

    const order = await prisma.orders.findUnique({
      where: { id },
      include: { order_items: true },
    });

    if (!order || order.buyer_id !== req.user.id) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (!EDITABLE_STATUSES.includes(order.status)) {
      return res.status(403).json({
        message: "Order cannot be edited at this stage",
      });
    }

    let total = 0;
    const newItems = [];

    for (const item of items) {
      const product = await prisma.products.findUnique({
        where: { id: item.product_id },
      });

      if (!product || !product.is_active) {
        return res.status(400).json({ message: "Invalid product" });
      }

      const subtotal = product.price * item.quantity;
      total += subtotal;

      newItems.push({
        id: uuidv4(),
        order_id: id,
        product_id: product.id,
        quantity: item.quantity,
        price: product.price,
        subtotal,
      });
    }

    // 🔥 Replace order items atomically
    await prisma.$transaction([
      prisma.order_items.deleteMany({
        where: { order_id: id },
      }),
      prisma.order_items.createMany({
        data: newItems,
      }),
      prisma.orders.update({
        where: { id },
        data: { total },
      }),
    ]);

    res.json({
      success: true,
      message: "Order updated successfully",
    });
  } catch (err) {
    next(err);
  }
};

exports.deleteOrder = async (req, res, next) => {
  try {
    const { id } = req.params;

    const order = await prisma.orders.findUnique({
      where: { id },
    });

    if (!order || order.buyer_id !== req.user.id) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (!EDITABLE_STATUSES.includes(order.status)) {
      return res.status(403).json({
        message: "Completed or processing orders cannot be deleted",
      });
    }

    await prisma.orders.update({
      where: { id },
      data: { status: "cancelled" },
    });

    await prisma.audit_logs.create({
      data: {
        id: uuidv4(),
        actor_id: req.user.id,
        action: "ORDER_CANCELLED",
        metadata: { order_id: id },
      },
    });

    res.json({
      success: true,
      message: "Order cancelled successfully",
    });
  } catch (err) {
    next(err);
  }
};
