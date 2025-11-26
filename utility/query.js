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
        // reject if value is an object/array (operators like {$ne:...} blocked) unless it's an ObjectId
        if (isPlainValue(v)) {
            out[k] = v
        } else if (isValidObjectId(v)) {
            // keep ObjectId instances, convert string -> ObjectId
            out[k] = (typeof v === 'string') ? mongoose.Types.ObjectId(v) : v
        } else {
            // ignore suspicious fields
        }
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
    updateReview: (field, set) => {
        return Review.updateOne(safeFilter(field), set)
    },
    updateLikes: async (reviewId, profileId, vote) => {
        // sanitize ids
        const rId = isValidObjectId(reviewId) ? mongoose.Types.ObjectId(reviewId) : reviewId
        const pId = isValidObjectId(profileId) ? mongoose.Types.ObjectId(profileId) : profileId

        const review = await Review.findOne({ _id: rId })
        if (!review) return 0
        const returnCount = Array.from(review.likes).length - Array.from(review.dislikes).length

        if (vote === "like") {
            if (review.likes.includes(pId)) {
                return returnCount
            } else if (review.dislikes.includes(pId)) {
                await Review.updateOne({ _id: review._id }, { $push: { likes: pId }, $pull: { dislikes: pId } })
                if (!review.profileId.equals(pId)) {
                    await Profile.updateOne({ _id: review.profileId._id }, { $inc: { erms: 3 } })
                }
                return returnCount + 2
            }

            await Review.updateOne({ _id: review._id }, { $push: { likes: pId } })
            if (!review.profileId.equals(pId)) {
                await Profile.updateOne({ _id: review.profileId._id }, { $inc: { erms: 2 } })
            }
            return returnCount + 1
        } else if (vote === "dislike") {
            if (review.dislikes.includes(pId)) {
                return returnCount
            } else if (review.likes.includes(pId)) {
                await Review.updateOne({ _id: review._id }, { $push: { dislikes: pId }, $pull: { likes: pId } })
                if (!review.profileId.equals(pId)) {
                    await Profile.updateOne({ _id: review.profileId._id }, { $inc: { erms: -3 } })
                }
                return returnCount - 2
            }

            await Review.updateOne({ _id: review._id }, { $push: { dislikes: pId } })
            if (!review.profileId.equals(pId)) {
                await Profile.updateOne({ _id: review.profileId._id }, { $inc: { erms: -1 } })
            }
            return returnCount - 1
        }

        return returnCount
    },
    deleteReview: (id) => {
        const f = safeFilter({ _id: id })
        return Review.deleteOne(f)
    }
}

module.exports = query