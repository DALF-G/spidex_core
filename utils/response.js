exports.success = (res, message, data = null) => {
    return res.status(200).json({
      success: true,
      message,
      data,
    });
  };
  