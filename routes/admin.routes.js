const express = require("express");
const router = express.Router();

const adminController = require("../controllers/admin.controller");
const { protect } = require("../middlewares/auth.middleware");
const { allowRoles } = require("../middlewares/role.middleware");

// Auth
router.post("/register", adminController.registerAdmin);
router.post("/login", adminController.adminLogin);

// Users
router.get("/users", protect, allowRoles("admin"), adminController.getAllUsers);
router.put(
  "/toggle-active/:userId",
  protect,
  allowRoles("admin"),
  adminController.toggleUserActive
);
router.delete(
  "/delete/:userId",
  protect,
  allowRoles("admin"),
  adminController.deleteUser
);

// Sellers
router.get(
  "/sellers",
  protect,
  allowRoles("admin"),
  adminController.getAllSellerProfiles
);
router.get(
  "/sellers/:sellerId",
  protect,
  allowRoles("admin"),
  adminController.getSellerProfileById
);
router.put(
  "/approve/:userId",
  protect,
  allowRoles("admin"),
  adminController.approveSeller
);
router.put(
  "/reject/:userId",
  protect,
  allowRoles("admin"),
  adminController.rejectSeller
);
router.put(
  "/verify/:sellerId",
  protect,
  allowRoles("admin"),
  adminController.verifySeller
);
router.get(
  "/pending",
  protect,
  allowRoles("admin"),
  adminController.getPendingSellers
);

// Buyers
router.get(
  "/buyers",
  protect,
  allowRoles("admin"),
  adminController.getAllBuyers
);

// Orders
router.get(
  "/orders/disputed",
  protect,
  allowRoles("admin"),
  adminController.getDisputedOrders
);
router.post(
  "/orders/refund/:orderId",
  protect,
  allowRoles("admin"),
  adminController.refundOrder
);

// Audit & stats
router.get(
  "/audit-logs",
  protect,
  allowRoles("admin"),
  adminController.getAuditLogs
);
router.get(
  "/stats",
  protect,
  allowRoles("admin"),
  adminController.getAdminStats
);

module.exports = router;
