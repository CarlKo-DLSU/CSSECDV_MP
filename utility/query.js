const mongoose = require("mongoose")
const Profile = require("../database/models/Profile")
const Resto = require("../database/models/Resto")
const Review = require("../database/models/Review")

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config()
}

async function connectDB() {
    await mongoose.connect(process.env.MONGO_URL);
}

connectDB()

// helper: safe filter builder to reduce NoSQL injection risk
function isPlainValue(v) {
    return v === null || ["string", "number", "boolean"].includes(typeof v)
}
function isValidObjectId(v) {
    // accept either an ObjectId instance or a string that parses to a valid ObjectId
    try {
        return mongoose.Types.ObjectId.isValid(v)
    } catch (e) {
        return false
    }
}
function safeFilter(raw) {
    // allow only plain objects with primitive values or valid ObjectId strings/instances
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const out = {}
    for (const k of Object.keys(raw)) {
        const v = raw[k]
        // allow plain primitives
        if (isPlainValue(v)) {
            out[k] = v
            continue
        }

        // allow RegExp instances directly (used for name regex searching)
        if (v instanceof RegExp) {
            out[k] = v
            continue
        }

        // allow {$regex: string|RegExp, $options?: string} shape (sanitize options)
        if (v && typeof v === 'object' && Object.prototype.hasOwnProperty.call(v, '$regex')) {
            const rxVal = v.$regex
            const opts = v.$options
            const safeOpts = (typeof opts === 'string' && /^[imsux]*$/.test(opts)) ? opts : ''
            try {
                const reg = rxVal instanceof RegExp ? rxVal : new RegExp(String(rxVal), safeOpts)
                out[k] = reg
            } catch (e) {
                // ignore invalid regex
            }
            continue
        }

        // accept ObjectId-like values
        if (isValidObjectId(v)) {
            out[k] = (typeof v === 'string') ? mongoose.Types.ObjectId(v) : v
            continue
        }

        // ignore suspicious or complex fields
    }
    return out
}

// helper: whitelist fields for profile creation
function pickProfileFields(data = {}) {
    const allowed = [
        "name", "avatar", "description", "erms", "password",
        "previousPasswords", "lastPasswordChange", "failedLoginAttempts",
        "lockUntil", "lastLoginAttempt", "lastSuccessfulLogin",
        "recoveryQuestion", "recoveryAnswerHash", "role", "createdAt"
    ]
    const out = {}
    for (const k of allowed) {
        if (Object.prototype.hasOwnProperty.call(data, k)) out[k] = data[k]
    }
    return out
}

