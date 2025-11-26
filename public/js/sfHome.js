const searchParams = new URLSearchParams(window.location.search);
const descLabel = "sort-desc-i"
const ascLabel = "sort-asc-i"
const FORBIDDEN_RE = /[\x00-\x1F\x7F\\\$\[\]]/

document.addEventListener('DOMContentLoaded', function() {
    const sort = document.getElementById('sf-sort')
    const min = document.getElementById('sf-min')
    const max = document.getElementById('sf-max')
    const order = document.getElementById('sf-order')
    const orderLabel = document.getElementById('sf-order-label')
    const filter = document.getElementById('sf-filter')
    const filterForm = document.getElementById('header-search-bar-form')
    const errEl = document.getElementById('sf-error')

    function showError(msg) {
        if (errEl) {
            errEl.textContent = msg || ''
        }
    }

    function isFilterValid() {
        const val = filter ? (filter.value || '') : ''
        if (FORBIDDEN_RE.test(val)) {
            showError('Input contains invalid characters.')
            return false
        }
        return true
    }

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

    // live validation: show error when invalid, clear when valid
    filter && filter.addEventListener('input', () => {
        const val = filter.value || ''
        if (FORBIDDEN_RE.test(val)) {
            showError('Input contains invalid characters.')
        } else {
            showError('')
        }
    })

    filter.addEventListener("change", somethingChanged)
    sort.addEventListener("change", somethingChanged)
    min.addEventListener("change", somethingChanged)
    max.addEventListener("change", somethingChanged)
    order.addEventListener("change", somethingChanged)

    filterForm.addEventListener("submit", (e) => {
        e.preventDefault()
        // validate before processing
        if (!isFilterValid()) {
            filter && filter.focus()
            return
        }
        showError('')
        console.log("sfHome -> submit event, filter.value:", filter ? filter.value : '')
        somethingChanged()
    })

    function somethingChanged() {
        // block navigation if filter invalid
        if (!isFilterValid()) {
            filter && filter.focus()
            return
        }
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