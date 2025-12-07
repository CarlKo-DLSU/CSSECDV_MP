const express = require("express")
const router = express.Router()
const multer = require("multer")
const path = require("path")
const query = require("../utility/query")
const error = require("../utility/error")
const checkAuthenticate = require("../utility/checkauthenticate")

const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, './public/imgs/uploads')
    },
    filename: function(req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, uniqueSuffix + '-' + file.originalname)
    }
})

const maxuploads = 4

// only allow these extensions
const ALLOWED_IMAGE_EXTS = ['.jpg', '.png', '.gif', '.jfif', '.webp', '.jpeg']

function imageFileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase()
    if (ALLOWED_IMAGE_EXTS.includes(ext)) {
        cb(null, true)
    } else {
        cb(new Error('Invalid file type'), false)
    }
}

const FILE_MAX_BYTES = 10 * 1024 * 1024
const upload = multer({ storage: storage, fileFilter: imageFileFilter, limits: { fileSize: FILE_MAX_BYTES } })

// wrap multer so we can return 400 on invalid files / too large
router.post("/new/:restoId", (req, res, next) => {
    upload.array("rv-images", maxuploads)(req, res, (err) => {
        if (err) {
            console.log(`Review image upload error: ${err && err.code ? err.code : err.message}`)
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).send("One or more images exceed the 10MB limit.")
            }
            return res.status(400).send("Invalid image upload.")
        }
        next()
    })
}, async (req, res) => {
    try {
        if (!req.isAuthenticated()) {
            res.redirect("/error?errorMsg=User not logged in.")
            return
        }

        const restoId = req.params.restoId
        const resto = await query.getResto({ name: restoId })
        const profile = req.user

        if (!resto) {
            error.throwRestoError()
        }

        const data = {
            restoId: resto._id,
            profileId: profile._id,
            title: req.body["rv-title"],
            body: req.body["rv-body"],
            uploads: req.files.map((i) => {
                return i.filename
            }),
            lastUpdated: new Date(),
            stars: req.body["rv-stars"],
        }

        const newReview = await query.insertReview(data)

        res.redirect(`/resto/id/${restoId}`)

        console.log(`POST -> ${resto.name} - ${req.body["rv-title"]}`)
        console.log(`\n--- UPLOAD ---\n${newReview}\n--------------\n`)
    } catch (err) {
        console.log(`ERROR! ${err.message}`)

        if (err.name !== "LoginError" && err.name !== "RestoError") {
            res.redirect(`/error`)
        } else {
            res.redirect(`/error?errorMsg=${err.message}`)
        }
    }
})

router.post("/reply", async (req, res) => {
    try {
        if (!req.isAuthenticated()) {
            res.redirect("/error?errorMsg=User not logged in.")
            return
        }
        
        const profile = req.user

        const reviewId = req.body.reviewId
        const review = await query.getReview({ _id: reviewId })

        if (!review) {
            error.throwReviewFetchError()
        }

        const resto = await query.getResto({ _id: review.restoId._id })

        if (!resto) {
            error.throwRestoError()
        }

        if (!profile._id.equals(resto.owner)) {
            error.throwLoginFailError()
        }

        const data = {
            lastUpdated: new Date(),
            body: req.body.body
        }

        await query.updateReview({ _id: reviewId }, { $set: { ownersResponse: data, hasOr: true } })

        res.redirect(`/resto/id/${resto.name}`)

        console.log(`REPLY-> ${reviewId}`)
        console.log(`\n--- REPLY ---\n${data}\n--------------\n`)
    } catch (err) {
        console.log(`ERROR! ${err.message}`)

        if (err.name !== "LoginError" && err.name !== "RestoError") {
            res.redirect(`/error`)
        } else {
            res.redirect(`/error?errorMsg=${err.message}`)
        }
    }
})

router.post("/vote", async (req, res) => {
    try {
        if (!req.isAuthenticated()) {
            res.status(403).send("User is not authenticated.")
            return
        }

        const { id, vote } = req.body
        const curLikes = await query.updateLikes(id, req.user._id, vote)

        console.log(`REVIEW: ${id} gains a ${vote}.`)
        res.status(200).send(curLikes.toString())
    } catch (err) {
        console.log(err)
        res.status(400).send("Bad Request.")
    }
})

module.exports = router
