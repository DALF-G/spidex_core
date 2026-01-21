const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: "uploads/kra-certificates",
  filename: (_, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const fileFilter = (_, file, cb) => {
  const allowed = ["application/pdf", "image/png", "image/jpeg"];
  cb(null, allowed.includes(file.mimetype));
};

module.exports = multer({ storage, fileFilter });
