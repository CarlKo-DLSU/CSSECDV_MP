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

// register route: validate -> store pending registration in session -> redirect to recovery setup
router.post('/register', async (req, res, next) => {
    try {
        const { username, password, confirm_password } = req.body
        const isAjax = req.xhr || (req.get('Accept') && req.get('Accept').includes('application/json')) || req.get('X-Requested-With') === 'XMLHttpRequest'
        if (!username || !password || !confirm_password) {
            const msg = 'Missing required fields.'
            if (isAjax) return res.status(400).json({ error: msg })
            return res.redirect(`/error?errorMsg=${encodeURIComponent(msg)}`)
        }
        if (password !== confirm_password) {
            const msg = 'Passwords do not match.'
            if (isAjax) return res.status(400).json({ error: msg })
            return res.redirect(`/error?errorMsg=${encodeURIComponent(msg)}`)
        }
        const lengthOk = password.length >= 8
        const numberOk = /[0-9]/.test(password)
        const specialOk = /[!@#$%^&*(),.?":{}|<>_\-\\\[\];'`~+=\/;]/.test(password)
        if (!lengthOk || !numberOk || !specialOk) {
            const msg = 'Password must be at least 8 characters and include a number and a special character.'
            if (isAjax) return res.status(400).json({ error: msg })
            return res.redirect(`/error?errorMsg=${encodeURIComponent(msg)}`)
        }
        const existing = await query.getProfile({ name: username })
        if (existing) {
            const msg = 'Username already taken.'
            if (isAjax) return res.status(409).json({ error: msg })
            return res.redirect(`/error?errorMsg=${encodeURIComponent(msg)}`)
        }

        // hash password now and store pending registration in session (will finish after recovery setup)
        const hashedPassword = await bcrypt.hash(password, 10)
        req.session.pendingRegistration = {
            username: username,
            passwordHash: hashedPassword,
            role: 'reviewer',
            rememberMe: !!req.body.rememberMe,
            createdAt: Date.now()
        }

        // respond with redirect to recovery setup (AJAX-aware)
        if (isAjax) {
            return res.status(200).json({ redirect: '/auth/recovery_setup' })
        } else {
            return res.redirect('/auth/recovery_setup')
        }

    } catch (err) {
        if (req.xhr) {
            return res.status(500).json({ error: err.message })
        }
        res.redirect(`/error?errorMsg=${encodeURIComponent(err.message)}`)
    }
})

// show recovery setup page (user will create the Handlebars template later)
router.get('/recovery_setup', (req, res) => {
    const pending = req.session.pendingRegistration
    if (!pending) {
        return res.redirect('/?errorMsg=' + encodeURIComponent('No pending registration found. Please register again.'))
    }
    // pass username to the page so it can be displayed
    return res.render('recovery_setup', { username: pending.username })
})

// handle recovery setup: validate question/answer -> create account -> login
router.post('/recovery_setup', async (req, res, next) => {
    try {
        const pending = req.session.pendingRegistration
        const isAjax = req.xhr || (req.get('Accept') && req.get('Accept').includes('application/json')) || req.get('X-Requested-With') === 'XMLHttpRequest'
        if (!pending) {
            const msg = 'No pending registration found. Please register again.'
            if (isAjax) return res.status(400).json({ error: msg })
            return res.redirect(`/error?errorMsg=${encodeURIComponent(msg)}`)
        }

        const { question, answer } = req.body
        const allowedQuestions = [
            "What is the name of a childhood friend that no one else would know?",
            "What is your favorite fictional location from a book or movie?",
            "What is/was the name of your first pet?"
        ]
        if (!question || !answer || !allowedQuestions.includes(question) || answer.trim().length < 1) {
            const msg = 'Invalid recovery question or answer.'
            if (isAjax) return res.status(400).json({ error: msg })
            return res.redirect(`/error?errorMsg=${encodeURIComponent(msg)}`)
        }

        // re-check username uniqueness (race condition protection)
        const exists = await query.getProfile({ name: pending.username })
        if (exists) {
            const msg = 'Username already taken.'
            // cleanup
            req.session.pendingRegistration = null
            if (isAjax) return res.status(409).json({ error: msg })
            return res.redirect(`/error?errorMsg=${encodeURIComponent(msg)}`)
        }

        const answerHash = await bcrypt.hash(answer.trim().toLowerCase(), 10) // normalize before hashing

        // create profile
        const created = await query.insertProfle({
            name: pending.username,
            password: pending.passwordHash,
            recoveryQuestion: question,
            recoveryAnswerHash: answerHash
        })

        if (!created) {
            const msg = 'Failed to create account.'
            if (isAjax) return res.status(500).json({ error: msg })
            return res.redirect(`/error?errorMsg=${encodeURIComponent(msg)}`)
        }

        // cleanup pending registration
        req.session.pendingRegistration = null

        // login user
        const user = await query.getProfile({ name: created.name })
        req.login(user, (err) => {
            if (err) return next(err)
            if (pending.rememberMe) {
                req.session.cookie.maxAge = 1814400000
            }
            if (isAjax) return res.status(200).json({ redirect: '/' })
            return res.redirect('/')
        })
    } catch (err) {
        if (req.xhr) {
            return res.status(500).json({ error: err.message })
        }
        next(err)
    }
})

// login route unchanged (keeps existing lock logic)
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

// ... rest of file unchanged ...
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

router.get('/recovery_account', (req, res) => {
    res.render('recovery_account') // no sensitive data passed
})

// verify recovery answer and create short-lived session token
router.post('/recovery_account/verify', async (req, res) => {
    try {
        const { username, question, answer } = req.body
        if (!username || !question || !answer) {
            return res.status(400).json({ error: 'Missing fields' })
        }

        const user = await query.getProfile({ name: username })
        if (!user) return res.status(404).json({ error: 'User not found' })

        // verify question matches stored question
        if (!user.recoveryQuestion || user.recoveryQuestion !== question) {
            return res.status(400).json({ error: 'Recovery question does not match' })
        }

        // compare normalized answer
        const normalized = answer.trim().toLowerCase()
        const match = await bcrypt.compare(normalized, user.recoveryAnswerHash || '')
        if (!match) return res.status(401).json({ error: 'Incorrect answer' })

        // set short-lived session state for password reset (15 minutes)
        req.session.passwordReset = {
            username: user.name,
            expiresAt: Date.now() + (15 * 60 * 1000)
        }

        return res.status(200).json({ verified: true })
    } catch (err) {
        return res.status(500).json({ error: err.message })
    }
})

// reset password (requires prior verification in same session)
router.post('/recovery_account/reset', async (req, res) => {
    try {
        const sessionToken = req.session.passwordReset
        if (!sessionToken || !sessionToken.username || sessionToken.expiresAt < Date.now()) {
            req.session.passwordReset = null
            return res.status(403).json({ error: 'Verification required or expired' })
        }

        const { new_password, confirm_password } = req.body
        if (!new_password || !confirm_password) {
            return res.status(400).json({ error: 'Missing password fields' })
        }
        if (new_password !== confirm_password) {
            return res.status(400).json({ error: 'Passwords do not match' })
        }

        const lengthOk = new_password.length >= 8
        const numberOk = /[0-9]/.test(new_password)
        const specialOk = /[!@#$%^&*(),.?":{}|<>_\-\\\[\];'`~+=\/;]/.test(new_password)
        if (!lengthOk || !numberOk || !specialOk) {
            return res.status(400).json({ error: 'Password must be at least 8 characters and include a number and a special character.' })
        }

        const user = await query.getProfile({ name: sessionToken.username })
        if (!user) {
            req.session.passwordReset = null
            return res.status(404).json({ error: 'User not found' })
        }

        // Disallow reuse of current or any previous passwords:
        // compare plaintext new_password against stored bcrypt hashes
        const allHashes = []
        if (user.password) allHashes.push(user.password)
        if (Array.isArray(user.previousPasswords) && user.previousPasswords.length) {
            allHashes.push(...user.previousPasswords)
        }

        for (const oldHash of allHashes) {
            // skip falsy entries
            if (!oldHash) continue
            // bcrypt.compare returns true when new_password matches an old hash
            // normalize nothing here — registration stored recovery answer normalized only
            const same = await bcrypt.compare(new_password, oldHash)
            if (same) {
                return res.status(400).json({ error: 'New password must not match any current or previous passwords.' })
            }
        }

        const newHash = await bcrypt.hash(new_password, 10)

        // Build update using $set and $push (push current password into previousPasswords)
        const updateOps = {
            $set: {
                password: newHash,
                lastPasswordChange: new Date()
            }
        }

        if (user.password) {
            // keep only the most recent N previous passwords (example: 10)
            updateOps.$push = {
                previousPasswords: {
                    $each: [user.password],
                    $slice: -10
                }
            }
        }

        await Profile.updateOne({ _id: user._id }, updateOps)

        // reset lock/failure counters after successful reset
        await Profile.updateOne({ _id: user._id }, { $set: { failedLoginAttempts: 0, lockUntil: null, lastSuccessfulLogin: new Date() } })

        // clear session state
        req.session.passwordReset = null

        // fetch fresh user object for login
        const freshUser = await query.getProfile({ _id: user._id })

        // log the user in after password reset
        req.login(freshUser, (err) => {
            if (err) {
                // still respond success but indicate login failed
                return res.status(200).json({ success: true, redirect: '/', login: false, message: 'Password changed but login failed. Please log in manually.' })
            }
            // successful login -> respond with redirect
            return res.status(200).json({ success: true, redirect: '/' })
        })
    } catch (err) {
        return res.status(500).json({ error: err.message })
    }
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