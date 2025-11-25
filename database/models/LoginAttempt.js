const mongoose = require('mongoose')

const loginAttemptSchema = new mongoose.Schema({
    username: { 
        type: String, 
        required: true, 
        unique: true, 
        index: true 
    },
    attempts: { 
        type: Number, 
        default: 0 
    },
    lockUntil: { 
        type: Date, 
        default: null 
    }
}, 
{ 
    timestamps: true 
})

module.exports = mongoose.model('LoginAttempt', loginAttemptSchema)