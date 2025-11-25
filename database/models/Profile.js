const mongoose = require("mongoose");

const profileSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    avatar: {
        type: String,
        default: "default_avatar.png"
    },
    description: {
        type: String,
        default: "Say something about yourself!"
    },
    erms: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: () => Date.now(),
        immutable: true
    },
    password: {
        type: String,
        required: true
    },
    previousPasswords: {
        type: [String],
        default: []
    },
    // comment out if demo-ing disallowing previous passwords
    lastPasswordChange: {
        type: Date,
        default: null
    },
    failedLoginAttempts: {
        type: Number,
        default: 0
    },
    lockUntil: {
        type: Date,
        default: null
    }
})

module.exports = mongoose.model("Profile", profileSchema);
