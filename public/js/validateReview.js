document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('cr-form')
    const title = document.getElementById('cr-title')
    const body = document.getElementById('cr-content')
    const button = document.getElementById('cr-post')
    const titleErr = document.getElementById('cr-title-err')
    const bodyErr = document.getElementById('cr-body-err')

    const TITLE_MAX = 101
    const BODY_MAX = 301

    const file = document.getElementById("cr-file")
    const label = document.getElementById("cr-upload-text")
    const icon = document.getElementsByClassName("cr-img-i")[0]

    const FILE_MAX_BYTES = 10 * 1024 * 1024
    const ALLOWED_IMAGE_EXTS = ['.jpg', '.png', '.gif', '.jfif', '.webp', '.jpeg']

    function fileHasAllowedExt(f) {
        if (!f || !f.name) return false
        const name = String(f.name || '').toLowerCase()
        return ALLOWED_IMAGE_EXTS.some(ext => name.endsWith(ext))
    }
    function fileTooLarge(f) {
        if (!f || typeof f.size !== 'number') return false
        return f.size > FILE_MAX_BYTES
    }

    const orForm = document.getElementById('or-form')
    const orBody = document.getElementById('or-content')
    const orButton = document.getElementById('or-post')

    if (title) title.setAttribute('maxlength', String(TITLE_MAX))
    if (body) body.setAttribute('maxlength', String(BODY_MAX))

    // add forbidden-regex (file-unique) and inline error helper
    const REVIEW_FORBIDDEN_RE = /[\x00-\x1F\x7F\\\$\[\]]/
    const externalErrEl = document.getElementById('cr-error') || null
    let _dynErr = null

    function showReviewError(text, targetForm = null) {
        // if a global external error element exists and no explicit target requested, use it
        if (externalErrEl && !targetForm) {
           externalErrEl.textContent = text
            return
        }

        const container = targetForm || form
        if (!container) return

        // store per-form dynamic error node so replies and create form don't conflict
        if (!container._dynErr) {
            const el = document.createElement('p')
            el.style.color = '#c00'
            el.style.marginTop = '6px'
            // decide reference element: prefer the form's submit button if it's a direct child
            let ref = null
            if (container === form && button && button.parentNode === form) ref = button
            if (container === orForm && orButton && orButton.parentNode === orForm) ref = orButton
            if (ref && ref.parentNode === container) {
                container.insertBefore(el, ref)
            } else {
                container.appendChild(el)
            }
            container._dynErr = el
        }
        container._dynErr.textContent = text
    }
    function clearReviewError(targetForm = null) {
        if (externalErrEl && !targetForm) externalErrEl.textContent = ''
        const container = targetForm || form
        if (container && container._dynErr) container._dynErr.textContent = ''
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
            if (raw.length == TITLE_MAX) {
                title.classList.add('required-error')
                if (titleErr) titleErr.textContent = `❌ Title must be ${TITLE_MAX-1} characters or less.`
                if (button) button.disabled = true
                return
            }
            if (REVIEW_FORBIDDEN_RE.test(raw)) {
                title.classList.add('required-error')
                if (titleErr) titleErr.textContent = '❌ Invalid characters detected.'
                if (button) button.disabled = true
                return
            }
            title.classList.remove('required-error')
            if (titleErr) titleErr.textContent = ''
            if (button) button.disabled = false
        })
    }

    if (body) {
        body.addEventListener('input', () => {
            const raw = String(body.value || '')
            if (raw.length == BODY_MAX) {
                body.classList.add('required-error')
                if (bodyErr) bodyErr.textContent = `❌ Content must be ${BODY_MAX-1} characters or less.`
                if (button) button.disabled = true
                return
            }
            if (REVIEW_FORBIDDEN_RE.test(raw)) {
                body.classList.add('required-error')
                if (bodyErr) bodyErr.textContent = '❌ Invalid characters detected.'
                if (button) button.disabled = true
                return
            }
            body.classList.remove('required-error')
            if (bodyErr) bodyErr.textContent = ''
            if (button) button.disabled = false
        })
    }

    if (orBody) {
        orBody.addEventListener('input', () => {
            const raw = String(orBody.value || '')
            if (REVIEW_FORBIDDEN_RE.test(raw)) {
                orBody.classList.add('required-error')
                showReviewError('❌ Invalid characters detected in input field/s.', orForm)
                if (orButton) orButton.disabled = true
            } else {
                orBody.classList.remove('required-error')
                clearReviewError(orForm)
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

        if ((title && title.value && title.value.length == TITLE_MAX) ||
            (body && body.value && body.value.length == BODY_MAX)) {
            e.preventDefault()
            if (title && title.value.length == TITLE_MAX) {
                title.classList.add('required-error')
                showReviewError(`❌ Title exceeds ${TITLE_MAX-1} characters (${title.value.length}/${TITLE_MAX-1}).`)
            } else if (body && body.value.length == BODY_MAX) {
                body.classList.add('required-error')
                showReviewError(`❌ Content exceeds ${BODY_MAX-1} characters (${body.value.length}/${BODY_MAX-1}).`)
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
            showReviewError('❌ Input field/s should not be empty')
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
            showReviewError('❌ Submission blocked: invalid characters detected in reply.', orForm)
            if (orButton) orButton.disabled = true
            return
        }

        if (!orBody) return

        if (String(orBody.value || '').trim() === "") {
            e.preventDefault()
            orBody.classList.add("required-error")
            showReviewError('❌ Input field/s should not be empty', orForm)
            if (orButton) orButton.disabled = true
        } else {
            orBody.classList.remove("required-error")
            clearReviewError(orForm)
            if (orButton) orButton.disabled = false
        }
    }

    function validateFilesLength() {
        if (!file || !label || !icon) return
        const numImages = file.files.length

        // validate extensions
        for (let i = 0; i < numImages; i++) {
            const f = file.files[i]
            if (!fileHasAllowedExt(f)) {
                label.innerText = "INVALID FILE"
                label.style.color = "var(--col-error)"
                if (button) button.disabled = true
                showReviewError('❌ Invalid image type. Allowed: .jpg, .png, .gif, .jfif, .webp, .jpeg')
                return
            }
            if (fileTooLarge(f)) {
                label.innerText = "FILE TOO LARGE"
                label.style.color = "var(--col-error)"
                if (button) button.disabled = true
                showReviewError('❌ One or more images exceed 10MB. Remove them before submitting.')
                return
            }
        }
        // clear any previous file-type error
        clearReviewError()
        if (button) button.disabled = false

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