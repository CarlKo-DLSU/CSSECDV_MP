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

        const match = await bcrypt.compare(current_password, user.password)
        if (!match) {
            if (isAjax(req)) return res.status(400).send('Current password is incorrect.')
            return res.status(400).render('changepass', { currentUser: req.user, error: 'Current password is incorrect.', success: null })
        }

        const hashed = await bcrypt.hash(new_password, 10)

        console.log('changepass.req.user (id,type):', req.user && req.user._id, typeof (req.user && req.user._id))

        let updateResult = null
        try {
            // 1) try findOneAndUpdate by name (common)
            if (req.user && req.user.name) {
                try {
                    const doc = await Profile.findOneAndUpdate(
                        { name: req.user.name },
                        { $set: { password: hashed } },
                        { new: true }
                    )
                    if (doc) updateResult = { method: 'findOneAndUpdate(name)', doc }
                } catch (e) {
                    console.error('findOneAndUpdate(name) error:', e)
                }
            }

            // 2) try findByIdAndUpdate converting to ObjectId if needed
            if (!updateResult && req.user && req.user._id) {
                try {
                    let id = req.user._id
                    if (typeof id === 'string') {
                        // try convert string to ObjectId
                        try { id = mongoose.Types.ObjectId(id) } catch (e) { /* ignore */ }
                    }
                    const doc2 = await Profile.findByIdAndUpdate(id, { $set: { password: hashed } }, { new: true })
                    if (doc2) updateResult = { method: 'findByIdAndUpdate', doc: doc2 }
                } catch (e) {
                    console.error('findByIdAndUpdate error:', e)
                }
            }

            // 3) try updateOne fallbacks
            if (!updateResult && Profile && typeof Profile.updateOne === 'function') {
                try {
                    const r = await Profile.updateOne({ _id: req.user._id }, { $set: { password: hashed } })
                    updateResult = { method: 'updateOne(_id)', result: r }
                } catch (e) {
                    console.error('updateOne(_id) error:', e)
                }
            }

            // 4) fallback to query helper (try _id then name)
            if (!updateResult && query && typeof query.updateProfile === 'function') {
                try {
                    const q = await query.updateProfile({ _id: req.user._id }, { $set: { password: hashed } })
                    updateResult = { method: 'query.updateProfile(_id)', result: q }
                } catch (e) {
                    console.error('query.updateProfile(_id) error:', e)
                }
            }
            if (!updateResult && query && typeof query.updateProfile === 'function' && req.user.name) {
                try {
                    const q2 = await query.updateProfile({ name: req.user.name }, { $set: { password: hashed } })
                    updateResult = { method: 'query.updateProfile(name)', result: q2 }
                } catch (e) {
                    console.error('query.updateProfile(name) error:', e)
                }
            }
        } catch (e) {
            console.error('changepass: unexpected update error', e)
        }

        console.log('changepass.updateResult:', updateResult)

        // Accept a variety of success indicators
        const ok = updateResult && (
            updateResult.doc ||
            (updateResult.result && (
                updateResult.result.modifiedCount === 1 ||
                updateResult.result.nModified === 1 ||
                updateResult.result.ok === 1 ||
                updateResult.result.matchedCount === 1
            ))
        )

        if (!ok) {
            console.error('Password update did not modify a document:', updateResult)
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