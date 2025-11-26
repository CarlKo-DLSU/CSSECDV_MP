// utility/requireRole.js
function requireRole(role) {
  return function (req, res, next) {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).redirect('/auth/login'); // or JSON for API
    }
    if (!req.user || !req.user.role) {
      return res.status(403).redirect('/error?errorMsg=Access%20denied');
    }
    if (req.user.role === role || req.user.role === 'admin') {
      // admin always allowed
      return next();
    }
    return res.status(403).redirect('/error?errorMsg=Access%20denied');
  };
}

function requireAnyRole(roles = []) {
  return function (req, res, next) {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).redirect('/auth/login');
    }
    const userRole = req.user && req.user.role;
    if (!userRole) return res.status(403).redirect('/error?errorMsg=Access%20denied');
    if (userRole === 'admin' || roles.includes(userRole)) return next();
    return res.status(403).redirect('/error?errorMsg=Access%20denied');
  };
}

module.exports = { requireRole, requireAnyRole };