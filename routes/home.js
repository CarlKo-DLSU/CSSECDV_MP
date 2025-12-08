const express = require('express');
const router = express.Router()
const query = require("../utility/query")
const error = require("../utility/error")
const { sortFilterHome } = require("../utility/sfHelper")
const checkAuthenticate = require('../utility/checkauthenticate');

router.get('/', checkAuthenticate, async (req, res) => {
    try {
        const q = req.query

        const sort = q.sort || "stars"
        const order = q.order || "desc"
        const min = Number(q.min) || 0
        const max = Number(q.max) || 5
        const filter = (typeof q.filter === 'string' && q.filter.length > 0) ? q.filter : null

        const regex = filter ? new RegExp(filter, "i") : /.*/i

        const allRestos = await query.getRestos()
        const restos = Array.isArray(allRestos) ? allRestos.filter(r => regex.test(r.name || "")) : allRestos

        if (!restos) {
            error.throwRestoFetchError()
        }

        const sfRestos = await sortFilterHome(restos, min, max, sort, order)
        res.render('home', { restos: sfRestos, home: true })
    } catch (err) {

        if (err.name !== "RestoFetchError") {
            res.redirect(`/error`)
        } else {
            res.redirect(`/error?errorMsg=${err.message}`)
        }
    }
})

router.get("/error", (req, res) => {
    const err = req.query.errorMsg
    res.render("error", { message: err || "You must be logged in to access this page." })
})

router.get("/about", (req, res) => {
    res.render("about")
})

module.exports = router
