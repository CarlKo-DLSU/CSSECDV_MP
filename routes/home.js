const express = require('express');
const router = express.Router()
const query = require("../utility/query")
const error = require("../utility/error")
const { sortFilterHome } = require("../utility/sfHelper")
const checkAuthenticate = require('../utility/checkauthenticate');

router.get('/', checkAuthenticate, async (req, res) => {
    try {
        const q = req.query
        console.log("ROUTE -> req.query:", q)

        const sort = q.sort || "relevance"
        const order = q.order || "desc"
        const min = Number(q.min) || 0
        const max = Number(q.max) || 5
        const filter = (typeof q.filter === 'string' && q.filter.length > 0) ? q.filter : null

        const regex = filter ? new RegExp(filter, "i") : /.*/i
        console.log("ROUTE -> filter:", filter, " regex:", regex)

        const allRestos = await query.getRestos()
        const restos = Array.isArray(allRestos) ? allRestos.filter(r => regex.test(r.name || "")) : allRestos
        console.log("ROUTE -> restos from DB (after filter):", Array.isArray(restos) ? restos.length : typeof restos)
        if (Array.isArray(restos)) {
            console.log("ROUTE -> sample names:", restos.slice(0,10).map(r => r.name))
        }

        if (!restos) {
            error.throwRestoFetchError()
        }

        const sfRestos = await sortFilterHome(restos, min, max, sort, order)
        console.log("ROUTE -> sfRestos length:", Array.isArray(sfRestos) ? sfRestos.length : typeof sfRestos)

        console.log(`ROUTE -> index`)
        res.render('home', { restos: sfRestos, home: true })
    } catch (err) {
        console.log(`ERROR! ${err.message}`)

        if (err.name !== "RestoFetchError") {
            res.redirect(`/error`)
        } else {
            res.redirect(`/error?errorMsg=${err.message}`)
        }
    }
})

router.get("/error", (req, res) => {
    const err = req.query.errorMsg
    res.render("error", { message: err || "Unknown error. Please retry!" })
})

router.get("/about", (req, res) => {
    res.render("about")
})

module.exports = router
