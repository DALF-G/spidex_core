const express = require("express");
const cors = require("cors");

const paymentRoutes = require("./routes/payment.routes");
const userRoutes = require("./routes/user.routes");
const adminRoutes = require("./routes/admin.routes");
const sellerRoutes = require("./routes/seller");
const buyerRoutes = require("./routes/buyer");
const categoryRoutes = require("./routes/category");
const productRoutes = require("./routes/product");
const messageRoutes = require("./routes/messages");
const errorMiddleware = require("./middlewares/error.middleware");
const cartRoutes = require("./routes/cart.routes");

const path = require("path");

const app = express(); // ✅ app initialized first

app.use(cors());


// ======================
// STATIC FILES
// ======================
app.use("/uploads", express.static(path.join(__dirname, "uploads")));


// Multer ignores JSON parser automatically
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set("trust proxy", true);

// ======================
// ROUTES
// ======================
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/users", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/seller", sellerRoutes);
app.use("/api/buyer", buyerRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/auth", userRoutes);
app.use("/api/cart", cartRoutes);


// ======================
// HEALTH CHECK
// ======================
app.get("/health", (req, res) => {
  res.json({ status: "OK", service: "Spidex Gateway" });
});

// ======================
// ERROR HANDLER (LAST)
// ======================
app.use(errorMiddleware);

module.exports = app;
