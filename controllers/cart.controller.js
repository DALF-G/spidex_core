const prisma = require("../config/db");
const { v4: uuidv4 } = require("uuid");

/**
 * GET current buyer cart
 */
exports.getMyCart = async (req, res, next) => {
  try {
    const buyerId = req.user.id;

    const cart = await prisma.orders.findFirst({
      where: {
        buyer_id: buyerId,
        status: "cart",
      },
      include: {
        order_items: {
          include: {
            products: {
              include: {
                productimage: true,
                users: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        },
      },
    });

    res.json({
      success: true,
      cart: cart || { order_items: [], total: 0 },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * ADD / UPDATE cart item
 */
exports.addToCart = async (req, res, next) => {
  try {
    const buyerId = req.user.id;
    const { productId, quantity = 1 } = req.body;

    // 1️⃣ Find or create cart
    let cart = await prisma.orders.findFirst({
      where: { buyer_id: buyerId, status: "cart" },
    });

    if (!cart) {
      cart = await prisma.orders.create({
        data: {
          id: uuidv4(),
          buyer_id: buyerId,
          status: "cart",
        },
      });
    }

    // 2️⃣ Get product unit price
    const product = await prisma.products.findUnique({
      where: { id: productId },
      select: { price: true },
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const unitPrice = Number(product.price);

    // 3️⃣ Check if item exists
    const existingItem = await prisma.order_items.findFirst({
      where: {
        order_id: cart.id,
        product_id: productId,
      },
    });

    let item;

    if (existingItem) {
      const newQuantity = existingItem.quantity + quantity;
      const newSubtotal = unitPrice * newQuantity;

      item = await prisma.order_items.update({
        where: { id: existingItem.id },
        data: {
          quantity: newQuantity,
          subtotal: newSubtotal,
        },
      });
    } else {
      item = await prisma.order_items.create({
        data: {
          id: uuidv4(),
          order_id: cart.id,
          product_id: productId,
          quantity,
          price: unitPrice,
          subtotal: unitPrice * quantity,
        },
      });
    }

    // 4️⃣ Recalculate cart total
    const items = await prisma.order_items.findMany({
      where: { order_id: cart.id },
      select: { subtotal: true },
    });

    const total = items.reduce(
      (sum, i) => sum + Number(i.subtotal),
      0
    );

    await prisma.orders.update({
      where: { id: cart.id },
      data: { total },
    });

    res.json({
      success: true,
      message: "Cart updated",
      item,
      total,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * UPDATE cart item quantity
 */
exports.updateCartItem = async (req, res, next) => {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;

    if (quantity < 1) {
      return res.status(400).json({ message: "Quantity must be at least 1" });
    }

    const item = await prisma.order_items.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    const newSubtotal = Number(item.price) * quantity;

    const updatedItem = await prisma.order_items.update({
      where: { id: itemId },
      data: {
        quantity,
        subtotal: newSubtotal,
      },
    });

    // Update cart total
    const items = await prisma.order_items.findMany({
      where: { order_id: item.order_id },
      select: { subtotal: true },
    });

    const total = items.reduce(
      (sum, i) => sum + Number(i.subtotal),
      0
    );

    await prisma.orders.update({
      where: { id: item.order_id },
      data: { total },
    });

    res.json({
      success: true,
      item: updatedItem,
      total,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * REMOVE item from cart
 */
exports.removeCartItem = async (req, res, next) => {
  try {
    const { itemId } = req.params;

    const item = await prisma.order_items.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    await prisma.order_items.delete({
      where: { id: itemId },
    });

    // Update cart total
    const items = await prisma.order_items.findMany({
      where: { order_id: item.order_id },
      select: { subtotal: true },
    });

    const total = items.reduce(
      (sum, i) => sum + Number(i.subtotal),
      0
    );

    await prisma.orders.update({
      where: { id: item.order_id },
      data: { total },
    });

    res.json({
      success: true,
      message: "Item removed",
      total,
    });
  } catch (err) {
    next(err);
  }
};

exports.checkoutCart = async (req, res, next) => {
    try {
      const buyerId = req.user.id;
  
      const cart = await prisma.orders.findFirst({
        where: {
          buyer_id: buyerId,
          status: "cart",
        },
        include: {
          order_items: true,
        },
      });
  
      if (!cart || cart.order_items.length === 0) {
        return res.status(400).json({
          message: "Cart is empty",
        });
      }
  
      // Finalize order
      const order = await prisma.orders.update({
        where: { id: cart.id },
        data: {
          status: "pending", // next: paid / shipped / completed
        },
      });
  
      res.json({
        success: true,
        message: "Order placed successfully",
        order,
      });
    } catch (err) {
      next(err);
    }
  };
  