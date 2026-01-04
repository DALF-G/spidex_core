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

exports.getMe = async (req, res, next) => {
  try {
    // req.user comes from protect middleware
    const userId = req.user.id;

    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        is_active: true,
        created_at: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      user,
    });
  } catch (err) {
    next(err);
  }
};