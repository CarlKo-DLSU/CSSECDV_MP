// utility/requireRole.js
function requireRole(role) {
  return function (req, res, next) {
    const requestedPath = req.originalUrl || req.url;
    const requestedMethod = req.method;
    const clientIp = req.ip || req.connection.remoteAddress;
    
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      console.log(`[require_role] unauthenticated admin access attempt at ip: ${clientIp}`);
      return res.status(401).redirect('/auth/login'); // or JSON for API
    }
    if (!req.user || !req.user.role) {
      console.log(`[require_role] unauthorized privileged access attempt by ${req.user?.name || 'Unknown'} at ip: ${clientIp}`);
      return res.status(403).redirect('/error?errorMsg=Access%20denied');
    }
    if (req.user.role === role || req.user.role === 'admin') {
      // admin always allowed
      return next();
    }
    console.log(`[require_role] unauthorized ${role} access attempt by ${req.user?.name || 'Unknown'} at ip: ${clientIp}`);
    return res.status(403).redirect('/error?errorMsg=Access%20denied');
  };
}

function requireAnyRole(roles = []) {
  return function (req, res, next) {
    const requestedPath = req.originalUrl || req.url;
    const requestedMethod = req.method;
    const clientIp = req.ip || req.connection.remoteAddress;
    
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      console.log(`[require_role] unauthenticated admin access attempt at ip: ${clientIp}`);
      return res.status(401).redirect('/auth/login');
    }
    const userRole = req.user && req.user.role;
    if (!userRole) {
      console.log(`[require_role] unauthorized privileged access attempt by ${req.user?.name || 'Unknown'} at ip: ${clientIp}`);
      return res.status(403).redirect('/error?errorMsg=Access%20denied');
    }
    if (userRole === 'admin' || roles.includes(userRole)) return next();
    console.log(`[require_role] unauthorized ${role} access attempt by ${req.user?.name || 'Unknown'} at ip: ${clientIp}`);
    return res.status(403).redirect('/error?errorMsg=Access%20denied');
  };
}

module.exports = { requireRole, requireAnyRole };