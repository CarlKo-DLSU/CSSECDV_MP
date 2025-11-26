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

// Limits / constants
const USERNAME_MIN = 1
const USERNAME_MAX = 30
const PASSWORD_MIN = 8
const PASSWORD_MAX = 128
const ANSWER_MIN = 1
const ANSWER_MAX = 200
const PENDING_REG_TTL_MS = 15 * 60 * 1000 // 15 minutes for pending registration/session tokens

const allowedQuestions = [
    "What is the name of a childhood friend that no one else would know?",
    "What is your favorite fictional location from a book or movie?",
    "What is/was the name of your first pet?"
]

function isString(v) { return typeof v === 'string' }
function containsMongoOperator(v) {
    // rejects strings beginning with $ or containing {"$"} style payloads
    if (!isString(v)) return true
    return v.indexOf('$') !== -1
}
function isValidUsername(u) {
    if (!isString(u)) return false
    const s = u.trim()
    if (s.length < USERNAME_MIN || s.length > USERNAME_MAX) return false
    // disallow control chars and null byte
    if (/[\0\r\n\t]/.test(s)) return false
    // disallow $ to avoid operator confusion; allow most visible chars otherwise
    if (s.includes('$')) return false
    return true
}
function isValidPassword(p) {
    if (!isString(p)) return false
    if (p.length < PASSWORD_MIN || p.length > PASSWORD_MAX) return false
    return true
}
function isValidAnswer(a) {
    if (!isString(a)) return false
    const s = a.trim()
    if (s.length < ANSWER_MIN || s.length > ANSWER_MAX) return false
    if (s.includes('$')) return false
    return true
}

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

        if (!isValidUsername(username)) {
            const msg = 'Invalid username.'
            if (isAjax) return res.status(400).json({ error: msg })
            return res.redirect(`/error?errorMsg=${encodeURIComponent(msg)}`)
        }
        if (!isValidPassword(password) || !isValidPassword(confirm_password)) {
            const msg = 'Invalid password.'
            if (isAjax) return res.status(400).json({ error: msg })
            return res.redirect(`/error?errorMsg=${encodeURIComponent(msg)}`)
        }

        if (password !== confirm_password) {
            const msg = 'Passwords do not match.'
            if (isAjax) return res.status(400).json({ error: msg })
            return res.redirect(`/error?errorMsg=${encodeURIComponent(msg)}`)
        }

        const numberOk = /[0-9]/.test(password)
        const specialOk = /[!@#$%^&*(),.?":{}|<>_\-\\\[\];'`~+=\/;]/.test(password)
        if (!numberOk || !specialOk) {
            const msg = 'Password must include a number and a special character.'
            if (isAjax) return res.status(400).json({ error: msg })
            return res.redirect(`/error?errorMsg=${encodeURIComponent(msg)}`)
        }

        // normalized sanitized username for DB operations
        const safeUsername = username.trim()

        const existing = await query.getProfile({ name: safeUsername })
        if (existing) {
            const msg = 'Username already taken.'
            if (isAjax) return res.status(409).json({ error: msg })
            return res.redirect(`/error?errorMsg=${encodeURIComponent(msg)}`)
        }

        // hash password now and store pending registration in session (will finish after recovery setup)
        const hashedPassword = await bcrypt.hash(password, 10)
        req.session.pendingRegistration = {
            username: safeUsername,
            passwordHash: hashedPassword,
            role: 'reviewer',
            rememberMe: !!req.body.rememberMe,
            createdAt: Date.now(),
            expiresAt: Date.now() + PENDING_REG_TTL_MS
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

// show recovery setup page
router.get('/recovery_setup', (req, res) => {
    const pending = req.session.pendingRegistration
    if (!pending || !pending.expiresAt || pending.expiresAt < Date.now()) {
        req.session.pendingRegistration = null
        return res.redirect('/?errorMsg=' + encodeURIComponent('No pending registration found or it expired. Please register again.'))
    }
    // pass username to the page so it can be displayed
    return res.render('recovery_setup', { username: pending.username })
})

// handle recovery setup: validate question/answer -> create account -> login
router.post('/recovery_setup', async (req, res, next) => {
    try {
        const pending = req.session.pendingRegistration
        const isAjax = req.xhr || (req.get('Accept') && req.get('Accept').includes('application/json')) || req.get('X-Requested-With') === 'XMLHttpRequest'
        if (!pending || !pending.expiresAt || pending.expiresAt < Date.now()) {
            req.session.pendingRegistration = null
            const msg = 'No pending registration found. Please register again.'
            if (isAjax) return res.status(400).json({ error: msg })
            return res.redirect(`/error?errorMsg=${encodeURIComponent(msg)}`)
        }

        const { question, answer } = req.body
        if (!isString(question) || !allowedQuestions.includes(question) || !isValidAnswer(answer)) {
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

        // create profile using explicit fields only
        const created = await query.insertProfle({
            name: pending.username,
            password: pending.passwordHash,
            recoveryQuestion: question,
            recoveryAnswerHash: answerHash,
            role: pending.role || 'reviewer'
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

// validatecredentials, logout and recovery_account routes: apply strict checks where appropriate

router.post('/validatecredentials', async (req, res) => {
    const username = req.body.username
    const password = req.body.password

    if (!isValidUsername(username) || !isString(password)) {
        return res.status(400).send("Bad Credentials")
    }

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

        // detect XHR / AJAX requests
        const isAjax = req.xhr || (req.get('Accept') && req.get('Accept').includes('application/json')) || req.get('X-Requested-With') === 'XMLHttpRequest'

        if (!isValidUsername(username) || !isString(question) || !isValidAnswer(answer)) {
            if (isAjax) return res.status(400).json({ error: 'Missing or invalid fields' })
            return res.redirect('/auth/recovery_account?error=invalid')
        }

        if (!allowedQuestions.includes(question)) {
            if (isAjax) return res.status(400).json({ error: 'Invalid question selected' })
            return res.redirect('/auth/recovery_account?error=invalid_question')
        }

        const user = await query.getProfile({ name: username.trim() })
        if (!user) {
            if (isAjax) return res.status(404).json({ error: 'User not found' })
            return res.redirect('/auth/recovery_account?error=notfound')
        }

        if (!user.recoveryQuestion || user.recoveryQuestion !== question) {
            if (isAjax) return res.status(400).json({ error: 'Recovery question does not match' })
            return res.redirect('/auth/recovery_account?error=question_mismatch')
        }

        const normalized = answer.trim().toLowerCase()
        const match = await bcrypt.compare(normalized, user.recoveryAnswerHash || '')
        if (!match) {
            if (isAjax) return res.status(401).json({ error: 'Incorrect answer' })
            return res.redirect('/auth/recovery_account?error=incorrect_answer')
        }

        // set short-lived session state for password reset (15 minutes)
        req.session.passwordReset = {
            username: user.name,
            expiresAt: Date.now() + PENDING_REG_TTL_MS
        }

        // ensure session is persisted to the store before responding (avoids race with next request)
        try {
            await new Promise((resolve, reject) => {
                req.session.save(err => { if (err) return reject(err); resolve() })
                console.log('DEBUG verify: session saved', { sessionID: req.sessionID, passwordReset: req.session.passwordReset })
            })
        } catch (saveErr) {
            // fallback: return an error for AJAX or redirect with error for non-AJAX
            if (isAjax) return res.status(500).json({ error: 'Failed to persist session' })
            return res.redirect('/auth/recovery_account?error=session_save_failed')
        }

        // respond appropriately for AJAX vs regular form submit
        if (isAjax) {
            return res.status(200).json({ verified: true })
        } else {
            // redirect back to the recovery page; client will detect ?verified=1 and show reset UI
            return res.redirect('/auth/recovery_account?verified=1')
        }
    } catch (err) {
        // prefer JSON error for XHR, otherwise redirect to generic error
        const isAjax = req.xhr || (req.get('Accept') && req.get('Accept').includes('application/json')) || req.get('X-Requested-With') === 'XMLHttpRequest'
        if (isAjax) return res.status(500).json({ error: err.message })
        return res.redirect('/auth/recovery_account?error=server')
    }
})

// reset password (requires prior verification in same session)
router.post('/recovery_account/reset', async (req, res) => {
    console.log('DEBUG reset: incoming', { sessionID: req.sessionID, sessionPasswordReset: req.session && req.session.passwordReset, cookies: req.headers.cookie })
    try {
        const isAjax = req.xhr || (req.get('Accept') && req.get('Accept').includes('application/json')) || req.get('X-Requested-With') === 'XMLHttpRequest'

        const sessionToken = req.session.passwordReset
        if (!sessionToken || !isString(sessionToken.username) || !sessionToken.expiresAt || sessionToken.expiresAt < Date.now()) {
            req.session.passwordReset = null
            if (isAjax) return res.status(403).json({ error: 'Verification required or expired' })
            return res.redirect('/auth/recovery_account?error=verification_required')
        }

        const { new_password, confirm_password } = req.body
        if (!isValidPassword(new_password) || !isValidPassword(confirm_password)) {
            if (isAjax) return res.status(400).json({ error: 'Missing or invalid password fields' })
            return res.redirect('/auth/recovery_account?error=invalid_password')
        }
        if (new_password !== confirm_password) {
            if (isAjax) return res.status(400).json({ error: 'Passwords do not match' })
            return res.redirect('/auth/recovery_account?error=password_mismatch')
        }

        const numberOk = /[0-9]/.test(new_password)
        const specialOk = /[!@#$%^&*(),.?":{}|<>_\-\\\[\];'`~+=\/;]/.test(new_password)
        if (!numberOk || !specialOk) {
            if (isAjax) return res.status(400).json({ error: 'Password must include a number and a special character.' })
            return res.redirect('/auth/recovery_account?error=weak_password')
        }

        const user = await query.getProfile({ name: sessionToken.username })
        if (!user) {
            req.session.passwordReset = null
            if (isAjax) return res.status(404).json({ error: 'User not found' })
            return res.redirect('/auth/recovery_account?error=notfound')
        }

        // Disallow reuse ...
        const allHashes = []
        if (user.password) allHashes.push(user.password)
        if (Array.isArray(user.previousPasswords) && user.previousPasswords.length) {
            allHashes.push(...user.previousPasswords)
        }

        for (const oldHash of allHashes) {
            if (!oldHash) continue
            const same = await bcrypt.compare(new_password, oldHash)
            if (same) {
                if (isAjax) return res.status(400).json({ error: 'New password must not match any current or previous passwords.' })
                return res.redirect('/auth/recovery_account?error=password_reused')
            }
        }

        const newHash = await bcrypt.hash(new_password, 10)

        const updateOps = {
            $set: {
                password: newHash,
                lastPasswordChange: new Date()
            }
        }

        if (user.password) {
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
                if (isAjax) {
                    return res.status(200).json({ success: true, redirect: '/', login: false, message: 'Password changed but login failed. Please log in manually.' })
                }
                // non-AJAX: redirect to home with a notice query (client may show it)
                return res.redirect('/?msg=' + encodeURIComponent('Password changed; please log in.'))
            }
            if (isAjax) {
                return res.status(200).json({ success: true, redirect: '/' })
            }
            return res.redirect('/')
        })
    } catch (err) {
        if (req.xhr) return res.status(500).json({ error: err.message })
        return res.redirect('/auth/recovery_account?error=server')
    }
})

router.post('/nametaken', async (req, res) => {
    const username = req.body.username
    if (!isValidUsername(username)) {
        return res.status(400).send("Invalid username.")
    }
    const results = await query.getProfile({ name: username.trim() })

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