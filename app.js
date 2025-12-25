const express = require("express");
const cors = require("cors");

const paymentRoutes = require("./routes/payment.routes");
const userRoutes = require("./routes/user.routes");
const adminRoutes = require("./routes/admin.routes");
const errorMiddleware = require("./middlewares/error.middleware");

const app = express();
// Middleware
app.use(express.json());
app.use(cors());
// Static files
app.use("/uploads", express.static("uploads"));
// Routes
app.use("/api/payment", paymentRoutes);

app.use("/api/users", userRoutes);

app.use("/api/admin", adminRoutes);


// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", service: "Spidex Gateway" });
});

app.use(errorMiddleware);

module.exports = app;
