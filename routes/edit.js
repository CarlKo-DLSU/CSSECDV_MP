const express = require("express")
const router = express.Router()
const query = require("../utility/query")
const error = require("../utility/error")
const multer = require("multer")
const path = require("path")
const fs = require("fs")
const checkAuthenticate = require("../utility/checkauthenticate")
const { updateOne } = require("../database/models/Profile")

const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, './public/imgs/avatars')
    },
    filename: function(req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, uniqueSuffix + '-' + file.originalname)
    }
})

const storage2 = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, './public/imgs/uploads')
    },
    filename: function(req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, uniqueSuffix + '-' + file.originalname)
    }
})

const FILE_MAX_BYTES = 10 * 1024 * 1024

// server-side allowed avatar extensions
const ALLOWED_AVATAR_EXTS = ['.jpg', '.png', '.gif', '.jfif', '.webp', '.jpeg']
function avatarFileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase()
    if (ALLOWED_AVATAR_EXTS.includes(ext)) {
        cb(null, true)
    } else {
        // signal an error so we can respond with 400
        cb(new Error('Invalid avatar file type'))
    }
}
const av = multer({ storage: storage, fileFilter: avatarFileFilter, limits: { fileSize: FILE_MAX_BYTES } })

const ALLOWED_UPLOAD_EXTS = ['.jpg', '.png', '.gif', '.jfif', '.webp', '.jpeg']
function imageFileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase()
    if (ALLOWED_UPLOAD_EXTS.includes(ext)) {
        cb(null, true)
    } else {
        cb(new Error('Invalid image file type'))
    }
}
const up = multer({ storage: storage2, fileFilter: imageFileFilter, limits: { fileSize: FILE_MAX_BYTES } })

router.get('/user', checkAuthenticate, (req, res) => {
    if (!req.isAuthenticated()) {
        res.redirect("/error?errorMsg=Login details could not be found.")
        return
    }

    res.render("edit-profile", req.user)
})

router.get("/review/:revId", checkAuthenticate, async (req, res) => {
    try {
        if (!req.isAuthenticated()) {
            error.throwLoginError()
        }

        const review = await query.getReview({ _id: req.params.revId })

        if (!review) {
            error.throwReviewFetchError()
        }

        // Check authorization: user must be the reviewer, a manager, or admin
        const isReviewer = review.profileId._id.equals(req.user._id);
        const isManager = req.user.role === 'manager';
        const isAdmin = req.user.role === 'admin';
        
        if (!isReviewer && !isManager && !isAdmin) {
            return res.redirect('/error?errorMsg=' + encodeURIComponent('You do not have permission to edit this review.'));
        }

        review.oldImages = review.uploads.length

        res.render("edit-review", review)
    } catch (err) {

        if (err.name != "ReviewFetchError") {
            res.redirect(`/error`)
        } else {
            res.redirect(`/error?errorMsg=${err.message}`)
        }
    }
})

router.post('/profile', (req, res, next) => {
    av.single("avatar")(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).send("Avatar exceeds the 10MB limit.")
            }
            return res.status(400).send("Invalid avatar image type.")
        }
        next()
    })
}, async (req, res) => {
    try {
        const user = req.user
        const name = req.body.name
        const desc = req.body.description
        const avatar = req.file

        if (!user || name === "") {
            res.status(400).send("Bad Data.")
            return
        }

        const found = await query.getProfile({ name: name })
        if (name === user.name || !found) {
            const oldAvatar = user.avatar
            const updateObj = { name: name, description: desc }
            if (avatar) {
                updateObj.avatar = avatar.filename

                if (oldAvatar !== "default_avatar.png") {
                    fs.unlink("./public/imgs/avatars/" + oldAvatar, (err) => {
                        if (err) {
                            console.log(err)
                        }
                    })
                }
            }

            await query.updateProfile({ _id: user._id }, { $set: updateObj })

            res.status(200).send("Success!")
        } else {
            res.status(409).send("Bad Credentials.")
        }
    } catch (err) {
        res.status(401).send("Failed to update.")
    }
})

router.post('/review', (req, res, next) => {
    up.array("images", 4)(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).send("One or more images exceed the 10MB limit.")
            }
            return res.status(400).send("Invalid image type.")
        }
        next()
    })
}, async (req, res) => {
    try {
        const user = req.user
        const { title, content, stars, id, imagesChanged } = req.body
        const images = req.files

        if (!user || title === "") {
            res.status(400).send("Bad Data.")
            return
        }

        const review = await query.getReview({ _id: id })

        if (!review) {
            res.status(400).send("Bad data.")
        }

        // Check authorization: user must be the reviewer, a manager, or admin
        const isReviewer = review.profileId._id.equals(user._id);
        const isManager = user.role === 'manager';
        const isAdmin = user.role === 'admin';

        if (!isReviewer && !isManager && !isAdmin) {
            res.status(403).send("Unauthorized: You do not have permission to edit this review.")
            return
        }

        if (isReviewer || isManager || isAdmin) {
            const oldImages = review.uploads
            const updateObj = { title: title, body: content, stars: stars }
            if (imagesChanged === "true") {
                updateObj.uploads = images.map(i => { return i.filename })

                oldImages.forEach(img => {
                    fs.unlink("./public/imgs/uploads/" + img, (err) => {
                        if (err) {
                            console.log(err)
                        }
                    })
                })
            }

            if (imagesChanged || updateObj.title !== review.title || updateObj.body !== review.body || updateObj.stars !== review.stars.toString()) {
                updateObj.edited = true
                updateObj.lastUpdated = new Date()

                await query.updateReview({ _id: id }, { $set: updateObj })
            }

            res.status(200).send("Success!")
        } else {
            res.status(409).send("Bad Credentials.")
        }
    } catch (err) {
        res.status(401).send("Failed to update.")
    }
})

router.post("/delete", async (req, res) => {
    try {
        const id = req.body.id
        const review = await query.getReview({ _id: id })

        if (!review) {
            error.throwReviewFetchError()
        }

        // Check authorization: user must be the reviewer, a manager, or admin
        const isReviewer = req.user._id.equals(review.profileId._id);
        const isManager = req.user.role === 'manager';
        const isAdmin = req.user.role === 'admin';

        if (!req.isAuthenticated() || (!isReviewer && !isManager && !isAdmin)) {
            error.throwLoginFailError()
        }

        const oldImages = review.uploads

        await query.deleteReview(id)

        oldImages.forEach(img => {
            fs.unlink("./public/imgs/uploads/" + img, (err) => {
                if (err) {
                    console.log(err)
                }
            })
        })

        res.redirect(`/resto/id/${review.restoId.name}`)
    } catch (err) {

        if (err.name != "ReviewFetchError" && err.name != "LoginFailError") {
            res.redirect(`/error`)
        } else {
            res.redirect(`/error?errorMsg=${err.message}`)
        }
    }
})

router.post("/delete/or", async (req, res) => {
    try {
        const id = req.body.id
        const review = await query.getReview({ _id: id })

        if (!review) {
            error.throwReviewFetchError()
        }

        if (!req.isAuthenticated() || !req.user._id.equals(review.restoId.owner)) {
            error.throwLoginFailError()
        }

        await query.updateReview({ _id: id }, { $set: { ownersResponse: null, hasOr: false } })

        res.redirect(`/resto/id/${review.restoId.name}`)
    } catch (err) {

        if (err.name != "ReviewFetchError" && err.name != "LoginFailError") {
            res.redirect(`/error`)
        } else {
            res.redirect(`/error?errorMsg=${err.message}`)
        }
    }
})

module.exports = router
