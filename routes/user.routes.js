const express = require("express");
const router = express.Router();
const userController = require("../controllers/user.controller");
const tokenController = require("../controllers/token.controller");
const { protect } = require("../middlewares/auth.middleware");

router.post("/register", userController.register);
router.post("/login", userController.login);
router.get("/me", protect, tokenController.getMe);


module.exports = router;
