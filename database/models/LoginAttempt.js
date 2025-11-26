const mongoose = require('mongoose')

const USERNAME_MAX = 30
const FORBIDDEN_RE = /[\x00-\x1F\x7F\\\$\[\]]/ // disallow control chars and dollar sign

const loginAttemptSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        index: true,
        trim: true,
        maxlength: USERNAME_MAX,
        validate: {
            validator: v => typeof v === 'string' && v.length > 0 && v.length <= USERNAME_MAX && !FORBIDDEN_RE.test(v),
            message: 'Invalid username'
        }
    },
    attempts: {
        type: Number,
        default: 0,
        min: 0
    },
    lockUntil: {
        type: Date,
        default: null,
        index: true
    },
    lastAttemptAt: {
        type: Date,
        default: () => new Date()
        // removed index:true to avoid duplicate with the TTL index declared below
    }
}, {
    timestamps: true
})

// Optional: automatically remove stale records after 30 days since lastAttemptAt
// Adjust expireAfterSeconds as needed (here: 30 days)
loginAttemptSchema.index({ lastAttemptAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 })

// Keep attempts non-negative
loginAttemptSchema.pre('save', function(next) {
    if (typeof this.attempts !== 'number' || this.attempts < 0) {
        this.attempts = 0
    }
    this.lastAttemptAt = new Date()
    next()
})

// Convenience static to atomically increment attempts and optionally set lock
loginAttemptSchema.statics.increment = async function(username, extra = {}) {
    const update = { $inc: { attempts: 1 }, $set: { lastAttemptAt: new Date() } }
    if (extra.lockUntil) {
        update.$set.lockUntil = extra.lockUntil
    }
    return this.findOneAndUpdate({ username }, update, { upsert: true, new: true, setDefaultsOnInsert: true })
}

module.exports = mongoose.model('LoginAttempt', loginAttemptSchema)