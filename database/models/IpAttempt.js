const mongoose = require('mongoose')

const ipAttemptSchema = new mongoose.Schema({
    ip: {
        type: String,
        required: true,
        unique: true,
        index: true,
        trim: true
    },
    attempts: {
        type: Number,
        default: 0,
        min: 0
    },
    blacklistUntil: {
        type: Date,
        default: null,
        index: true
    },
    lastAttemptAt: {
        type: Date,
        default: () => new Date()
    }
}, {
    timestamps: true
})

ipAttemptSchema.pre('save', function(next) {
    if (typeof this.attempts !== 'number' || this.attempts < 0) this.attempts = 0
    this.lastAttemptAt = new Date()
    next()
})

// Convenience static to atomically increment attempts and optionally set blacklist
ipAttemptSchema.statics.increment = async function(ip, extra = {}) {
    const update = { $inc: { attempts: 1 }, $set: { lastAttemptAt: new Date() } }
    if (extra.blacklistUntil) {
        update.$set.blacklistUntil = extra.blacklistUntil
    }
    return this.findOneAndUpdate({ ip }, update, { upsert: true, new: true, setDefaultsOnInsert: true })
}

module.exports = mongoose.model('IpAttempt', ipAttemptSchema)