const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const prisma = require("../config/db");
const { signToken, signRefreshToken } = require("../utils/jwt");
const {
  createUserWithAccount,
  findUserByEmail,
} = require("../services/user.service");

/**
 * REGISTER + AUTO LOGIN
 */
exports.register = async (req, res, next) => {
  try {
    const { name, email, phone, password, role } = req.body;

    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const password_hash = await bcrypt.hash(password, 12);

    const user = await createUserWithAccount({
      name,
      email,
      phone,
      password_hash,
      role,
    });

    // Access token (short-lived)
    const token = signToken({
      id: user.id,
      role: user.role,
    });

    // Refresh token (long-lived)
    const refreshToken = signRefreshToken({
      id: user.id,
    });

    // Store refresh token (safe, optional revoke)
    await prisma.refresh_tokens.create({
      data: {
        id: uuidv4(),
        user_id: user.id,
        token: refreshToken,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });

    res.status(201).json({
      success: true,
      message: "Registered & logged in",
      token,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * LOGIN
 */
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Access token
    const token = signToken({
      id: user.id,
      role: user.role,
      is_active: user.is_active,
    });

    // Refresh token
    const refreshToken = signRefreshToken({
      id: user.id,
    });

    await prisma.refresh_tokens.create({
      data: {
        id: uuidv4(),
        user_id: user.id,
        token: refreshToken,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    res.json({
      success: true,
      token,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        is_active: user.is_active,
      },
    });
  } catch (err) {
    next(err);
  }
};
