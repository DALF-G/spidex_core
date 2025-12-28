const express = require("express");
const router = express.Router();

const sellerController = require("../controllers/seller.controller");
const { protect } = require("../middlewares/auth.middleware");
const { allowRoles } = require("../middlewares/role.middleware");
const sellerApproved = require("../middlewares/sellerApproved.middleware");

/**
 * Seller Profile
 */
router.get(
  "/profile",
  protect,
  allowRoles("seller"),
  sellerController.getProfile
);

router.put(
  "/profile",
  protect,
  allowRoles("seller"),
  sellerApproved,
  sellerController.updateProfile
);

/**
 * Seller Orders
 */
router.get(
  "/orders",
  protect,
  allowRoles("seller"),
  sellerApproved,
  sellerController.getOrders
);

router.put(
  "/order/status/:id",
  protect,
  allowRoles("seller"),
  sellerApproved,
  sellerController.updateOrderStatus
);

router.put(
  "/orders/fulfill/:id",
  protect,
  allowRoles("seller"),
  sellerApproved,
  sellerController.fulfillOrder
);

/**
 * Notifications
 */
router.get(
  "/notifications",
  protect,
  allowRoles("seller"),
  sellerController.getNotifications
);

router.put(
  "/notifications/read/:id",
  protect,
  allowRoles("seller"),
  sellerController.markNotificationRead
);

/**
 * Finance
 */
router.get(
  "/balance",
  protect,
  allowRoles("seller"),
  sellerApproved,
  sellerController.getBalance
);

router.get(
  "/transactions",
  protect,
  allowRoles("seller"),
  sellerApproved,
  sellerController.getTransactions
);

router.get(
  "/payouts",
  protect,
  allowRoles("seller"),
  sellerApproved,
  sellerController.getPayouts
);

/**
 * Status & Stats
 */
router.get(
  "/status",
  protect,
  allowRoles("seller"),
  sellerController.checkApprovalStatus
);

router.get(
  "/stats",
  protect,
  allowRoles("seller"),
  sellerApproved,
  sellerController.getSellerStats
);

module.exports = router;
