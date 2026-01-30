const mpesaService = require("../services/mpesa.service");
const cardService = require("../services/card.service");
const response = require("../utils/response");

exports.initiatePayment = async (req, res, next) => {
  try {
    const { amount, phone, reference, method, cardToken } = req.body;

    if (!method) {
      return response.error(res, "Payment method required", 400);
    }

    let result;

    if (method === "mpesa") {
      if (!phone) {
        return response.error(res, "Phone number required", 400);
      }

      result = await mpesaService.stkPush({
        amount,
        phone,
        reference,
      });
    }

    else if (method === "card") {
      if (!cardToken) {
        return response.error(res, "Card token required", 400);
      }

      result = await cardService.chargeCard({
        amount,
        token: cardToken,
        reference,
      });
    }

    else {
      return response.error(res, "Unsupported payment method", 400);
    }

    return response.success(
      res,
      "Payment initiated successfully",
      result
    );
  } catch (err) {
    next(err);
  }
};
