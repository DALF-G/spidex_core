const prisma = require("../config/db");
const { v4: uuidv4 } = require("uuid");
const { getIO } = require("../socket");

/**
 * SEND MESSAGE
 */
exports.sendMessage = async (req, res, next) => {
    try {
      const { receiver_id, body } = req.body;
      const sender_id = req.user.id;
      const sender_role = req.user.role;
  
      if (!receiver_id || !body) {
        return res.status(400).json({ message: "Missing fields" });
      }
  
      let buyer_id, seller_id;
  
      // ===============================
      // ROLE RESOLUTION (UNCHANGED)
      // ===============================
      if (sender_role === "buyer") {
        buyer_id = sender_id;
        seller_id = receiver_id;
      } else if (sender_role === "seller") {
        buyer_id = receiver_id;
        seller_id = sender_id;
      } 
      // ===============================
      // ADMIN LOGIC (UPGRADED, SAFE)
      // ===============================
      else if (sender_role === "admin") {
        // Try to find existing conversation
        let conversation = await prisma.conversations.findFirst({
          where: {
            OR: [
              { buyer_id: receiver_id },
              { seller_id: receiver_id },
            ],
          },
        });
  
        // If no conversation exists, create one
        if (!conversation) {
          const receiver = await prisma.users.findUnique({
            where: { id: receiver_id },
            select: { role: true },
          });
  
          if (!receiver || !["buyer", "seller"].includes(receiver.role)) {
            return res.status(400).json({ message: "Invalid receiver" });
          }
  
          conversation = await prisma.conversations.create({
            data: {
              id: uuidv4(),
              buyer_id: receiver.role === "buyer" ? receiver_id : sender_id,
              seller_id: receiver.role === "seller" ? receiver_id : sender_id,
            },
          });
        }
  
        const message = await prisma.messages.create({
          data: {
            id: uuidv4(),
            conversation_id: conversation.id,
            sender_id,
            sender_role,
            receiver_id,
            body,
            is_read: false,
          },
        });
  
        // 🔔 REAL-TIME EMIT (SAFE)
        try {
          getIO().to(receiver_id).emit("new_message", message);
        } catch (_) {}
  
        return res.json({ success: true, message });
      }
  
      // ===============================
      // FIND OR CREATE CONVERSATION
      // (BUYER ↔ SELLER — UNCHANGED)
      // ===============================
      let conversation = await prisma.conversations.findFirst({
        where: { buyer_id, seller_id },
      });
  
      if (!conversation) {
        conversation = await prisma.conversations.create({
          data: {
            id: uuidv4(),
            buyer_id,
            seller_id,
          },
        });
      }
  
      // ===============================
      // CREATE MESSAGE
      // ===============================
      const message = await prisma.messages.create({
        data: {
          id: uuidv4(),
          conversation_id: conversation.id,
          sender_id,
          sender_role,
          receiver_id,
          body,
          is_read: false,
        },
      });
  
      // 🔔 REAL-TIME EMIT (SAFE)
      try {
        getIO().to(receiver_id).emit("new_message", message);
      } catch (_) {}
  
      res.json({ success: true, message });
    } catch (err) {
      next(err);
    }
  };
  
/**
 * GET CONVERSATION MESSAGES
 */
exports.getConversationMessages = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    const role = req.user.role;

    const conversation = await prisma.conversations.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    // Access control
    if (
      role !== "admin" &&
      ![conversation.buyer_id, conversation.seller_id].includes(userId)
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    const messages = await prisma.messages.findMany({
      where: { conversation_id: conversationId },
      orderBy: { created_at: "asc" },
    });

    res.json({
      success: true,
      messages: messages.map((m) => ({
        ...m,
        body:
          m.is_deleted && role !== "admin"
            ? "This message was deleted"
            : m.body,
      })),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE OWN MESSAGE (SOFT DELETE)
 */
exports.deleteMessage = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;
    const role = req.user.role;

    const message = await prisma.messages.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    if (role !== "admin" && message.sender_id !== userId) {
      return res.status(403).json({ message: "Cannot delete this message" });
    }

    await prisma.messages.update({
      where: { id: messageId },
      data: {
        is_deleted: true,
        deleted_by: userId,
      },
    });

    res.json({ success: true, message: "Message deleted" });
  } catch (err) {
    next(err);
  }
};

/**
 * ADMIN: VIEW ALL CONVERSATIONS
 */
exports.getAllConversations = async (req, res, next) => {
  try {
    const conversations = await prisma.conversations.findMany({
      include: {
        messages: {
          orderBy: { created_at: "asc" },
        },
      },
      orderBy: { created_at: "desc" },
    });

    res.json({ success: true, conversations });
  } catch (err) {
    next(err);
  }
};

/**
 * MARK CONVERSATION AS READ
 */
exports.markConversationRead = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    await prisma.messages.updateMany({
      where: {
        conversation_id: conversationId,
        receiver_id: userId,
        is_read: false,
      },
      data: {
        is_read: true,
        read_at: new Date(),
      },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
