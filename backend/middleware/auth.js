const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'navia_clientiq_secret_key_2026';

module.exports = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(token, JWT_SECRET);

    req.user = decoded;
    next();
  } catch (err) {
    console.log('AUTH MIDDLEWARE ERROR:', err.message);
    return res.status(401).json({ message: 'Invalid token' });
  }
};