const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

exports.chargeCard = async ({ amount, token, reference }) => {
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amount * 100, // cents
    currency: "kes",
    payment_method: token,
    confirm: true,
    description: `Order payment ${reference}`,
    metadata: { reference },
  });

  return paymentIntent;
};
