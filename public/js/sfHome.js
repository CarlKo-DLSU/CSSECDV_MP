const searchParams = new URLSearchParams(window.location.search);
const descLabel = "sort-desc-i"
const ascLabel = "sort-asc-i"

document.addEventListener('DOMContentLoaded', function() {
    const sort = document.getElementById('sf-sort')
    const min = document.getElementById('sf-min')
    const max = document.getElementById('sf-max')
    const order = document.getElementById('sf-order')
    const orderLabel = document.getElementById('sf-order-label')
    const filter = document.getElementById('sf-filter')
    const filterForm = document.getElementById('header-search-bar-form')

    for (const [key, val] of searchParams.entries()) {
        if (key === "order") {
            if (val === "asc") {
                orderLabel.classList.add(ascLabel)
                order.checked = true
            } else if (val === "desc") {
                orderLabel.classList.remove(ascLabel)
                order.checked = false
            }
            continue
        }

        document.getElementById("sf-" + key).value = val
    }

    filter.addEventListener("change", somethingChanged)
    sort.addEventListener("change", somethingChanged)
    min.addEventListener("change", somethingChanged)
    max.addEventListener("change", somethingChanged)
    order.addEventListener("change", somethingChanged)

    filterForm.addEventListener("submit", (e) => {
        e.preventDefault()
        console.log("sfHome -> submit event, filter.value:", filter ? filter.value : null)
        somethingChanged()
    })

    function somethingChanged() {
        // use current pathname (like sfReviews.js does) and encode params
        const path = window.location.origin + window.location.pathname
        const vals = {
            sort: encodeURIComponent(sort.value || ""),
            order: order.checked ? "asc" : "desc",
            min: encodeURIComponent(min.value || ""),
            max: encodeURIComponent(max.value || ""),
            filter: encodeURIComponent((filter && filter.value) ? filter.value : "")
        }
        console.log("sfHome -> navigating with:", vals)
        window.location.href = `${path}?sort=${vals.sort}&order=${vals.order}&min=${vals.min}&max=${vals.max}&filter=${vals.filter}`
    }
})
