const searchParams = new URLSearchParams(window.location.search);
const ascLabel = "sort-asc-i"
const hasorLabel = "sort-or-i"
const FORBIDDEN_RE = /[\x00-\x1F\x7F\\\$\[\]]/

document.addEventListener('DOMContentLoaded', function() {
    const sort = document.getElementById('sf-sort')
    const min = document.getElementById('sf-min')
    const max = document.getElementById('sf-max')
    const page = document.getElementById('sf-page')
    const order = document.getElementById('sf-order')
    const orderLabel = document.getElementById('sf-order-label')
    const or = document.getElementById('sf-or')
    const orLabel = document.getElementById('sf-or-label')
    const filter = document.getElementById('sf-filter')
    const filterForm = document.getElementById('header-search-bar-form')
    const errEl = document.getElementById('sf-error')

    function showError(msg) {
        if (errEl) errEl.textContent = msg || ''
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

        if (key === "or") {
            if (val === "or") {
                orLabel.classList.add(hasorLabel)
                or.checked = true
            } else if (val === "noor") {
                orderLabel.classList.remove(hasorLabel)
                or.checked = false
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

    page.addEventListener("change", somethingChanged)
    sort.addEventListener("change", somethingChanged)
    min.addEventListener("change", somethingChanged)
    max.addEventListener("change", somethingChanged)
    order.addEventListener("change", somethingChanged)
    or.addEventListener("change", somethingChanged)

    filterForm.addEventListener("submit", (e) => {
        e.preventDefault()
        if (!isFilterValid()) {
            filter && filter.focus()
            return
        }
        somethingChanged()
    })

    function somethingChanged() {
        // block navigation if filter invalid
        if (!isFilterValid()) {
            filter && filter.focus()
            return
        }
        const path = window.location.origin + window.location.pathname
        window.location.href = `${path}?sort=${sort.value}&order=${order.checked ? "asc" : "desc"}&min=${min.value}&max=${max.value}&page=${page.value}&or=${or.checked ? "or" : "noor"}&filter=${encodeURIComponent(filter.value)}`
    }
})