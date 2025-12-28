require("dotenv").config();
const http = require("http");
const app = require("./app");
const prisma = require("./config/db");
const { initSocket } = require("./socket");

const PORT = process.env.PORT || 3000;

// Create ONE server
const server = http.createServer(app);

async function startServer() {
  try {
    await prisma.$connect();
    console.log("PostgreSQL connected successfully");

    // Initialize Socket.IO ON THE SAME SERVER
    initSocket(server);

    // Listen ONCE
    server.listen(PORT, () => {
      console.log(`Spidex Gateway running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Startup error:", err);
    process.exit(1);
  }
}

startServer();
