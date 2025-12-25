const express = require("express");
const router = express.Router();

const paymentController = require("../controllers/payment.controller");
const idempotency = require("../middlewares/idempotency.middleware");

router.post(
  "/mpesa/stk-push",
  idempotency,
  paymentController.initiateMpesa
);

module.exports = router;
