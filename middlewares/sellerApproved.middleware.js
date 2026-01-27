const prisma = require("../config/db");

module.exports = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    // Only enforce for sellers
    if (req.user.role !== "seller") {
      return next();
    }

    const seller = await prisma.users.findUnique({
      where: { id: req.user.id },
      select: {
        isApprovedSeller: true,
        is_active: true,
      },
    });

    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    if (!seller.isApprovedSeller) {
      return res.status(403).json({
        message: "Seller not approved yet",
      });
    }

    if (!seller.is_active) {
      return res.status(403).json({
        message: "Seller account suspended",
      });
    }

    next();
  } catch (err) {
    next(err);
  }
};
