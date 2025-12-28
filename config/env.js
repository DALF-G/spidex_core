require("dotenv").config();

module.exports = {
  PORT: process.env.PORT || 5000,
  MPESA_BASE_URL: process.env.MPESA_BASE_URL,
  MPESA_SHORTCODE: process.env.MPESA_SHORTCODE,
};
