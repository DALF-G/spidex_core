const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin.controller");
const { protect } = require("../middlewares/auth.middleware");
const { allowRoles } = require("../middlewares/role.middleware");

// Only logged-in admins can create other admins
router.post("/register",
  adminController.registerAdmin
);

router.post("/login", 
  adminController.adminLogin
);

router.get("/users",protect,allowRoles("admin"),
  adminController.getAllUsers
);

router.put("/approve/:userId",protect,allowRoles("admin"),
  adminController.approveSeller
);

router.get(
  "/pending",protect, allowRoles("admin"),
  adminController.getPendingSellers
);

router.put("/reject/:userId",protect,allowRoles("admin"),
  adminController.rejectSeller
);

router.put("/toggle-active/:userId",protect,allowRoles("admin"),
  adminController.toggleUserActive
);

router.delete("/delete/:userId",protect,allowRoles("admin"),
  adminController.deleteUser
);

router.get("/audit-logs",protect,allowRoles("admin"),
  adminController.getAuditLogs
);

router.get("/stats",protect,allowRoles("admin"),
  adminController.getAdminStats
);

/**
 * ADMIN: Refund disputed order
 */
router.post("/orders/refund/:orderId",protect,allowRoles("admin"),
  adminController.refundOrder
);

router.get("/orders/disputed",protect,allowRoles("admin"),
  adminController.getDisputedOrders
);




module.exports = router;
