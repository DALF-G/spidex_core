const express = require("express");
const router = express.Router();

const messageController = require("../controllers/message.controller");
const { protect } = require("../middlewares/auth.middleware");
const { allowRoles } = require("../middlewares/role.middleware");

// Send message
router.post(
  "/send",
  protect,
  allowRoles("buyer", "seller", "admin"),
  messageController.sendMessage
);

router.put(
    "/read/:conversationId",
    protect,
    allowRoles("buyer", "seller"),
    messageController.markConversationRead
  );



// Get conversation messages
router.get(
  "/conversation/:conversationId",
  protect,
  allowRoles("buyer", "seller", "admin"),
  messageController.getConversationMessages
);

// Delete own message (soft delete)
router.delete(
  "/:messageId",
  protect,
  allowRoles("buyer", "seller", "admin"),
  messageController.deleteMessage
);

// Admin: view ALL conversations
router.get(
  "/admin/conversations",
  protect,
  allowRoles("admin"),
  messageController.getAllConversations
);

module.exports = router;
