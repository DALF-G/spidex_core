const prisma = require("../config/db");

/* ===========================
   CREATE PRODUCT
=========================== */
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

    // Admin can create for another seller
    if (req.user.role === "admin") {
      if (!seller_id) {
        return res
          .status(400)
          .json({ message: "seller_id is required for admin" });
      }
      finalSellerId = seller_id;
    }

    // Seller cannot spoof seller_id
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

/* ===========================
   GET ALL PRODUCTS
   (Pagination + Filters)
=========================== */
exports.getAllProducts = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 12,
      category,
      seller,
      q,
      subcategory,
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const where = { is_active: true };

    if (category) where.category_id = category;
    if (subcategory) where.subcategory_id = subcategory;
    if (seller) where.seller_id = seller;

    if (q) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }

    const [products, count] = await Promise.all([
      prisma.products.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { created_at: "desc" },
        include: {
          users: { select: { id: true, name: true } },
          category: true,
          subcategory: true,
          productimage: true,
        },
      }),
      prisma.products.count({ where }),
    ]);

    const formatted = products.map(({ users, ...rest }) => ({
      ...rest,
      seller: users,
    }));

    res.json({
      success: true,
      count,
      page: Number(page),
      products: formatted,
    });
  } catch (err) {
    next(err);
  }
};

/* ===========================
   GET PRODUCT BY ID
   (VIEW TRACKING)
=========================== */
exports.getProductById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const product = await prisma.products.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            phone: true,
            // ✅ SELLER PROFILE HERE
            seller_profile: {
              select: {
                company_name: true,
                company_location: true,
                website: true,
                phone_primary: true,
                phone_secondary: true,
                is_verified: true,
              },
            },
          },
        },
        category: true,
        subcategory: true,
        productimage: true,
      },
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // 🔁 Increment product views (non-blocking)
    prisma.products
      .update({
        where: { id },
        data: { views: { increment: 1 } },
      })
      .catch(() => {});

    // 👁️ Buyer view tracking
    if (req.user && req.user.role === "buyer") {
      const buyerId = req.user.id;
      const sellerId = product.seller_id;

      // Log every product view
      await prisma.product_views.create({
        data: {
          product_id: id,
          buyer_id: buyerId,
          seller_id: sellerId,
        },
      });

      // Track unique buyer → seller visit
      await prisma.buyer_visits.upsert({
        where: {
          seller_id_buyer_id: {
            seller_id: sellerId,
            buyer_id: buyerId,
          },
        },
        update: { last_visit: new Date() },
        create: {
          seller_id: sellerId,
          buyer_id: buyerId,
        },
      });
    }

    const { users, ...rest } = product;

    res.json({
      success: true,
      product: {
        ...rest,
        
        // product.seller.seller_profile.company_name
        seller: users,
      },
    });
  } catch (err) {
    next(err);
  }
};


/* ===========================
   GET MY PRODUCTS (SELLER)
=========================== */
exports.getMyProducts = async (req, res, next) => {
  try {
    const products = await prisma.products.findMany({
      where: { seller_id: req.user.id },
      orderBy: { created_at: "desc" },
      include: {
        users: { select: { id: true, name: true } },
        category: true,
        subcategory: true,
        productimage: true,
      },
    });

    const formatted = products.map(({ users, ...rest }) => ({
      ...rest,
      seller: users,
    }));

    res.json({
      success: true,
      products: formatted,
    });
  } catch (err) {
    next(err);
  }
};

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
      orderBy: { created_at: "desc" },
      include: {
        users: { select: { id: true, name: true } },
        category: true,
        subcategory: true,
        productimage: true,
      },
    });

    const formattedProducts = products.map(({ users, ...rest }) => ({
      ...rest,
      seller: users,
    }));

    res.json({
      success: true,
      count: formattedProducts.length,
      products: formattedProducts,
    });
  } catch (err) {
    next(err);
  }
};

/* ===========================
   UPDATE PRODUCT
=========================== */
exports.updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;

    const product = await prisma.products.findUnique({ where: { id } });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (
      req.user.role === "seller" &&
      product.seller_id !== req.user.id
    ) {
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

/* ===========================
   DELETE PRODUCT
=========================== */
exports.deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;

    const product = await prisma.products.findUnique({ where: { id } });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (
      req.user.role === "seller" &&
      product.seller_id !== req.user.id
    ) {
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

/* ===========================
   UPLOAD PRODUCT IMAGES
=========================== */
exports.uploadProductImages = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        message: "No images uploaded. Use form-data with key 'photo'.",
      });
    }

    const product = await prisma.products.findUnique({ where: { id } });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (
      req.user.role === "seller" &&
      product.seller_id !== req.user.id
    ) {
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

