const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin.controller");
const { protect } = require("../middlewares/auth.middleware");
const { allowRoles } = require("../middlewares/role.middleware");

// Only logged-in admins can create other admins
router.post("/register",protect,
  adminController.registerAdmin
);

router.post("/login", 
  adminController.adminLogin
);

router.get("/users",protect,allowRoles("admin"),
  adminController.getAllUsers
);

router.get("/sellers",protect,allowRoles("admin"),
  adminController.getAllSellers
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

router.get("/buyers",protect,allowRoles("admin"),
  adminController.getAllBuyers
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
