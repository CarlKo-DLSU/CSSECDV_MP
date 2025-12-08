const express = require('express')
const router = express.Router()
const checkAuthenticate = require('../utility/checkauthenticate')
const query = require('../utility/query')
const bcrypt = require('bcrypt')
const Profile = require('../database/models/Profile')
const mongoose = require('mongoose')

// defensive constants
const PASSWORD_MIN = 8
const PASSWORD_MAX = 128
const FORBIDDEN_RE = /[\x00-\x1F\x7F\\\$\[\]]/ // disallow control chars and dollar sign
const DAY_MS = 24 * 60 * 60 * 1000

// helper to detect XHR
function isAjax(req) {
    return req.xhr || (req.get('X-Requested-With') === 'XMLHttpRequest') || (req.get('Accept') && req.get('Accept').includes('application/json'))
}

// show change password page
router.get('/', checkAuthenticate, (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/error?errorMsg=You must be logged in to access this page.')
    }
    res.render('changepass', { currentUser: req.user, error: null, success: null })
})

// handle change password
router.post('/', checkAuthenticate, async (req, res) => {
    try {
        if (!req.isAuthenticated()) {
            if (isAjax(req)) return res.status(401).json({ error: 'Not authenticated.' })
            return res.status(401).render('changepass', { currentUser: null, error: 'Not authenticated.', success: null })
        }

        // Ensure body values are strings
        const current_password = typeof req.body.current_password === 'string' ? req.body.current_password : ''
        const new_password = typeof req.body.new_password === 'string' ? req.body.new_password : ''
        const confirm_password = typeof req.body.confirm_password === 'string' ? req.body.confirm_password : ''

        // basic presence checks
        if (!current_password || !new_password || !confirm_password) {
            const msg = 'Missing required fields.'
            if (isAjax(req)) return res.status(400).json({ error: msg })
            return res.status(400).render('changepass', { currentUser: req.user, error: msg, success: null })
        }

        // enforce length and character rules
        if (new_password.length < PASSWORD_MIN || new_password.length > PASSWORD_MAX || FORBIDDEN_RE.test(new_password) || FORBIDDEN_RE.test(current_password) || FORBIDDEN_RE.test(confirm_password)) {
            const msg = `Password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters and must not contain control characters or '$'.`
            if (isAjax(req)) return res.status(400).json({ error: msg })
            return res.status(400).render('changepass', { currentUser: req.user, error: msg, success: null })
        }

        if (new_password !== confirm_password) {
            const msg = 'New passwords do not match.'
            if (isAjax(req)) return res.status(400).json({ error: msg })
            return res.status(400).render('changepass', { currentUser: req.user, error: msg, success: null })
        }

        const numberOk = /[0-9]/.test(new_password)
        const specialOk = /[!@#%^&*(),.?":{}|<>_\-;'`~+=\/;]/.test(new_password)
        if (!numberOk || !specialOk) {
            const msg = 'Password must be at least 8 characters and include a number and a special character.'
            if (isAjax(req)) return res.status(400).json({ error: msg })
            return res.status(400).render('changepass', { currentUser: req.user, error: msg, success: null })
        }

        // fetch fresh user record
        const user = await query.getProfile({ _id: String(req.user._id) })
        if (!user) {
            const msg = 'User record not found.'
            if (isAjax(req)) return res.status(500).json({ error: msg })
            return res.status(500).render('changepass', { currentUser: req.user, error: msg, success: null })
        }

        // enforce 24-hour cooldown if lastPasswordChange is a valid date
        if (user.lastPasswordChange) {
            const lastChange = new Date(user.lastPasswordChange)
            if (!isNaN(lastChange.getTime())) {
                const elapsed = Date.now() - lastChange.getTime()
                if (elapsed < DAY_MS) {
                    const remainingMs = DAY_MS - elapsed
                    const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000))
                    try {
                        const who = user && (user.name || user._id) ? (user.name || String(user._id)) : 'unknown'
                        console.error(`[changepass] password change cooldown for username="${who}" remainingHours=${remainingHours} ip=${req.ip}`)
                    } catch (logErr) { /* ignore logging errors */ }
                    const msg = `You must wait 24 hours before changing your password again. Try again in ~${remainingHours} hour(s).`
                    if (isAjax(req)) return res.status(429).json({ error: msg })
                    return res.status(429).render('changepass', { currentUser: req.user, error: msg, success: null })
                }
            }
        }

        // verify current password
        const match = await bcrypt.compare(current_password, user.password)
        if (!match) {
            try {
                const who = user && (user.name || user._id) ? (user.name || String(user._id)) : 'unknown'
                console.error(`[changepass] incorrect current password attempt for username="${who}" ip=${req.ip}`)
            } catch (logErr) { /* ignore logging errors */ }
            const msg = 'Current password is incorrect.'
            if (isAjax(req)) return res.status(400).json({ error: msg })
            return res.status(400).render('changepass', { currentUser: req.user, error: msg, success: null })
        }

        // disallow reuse of current or previous passwords
        if (await bcrypt.compare(new_password, user.password)) {
            const msg = 'New password must not match your current password.'
            if (isAjax(req)) return res.status(400).json({ error: msg })
            return res.status(400).render('changepass', { currentUser: req.user, error: msg, success: null })
        }

        if (Array.isArray(user.previousPasswords) && user.previousPasswords.length > 0) {
            for (const oldHash of user.previousPasswords) {
                if (oldHash && await bcrypt.compare(new_password, oldHash)) {
                    try {
                        const who = user && (user.name || user._id) ? (user.name || String(user._id)) : 'unknown'
                        console.error(`[changepass] attempted reuse of previous password for username="${who}" ip=${req.ip}`)
                    } catch (logErr) { /* ignore logging errors */ }
                    const msg = 'New password was used previously. Choose a different password.'
                    if (isAjax(req)) return res.status(400).json({ error: msg })
                    return res.status(400).render('changepass', { currentUser: req.user, error: msg, success: null })
                }
            }
        }

        // hash new password
        const hashed = await bcrypt.hash(new_password, 10)

        // atomic update: push current password into previousPasswords (limit to last 10) and set new password & timestamp
        const id = req.user && req.user._id ? String(req.user._id) : null
        if (!id) {
            const msg = 'Invalid user id.'
            if (isAjax(req)) return res.status(500).json({ error: msg })
            return res.status(500).render('changepass', { currentUser: req.user, error: msg, success: null })
        }

        let updateResult = null
        try {
            updateResult = await Profile.findByIdAndUpdate(
                id,
                {
                    $push: {
                        previousPasswords: {
                            $each: [user.password],
                            $slice: -10
                        }
                    },
                    $set: {
                        password: hashed,
                        lastPasswordChange: new Date()
                    }
                },
                { new: true }
            )
        } catch (e) {
            // fallback using query helper if direct model update fails
            try {
                await query.updateProfile({ _id: id }, { $push: { previousPasswords: { $each: [user.password], $slice: -10 } } })
                await query.updateProfile({ _id: id }, { $set: { password: hashed, lastPasswordChange: new Date() } })
                updateResult = true
            } catch (e2) {
                console.error('changepass.update error:', e, e2)
            }
        }

        if (!updateResult) {
            const msg = 'Failed to update password.'
            if (isAjax(req)) return res.status(500).json({ error: msg })
            return res.status(500).render('changepass', { currentUser: req.user, error: msg, success: null })
        }

        // success
        try {
            const who = user && (user.name || user._id) ? (user.name || String(user._id)) : 'unknown'
            console.info(`[changepass] password changed for username="${who}" ip=${req.ip}`)
        } catch (logErr) { /* ignore logging errors */ }

        if (isAjax(req)) return res.status(200).json({ success: true, message: 'Password changed successfully.' })
        return res.render('changepass', { currentUser: req.user, error: null, success: 'Password changed successfully.' })
    } catch (err) {
        console.error('changepass.handler error:', err)
        if (isAjax(req)) return res.status(500).json({ error: 'Internal server error.' })
        return res.status(500).render('changepass', { currentUser: req.user, error: 'Internal server error.', success: null })
    }
})

module.exports = router