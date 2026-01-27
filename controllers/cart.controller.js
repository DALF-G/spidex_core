const prisma = require("../config/db");
const { v4: uuidv4 } = require("uuid");

/**
 * GET current cart
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
                users: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    res.json({
      success: true,
      cart: cart || { order_items: [] },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * ADD product to cart
 */
exports.addToCart = async (req, res, next) => {
  try {
    const buyerId = req.user.id;
    const { productId, quantity = 1 } = req.body;

    // 1️⃣ Find or create cart
    let cart = await prisma.orders.findFirst({
      where: {
        buyer_id: buyerId,
        status: "cart",
      },
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

    // 2️⃣ Check existing item
    const existingItem = await prisma.order_items.findFirst({
      where: {
        order_id: cart.id,
        product_id: productId,
      },
    });

    if (existingItem) {
      const updated = await prisma.order_items.update({
        where: { id: existingItem.id },
        data: {
          quantity: existingItem.quantity + quantity,
        },
      });

      return res.json({
        success: true,
        message: "Cart updated",
        item: updated,
      });
    }

    // 3️⃣ Create new item
    const product = await prisma.products.findUnique({
      where: { id: productId },
      select: { price: true },
    });

    const item = await prisma.order_items.create({
      data: {
        id: uuidv4(),
        order_id: cart.id,
        product_id: productId,
        quantity,
        price: product.price,
      },
    });

    res.json({
      success: true,
      message: "Added to cart",
      item,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * UPDATE quantity
 */
exports.updateCartItem = async (req, res, next) => {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;

    if (quantity < 1) {
      return res.status(400).json({ message: "Quantity must be at least 1" });
    }

    const item = await prisma.order_items.update({
      where: { id: itemId },
      data: { quantity },
    });

    res.json({ success: true, item });
  } catch (err) {
    next(err);
  }
};

/**
 * REMOVE item
 */
exports.removeCartItem = async (req, res, next) => {
  try {
    const { itemId } = req.params;

    await prisma.order_items.delete({
      where: { id: itemId },
    });

    res.json({
      success: true,
      message: "Item removed",
    });
  } catch (err) {
    next(err);
  }
};
