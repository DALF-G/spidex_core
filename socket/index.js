const { Server } = require("socket.io");

let io;

exports.initSocket = (server) => {
  io = new Server(server, {
    cors: { origin: "*" },
  });

  io.on("connection", (socket) => {
    socket.on("join", ({ userId }) => {
      socket.join(userId);
    });
  });

  return io;
};

exports.getIO = () => {
  if (!io) throw new Error("Socket not initialized");
  return io;
};
