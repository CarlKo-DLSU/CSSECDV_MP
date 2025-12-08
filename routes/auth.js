const express = require('express');
const router = express.Router()
const query = require('../utility/query');
const error = require("../utility/error")
const bcrypt = require("bcrypt")
const passport = require('passport');
const checkAuthenticate = require('../utility/checkauthenticate');
const Profile = require('../database/models/Profile');
const LoginAttempt = require('../database/models/LoginAttempt');
const IpAttempt = require('../database/models/IpAttempt'); // new

const LOCK_THRESHOLD = 5
const LOCK_MS = 5 * 60 * 1000 // 5 minutes

const IP_LOCK_THRESHOLD = 20
const IP_LOCK_MS = 5 * 60 * 1000 // 5 minutes

// Limits / constants
const USERNAME_MIN = 1
const USERNAME_MAX = 30
const PASSWORD_MIN = 8
const PASSWORD_MAX = 128
const ANSWER_MIN = 1
const ANSWER_MAX = 50
const PENDING_REG_TTL_MS = 15 * 60 * 1000 // 15 minutes for pending registration/session tokens

const allowedQuestions = [
    "What is the name of a childhood friend that no one else would know?",
    "What is your favorite fictional location from a book or movie?",
    "What is/was the name of your first pet?"
]

function isString(v) { return typeof v === 'string' }
function containsMongoOperator(v) {
    if (!isString(v)) return true
    return /[\x00-\x1F\x7F\\\$\[\]]/.test(v)
}
function isValidUsername(u) {
    if (!isString(u)) return false
    if (/[\x00-\x1F\x7F\\\$\[\]]/.test(u)) return false
    const s = u.trim()
    if (s.length < USERNAME_MIN || s.length > USERNAME_MAX) return false
    return true
}
function isValidPassword(p) {
    if (!isString(p)) return false
    if (p.length < PASSWORD_MIN || p.length > PASSWORD_MAX) return false
    if (/[\x00-\x1F\x7F\\\$\[\]]/.test(p)) return false
    return true
}
function isValidAnswer(a) {
    if (!isString(a)) return false
    const s = a.trim()
    if (s.length < ANSWER_MIN || s.length > ANSWER_MAX) return false
    if (s.includes('$')) return false
    return true
}
function containsRawInvalidChars(raw) {
    if (!isString(raw)) return true
    // any ASCII control (0x00-0x1F), DEL (0x7F) or dollar sign
    if (/[\x00-\x1F\x7F\\\$\[\]]/.test(raw)) return true
    // reject if raw has leading/trailing whitespace (including newline/tab)
    if (raw !== raw.trim()) return true
    return false
}

async function recordFailedAttempt(username, failureType = 'Invalid Credentials', ip = 'unknown') {
    const uname = String(username || '').trim()
    const ipSafe = String(ip || 'unknown')

    // increment IP attempt (unless ip is literally 'unknown')
    try {
        if (ipSafe !== 'unknown') {
           const ipRec = await IpAttempt.increment(ipSafe)
            // if threshold reached and not currently blacklisted, set blacklist and return immediately
            if (ipRec.attempts >= IP_LOCK_THRESHOLD && (!ipRec.blacklistUntil || ipRec.blacklistUntil < Date.now())) {
                ipRec.blacklistUntil = new Date(Date.now() + IP_LOCK_MS)
                ipRec.attempts = 0
                await ipRec.save()
                try { console.info(`[auth] ip blacklisted ip="${ipSafe}" until=${ipRec.blacklistUntil.toISOString()}`) } catch (e) {}
                // stop further per-username processing for this request
                return { locked: false, la: null, ipBlacklisted: true, ipRec }
            }
        }
    } catch (e) {
        // ignore DB logging errors for IP tracking
    }

    if (uname.length === 0) return { locked: false, la: null, ipBlacklisted: false }

    const userExists = await Profile.exists({ name: uname })
    if (!userExists) {
        // log attempts that use non-existent usernames (no LoginAttempt document created)
        try { console.info(`[auth] failed login attempt for non-existent username="${uname}" ip=${ipSafe} type="Non-existent username"`) } catch (e) {}
        return { locked: false, la: null, ipBlacklisted: false }
    }

    const update = {
        $inc: { attempts: 1 },
        $set: { lastFailureType: failureType, lastFailureAt: new Date() }
    }

    const la = await LoginAttempt.findOneAndUpdate(
        { username: uname },
        update,
        { upsert: true, new: true, setDefaultsOnInsert: true }
    )

    try {
        console.info(`[auth] failed login attempt for username="${uname}" ip=${ipSafe} type="${failureType}"`)
    } catch (e) { /* ignore logging errors */ }

    // if threshold reached and not currently locked, set lock and reset attempts
    if (la.attempts >= LOCK_THRESHOLD && (!la.lockUntil || la.lockUntil < Date.now())) {
        la.lockUntil = new Date(Date.now() + LOCK_MS)
        la.attempts = 0
        await la.save()
        return { locked: true, la, ipBlacklisted: false }
    }
    return { locked: false, la, ipBlacklisted: false }
}

