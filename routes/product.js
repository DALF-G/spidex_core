const express = require("express");
const router = express.Router();
const { cloudinary } = require("../config/cloudinary");
const productController = require("../controllers/product.controller");
const upload = require("../middlewares/upload");
const { protect } = require("../middlewares/auth.middleware");
const { allowRoles } = require("../middlewares/role.middleware");



/**
 * SEARCH MUST COME FIRST
 */
router.get("/search", productController.searchProducts);

/**
 * PUBLIC
 */
router.get("/", productController.getAllProducts);

/**
 * SELLER
 */
router.get(
  "/mine",
  protect,
  allowRoles("seller"),
  productController.getMyProducts
);

router.get("/:id", protect, productController.getProductById);

/**
 * CREATE PRODUCT
 */
router.post(
  "/",
  protect,
  allowRoles("seller", "admin"),
  productController.createProduct
);

/**
 * UPLOAD PRODUCT IMAGES
 */
router.post(
  "/images/:id",
  protect,
  allowRoles("seller", "admin"),
  upload.array("photo", 10),
  productController.uploadProductImages
);

/**
 * UPDATE / DELETE
 */
router.put(
  "/:id",
  protect,
  allowRoles("seller", "admin"),
  productController.updateProduct
);

router.delete(
  "/:id",
  protect,
  allowRoles("seller", "admin"),
  productController.deleteProduct
);

module.exports = router;
