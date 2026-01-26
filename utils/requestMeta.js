const UAParser = require("ua-parser-js");
const geoip = require("geoip-lite");

const getRequestMeta = (req) => {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    req.ip ||
    null;

  const parser = new UAParser(req.headers["user-agent"]);
  const ua = parser.getResult();

  const device = ua.device.type
    ? `${ua.device.type} (${ua.browser.name} on ${ua.os.name})`
    : `${ua.browser.name || "Unknown"} on ${ua.os.name || "Unknown OS"}`;

  const geo = ip ? geoip.lookup(ip) : null;

  return {
    ip,
    device,
    location: geo
      ? {
          country: geo.country || null,
          city: geo.city || null,
          timezone: geo.timezone || null,
        }
      : {
          country: null,
          city: null,
          timezone: null,
        },
  };
};

module.exports = { getRequestMeta };