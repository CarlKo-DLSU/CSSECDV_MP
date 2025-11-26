if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config()
}

// node requires
const path = require("path")
const express = require("express")
const hbs = require("hbs")
const query = require("./utility/query")
const error = require("./utility/error")

// express settings
const app = new express()
app.use(express.json()) // use json
app.use(express.urlencoded({ extended: true })); // files consist of more than strings
app.use(express.static('public')) // we'll add a static directory named "public"

// global data
app.locals.currentUser = null

// hbs
hbs.registerPartials(__dirname + "/views/partials")
app.set('views', __dirname + "/views")
app.set('view engine', 'hbs')
app.set('view options', { layout: '/layouts/header' });

const session = require("express-session")
const MongoStore = require('connect-mongo');
const passport = require('passport')
const initPassport = require("./utility/passport_config")

app.use(session({
    secret: process.env.SESSION_SECRET,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URL
    }),
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        maxAge: false 
    }
}))

app.use(passport.session())
initPassport(passport)

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

app.use("/", homeRouter)
app.use("/profile", profileRouter)
app.use("/resto", restoRouter)
app.use("/review", reviewRouter)
app.use("/auth", authRouter)
app.use("/edit", editRouter)
app.use("/changepass", changePassRouter)


// listen! :3
const server = app.listen(process.env.PORT, function() {
    console.log('SERVER IS UP!');
});
