const mongoose = require("mongoose");

const allowedQuestions = [
    "What is the name of a childhood friend that no one else would know?",
    "What is your favorite fictional location from a book or movie?",
    "What is/was the name of your first pet?"
];

const profileSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        maxlength: 30,
        validate: {
            validator: v => {
                if (typeof v !== 'string') return false
                if (/[\x00-\x1F\x7F\\\$\[\]]/.test(v)) return false
                const t = v.trim()
                return t.length >= 1 && t.length <= 30
            },
            message: 'Invalid username'
        }
    },
    avatar: {
        type: String,
        default: "default_avatar.png",
        maxlength: 200,
        trim: true
    },
    description: {
        type: String,
        default: "Say something about yourself!",
        maxlength: 500,
        trim: true
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
        required: true,
        minlength: 60 // expect bcrypt hashes (defensive)
    },
    previousPasswords: {
        type: [String],
        default: [],
        validate: [
            {
                validator: arr => Array.isArray(arr) && arr.length <= 10,
                message: 'previousPasswords may contain at most 10 entries'
            },
            {
                validator: arr => arr.every(h => typeof h === 'string' && (h.length === 60 || h.length === 0)),
                message: 'previousPasswords must be bcrypt hashes'
            }
        ]
    },
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
    },
    lastLoginAttempt: { 
        type: Date, 
        default: null 
    },
    lastSuccessfulLogin: { 
        type: Date, 
        default: null 
    },
    recoveryQuestion: {
        type: String,
        enum: allowedQuestions,
        default: null
    },
    recoveryAnswerHash: {
        type: String,
        default: null,
        minlength: 60 // bcrypt hash length
    },
    role: {
        type: String,
        enum: ["reviewer", "manager", "admin"],
        default: "reviewer",
        required: true
    }
});

// keep previousPasswords trimmed to the most recent 10 entries
profileSchema.pre('save', function(next) {
    if (Array.isArray(this.previousPasswords) && this.previousPasswords.length > 10) {
        this.previousPasswords = this.previousPasswords.slice(-10);
    }
    next();
});

module.exports = mongoose.model("Profile", profileSchema);