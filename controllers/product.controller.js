const prisma = require("../config/db");

/**
 * CREATE PRODUCT
 * - Admin: can create for any seller (seller_id required)
 * - Seller: can only create for self
 */
exports.createProduct = async (req, res, next) => {
  try {
    const {
      title,
      description,
      price,
      category_id,
      subcategory_id,
      seller_id, // admin only
    } = req.body;

    if (!title || !price || !category_id) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    let finalSellerId = req.user.id;

    // 🧠 Admin can create for another seller
    if (req.user.role === "admin") {
      if (!seller_id) {
        return res
          .status(400)
          .json({ message: "seller_id is required for admin" });
      }
      finalSellerId = seller_id;
    }

    // 🚫 Seller cannot spoof seller_id
    if (req.user.role === "seller" && seller_id) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const product = await prisma.products.create({
      data: {
        title,
        description,
        price,
        seller_id: finalSellerId,
        category_id,
        subcategory_id: subcategory_id || null,
      },
    });

    res.status(201).json({
      success: true,
      product,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET ALL PRODUCTS (ROOT / PUBLIC / ADMIN)
 */
exports.getAllProducts = async (req, res, next) => {
  try {
    const products = await prisma.products.findMany({
      where: { is_active: true },
      include: {
        users: {
          select: {
            id: true,
            name: true,
          },
        },
        category: true,
        subcategory: true,
        productimage: true,
      },
      orderBy: { created_at: "desc" },
    });

    // 🔁 Standardize response for frontend
    const formattedProducts = products.map((product) => {
      const { users, ...rest } = product;
      return {
        ...rest,
        seller: users, // 👈 rename users → seller
      };
    });

    res.json({
      success: true,
      products: formattedProducts,
    });
  } catch (err) {
    next(err);
  }
};


/**
 * GET PRODUCTS FOR LOGGED-IN SELLER
 */
exports.getMyProducts = async (req, res, next) => {
  try {
    const products = await prisma.products.findMany({
      where: { seller_id: req.user.id },
      include: {
        users: {
          select: {
            id: true,
            name: true,
          },
        },
        category: true,
        subcategory: true,
        productimage: true,
      },
      orderBy: { created_at: "desc" },
    });

    // 🔁 Standardize response (users → seller)
    const formattedProducts = products.map((product) => {
      const { users, ...rest } = product;
      return {
        ...rest,
        seller: users,
      };
    });

    res.json({
      success: true,
      products: formattedProducts,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * UPDATE PRODUCT
 * - Admin: any product
 * - Seller: only own product
 */
exports.updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;

    const product = await prisma.products.findUnique({
      where: { id },
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // 🚫 Seller ownership enforcement
    if (req.user.role === "seller" && product.seller_id !== req.user.id) {
      return res.status(403).json({ message: "Access denied" });
    }

    const updated = await prisma.products.update({
      where: { id },
      data: req.body,
    });

    res.json({
      success: true,
      product: updated,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE PRODUCT
 * - Admin: any product
 * - Seller: only own product
 */
exports.deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;

    const product = await prisma.products.findUnique({ where: { id } });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (req.user.role === "seller" && product.seller_id !== req.user.id) {
      return res.status(403).json({ message: "Access denied" });
    }

    await prisma.products.delete({ where: { id } });

    res.json({
      success: true,
      message: "Product deleted",
    });
  } catch (err) {
    next(err);
  }
};

/**
 * UPLOAD PRODUCT IMAGES
 * - Admin: any product
 * - Seller: own product only
 */
exports.uploadProductImages = async (req, res, next) => {
  try {
    console.log("FILES:", req.files);

    const { id } = req.params;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        message: "No images uploaded. Use form-data with key 'photo'.",
      });
    }

    const product = await prisma.products.findUnique({
      where: { id },
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (req.user.role === "seller" && product.seller_id !== req.user.id) {
      return res.status(403).json({ message: "Access denied" });
    }

    const images = await Promise.all(
      req.files.map((file) =>
        prisma.productimage.create({
          data: {
            url: file.path,
            product_id: id,
          },
        })
      )
    );

    res.json({
      success: true,
      images,
    });
  } catch (err) {
    next(err);
  }
};



/**
 * SEARCH & FILTER PRODUCTS (PUBLIC)
 */
exports.searchProducts = async (req, res, next) => {
  try {
    const {
      search,
      category,
      subcategory,
      minPrice,
      maxPrice,
      seller,
    } = req.query;

    const where = { is_active: true };

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    if (category) where.category_id = category;
    if (subcategory) where.subcategory_id = subcategory;
    if (seller) where.seller_id = seller;

    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = Number(minPrice);
      if (maxPrice) where.price.lte = Number(maxPrice);
    }

    const products = await prisma.products.findMany({
      where,
      include: {
        users: {
          select: {
            id: true,
            name: true,
          },
        },
        category: true,
        subcategory: true,
        productimage: true,
      },
      orderBy: { created_at: "desc" },
    });

    // 🔁 Standardize response (users → seller)
    const formattedProducts = products.map((product) => {
      const { users, ...rest } = product;
      return {
        ...rest,
        seller: users,
      };
    });

    res.json({
      success: true,
      count: formattedProducts.length,
      products: formattedProducts,
    });
  } catch (err) {
    next(err);
  }
};
