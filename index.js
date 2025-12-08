if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config()
}

// node requires
const path = require("path")
const express = require("express")
const hbs = require("hbs")
const query = require("./utility/query")
const error = require("./utility/error")
const helmet = require("helmet")
const compression = require("compression")
const fs = require('fs');
const logStream = fs.createWriteStream(path.join(__dirname, 'server.log'), { flags: 'a' });
function logWithTimestamp(type, ...args) {
    const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    const line = `[${new Date().toISOString()}] [${type}] ${msg}\n`;
    logStream.write(line);
}
const origLog = console.log;
const origError = console.error;
console.log = (...args) => {
    origLog(...args);
    logWithTimestamp('LOG', ...args);
};
console.error = (...args) => {
    origError(...args);
    logWithTimestamp('ERROR', ...args);
};

// express settings
const app = new express()
app.use(express.json()) // use json
app.use(express.urlencoded({ extended: true })); // parse urlencoded
app.use(express.static('public')) // static directory

// security middleware
app.disable('x-powered-by')
app.use(helmet())
app.use(compression())

// require essential env vars early
if (!process.env.SESSION_SECRET || !process.env.MONGO_URL || !process.env.PORT) {
    console.error('Missing required env variables: SESSION_SECRET, MONGO_URL, or PORT')
    process.exit(1)
}

// when behind a proxy (e.g. production), trust first proxy so secure cookies work
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1)
}

// global data
app.locals.currentUser = null

// hbs
hbs.registerPartials(__dirname + "/views/partials")
app.set('views', __dirname + "/views")
app.set('view engine', 'hbs')
app.set('view options', { layout: '/layouts/header' });

// Handlebars helpers
hbs.registerHelper('hasRole', function(user, role, options) {
    try {
        if (user && user.role && user.role === role) {
            return options.fn(this);
        }
    } catch (e) {}
    return options.inverse(this);
});

hbs.registerHelper('or', function(a, b) {
    return a || b;
});

hbs.registerHelper('eq', function(a, b) {
    return a === b;
});

const session = require("express-session")
const MongoStore = require('connect-mongo');
const passport = require('passport')
const initPassport = require("./utility/passport_config")

// session config hardening
const SESSION_MAX_AGE = parseInt(process.env.SESSION_MAX_AGE, 10) || (14 * 24 * 60 * 60 * 1000) // 14 days
const SESSION_NAME = process.env.SESSION_NAME || 'restaurantReviewsSession'

app.use(session({
    name: SESSION_NAME,
    secret: process.env.SESSION_SECRET,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URL,
        ttl: Math.floor(SESSION_MAX_AGE / 1000),
        autoRemove: 'native'
    }),
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: SESSION_MAX_AGE
    }
}))

// passport initialization (ensure strategies are configured before session use)
initPassport(passport)
app.use(passport.initialize())
app.use(passport.session())

app.use((req, res, next) => {
    res.locals.currentUser = req.user || null;
    next();
});

// simple date formatting helper
hbs.registerHelper('formatDate', function(date) {
    if (!date) return 'Never';
    return new Date(date).toLocaleString();
});

// new helper: show lastLoginAttempt and append "(unsuccessful)" when last attempt is after last successful login
hbs.registerHelper('formatLastActivity', function(lastAttempt, lastSuccess) {
    if (!lastAttempt) return 'Never';
    try {
        const attemptTs = new Date(lastAttempt).getTime();
        const successTs = lastSuccess ? new Date(lastSuccess).getTime() : 0;
        const dateStr = new Date(lastAttempt).toLocaleString();
        if (!lastSuccess || attemptTs > successTs) {
            return `${dateStr} (unsuccessful)`;
        }
        return `${dateStr}`;
    } catch (e) {
        return 'Unknown';
    }
});

// routes
const homeRouter = require("./routes/home")
const profileRouter = require("./routes/profile")
const restoRouter = require("./routes/resto")
const reviewRouter = require("./routes/review")
const authRouter = require("./routes/auth")
const editRouter = require("./routes/edit")
const changePassRouter = require("./routes/changepass")
const adminRouter = require("./routes/admin")
const managerRouter = require("./routes/manager")

app.use("/", homeRouter)
app.use("/profile", profileRouter)
app.use("/resto", restoRouter)
app.use("/review", reviewRouter)
app.use("/auth", authRouter)
app.use("/edit", editRouter)
app.use("/changepass", changePassRouter)
app.use("/admin", adminRouter)
app.use("/manager", managerRouter)

// 404 handler — must come after all routes
app.use((req, res) => {
    res.status(404).render('error', { message: '404 - Page not found' })
})

// basic error handler (keeps response minimal)
app.use((err, req, res, next) => {
    console.error(err)
    if (res.headersSent) return next(err)
    // use the same `message` key expected by the error view
    res.status(500).render('error', { message: 'Internal Server Error' })
})

// listen
const server = app.listen(process.env.PORT, function() {
    console.log('SERVER IS UP!');
})