async function clearAttempts(username) {
    const uname = String(username || '').trim()
    if (!uname) return
    await LoginAttempt.deleteOne({ username: uname })
}

// register route: validate -> store pending registration in session -> redirect to recovery setup
router.post('/register', async (req, res, next) => {
    try {
        const { username, password, confirm_password } = req.body
        const isAjax = req.xhr || (req.get('Accept') && req.get('Accept').includes('application/json')) || req.get('X-Requested-With') === 'XMLHttpRequest'

        if (containsRawInvalidChars(username) || !isValidUsername(username)) {
            const msg = 'Invalid username.'
            if (isAjax) return res.status(400).json({ error: msg })
            return res.redirect()
        }

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
        const specialOk = /[!@#%^&*(),.?":{}|<>_\-;'`~+=\/;]/.test(password)
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
        return res.redirect('/error?errorMsg=' + encodeURIComponent('No pending registration found or it expired. Please register again.'))
    }
    // pass username to the page so it can be displayed
    return res.render('recovery_setup', { username: pending.username })
})

// handle recovery setup: validate question/answer -> create account -> login
router.post('/recovery_setup', async (req, res) => {
    try {
        const isAjax = req.xhr || (req.get('Accept') && req.get('Accept').includes('application/json')) || req.get('X-Requested-With') === 'XMLHttpRequest'

        // Expect pending registration stored in session (set earlier)
        const pending = req.session && req.session.pendingRegistration
        if (!pending || !pending.username) {
            if (isAjax) return res.status(403).json({ error: 'No pending registration.' })
            return res.redirect('/auth/register?error=pending_required')
        }

        const { question, answer } = req.body

        // basic type checks: answer must be a primitive string (reject arrays/objects)
        if (Array.isArray(answer) || typeof answer !== 'string' || typeof question !== 'string') {
            if (isAjax) return res.status(400).json({ error: 'Invalid input.' })
            return res.redirect('/auth/recovery_setup?error=invalid_input')
        }

        const FORBIDDEN_RE = /[\x00-\x1F\x7F\\\$\[\]]/
        if (FORBIDDEN_RE.test(answer)) {
            if (isAjax) return res.status(400).json({ error: 'Answer contains invalid characters.' })
            return res.redirect('/auth/recovery_setup?error=invalid_answer')
        }

        const normalized = answer.trim().toLowerCase()
        if (normalized.length < ANSWER_MIN || normalized.length > ANSWER_MAX) {
            if (isAjax) return res.status(400).json({ error: 'Answer length invalid.' })
            return res.redirect('/auth/recovery_setup?error=answer_length')
        }

        // question whitelist check
        const allowedQuestions = [
            "What is the name of a childhood friend that no one else would know?",
            "What is your favorite fictional location from a book or movie?",
            "What is/was the name of your first pet?"
        ]
        if (!allowedQuestions.includes(question)) {
            if (isAjax) return res.status(400).json({ error: 'Invalid question.' })
            return res.redirect('/auth/recovery_setup?error=invalid_question')
        }

        // hash normalized answer and persist to user record
        const answerHash = await bcrypt.hash(normalized, 10)

        // create profile if missing, otherwise update existing profile
        const safeName = String(pending.username).trim()
        let profile = await Profile.findOne({ name: safeName })
        if (profile) {
            // update recovery fields on existing account
            await Profile.updateOne(
                { _id: profile._id },
                { $set: { recoveryQuestion: question, recoveryAnswerHash: answerHash } }
            )
            profile = await Profile.findById(profile._id)
        } else {
            // create new account from pending registration
            try {
                profile = new Profile({
                    name: safeName,
                    password: pending.passwordHash,
                    role: pending.role || 'reviewer',
                    recoveryQuestion: question,
                    recoveryAnswerHash: answerHash,
                    createdAt: new Date()
                })
                try { console.info(`[auth] account created username="${safeName}" ip=${req.ip}`) } catch (e) {}
                await profile.save()
            } catch (e) {
                // handle duplicate-name race or validation error
                console.error('recovery_setup create error:', e)
                if (isAjax) return res.status(500).json({ error: 'Failed to create account. Try again.' })
                return res.redirect('/auth/recovery_setup?error=account_create_failed')
            }
        }

        // clear pending state and persist session
        req.session.pendingRegistration = null
        try { await new Promise((r, rej) => req.session.save(err => err ? rej(err) : r())) } catch (saveErr) {
            console.error('recovery_setup session save error:', saveErr)
        }

        // log the user in and respond
        req.login(profile, (loginErr) => {
            if (loginErr) {
                console.error('recovery_setup login error:', loginErr)
                if (isAjax) return res.status(200).json({ success: true, redirect: '/', login: false, message: 'Account created; please log in.' })
                return res.redirect('/?msg=' + encodeURIComponent('Account created; please log in.'))
            }
            if (isAjax) return res.status(200).json({ success: true, redirect: '/' })
            return res.redirect('/')
        })
    } catch (err) {
        console.error('recovery_setup error:', err)
        if (req.xhr) return res.status(500).json({ error: 'Server error.' })
        return res.redirect('/auth/recovery_setup?error=server')
    }
})

// login route unchanged (keeps existing lock logic)
router.post('/login', async (req, res, next) => {
    const username = String(req.body.username || '').trim()
    const ip = req.ip
    try {
        const ipRec = await IpAttempt.findOne({ ip })
        if (ipRec && ipRec.blacklistUntil && ipRec.blacklistUntil > Date.now()) {
            return res.redirect(`/error?errorMsg=${encodeURIComponent('Too many failed attempts from your IP. Try again later.')}`)
        }

        // If there is a username-level lock (from LoginAttempt), refuse early
        const la = await LoginAttempt.findOne({ username })
        if (la && la.lockUntil && la.lockUntil > Date.now()) {
            return res.redirect(`/error?errorMsg=${encodeURIComponent('Please try again in a few minutes.')}`);
        }

        passport.authenticate('local', async (err, user, info) => {
            if (err) return next(err);

            if (!user) {
                const { locked: laLocked, la, ipBlacklisted } = await recordFailedAttempt(username, 'Wrong Password', ip)

                if (ipBlacklisted) {
                    // IP was just blacklisted by this attempt; block further processing and respond
                    try { console.info(`[auth] blocked login attempt from newly blacklisted ip="${ip}"`) } catch (e) {}
                    return res.redirect(`/error?errorMsg=${encodeURIComponent('Too many failed attempts from your IP. Try again later.')}`)
                }

                // if an actual Profile exists, also increment its counters for monitoring
                const userRecord = await query.getProfile({ name: username })
                let profileLocked = false
                let updatedProfile = null
                if (userRecord) {
                    const newAttempts = (userRecord.failedLoginAttempts || 0) + 1;
                    const update = {};
                    if (newAttempts >= LOCK_THRESHOLD) {
                        // apply profile-level lock and reset counter
                        update.failedLoginAttempts = 0;
                        update.lockUntil = new Date(Date.now() + LOCK_MS);
                        profileLocked = true
                    } else {
                        update.failedLoginAttempts = newAttempts;
                    }
                    updatedProfile = await Profile.findByIdAndUpdate(userRecord._id, update, { new: true });
                    // double-check that lock was applied (race-safe)
                    if (updatedProfile && updatedProfile.lockUntil && updatedProfile.lockUntil > Date.now()) profileLocked = true
                }

                // Log the lock event once, preferring the profile-level lock entry (mentions account name)
                if (profileLocked && updatedProfile) {
                    try { console.info(`[auth] account locked for username="${updatedProfile.name}" until=${updatedProfile.lockUntil.toISOString()} ip=${req.ip}`) } catch (e) {}
                    return res.redirect(`/error?errorMsg=${encodeURIComponent('Please try again in a few minutes.')}`);
                }
                if (laLocked && la) {
                    try { console.info(`[auth] username-level lock applied for username="${la.username}" until=${la.lockUntil.toISOString()} ip=${req.ip}`) } catch (e) {}
                    return res.redirect(`/error?errorMsg=${encodeURIComponent('Please try again in a few minutes.')}`);
                }

                return res.redirect("/error?errorMsg=Failed to log in, please try again!");
            }

            // successful login: clear username-level attempts and reset Profile counters
            await clearAttempts(username);
            await Profile.findByIdAndUpdate(user._id, { failedLoginAttempts: 0, lockUntil: null });

            req.login(user, (loginErr) => {
                if (loginErr) return next(loginErr);
                try { console.info(`[auth] successful login for username="${username}" ip=${req.ip}`) } catch (e) {}
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

router.post('/validatecredentials', async (req, res) => {
    const username = String(req.body.username || '').trim()
    const password = req.body.password
    const ip = req.ip

    const ipRec = await IpAttempt.findOne({ ip })
    if (ipRec && ipRec.blacklistUntil && ipRec.blacklistUntil > Date.now()) {
        return res.status(423).send("Too many failed attempts from your IP. Try again later.")
    }

    if (containsRawInvalidChars(username) || !isString(password)) {
        // still record IP attempt (username might exist) - call recordFailedAttempt with ip
        const r = await recordFailedAttempt(username, 'Invalid Credentials', ip)
        if (r && r.ipBlacklisted) return res.status(423).send("Too many failed attempts from your IP. Try again later.")
        return res.status(400).send("Bad Credentials")
    }

    if (!isValidUsername(username) || !isString(password)) {
       const r = await recordFailedAttempt(username, 'Invalid Credentials', ip)
        if (r && r.ipBlacklisted) return res.status(423).send("Too many failed attempts from your IP. Try again later.")
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
        const { locked, ipBlacklisted } = await recordFailedAttempt(username, 'Invalid Credentials', req.ip)
        if (ipBlacklisted) return res.status(423).send("Too many failed attempts from your IP. Try again later.")
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
            const { locked: laLocked, la, ipBlacklisted } = await recordFailedAttempt(username, 'Wrong Password', req.ip)
            if (ipBlacklisted) return res.status(423).send("Too many failed attempts from your IP. Try again later.")

            const newAttempts = (user.failedLoginAttempts || 0) + 1;
            const update = { lastLoginAttempt: new Date() };
            let profileLocked = false
            if (newAttempts >= LOCK_THRESHOLD) {
                // apply lock and reset the profile counter
                update.failedLoginAttempts = 0;
                update.lockUntil = new Date(Date.now() + LOCK_MS);
                profileLocked = true
            } else {
                update.failedLoginAttempts = newAttempts;
            }
            const updatedProfile = await Profile.findByIdAndUpdate(user._id, update, { new: true });
            if (updatedProfile && updatedProfile.lockUntil && updatedProfile.lockUntil > Date.now()) profileLocked = true

            // Log the lock event once, preferring profile-level entry
            if (profileLocked && updatedProfile) {
                try { console.info(`[auth] account locked for username="${updatedProfile.name}" until=${updatedProfile.lockUntil.toISOString()} ip=${req.ip}`) } catch (e) {}
                return res.status(423).send("Too many failed attempts. Account locked for 5 minutes.");
            }
            if (laLocked && la) {
                try { console.info(`[auth] username-level lock applied for username="${la.username}" until=${la.lockUntil.toISOString()} ip=${req.ip}`) } catch (e) {}
                return res.status(423).send("Too many failed attempts. Account locked for 5 minutes.");
            }

            res.status(400).send("Bad Credentials")
        }
    } catch (err) {
        res.status(500).send("Internal Error")
    }
})

router.get('/logout', (req, res) => {
    const username = req.user && (req.user.name || req.user.username) ? (req.user.name || req.user.username) : null
    const ip = req.ip
    req.logout((err) => {
        if (err) {
            try { console.error(`[auth] logout error for username="${username || 'unknown'}" ip=${ip}: ${err && err.message ? err.message : err}`) } catch (e) {}
            return res.redirect('/error?errorMsg=Failed to logout.')
        }
        try { console.info(`[auth] logout username="${username || 'unknown'}" ip=${ip}`) } catch (e) {}
        return res.clearCookie("restaurantReviewsCookie").redirect('/')
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
        const specialOk = /[!@#%^&*(),.?":{}|<>_\-;'`~+=\/;]/.test(new_password)
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
    // reject raw invalid input immediately
    if (containsRawInvalidChars(username) || !isValidUsername(username)) {
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