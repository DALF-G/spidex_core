const { v4: uuidv4 } = require("uuid");

module.exports = (req, res, next) => {
  const key = req.headers["idempotency-key"];

  if (!key) {
    return res.status(400).json({
      message: "Idempotency-Key header required",
    });
  }

  req.idempotencyKey = key || uuidv4();
  next();
};