const query = {
    getProfile: (filter) => {
        return Profile.findOne(safeFilter(filter)).lean()
    },
    getResto: (filter) => {
        return Resto.findOne(safeFilter(filter)).lean()
    },
    getRestos: (filter) => {
        return Resto.find(safeFilter(filter)).lean()
    },
    getReview: (filter, fields) => {
        return Review.findOne(safeFilter(filter), fields).populate({
            path: 'restoId',
            model: 'Resto'
        }).populate({
            path: 'profileId',
            model: 'Profile'
        }).lean()
    },
    getReviews: (filter) => {
        return Review.find(safeFilter(filter))
            .populate({
                path: 'restoId',
                model: 'Resto'
            })
            .populate({
                path: 'profileId',
                model: 'Profile'
            })
            .lean()
    },
    insertReview: (data) => {
        // keep behaviour but avoid passing unexpected top-level prototypes
        const safe = Object.assign({}, data)
        return Review.create(safe)
    },
    insertProfle: (data) => {
        // whitelist profile fields to avoid arbitrary insert data
        const safe = pickProfileFields(data)
        return Profile.create(safe)
    },
    updateProfile: (field, set) => {
        return Profile.updateOne(safeFilter(field), set)
    },
    updateResto: (field, set) => {
        return Resto.updateOne(safeFilter(field), set)
    },
    updateReview: (field, set) => {
        return Review.updateOne(safeFilter(field), set)
    },
    updateLikes: async (reviewId, profileId, vote) => {
        // normalize ids to ObjectId instances when given strings
        const ensureOid = (v) => {
            if (v == null) return v
            if (typeof v === 'string' && mongoose.Types.ObjectId.isValid(v)) {
                return new mongoose.Types.ObjectId(v)
            }
            return v
        }

        const rId = ensureOid(reviewId)
        const pId = ensureOid(profileId)

        const review = await Review.findOne({ _id: rId })
        if (!review) return 0

        // compute current net count
        const likeCount = Array.from(review.likes).length
        const dislikeCount = Array.from(review.dislikes).length
        const returnCount = likeCount - dislikeCount

        // helpers to check membership
        const inLikes = (pId && review.likes.some(l => typeof l.equals === 'function' ? l.equals(pId) : String(l) === String(pId)))
        const inDislikes = (pId && review.dislikes.some(d => typeof d.equals === 'function' ? d.equals(pId) : String(d) === String(pId)))

        if (vote === "like") {
            if (inLikes) {
                return returnCount
            }
            if (inDislikes) {
                // switch dislike -> like
                await Review.updateOne({ _id: review._id }, { $push: { likes: pId }, $pull: { dislikes: pId } })
                if (review.profileId && pId && !(typeof review.profileId.equals === 'function' ? review.profileId.equals(pId) : String(review.profileId) === String(pId))) {
                    await Profile.updateOne({ _id: review.profileId._id || review.profileId }, { $inc: { erms: 3 } })
                }
                return returnCount + 2
            }

            // fresh like
            await Review.updateOne({ _id: review._id }, { $push: { likes: pId } })
            if (review.profileId && pId && !(typeof review.profileId.equals === 'function' ? review.profileId.equals(pId) : String(review.profileId) === String(pId))) {
                await Profile.updateOne({ _id: review.profileId._id || review.profileId }, { $inc: { erms: 2 } })
            }
            return returnCount + 1
        } else if (vote === "dislike") {
            if (inDislikes) {
                return returnCount
            }
            if (inLikes) {
                // switch like -> dislike
                await Review.updateOne({ _id: review._id }, { $push: { dislikes: pId }, $pull: { likes: pId } })
                if (review.profileId && pId && !(typeof review.profileId.equals === 'function' ? review.profileId.equals(pId) : String(review.profileId) === String(pId))) {
                    await Profile.updateOne({ _id: review.profileId._id || review.profileId }, { $inc: { erms: -3 } })
                }
                return returnCount - 2
            }

            // fresh dislike
            await Review.updateOne({ _id: review._id }, { $push: { dislikes: pId } })
            if (review.profileId && pId && !(typeof review.profileId.equals === 'function' ? review.profileId.equals(pId) : String(review.profileId) === String(pId))) {
                await Profile.updateOne({ _id: review.profileId._id || review.profileId }, { $inc: { erms: -1 } })
            }
            return returnCount - 1
        } else if (vote === "remove") {
            // remove an existing like or dislike
            if (inLikes) {
                await Review.updateOne({ _id: review._id }, { $pull: { likes: pId } })
                if (review.profileId && pId && !(typeof review.profileId.equals === 'function' ? review.profileId.equals(pId) : String(review.profileId) === String(pId))) {
                    // removing a like: revert erms awarded for that like
                    await Profile.updateOne({ _id: review.profileId._id || review.profileId }, { $inc: { erms: -2 } })
                }
                return returnCount - 1
            }
            if (inDislikes) {
                await Review.updateOne({ _id: review._id }, { $pull: { dislikes: pId } })
                if (review.profileId && pId && !(typeof review.profileId.equals === 'function' ? review.profileId.equals(pId) : String(review.profileId) === String(pId))) {
                    // removing a dislike: revert penalty
                    await Profile.updateOne({ _id: review.profileId._id || review.profileId }, { $inc: { erms: 1 } })
                }
                return returnCount + 1
            }

            return returnCount
        }

        return returnCount
    },
    deleteReview: (id) => {
        const f = safeFilter({ _id: id })
        return Review.deleteOne(f)
    }
}

module.exports = query