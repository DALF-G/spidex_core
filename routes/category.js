const express = require("express");
const router = express.Router();

const categoryController = require("../controllers/category.controller");
const { protect } = require("../middlewares/auth.middleware");
const { allowRoles } = require("../middlewares/role.middleware");
const upload = require("../middlewares/upload");
const { cloudinary } = require("../config/cloudinary");

/**
 * Category CRUD
 */
router.post(
  "/",
  protect,
  allowRoles("admin", "seller"),
  upload.single("photo"),
  categoryController.createCategory
);

router.get("/", categoryController.getAllCategories);

router.get("/:id", categoryController.getCategoryById);

router.put(
  "/:id",
  protect,
  allowRoles("admin", "seller"),
  upload.single("photo"),
  categoryController.updateCategory
);

router.delete(
  "/:id",
  protect,
  allowRoles("admin", "seller"),
  categoryController.deleteCategory
);

/**
 * Subcategories
 */
router.post(
  "/:id/subcategory",
  protect,
  allowRoles("admin", "seller"),
  categoryController.addSubCategory
);

router.put(
  "/subcategory/:subId",
  protect,
  allowRoles("admin", "seller"),
  categoryController.updateSubCategory
);

router.delete(
  "/subcategory/:subId",
  protect,
  allowRoles("admin", "seller"),
  categoryController.deleteSubCategory
);

module.exports = router;
