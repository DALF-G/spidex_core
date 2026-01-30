const express = require("express");
const router = express.Router();

const paymentController = require("../controllers/payment.controller");
const idempotency = require("../middlewares/idempotency.middleware");

router.post(
  "/payments/initiate",
  idempotency,
  paymentController.initiatePayment
);

module.exports = router;
