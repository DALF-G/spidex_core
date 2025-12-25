const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin.controller");
const { protect } = require("../middlewares/auth.middleware");
const { allowRoles } = require("../middlewares/role.middleware");

// Only logged-in admins can create other admins
router.post("/register",protect,allowRoles("admin"),
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



module.exports = router;
