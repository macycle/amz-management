import jwt from 'jsonwebtoken';

export function sign(user) { return jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '12h' }); }
export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: '请先登录或登录已过期' }); }
}
