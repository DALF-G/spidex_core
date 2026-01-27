const express = require("express");
const router = express.Router();
const cartController = require("../controllers/cart.controller");
const { protect } = require("../middlewares/auth.middleware");

router.get("/", protect, cartController.getMyCart);
router.post("/add", protect, cartController.addToCart);
router.patch("/:itemId", protect, cartController.updateCartItem);
router.delete("/:itemId", protect, cartController.removeCartItem);
router.post("/checkout", protect, cartController.checkoutCart);


module.exports = router;
