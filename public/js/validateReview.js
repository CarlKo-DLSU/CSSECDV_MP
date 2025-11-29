document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('cr-form')
    const title = document.getElementById('cr-title')
    const body = document.getElementById('cr-content')
    const button = document.getElementById('cr-post')

    const TITLE_MAX = 100
    const BODY_MAX = 300

    const file = document.getElementById("cr-file")
    const label = document.getElementById("cr-upload-text")
    const icon = document.getElementsByClassName("cr-img-i")[0]

    const orForm = document.getElementById('or-form')
    const orBody = document.getElementById('or-content')
    const orButton = document.getElementById('or-post')

    if (title) title.setAttribute('maxlength', String(TITLE_MAX))
    if (body) body.setAttribute('maxlength', String(BODY_MAX))

    // add forbidden-regex (file-unique) and inline error helper
    const REVIEW_FORBIDDEN_RE = /[\x00-\x1F\x7F\\\$\[\]]/
    const externalErrEl = document.getElementById('cr-error') || null
    let _dynErr = null

    function showReviewError(text) {
        if (externalErrEl) {
            externalErrEl.textContent = text
            return
        }
        if (!form) return
        if (!_dynErr) {
            _dynErr = document.createElement('p')
            _dynErr.style.color = '#c00'
            _dynErr.style.marginTop = '6px'
            // only use button as reference if it's actually a child of form
            const ref = (button && button.parentNode === form) ? button : null
            if (ref) {
                form.insertBefore(_dynErr, ref)
            } else {
                form.appendChild(_dynErr)
            }
        }
        _dynErr.textContent = text
    }
    function clearReviewError() {
        if (externalErrEl) externalErrEl.textContent = ''
        if (_dynErr) _dynErr.textContent = ''
    }

    if (file) {
        file.addEventListener("change", validateFilesLength);
        file.addEventListener("click", validateFilesLength);
    }
    if (form) {
        form.addEventListener('submit', validateReviewContent)
    }
    if (orForm) {
        orForm.addEventListener('submit', validateReplyContent)
    }

    // proactive input validation: show invalid-char message and disable submit
    if (title) {
        title.addEventListener('input', () => {
            const raw = String(title.value || '')
            if (REVIEW_FORBIDDEN_RE.test(raw)) {
                title.classList.add('required-error')
                showReviewError('❌ Invalid characters detected in input field/s.')
                if (button) button.disabled = true
                return
            }
            if (raw.length > TITLE_MAX) {
                title.classList.add('required-error')
                showReviewError(`❌ Title exceeds ${TITLE_MAX} characters (${raw.length}/${TITLE_MAX}).`)
                if (button) button.disabled = true
                return
            } else {
                title.classList.remove('required-error')
                clearReviewError()
                if (button) button.disabled = false
            }
        })
    }

    if (body) {
        body.addEventListener('input', () => {
            const raw = String(body.value || '')
            if (REVIEW_FORBIDDEN_RE.test(raw)) {
                body.classList.add('required-error')
                showReviewError('❌ Invalid characters detected in input field/s.')
                if (button) button.disabled = true
                return
            }
            if (raw.length > BODY_MAX) {
                body.classList.add('required-error')
                showReviewError(`❌ Content exceeds ${BODY_MAX} characters (${raw.length}/${BODY_MAX}).`)
                if (button) button.disabled = true
                return
            } else {
                body.classList.remove('required-error')
                clearReviewError()
                if (button) button.disabled = false
            }
        })
    }

    if (orBody) {
        orBody.addEventListener('input', () => {
            const raw = String(orBody.value || '')
            if (REVIEW_FORBIDDEN_RE.test(raw)) {
                orBody.classList.add('required-error')
                showReviewError('❌ Invalid characters detected in input field/s.')
                if (orButton) orButton.disabled = true
            } else {
                orBody.classList.remove('required-error')
                clearReviewError()
                if (orButton) orButton.disabled = false
            }
        })
    }

    function validateReviewContent(e) {
        // pre-check forbidden characters
        if ((title && REVIEW_FORBIDDEN_RE.test(String(title.value || ''))) ||
            (body && REVIEW_FORBIDDEN_RE.test(String(body.value || '')))) {
            e.preventDefault()
            if (title && REVIEW_FORBIDDEN_RE.test(String(title.value || ''))) title.classList.add('required-error')
            if (body && REVIEW_FORBIDDEN_RE.test(String(body.value || ''))) body.classList.add('required-error')
            showReviewError('❌ Submission blocked: invalid characters detected.')
            if (button) button.disabled = true
            return
        }

        if ((title && title.value && title.value.length > TITLE_MAX) ||
            (body && body.value && body.value.length > BODY_MAX)) {
            e.preventDefault()
            if (title && title.value.length > TITLE_MAX) {
                title.classList.add('required-error')
                showReviewError(`❌ Title exceeds ${TITLE_MAX} characters (${title.value.length}/${TITLE_MAX}).`)
            } else if (body && body.value.length > BODY_MAX) {
                body.classList.add('required-error')
                showReviewError(`❌ Content exceeds ${BODY_MAX} characters (${body.value.length}/${BODY_MAX}).`)
            }
            if (button) button.disabled = true
            return
        }

        if (!title || !body) {
            // keep behavior safe if elements missing
            return
        }

        if (title.value === "" || body.value === ""){
            // disable button
            e.preventDefault()
            title.classList.add("required-error")
            body.classList.add("required-error")
        } else {
            // enable button
            title.classList.remove("required-error")
            body.classList.remove("required-error")
        }

        if (file && file.files.length > 4) {
            e.preventDefault()
        }
    }

    function validateReplyContent(e) {
        // pre-check forbidden characters for reply body
        if (orBody && REVIEW_FORBIDDEN_RE.test(String(orBody.value || ''))) {
            e.preventDefault()
            orBody.classList.add('required-error')
            showReviewError('❌ Submission blocked: invalid characters detected in reply.')
            if (orButton) orButton.disabled = true
            return
        }

        if (!orBody) return

        if (orBody.value == ""){
            // disable button
            e.preventDefault()
            orBody.classList.add("required-error")
        } else {
            // enable button
            orBody.classList.remove("required-error")
        }
    }

    function validateFilesLength() {
        if (!file || !label || !icon) return
        const numImages = file.files.length
        label.innerText = numImages + " IMGS"

        if (numImages == 0) {
            label.style.color = "white"
            icon.style.backgroundPosition = normalIcon
        } else if (numImages < 5) {
            label.style.color = "var(--col-prim)"
            icon.style.backgroundPosition = normalIcon
        } else {
            label.style.color = "var(--col-error)"
            icon.style.backgroundPosition = errorIcon
            label.innerText = "MAX 4 IMGS"
        }
    }
});