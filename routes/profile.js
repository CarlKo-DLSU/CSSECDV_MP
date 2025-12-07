const express = require("express")
const router = express.Router()
const query = require("../utility/query")
const { sortFilterReviews } = require("../utility/sfHelper")
const error = require("../utility/error")
const checkAuthenticate = require("../utility/checkauthenticate")
const Profile = require("../database/models/Profile")
const Resto = require("../database/models/Resto")

router.get('/id/:profileId', checkAuthenticate, async (req, res) => {
    try {
        const q = req.query

        const sort = q.sort || "date"
        const order = q.order || "desc"
        const min = q.min || 0
        const max = q.max || 5
        const page = q.page || 1
        const or = q.or || "noor"
        const filter = q.filter || null

        const profile = await query.getProfile({ name: req.params.profileId })

        if (!profile) {
            error.throwProfileError()
        }

        const reviews = await query.getReviews({ profileId: profile._id })

        if (!reviews) {
            error.throwReviewFetchError()
        }

        const sb = { ...profile, reviewCount: reviews.length }

        let isCurrentUser = false
        if (req.isAuthenticated()) {
            isCurrentUser = profile._id.equals(req.user._id) 
        }

        // If current user is admin or manager, fetch all usernames and restaurants for dropdowns
        let allUsers = []
        let allRestos = []
        if (req.user && (req.user.role === 'admin' || req.user.role === 'manager')) {
            allUsers = await Profile.find({}, 'name role').lean()
            // Fetch restaurants with owner details populated
            allRestos = await Resto.find({}).populate('owner', 'name').lean()
        }

        const sfReviews = await sortFilterReviews(reviews, min, max, sort, order, page, or, filter, req.user)
        const empty = sfReviews.length == 0

        console.log(`ROUTE -> profile: ${req.params.profileId}`)
        res.render('profile', { sb: sb, reviews: sfReviews, isCurrentUser: isCurrentUser, empty: empty, allUsers: allUsers, allRestos: allRestos, currentUser: req.user })
    } catch (err) {
        console.log(`ERROR! ${err.message}`)

        if (err.name !== "ProfileError" && err.name !== "ReviewFetchError") {
            res.redirect(`/error`)
        } else {
            res.redirect(`/error?errorMsg=${err.message}`)
        }
    }
})


module.exports = router
