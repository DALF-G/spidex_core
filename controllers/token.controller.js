const jwt = require("jsonwebtoken");
const prisma = require("../config/db");
const { signAccessToken } = require("../utils/jwt");

exports.refresh = async (req, res) => {
  const { refreshToken } = req.body;

  const stored = await prisma.refresh_tokens.findUnique({
    where: { token: refreshToken },
  });

  if (!stored || stored.expires_at < new Date()) {
    return res.status(401).json({ message: "Invalid refresh token" });
  }

  const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
  const accessToken = signAccessToken({ id: decoded.id });

  res.json({ accessToken });
};
