const mpesaService = require("../services/mpesa.service");
const response = require("../utils/response");

exports.initiateMpesa = async (req, res, next) => {
  try {
    const { amount, phone, reference } = req.body;

    const result = await mpesaService.stkPush({
      amount,
      phone,
      reference,
    });

    return response.success(res, "STK push initiated", result);
  } catch (err) {
    next(err);
  }
};
