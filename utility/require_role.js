// utility/requireRole.js
function requireRole(role) {
  return function (req, res, next) {
    const requestedPath = req.originalUrl || req.url;
    const requestedMethod = req.method;
    const clientIp = req.ip || req.connection.remoteAddress;
    
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      console.log(`[ACCESS DENIED] Unauthenticated access attempt - Path: ${requestedMethod} ${requestedPath}, IP: ${clientIp}`);
      return res.status(401).redirect('/auth/login'); // or JSON for API
    }
    if (!req.user || !req.user.role) {
      console.log(`[ACCESS DENIED] User without role - User: ${req.user?.name || 'Unknown'}, Path: ${requestedMethod} ${requestedPath}, IP: ${clientIp}`);
      return res.status(403).redirect('/error?errorMsg=Access%20denied');
    }
    if (req.user.role === role || req.user.role === 'admin') {
      // admin always allowed
      return next();
    }
    console.log(`[ACCESS DENIED] Insufficient privileges - User: ${req.user.name} (${req.user.role}), Required: ${role}, Path: ${requestedMethod} ${requestedPath}, IP: ${clientIp}`);
    return res.status(403).redirect('/error?errorMsg=Access%20denied');
  };
}

function requireAnyRole(roles = []) {
  return function (req, res, next) {
    const requestedPath = req.originalUrl || req.url;
    const requestedMethod = req.method;
    const clientIp = req.ip || req.connection.remoteAddress;
    
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      console.log(`[ACCESS DENIED] Unauthenticated access attempt - Path: ${requestedMethod} ${requestedPath}, IP: ${clientIp}`);
      return res.status(401).redirect('/auth/login');
    }
    const userRole = req.user && req.user.role;
    if (!userRole) {
      console.log(`[ACCESS DENIED] User without role - User: ${req.user?.name || 'Unknown'}, Path: ${requestedMethod} ${requestedPath}, IP: ${clientIp}`);
      return res.status(403).redirect('/error?errorMsg=Access%20denied');
    }
    if (userRole === 'admin' || roles.includes(userRole)) return next();
    console.log(`[ACCESS DENIED] Insufficient privileges - User: ${req.user.name} (${userRole}), Required: [${roles.join(', ')}], Path: ${requestedMethod} ${requestedPath}, IP: ${clientIp}`);
    return res.status(403).redirect('/error?errorMsg=Access%20denied');
  };
}

module.exports = { requireRole, requireAnyRole };