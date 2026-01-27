const express = require("express");
const router = express.Router();

const sellerController = require("../controllers/seller.controller");
const { protect } = require("../middlewares/auth.middleware");
const { allowRoles } = require("../middlewares/role.middleware");
const sellerApproved = require("../middlewares/sellerApproved.middleware");
const uploadKra = require("../middlewares/uploadKra.middleware");

/**
 * User Account Profile
 */
router.get("/profile",protect,allowRoles("seller", "admin"),
  sellerController.getProfile
);

router.put("/profile/update",protect,allowRoles("seller"),
  sellerController.updateProfile
);

/**
 * Company Profile
 */
router.get("/seller-profile",protect,allowRoles("seller", "admin"),
  sellerController.getSellerProfile
);

router.post("/company-profile",protect,allowRoles("seller"),
  sellerController.upsertSellerProfile
);

/**
 * Orders
 */
router.get("/orders",protect,allowRoles("seller"),
  sellerApproved,
  sellerController.getOrders
);

router.put("/orders/status/:id",protect,allowRoles("seller"),
  sellerApproved,
  sellerController.updateOrderStatus
);

router.put("/orders/fulfill/:id",protect,allowRoles("seller"),
  sellerApproved,
  sellerController.fulfillOrder
);

/**
 * Seller Status
 */
router.get("/status",protect,allowRoles("seller"),
  sellerController.checkApprovalStatus
);

/**
 * KRA Upload
 */
router.post("/kra-upload",protect,allowRoles("seller"),
  uploadKra.single("kra_certificate"),
  sellerController.uploadKraCertificate
);

/**
 * Dashboard
 */
router.get("/stats",protect,allowRoles("seller"),
  sellerApproved,
  sellerController.getSellerDashboardCharts
);

module.exports = router;
