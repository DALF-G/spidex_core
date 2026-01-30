const express = require("express");
const router = express.Router();
const webhook = require("../controllers/stripe.webhook");

router.post(
  "/webhooks/stripe",
  express.raw({ type: "application/json" }),
  webhook.handleStripeWebhook
);

module.exports = router;
