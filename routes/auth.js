const express = require('express');
const router = express.Router()
const query = require('../utility/query');
const error = require("../utility/error")
const bcrypt = require("bcrypt")
const passport = require('passport');
const checkAuthenticate = require('../utility/checkauthenticate');
const Profile = require('../database/models/Profile');
const LoginAttempt = require('../database/models/LoginAttempt');

const LOCK_THRESHOLD = 5
const LOCK_MS = 5 * 60 * 1000 // 5 minutes

async function recordFailedAttempt(username) {
    const la = await LoginAttempt.findOneAndUpdate(
        { username },
        { $inc: { attempts: 1 } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    )
    if (la.attempts >= LOCK_THRESHOLD && (!la.lockUntil || la.lockUntil < Date.now())) {
        la.lockUntil = new Date(Date.now() + LOCK_MS)
        await la.save()
        return { locked: true, la }
    }
    return { locked: false, la }
}

async function clearAttempts(username) {
    await LoginAttempt.deleteOne({ username })
}

// register route unchanged (kept as before)
router.post('/register', async (req, res, next) => {
    try {
        const { username, password, confirm_password } = req.body
        const isAjax = req.xhr || (req.get('Accept') && req.get('Accept').includes('application/json')) || req.get('X-Requested-With') === 'XMLHttpRequest'
        if (!username || !password || !confirm_password) {
            const msg = 'Missing required fields.'
            if (isAjax) return res.status(400).send(msg)
            return res.redirect(`/error?errorMsg=${encodeURIComponent(msg)}`)
        }
        if (password !== confirm_password) {
            const msg = 'Passwords do not match.'
            if (isAjax) return res.status(400).send(msg)
            return res.redirect(`/error?errorMsg=${encodeURIComponent(msg)}`)
        }
        const lengthOk = password.length >= 8
        const numberOk = /[0-9]/.test(password)
        const specialOk = /[!@#$%^&*(),.?":{}|<>_\-\\\[\];'`~+=\/;]/.test(password)
        if (!lengthOk || !numberOk || !specialOk) {
            const msg = 'Password must be at least 8 characters and include a number and a special character.'
            if (isAjax) return res.status(400).send(msg)
            return res.redirect(`/error?errorMsg=${encodeURIComponent(msg)}`)
        }
        const existing = await query.getProfile({ name: username })
        if (existing) {
            const msg = 'Username already taken.'
            if (isAjax) return res.status(409).send(msg)
            return res.redirect(`/error?errorMsg=${encodeURIComponent(msg)}`)
        }
        const hashedPassword = await bcrypt.hash(password, 10)
        await query.insertProfle({
            name: username,
            password: hashedPassword,
            role: 'reviewer'
        })
        const user = await query.getProfile({ name: username })
        if (!user) {
            const msg = 'Failed to retrieve user after registration.'
            if (isAjax) return res.status(500).send(msg)
            return res.redirect(`/error?errorMsg=${encodeURIComponent(msg)}`)
        }
        req.login(user, (err) => {
            if (err) {
                return next(err)
            }
            if (req.body.rememberMe) {
                req.session.cookie.maxAge = 1814400000
            }
            if (isAjax) return res.status(200).send('Success')
            return res.redirect('/')
        })
    } catch (err) {
        if (req.xhr) {
            return res.status(500).send(err.message)
        }
        res.redirect(`/error?errorMsg=${encodeURIComponent(err.message)}`)
    }
})

// login route: use passport with custom callback; record attempts by username regardless of existing Profile
router.post('/login', async (req, res, next) => {
    const username = req.body.username
    try {
        // If there is a username-level lock (from LoginAttempt), refuse early
        const la = await LoginAttempt.findOne({ username })
        if (la && la.lockUntil && la.lockUntil > Date.now()) {
            return res.redirect(`/error?errorMsg=${encodeURIComponent('Please try again in a few minutes.')}`);
        }

        passport.authenticate('local', async (err, user, info) => {
            if (err) return next(err);

            if (!user) {
                // failed login attempt -> record at username-level
                const { locked } = await recordFailedAttempt(username)

                // if an actual Profile exists, also increment its counters for monitoring
                const userRecord = await query.getProfile({ name: username })
                if (userRecord) {
                    const newAttempts = (userRecord.failedLoginAttempts || 0) + 1;
                    const update = { failedLoginAttempts: newAttempts };
                    if (newAttempts >= LOCK_THRESHOLD) {
                        update.lockUntil = new Date(Date.now() + LOCK_MS);
                    }
                    await Profile.findByIdAndUpdate(userRecord._id, update, { new: true });
                }

                if (locked) {
                    return res.redirect(`/error?errorMsg=${encodeURIComponent('Please try again in a few minutes.')}`);
                }

                return res.redirect("/error?errorMsg=Failed to log in, please try again!");
            }

            // successful login: clear username-level attempts and reset Profile counters
            await clearAttempts(req.body.username);
            await Profile.findByIdAndUpdate(user._id, { failedLoginAttempts: 0, lockUntil: null });

            req.login(user, (loginErr) => {
                if (loginErr) return next(loginErr);
                if (req.body.rememberMe) {
                    req.session.cookie.maxAge = 1814400000;
                }
                return res.redirect('/');
            });
        })(req, res, next);
    } catch (e) {
        return next(e);
    }
})

// validatecredentials route: check username-level lock even if user doesn't exist
router.post('/validatecredentials', async (req, res) => {
    const username = req.body.username
    const password = req.body.password
    const user = await query.getProfile({ name: username })

    // check username-level lock
    const la = await LoginAttempt.findOne({ username })
    if (la && la.lockUntil && la.lockUntil > Date.now()) {
        const secondsLeft = Math.ceil((la.lockUntil - Date.now()) / 1000);
        return res.status(423).send(`Account locked. Try again in ${secondsLeft} seconds.`);
    }

    if (!user) {
        // record failed attempt for unknown username
        const { locked } = await recordFailedAttempt(username)
        if (locked) {
            return res.status(423).send("Too many failed attempts. Account locked for 5 minutes.");
        }
        // don't reveal whether user exists
        return res.status(400).send("Bad Credentials")
    }

    // if account currently locked at profile level
    if (user.lockUntil && user.lockUntil > Date.now()) {
        return res.status(400).send("Bad Credentials")
    }

    try {
        if (await bcrypt.compare(password, user.password)) {
            // successful: clear username-level attempts and reset Profile counters
            await clearAttempts(username);
            await Profile.findByIdAndUpdate(user._id, {
                failedLoginAttempts: 0,
                lockUntil: null,
                lastSuccessfulLogin: new Date(),
                lastLoginAttempt: new Date()
            });
            res.status(200).send("Success!");
        } else {
            // increment failed both at username-level and profile-level
            const { locked } = await recordFailedAttempt(username)

            const newAttempts = (user.failedLoginAttempts || 0) + 1;
            const update = {
                failedLoginAttempts: newAttempts,
                lastLoginAttempt: new Date()
            };
            if (newAttempts >= LOCK_THRESHOLD) {
                update.lockUntil = new Date(Date.now() + LOCK_MS);
            }
            await Profile.findByIdAndUpdate(user._id, update, { new: true });

            if (locked) {
                return res.status(423).send("Too many failed attempts. Account locked for 5 minutes.");
            }

            res.status(400).send("Bad Credentials")
        }
    } catch (err) {
        res.status(500).send("Internal Error")
    }
})

router.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            res.redirect('/error?errorMsg=Failed to logout.')
        } else {
            res.clearCookie("restaurantReviewsCookie").redirect('/')
        }
    })
})

router.post('/nametaken', async (req, res) => {
    const results = await query.getProfile({ name: req.body.username })

    if (results) {
        res.status(409).send("Username Taken.")
    } else {
        res.status(200).send("Success!")
    }
})

router.get('/authorized', (req, res) => {
    if (req.isAuthenticated()) {
        res.status(200).send("User is authenticated.")
    } else {
        res.status(206).send("User is not authenticated.")
    }
})

module.exports = router