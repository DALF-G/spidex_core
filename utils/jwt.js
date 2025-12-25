const jwt = require("jsonwebtoken");

exports.signToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: "1d",
  });
};
exports.signRefreshToken = (payload) =>
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "5d" });