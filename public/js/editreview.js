document.addEventListener('DOMContentLoaded', function () {
    const title = document.getElementById('edit-title')
    const content = document.getElementById('edit-content')
    const msg = document.getElementById('edit-msg')
    const cancel = document.getElementById('edit-cancel')
    const saveLabel = document.getElementById('edit-save')
    const saveInput = document.getElementById('edit-submit')
    const del = document.getElementById('edit-delete')
    const form = document.getElementById('edit-form')
    const rating = document.getElementById('cr-star-input')

    const TITLE_MAX = 100
    const BODY_MAX = 300

    const no = document.getElementById('delete-no')
    const deletePopup = document.getElementById('delete-popup')

    const file = document.getElementById("cr-file")
    const label = document.getElementById("cr-upload-text")
    const icon = document.getElementsByClassName("cr-img-i")[0]
    const oldImages = label ? parseInt(label.getAttribute("data-oldImages") || "0", 10) : 0

    const ALLOWED_IMAGE_EXTS = ['.jpg', '.png', '.gif', '.jfif', '.webp', '.jpeg']
    const FILE_MAX_BYTES = 10 * 1024 * 1024
    
    function fileHasAllowedExt(f) {
        if (!f || !f.name) return false
        const name = String(f.name || '').toLowerCase()
        return ALLOWED_IMAGE_EXTS.some(ext => name.endsWith(ext))
    }
    function fileTooLarge(f) {
        if (!f || typeof f.size !== 'number') return false
        return f.size > FILE_MAX_BYTES
    }

    if (title) title.setAttribute('maxlength', String(TITLE_MAX))
    if (content) content.setAttribute('maxlength', String(BODY_MAX))

    const revId = form ? form.getAttribute("data-id") : null

    const EDIT_REVIEW_FORBIDDEN_RE = /[\x00-\x1F\x7F\\\$\[\]]/
    function showEditError(text) {
        if (msg) {
            msg.innerHTML = text
            msg.style.color = '#c00'
        } else {
            // fallback to alert (shouldn't happen)
            alert(text)
        }
    }
    function clearEditError() {
        if (msg) msg.innerHTML = ""
    }

    function emptyMsg() {
        if (msg) msg.innerHTML = ""
    }

    const openDel = (tog, po) => {
        if (tog && po) {
            tog.addEventListener("click", () => {
                po.style.display = (po.style.display == "flex") ? "none" : "flex";

                Array.from(po.getElementsByClassName("required-field")).forEach(e => {
                    e.classList.remove("required-error")
                });
            })
        }
    }

    openDel(no, deletePopup)
    openDel(del, deletePopup)

    if (title) {
        title.addEventListener('focus', () => { if (msg) msg.innerHTML = '' })
    }

    if (file) {
        file.addEventListener("change", validateFilesLength);
        file.addEventListener("click", validateFilesLength);
    }
    if (form) {
        form.addEventListener('submit', validateReviewContent)
    }

    const deleteForm = document.getElementById('delete-yes')
    if (deleteForm) {
        deleteForm.addEventListener("click", (e) => { e.preventDefault(); deleteForm.submit() })
    }

    if (oldImages > 0 && label) {
        label.style.color = "var(--col-prim)"
        label.innerText = oldImages + " IMGS"
        if (icon) icon.style.backgroundPosition = normalIcon
    }

    // proactive input validation for edit form
    if (title) {
        title.addEventListener('input', () => {
            const raw = String(title.value || '')
            if (EDIT_REVIEW_FORBIDDEN_RE.test(raw)) {
                title.classList.add('required-error')
                showEditError('❌ Title contains invalid characters.')
                if (saveInput) saveInput.disabled = true
                return
            }
            if (raw.length > TITLE_MAX) {
                title.classList.add('required-error')
                showEditError(`❌ Title exceeds ${TITLE_MAX} characters (${raw.length}/${TITLE_MAX}).`)
                if (saveInput) saveInput.disabled = true
                return
            }

            title.classList.remove('required-error')
            clearEditError()
            if (saveInput) saveInput.disabled = false
        })
    }

    if (content) {
        content.addEventListener('input', () => {
            const raw = String(content.value || '')
            if (EDIT_REVIEW_FORBIDDEN_RE.test(raw)) {
                content.classList.add('required-error')
                showEditError('❌ Content contains invalid characters.')
                if (saveInput) saveInput.disabled = true
                return
            }
            if (raw.length > BODY_MAX) {
                content.classList.add('required-error')
                showEditError(`❌ Content exceeds ${BODY_MAX} characters (${raw.length}/${BODY_MAX}).`)
                if (saveInput) saveInput.disabled = true
                return
            }

            content.classList.remove('required-error')
            clearEditError()
            if (saveInput) saveInput.disabled = false
        })
    }

    function validateReviewContent(e) {
        e.preventDefault()
        if (file && file.files && file.files.length > 0) {
           for (let i = 0; i < file.files.length; i++) {
                if (fileTooLarge(file.files[i])) {
                    showEditError('❌ One or more images exceed 10MB. Remove them before saving.')
                    if (saveInput) saveInput.disabled = true
                    return
                }
            }
        }
        // block submission if invalid chars present
        if (EDIT_REVIEW_FORBIDDEN_RE.test(String(title ? title.value : '')) || EDIT_REVIEW_FORBIDDEN_RE.test(String(content ? content.value : ''))) {
            showEditError('❌ Submission blocked: invalid characters detected.')
            if (title && EDIT_REVIEW_FORBIDDEN_RE.test(String(title.value || ''))) title.classList.add('required-error')
            if (content && EDIT_REVIEW_FORBIDDEN_RE.test(String(content.value || ''))) content.classList.add('required-error')
            if (saveInput) saveInput.disabled = true
            return
        }

        if ((title && title.value && title.value.length > TITLE_MAX) ||
            (content && content.value && content.value.length > BODY_MAX)) {
            if (title && title.value.length > TITLE_MAX) {
                title.classList.add('required-error')
                showEditError(`❌ Title exceeds ${TITLE_MAX} characters (${title.value.length}/${TITLE_MAX}).`)
            } else if (content && content.value.length > BODY_MAX) {
                content.classList.add('required-error')
                showEditError(`❌ Content exceeds ${BODY_MAX} characters (${content.value.length}/${BODY_MAX}).`)
            }
            if (saveInput) saveInput.disabled = true
            return
        }

        if (file && file.files && file.files.length > 4) {
            return
        }

        if (!title) return
        if (title.value == "") {
            title.classList.add("required-error")
            return
        } else {
            title.classList.remove("required-error")
            submitForm()
        }
    }

    function validateFilesLength() {
        if (!file || !label || !icon) return
        const numImages = file.files.length

        // check extensions
        for (let i = 0; i < numImages; i++) {
            const f = file.files[i]
            if (!fileHasAllowedExt(f)) {
                label.innerText = "INVALID FILE"
                label.style.color = "var(--col-error)"
                showEditError('❌ Invalid image type. Allowed: .jpg, .png, .gif, .jfif, .webp, .jpeg')
                if (saveInput) saveInput.disabled = true
                return
            }
            if (fileTooLarge(f)) {
                label.innerText = "FILE TOO LARGE"
                label.style.color = "var(--col-error)"
                showEditError('❌ One or more images exceed 10MB. Remove them before saving.')
                if (saveInput) saveInput.disabled = true
                return
            }
        }
        // clear previous errors
        clearEditError()
        if (saveInput) saveInput.disabled = false
        
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

        file.setAttribute("data-changed", "true")
    }

    function submitForm() {
        if (!form) return
        const data = new FormData(form)
        if (revId) data.append("id", revId)
        data.append("imagesChanged", file ? file.getAttribute("data-changed") : "false")

        let xhttp = new XMLHttpRequest()
        xhttp.open("POST", `/edit/review`, true)

        xhttp.onreadystatechange = () => {
            if (xhttp.readyState != 4) {
                return
            }

            if (xhttp.status == 200) {
                if (msg) msg.innerHTML = "✅ Changes Saved."
            } else {
                if (msg) msg.innerHTML = "❌ Failed to update. Please Try Again."
            }
        }

        xhttp.send(data)
    }
})