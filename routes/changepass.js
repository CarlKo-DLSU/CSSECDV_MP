const express = require('express')
const router = express.Router()
const checkAuthenticate = require('../utility/checkauthenticate')
const query = require('../utility/query')
const bcrypt = require('bcrypt')
const Profile = require('../database/models/Profile')
const mongoose = require('mongoose')

// helper to detect XHR
function isAjax(req) {
    return req.xhr || (req.get('X-Requested-With') === 'XMLHttpRequest') || (req.get('Accept') && req.get('Accept').includes('application/json'))
}

// show change password page
router.get('/', checkAuthenticate, (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/error?errorMsg=Login details could not be found.')
    }
    res.render('changepass', { currentUser: req.user, error: null, success: null })
})

// handle change password
router.post('/', checkAuthenticate, async (req, res) => {
    try {
        if (!req.isAuthenticated()) {
            if (isAjax(req)) return res.status(401).send('Not authenticated.')
            return res.status(401).render('changepass', { currentUser: null, error: 'Not authenticated.', success: null })
        }

        const { current_password, new_password, confirm_password } = req.body

        if (!current_password || !new_password || !confirm_password) {
            if (isAjax(req)) return res.status(400).send('Missing required fields.')
            return res.status(400).render('changepass', { currentUser: req.user, error: 'Missing required fields.', success: null })
        }

        if (new_password !== confirm_password) {
            if (isAjax(req)) return res.status(400).send('New passwords do not match.')
            return res.status(400).render('changepass', { currentUser: req.user, error: 'New passwords do not match.', success: null })
        }

        const lengthOk = new_password.length >= 8
        const numberOk = /[0-9]/.test(new_password)
        const specialOk = /[!@#$%^&*(),.?":{}|<>_\-\\\[\];'`~+=\/;]/.test(new_password)

        if (!lengthOk || !numberOk || !specialOk) {
            const msg = 'Password must be at least 8 characters and include a number and a special character.'
            if (isAjax(req)) return res.status(400).send(msg)
            return res.status(400).render('changepass', { currentUser: req.user, error: msg, success: null })
        }

        // fetch fresh user record
        const user = await query.getProfile({ _id: req.user._id })
        if (!user) {
            if (isAjax(req)) return res.status(500).send('User record not found.')
            return res.status(500).render('changepass', { currentUser: req.user, error: 'User record not found.', success: null })
        }

        // comment out if demo-ing disallowing previous passwords
        if (user.lastPasswordChange) {
            const elapsed = Date.now() - new Date(user.lastPasswordChange).getTime()
            const DAY_MS = 24 * 60 * 60 * 1000
            if (elapsed < DAY_MS) {
                const remainingMs = DAY_MS - elapsed
                const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000))
                const msg = `You must wait 24 hours before changing your password again. Try again in ~${remainingHours} hour(s).`
                if (isAjax(req)) return res.status(429).send(msg)
                return res.status(429).render('changepass', { currentUser: req.user, error: msg, success: null })
            }
        }

        const match = await bcrypt.compare(current_password, user.password)
        if (!match) {
            if (isAjax(req)) return res.status(400).send('Current password is incorrect.')
            return res.status(400).render('changepass', { currentUser: req.user, error: 'Current password is incorrect.', success: null })
        }

        const matchCurrent = await bcrypt.compare(new_password, user.password)
        if (matchCurrent) {
            if (isAjax(req)) return res.status(400).send('New password must not match your current password.')
            return res.status(400).render('changepass', { currentUser: req.user, error: 'New password must not match your current password.', success: null })
        }
        // check against previousPasswords (if any)
        if (Array.isArray(user.previousPasswords) && user.previousPasswords.length > 0) {
            for (const oldHash of user.previousPasswords) {
                if (await bcrypt.compare(new_password, oldHash)) {
                    if (isAjax(req)) return res.status(400).send('New password was used previously. Choose a different password.')
                    return res.status(400).render('changepass', { currentUser: req.user, error: 'New password was used previously. Choose a different password.', success: null })
                }
            }
        }

        const hashed = await bcrypt.hash(new_password, 10)

        const id = (req.user && req.user._id) ? req.user._id : null
        let updateResult = null
        try {
            // use findByIdAndUpdate with atomic update: push then set
            if (id) {
                updateResult = await Profile.findByIdAndUpdate(
                   id,
                    {
                        $push: {
                            // push previous hash to front; no $slice so history is unlimited
                            previousPasswords: { $each: [user.password], $position: 0 }
                        },
                        // comment out if demo-ing disallowing previous passwords
                        // $set: { password: hashed }
                        $set: { password: hashed, lastPasswordChange: new Date() }
                    },
                    { new: true }
                )
            }
            // fallback: if model update didn't run, try query helper
            if (!updateResult && query && typeof query.updateProfile === 'function') {
                // push old hash and set new hash (two operations if helper doesn't support $push/$slice)
                await query.updateProfile({ _id: req.user._id }, { $push: { previousPasswords: { $each: [user.password], $position: 0 } } })
                // comment out if demo-ing disallowing previous passwords
                // await query.updateProfile({ _id: req.user._id }, { $set: { password: hashed } })
                await query.updateProfile({ _id: req.user._id }, { $set: { password: hashed, lastPasswordChange: new Date() } })
                updateResult = true
            }
        } catch (e) {
            console.error('changepass.update error:', e)
        }

        // interpret result
        const success = !!updateResult
        if (!success) {
            if (isAjax(req)) return res.status(500).send('Failed to update password.')
            return res.status(500).render('changepass', { currentUser: req.user, error: 'Failed to update password.', success: null })
        }

        if (isAjax(req)) return res.status(200).send('Password changed successfully.')
        return res.render('changepass', { currentUser: req.user, error: null, success: 'Password changed successfully.' })
    } catch (err) {
        console.error(err)
        if (isAjax(req)) return res.status(500).send('Internal server error.')
        return res.status(500).render('changepass', { currentUser: req.user, error: 'Internal server error.', success: null })
    }
})

module.exports = router