const express = require('express')
const router = express.Router()
const checkAuthenticate = require('../utility/checkauthenticate')
const query = require('../utility/query')
const bcrypt = require('bcrypt')

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
            return res.status(401).render('changepass', { currentUser: null, error: 'Not authenticated.', success: null })
        }

        const { current_password, new_password, confirm_password } = req.body

        if (!current_password || !new_password || !confirm_password) {
            return res.status(400).render('changepass', { currentUser: req.user, error: 'Missing required fields.', success: null })
        }

        if (new_password !== confirm_password) {
            return res.status(400).render('changepass', { currentUser: req.user, error: 'New passwords do not match.', success: null })
        }

        // same password rules as registration
        const lengthOk = new_password.length >= 8
        const numberOk = /[0-9]/.test(new_password)
        const specialOk = /[!@#$%^&*(),.?":{}|<>_\-\\\[\];'`~+=\/;]/.test(new_password)

        if (!lengthOk || !numberOk || !specialOk) {
            return res.status(400).render('changepass', { currentUser: req.user, error: 'Password must be at least 8 characters and include a number and a special character.', success: null })
        }

        // fetch fresh user record
        const user = await query.getProfile({ _id: req.user._id })
        if (!user) {
            return res.status(500).render('changepass', { currentUser: req.user, error: 'User record not found.', success: null })
        }

        const match = await bcrypt.compare(current_password, user.password)
        if (!match) {
            return res.status(400).render('changepass', { currentUser: req.user, error: 'Current password is incorrect.', success: null })
        }

        const hashed = await bcrypt.hash(new_password, 10)
        await query.updateProfile({ _id: req.user._id }, { $set: { password: hashed } })

        return res.render('changepass', { currentUser: req.user, error: null, success: 'Password changed successfully.' })
    } catch (err) {
        console.error(err)
        return res.status(500).render('changepass', { currentUser: req.user, error: 'Internal server error.', success: null })
    }
})

module.exports = router