module.exports = (req, res, next) => {
    // user must already be authenticated
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
  
    // only applies to sellers
    if (req.user.role === "seller" && !req.user.is_active) {
      return res.status(403).json({
        message: "Seller not approved yet",
      });
    }
  
    next();
  };
  