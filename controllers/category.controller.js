const prisma = require("../config/db");

/**
 * CREATE CATEGORY (OPTIONAL SUBCATEGORIES)
 * supports multipart/form-data
 */
exports.createCategory = async (req, res, next) => {
  try {
    const { name, subcategories } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Name required" });
    }

    const existing = await prisma.category.findUnique({
      where: { name },
    });

    if (existing) {
      return res.status(400).json({ message: "Category already exists" });
    }

    // ✅ Cloudinary file URL
    const photoUrl = req.file ? req.file.path : null;

    const subcategoryList = subcategories
      ? subcategories.split(",").map(s => s.trim()).filter(Boolean)
      : [];

    const category = await prisma.category.create({
      data: {
        name,
        photo: photoUrl,
        subcategory: subcategoryList.length
          ? {
              create: subcategoryList.map(name => ({ name })),
            }
          : undefined,
      },
      include: {
        subcategory: true, // ✅ correct relation name
      },
    });

    res.status(201).json({
      success: true,
      category,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * UPDATE CATEGORY
 */
exports.updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = {};

    if (req.body.name) {
      data.name = req.body.name;
    }

    if (req.file) {
      data.photo = req.file.path;
    }

    const category = await prisma.category.update({
      where: { id },
      data,
    });

    res.json({
      success: true,
      category,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET ALL CATEGORIES
 */
exports.getAllCategories = async (req, res, next) => {
  try {
    const categories = await prisma.category.findMany({
      include: { subcategory: true },
      orderBy: { created_at: "asc" },
    });

    res.json({ success: true, categories });
  } catch (err) {
    next(err);
  }
};

/**
 * GET CATEGORY BY ID
 */
exports.getCategoryById = async (req, res, next) => {
  try {
    const category = await prisma.category.findUnique({
      where: { id: req.params.id },
      include: { subcategory: true }, // ✅ fixed
    });

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.json({ success: true, category });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE CATEGORY
 */
exports.deleteCategory = async (req, res, next) => {
  try {
    const { id } = req.params;

    const productCount = await prisma.products.count({
      where: { category_id: id },
    });

    if (productCount > 0) {
      return res.status(400).json({
        message: "Cannot delete category with existing products",
      });
    }

    await prisma.category.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: "Category and subcategories deleted",
    });
  } catch (err) {
    next(err);
  }
};

/**
 * ADD SUBCATEGORY
 */
exports.addSubCategory = async (req, res, next) => {
  try {
    const { name } = req.body;
    const { id } = req.params;

    if (!name) {
      return res.status(400).json({ message: "Subcategory name required" });
    }

    const sub = await prisma.subcategory.create({
      data: {
        name,
        category_id: id,
      },
    });

    res.json({
      success: true,
      subcategory: sub,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * UPDATE SUBCATEGORY
 */
exports.updateSubCategory = async (req, res, next) => {
  try {
    const { subId } = req.params;
    const { name } = req.body;

    const sub = await prisma.subcategory.update({
      where: { id: subId },
      data: { name },
    });

    res.json({
      success: true,
      subcategory: sub,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE SUBCATEGORY
 */
exports.deleteSubCategory = async (req, res, next) => {
  try {
    const { subId } = req.params;

    await prisma.subcategory.delete({
      where: { id: subId },
    });

    res.json({
      success: true,
      message: "Subcategory deleted",
    });
  } catch (err) {
    next(err);
  }
};
