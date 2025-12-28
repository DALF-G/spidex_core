const { v4: uuidv4 } = require("uuid");
const prisma = require("../config/db");

exports.notifyUser = async ({ userId, title, message }) => {
  await prisma.notifications.create({
    data: {
      id: uuidv4(),
      user_id: userId,
      title,
      message,
    },
  });
};
