const express = require("express")
const router = express.Router()
const query = require("../utility/query")
const { sortFilterReviews } = require("../utility/sfHelper")
const error = require("../utility/error")
const checkAuthenticate = require("../utility/checkauthenticate")
const multer = require("multer")
const path = require("path")
const fs = require("fs")
const crypto = require("crypto")
const IP_LOG = console.info

router.get('/id/:restoId', checkAuthenticate, async (req, res) => {
    try {
        const q = req.query

        const sort = q.sort || "date"
        const order = q.order || "desc"
        const min = q.min || 0
        const max = q.max || 5
        const page = q.page || 1
        const or = q.or || "noor"
        const filter = q.filter || null

        const resto = await query.getResto({ name: req.params.restoId })

        if (!resto) {
            error.throwRestoError()
        }
        
        const isOwner = req.isAuthenticated() && String(req.user._id) === String(resto.owner)
        const isManager = req.isAuthenticated() && req.user.role === 'manager'
        const isAdmin = req.isAuthenticated() && req.user.role === 'admin'

        const reviews = await query.getReviews({ restoId: resto._id })
        const reviewCount = reviews.length

        if (!reviews) {
            error.throwReviewFetchError()
        }

        const sb = {
            ...resto, reviewCount: reviews.length,
            stars: (reviewCount > 0) ? (reviews.reduce((total, rev) => { return total + rev.stars }, 0) / reviewCount).toFixed(2) : 0
        }

        const sfReviews = await sortFilterReviews(reviews, min, max, sort, order, page, or, filter, req.user)

        sfReviews.forEach(s => {
           s.isOwner = isOwner
           s.isManager = isManager
           s.isAdmin = isAdmin
        })

        const empty = sfReviews.length == 0

        res.render('resto', { sb: sb, reviews: sfReviews, empty: empty, isManager: isManager, isAdmin: isAdmin, isOwner: isOwner, restoId: resto._id })
    } catch (err) {

        if (err.name !== "RestoError" && err.name != "ReviewFetchError") {
            res.redirect(`/error`)
        } else {
            res.redirect(`/error?errorMsg=${err.message}`)
        }
    }
})

const posterStorage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, './public/imgs/posters')
    },
    filename: function(req, file, cb) {
        const ext = path.extname(file.originalname || '').toLowerCase()
        const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`
        cb(null, name)
    }
})

function posterFileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase()
    const ALLOWED = ['.jpg', '.png', '.gif', '.jfif', '.webp', '.jpeg']
    if (ALLOWED.includes(ext)) cb(null, true)
    else cb(new Error('Invalid file type'), false)
}

const FILE_MAX_BYTES = 10 * 1024 * 1024
const uploadPoster = multer({ storage: posterStorage, fileFilter: posterFileFilter, limits: { fileSize: FILE_MAX_BYTES } })

// owner-only poster update
router.post('/id/:restoId/poster', (req, res, next) => {
    uploadPoster.single('resto-poster')(req, res, (err) => {
        if (err) {
           if (err.code === 'LIMIT_FILE_SIZE') {
                return res.redirect(`/error?errorMsg=${encodeURIComponent('Poster exceeds 10MB.')}`)
            }
            return res.redirect(`/error?errorMsg=${encodeURIComponent('Invalid poster upload.')}`)
        }
        next()
    })
}, async (req, res) => {
    try {
        if (!req.isAuthenticated()) {
            return res.redirect('/error?errorMsg=' + encodeURIComponent('User not logged in.'))
        }

        const resto = await query.getResto({ name: req.params.restoId })
        if (!resto) error.throwRestoError()

        // ownership check
        if (String(req.user._id) !== String(resto.owner)) {
            return res.redirect('/error?errorMsg=' + encodeURIComponent('Unauthorized'))
        }

        // if no file (should not happen), redirect
        if (!req.file) {
            return res.redirect('/resto/id/' + resto.name)
        }

        const newPoster = req.file.filename
        // update DB
        await query.updateResto({ _id: resto._id }, { $set: { poster: newPoster } })

        // remove old poster file if not default and exists
        try {
            if (resto.poster && resto.poster !== 'default_poster.png') {
                const oldPath = path.join(__dirname, '..', 'public', 'imgs', 'posters', resto.poster)
                fs.unlink(oldPath, (e) => { /* ignore unlink errors */ })
            }
        } catch (e) {}

        try { console.info(`[resto] poster updated for resto="${resto.name}" by="${req.user.name || req.user._id}" ip=${req.ip}`) } catch (e) {}

        return res.redirect('/resto/id/' + resto.name)
    } catch (err) {
        console.error(err)
        return res.redirect('/error')
    }
})

module.exports = router
