const express = require("express");
const router = express.Router();
const buyerController = require("../controllers/buyer.controller");
const { protect } = require("../middlewares/auth.middleware");
const { allowRoles } = require("../middlewares/role.middleware");

/**
 * Profile
 */
router.get(
  "/profile",
  protect,
  allowRoles("buyer"),
  buyerController.getProfile
);

router.patch(
  "/profile",
  protect,
  allowRoles("buyer"),
  buyerController.updateProfile
);

/**
 * Orders
 */
router.post(
  "/orders",
  protect,
  allowRoles("buyer"),
  buyerController.createOrder
);

router.get(
  "/orders",
  protect,
  allowRoles("buyer"),
  buyerController.getMyOrders
);

router.get(
  "/orders/:id",
  protect,
  allowRoles("buyer"),
  buyerController.getOrderById
);

router.post(
  "/orders/:id/dispute",
  protect,
  allowRoles("buyer"),
  buyerController.raiseDispute
);

/**
 * Notifications
 */
router.get(
  "/notifications",
  protect,
  allowRoles("buyer"),
  buyerController.getNotifications
);

module.exports = router;
