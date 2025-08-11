// middleware/requireRole.js
module.exports = function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.redirect('/login');
    }

    const userRole = req.session.user.role || req.session.user.department;

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).send('❌ Access Denied');
    }

    next();
  };
};
