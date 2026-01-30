const Stripe = require("stripe");
const prisma = require("../config/db");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

exports.handleStripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error`);
  }

  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object;
    const orderId = intent.metadata.order_id;

    await prisma.orders.update({
      where: { id: orderId },
      data: {
        status: "paid",
        paid_at: new Date(),
        payment_method: "card",
      },
    });
  }

  res.json({ received: true });
};
