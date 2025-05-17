const jwt = require('jsonwebtoken');

const generateQRToken = (visitId, guestName, flatNumber) => {
  return jwt.sign(
    {
      visitId,
      guestName,
      flatNumber,
      timestamp: Date.now()
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
};

const verifyQRToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid QR token');
  }
};

module.exports = {
  generateQRToken,
  verifyQRToken
}; 