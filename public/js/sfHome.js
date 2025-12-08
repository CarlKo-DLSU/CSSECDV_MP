const searchParams = new URLSearchParams(window.location.search);
const descLabel = "sort-desc-i"
const ascLabel = "sort-asc-i"

document.addEventListener('DOMContentLoaded', function() {
    const FORBIDDEN_RE = /[\x00-\x1F\x7F\\\$\[\]]/
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
            showError('❌ Input contains invalid characters.')
            return false
        }
        return true
    }

    for (const [key, val] of searchParams.entries()) {
        if (key === "order") {
            if (orderLabel && order) {
                if (val === "asc") {
                    orderLabel.classList.add(ascLabel)
                    order.checked = true
                } else if (val === "desc") {
                    orderLabel.classList.remove(ascLabel)
                    order.checked = false
                }
            }
            continue
        }

        const el = document.getElementById("sf-" + key)
        if (el) el.value = val
    }

    if (!searchParams.has('sort') && sort) {
        sort.value = 'stars'
    }

    // live validation: show error when invalid, clear when valid
    filter && filter.addEventListener('input', () => {
        const val = filter.value || ''
        if (FORBIDDEN_RE.test(val)) {
            showError('❌ Input contains invalid characters.')
        } else {
            showError('')
        }
    })

    // attach listeners only when elements exist
    filter && filter.addEventListener("change", somethingChanged)
    sort && sort.addEventListener("change", somethingChanged)
    min && min.addEventListener("change", somethingChanged)
    max && max.addEventListener("change", somethingChanged)
    order && order.addEventListener("change", somethingChanged)

    filterForm && filterForm.addEventListener("submit", (e) => {
        e.preventDefault()
        // validate before processing
        if (!isFilterValid()) {
            filter && filter.focus()
            return
        }
        showError('')
        somethingChanged()
    })

    function somethingChanged() {
        // block navigation if filter invalid
        if (!isFilterValid()) {
            filter && filter.focus()
            return
        }
        // use current pathname and encode params; guard missing inputs
        const path = window.location.origin + window.location.pathname
        const vals = {
            sort: encodeURIComponent(sort ? sort.value : ""),
            order: (order && order.checked) ? "asc" : "desc",
            min: encodeURIComponent(min ? min.value : ""),
            max: encodeURIComponent(max ? max.value : ""),
            filter: encodeURIComponent((filter && filter.value) ? filter.value : "")
        }
        window.location.href = `${path}?sort=${vals.sort}&order=${vals.order}&min=${vals.min}&max=${vals.max}&filter=${vals.filter}`
    }
})