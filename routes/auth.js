const express = require('express');
const router = express.Router()
const query = require('../utility/query');
const error = require("../utility/error")
const bcrypt = require("bcrypt")
const passport = require('passport');
const checkAuthenticate = require('../utility/checkauthenticate');
const Profile = require('../database/models/Profile');

router.post('/register', async (req, res, next) => {
    try {
        const { username, password, confirm_password } = req.body

        // server-side validation (must mirror client rules)
        if (!username || !password || !confirm_password) {
            return res.redirect(`/error?errorMsg=${encodeURIComponent('Missing required fields.')}`)
        }

        if (password !== confirm_password) {
            return res.redirect(`/error?errorMsg=${encodeURIComponent('Passwords do not match.')}`)
        }

        const lengthOk = password.length >= 8
        const numberOk = /[0-9]/.test(password)
        const specialOk = /[!@#$%^&*(),.?":{}|<>_\-\\\[\];'`~+=\/;]/.test(password)

        if (!lengthOk || !numberOk || !specialOk) {
            return res.redirect(`/error?errorMsg=${encodeURIComponent('Password must be at least 8 characters and include a number and a special character.')}`)
        }

        // check username availability server-side too
        const existing = await query.getProfile({ name: username })
        if (existing) {
            return res.redirect(`/error?errorMsg=${encodeURIComponent('Username already taken.')}`)
        }

        const hashedPassword = await bcrypt.hash(password, 10)

        await query.insertProfle({
            name: username,
            password: hashedPassword
        })

        // fetch the newly created user and log them in
        const user = await query.getProfile({ name: username })
        if (!user) {
            return res.redirect(`/error?errorMsg=${encodeURIComponent('Failed to retrieve user after registration.')}`)
        }

        req.login(user, (err) => {
            if (err) {
                return next(err)
            }
            // optional: honor rememberMe if provided on registration form
            if (req.body.rememberMe) {
                req.session.cookie.maxAge = 1814400000
            }
            return res.redirect('/')
        })
    } catch (err) {
        res.redirect(`/error?errorMsg=${encodeURIComponent(err.message)}`)
    }
})

router.post('/login', async (req, res, next) => {
    const { username } = req.body;

    try {
        const userRecord = await query.getProfile({ name: username });

        // if account currently locked
        if (userRecord && userRecord.lockUntil && userRecord.lockUntil > Date.now()) {
            return res.redirect(`/error?errorMsg=${encodeURIComponent('Please try again in a few minutes.')}`);
        }

        // use passport with a custom callback so we can update counters
        passport.authenticate('local', async (err, user, info) => {
            if (err) return next(err);

            if (!user) {
                // failed login attempt
                if (userRecord) {
                    const newAttempts = (userRecord.failedLoginAttempts || 0) + 1;
                    const update = { failedLoginAttempts: newAttempts };

                    if (newAttempts >= 5) {
                        update.lockUntil = new Date(Date.now() + 5 * 60 * 1000); // lock 5 minutes
                    }

                    await Profile.findByIdAndUpdate(userRecord._id, update, { new: true });

                    if (newAttempts >= 5) {
                        return res.redirect(`/error?errorMsg=${encodeURIComponent('Please try again in a few minutes.')}`);
                    }
                }

                return res.redirect("/error?errorMsg=Failed to log in, please try again!");
            }

            // successful login: reset counters
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

router.post('/validatecredentials', async (req, res) => {
    const username = req.body.username
    const password = req.body.password
    const user = await query.getProfile({ name: username })

    if (!user) {
        res.status(400).send("Bad Credentials")
        return
    }

    // if account currently locked
    if (user.lockUntil && user.lockUntil > Date.now()) {
        const secondsLeft = Math.ceil((user.lockUntil - Date.now()) / 1000);
        return res.status(423).send(`Account locked. Try again in ${secondsLeft} seconds.`);
    }

    try {
        if (await bcrypt.compare(password, user.password)) {
            // reset counters on success
            await Profile.findByIdAndUpdate(user._id, { failedLoginAttempts: 0, lockUntil: null });
            res.status(200).send("Success!")
        } else {
            // increment failed attempts and set lock if threshold reached
            const newAttempts = (user.failedLoginAttempts || 0) + 1;
            const update = { failedLoginAttempts: newAttempts };

            if (newAttempts >= 5) {
                update.lockUntil = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
            }

            await Profile.findByIdAndUpdate(user._id, update, { new: true });

            if (newAttempts >= 5) {
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
