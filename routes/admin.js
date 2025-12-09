const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const Profile = require('../database/models/Profile');
const Review = require('../database/models/Review');
const { requireRole } = require('../utility/require_role');
const fs = require('fs');
const path = require('path');

// All admin routes require admin role
router.use(requireRole('admin'));

// Validation helpers
function isValidUsername(u) {
    if (typeof u !== 'string') return false;
    if (/[\x00-\x1F\x7F\\\$\[\]]/.test(u)) return false;
    const s = u.trim();
    return s.length >= 1 && s.length <= 30;
}

function isValidPassword(p) {
    if (typeof p !== 'string') return false;
    if (p.length < 8 || p.length > 128) return false;
    if (/[\x00-\x1F\x7F\\\$\[\]]/.test(p)) return false;
    return true;
}

// POST /admin/create - Create new manager or admin account
router.post('/create', async (req, res) => {
    try {
        const { username, password, role } = req.body;

        // Validate inputs
        if (!username || !password || !role) {
            console.log(`[admin] CREATE FAIL - Missing required fields`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('Missing required fields.'));
        }

        if (!isValidUsername(username)) {
            console.log(`[admin] CREATE FAIL - Username: ${username}, Reason: Invalid username format`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('Invalid username format.'));
        }

        if (!isValidPassword(password)) {
            console.log(`[admin] CREATE FAIL - Username: ${username}, Reason: Invalid password format`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('Password must be 8-128 characters with no invalid characters.'));
        }

        if (!['manager', 'admin'].includes(role)) {
            console.log(`[admin] CREATE FAIL - Username: ${username}, Reason: Invalid role: ${role}`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('Invalid role. Must be manager or admin.'));
        }

        // Check if username already exists
        const existing = await Profile.findOne({ name: username.trim() });
        if (existing) {
            console.log(`[admin] CREATE FAIL - Username: ${username}, Reason: Username already exists`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('Username already exists.'));
        }

        // Hash password and create user
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new Profile({
            name: username.trim(),
            password: hashedPassword,
            role: role
        });
        await newUser.save();

        console.log(`[admin] CREATE SUCCESS - Admin: ${req.user.name}, Created: ${role} account for ${username}`);
        return res.redirect(`/profile/id/${req.user.name}?success=User created successfully`);
    } catch (err) {
        console.error(`[admin] CREATE ERROR - ${err.message}`);
        return res.redirect('/error?errorMsg=' + encodeURIComponent('Failed to create user.'));
    }
});

// POST /admin/assign-role - Assign role to existing user
router.post('/assign-role', async (req, res) => {
    try {
        const { username, role } = req.body;

        if (!username || !role) {
            console.log(`[admin] ASSIGN-ROLE FAIL - Missing required fields`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('Missing username or role.'));
        }

        if (!['reviewer', 'manager', 'admin'].includes(role)) {
            console.log(`[admin] ASSIGN-ROLE FAIL - Username: ${username}, Reason: Invalid role: ${role}`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('Invalid role.'));
        }

        // Find user
        const user = await Profile.findOne({ name: username });
        if (!user) {
            console.log(`[admin] ASSIGN-ROLE FAIL - Username: ${username}, Reason: User not found`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('User not found.'));
        }

        // Prevent removing last admin
        if (user.role === 'admin' && role !== 'admin') {
            const adminCount = await Profile.countDocuments({ role: 'admin' });
            if (adminCount <= 1) {
                console.log(`[admin] ASSIGN-ROLE FAIL - Username: ${username}, Reason: Cannot change role of last admin`);
                return res.redirect('/error?errorMsg=' + encodeURIComponent('Cannot change role of last admin.'));
            }
        }

        // Update role (password remains unchanged)
        const oldRole = user.role;
        user.role = role;
        await user.save();

        console.log(`[admin] ASSIGN-ROLE SUCCESS - Admin: ${req.user.name}, Changed ${username} role from ${oldRole} to ${role}`);
        return res.redirect(`/profile/id/${req.user.name}?success=Role updated successfully`);
    } catch (err) {
        console.error(`[admin] ASSIGN-ROLE ERROR - ${err.message}`);
        return res.redirect('/error?errorMsg=' + encodeURIComponent('Failed to assign role.'));
    }
});

// POST /admin/delete - Delete user account
router.post('/delete', async (req, res) => {
    try {
        const { username } = req.body;

        if (!username) {
            console.log(`[admin] DELETE FAIL - Missing username`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('Missing username.'));
        }

        // Find user
        const user = await Profile.findOne({ name: username });
        if (!user) {
            console.log(`[admin] DELETE FAIL - Username: ${username}, Reason: User not found`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('User not found.'));
        }

        // Prevent deleting last admin
        if (user.role === 'admin') {
            const adminCount = await Profile.countDocuments({ role: 'admin' });
            if (adminCount <= 1) {
                console.log(`[admin] DELETE FAIL - Username: ${username}, Reason: Cannot delete last admin`);
                return res.redirect('/error?errorMsg=' + encodeURIComponent('Cannot delete the last admin account.'));
            }
        }

        // Prevent self-deletion
        if (user._id.equals(req.user._id)) {
            console.log(`[admin] DELETE FAIL - Username: ${username}, Reason: Cannot delete own account`);
            return res.redirect('/error?errorMsg=' + encodeURIComponent('Cannot delete your own account.'));
        }

        // Delete user's reviews
        await Review.deleteMany({ profileId: user._id });

        // Delete user
        await Profile.deleteOne({ _id: user._id });

        console.log(`[admin] DELETE SUCCESS - Admin: ${req.user.name}, Deleted user: ${username} (${user.role})`);
        return res.redirect(`/profile/id/${req.user.name}?success=User deleted successfully`);
    } catch (err) {
        console.error(`[admin] DELETE ERROR - ${err.message}`);
        return res.redirect('/error?errorMsg=' + encodeURIComponent('Failed to delete user.'));
    }
});

// GET /admin/logs - View application logs (read-only)
router.get('/logs', (req, res) => {
    try {
        // Read all logs from server.log (change path if needed)
        const logPath = path.join(__dirname, '..', 'server.log');
        let logs = '';
        if (fs.existsSync(logPath)) {
            logs = fs.readFileSync(logPath, 'utf-8');
        } else {
            logs = 'No log file found. Make sure your server writes logs to server.log.';
        }
        // Add timestamps to each line if not present
        const lines = logs.split('\n').map(line => {
            // If line already starts with a timestamp, leave it
            if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(line)) return line;
            // Otherwise, prepend current timestamp
            return `${new Date().toISOString()} | ${line}`;
        });
        const allLogs = lines.join('\n');
        res.setHeader('Content-Type', 'text/plain');
        res.send(`==== Application Logs (all lines, with timestamps) ====
Accessed by: ${req.user.name} (${req.user.role})
Timestamp: ${new Date().toISOString()}
\n${allLogs}`);
    } catch (err) {
        console.error('[admin] Admin logs error:', err);
        res.status(500).send('Failed to retrieve logs: ' + err.message);
    }
});

module.exports = router;
