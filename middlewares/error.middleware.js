module.exports = (err, req, res, next) => {
    // Default values
    const statusCode = err.statusCode || 400;
    const message = err.message || "Something went wrong";
  
    res.status(statusCode).json({
      success: false,
      message,
    });
  };
  