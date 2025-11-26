const query = require('../utility/query')
const bcrypt = require("bcrypt")
const LocalStrategy = require('passport-local').Strategy
const mongoose = require('mongoose')

// defensive limits (mirror routes/auth.js)
const USERNAME_MAX = 30
const FORBIDDEN_RE = /[\x00-\x1F\x7F\\\$\[\]]/

// precompute a dummy hash to mitigate user-enumeration timing differences
const DUMMY_HASH = bcrypt.hashSync('invalidpassword-placeholder', 10)

function init(passport) {
    const authenticateUser = async (username, password, done) => {
        try {
            if (typeof username !== 'string' || typeof password !== 'string') {
                // avoid throwing; treat as invalid credentials
                await bcrypt.compare(String(password || ''), DUMMY_HASH)
                return done(null, false)
            }

            const safeUsername = username.trim()
            if (!safeUsername || safeUsername.length > USERNAME_MAX || FORBIDDEN_RE.test(safeUsername)) {
                await bcrypt.compare(password, DUMMY_HASH)
                return done(null, false)
            }

            const user = await query.getProfile({ name: safeUsername })
            if (!user) {
                // perform dummy compare to make timing similar to existing user path
                await bcrypt.compare(password, DUMMY_HASH)
                return done(null, false)
            }

            const ok = await bcrypt.compare(password, user.password)
            if (ok) {
                return done(null, user)
            } else {
                return done(null, false)
            }
        } catch (err) {
            return done(err)
        }
    }

    passport.use(new LocalStrategy({ usernameField: 'username', passwordField: 'password' }, authenticateUser))

    passport.serializeUser((user, done) => {
        try {
            done(null, user._id)
        } catch (e) {
            done(e)
        }
    })

    passport.deserializeUser(async (id, done) => {
        try {
            if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
                return done(null, false)
            }
            const user = await query.getProfile({ _id: String(id) })
            return done(null, user || false)
        } catch (err) {
            return done(err)
        }
    })
}

module.exports = init