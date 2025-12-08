const ALLOWED_IMAGE_EXTS = ['.jpg', '.png', '.gif', '.jfif', '.webp', '.jpeg']
const FILE_MAX_BYTES = 10 * 1024 * 1024

function hasAllowedExt(name) {
    if (!name) return false
    const n = String(name).toLowerCase()
    return ALLOWED_IMAGE_EXTS.some(ext => n.endsWith(ext))
}

function fileTooLarge(f) {
    if (!f || typeof f.size !== 'number') return false
    return f.size > FILE_MAX_BYTES
}

document.addEventListener('DOMContentLoaded', function () {
    const input = document.getElementById('resto-poster-input')
    const img = document.getElementById('resto-poster-img')
    const actions = document.getElementById('resto-poster-actions')
    const confirmBtn = document.getElementById('resto-poster-confirm')
    const cancelBtn = document.getElementById('resto-poster-cancel')
    const errEl = document.getElementById('resto-poster-error')
    const form = document.getElementById('resto-poster-form')

    if (!input || !img || !actions || !form) return

    if (confirmBtn) confirmBtn.disabled = true
    if (errEl) { errEl.textContent = ''; errEl.style.display = 'none' }

    input.addEventListener('change', () => {
        if (errEl) { errEl.textContent = ''; errEl.style.display = 'none' }
        const f = input.files && input.files[0] ? input.files[0] : null
        if (!f) {
            actions.style.display = 'none'
            if (confirmBtn) confirmBtn.disabled = true
            return
        }
        if (!hasAllowedExt(f.name)) {
            if (errEl) {
                errEl.textContent = 'Invalid file type. Allowed: ' + ALLOWED_IMAGE_EXTS.join(', ')
                errEl.style.display = 'block'
            }
            input.value = ''
            actions.style.display = 'none'
            if (confirmBtn) confirmBtn.disabled = true
            return
        }
        if (fileTooLarge(f)) {
            if (errEl) {
                errEl.textContent = 'Image exceeds 10MB. Choose a smaller file.'
                errEl.style.display = 'block'
            }
            input.value = ''
            actions.style.display = 'none'
            if (confirmBtn) confirmBtn.disabled = true
        }
        // preview
        try {
            const url = URL.createObjectURL(f)
            img.setAttribute('src', url)
        } catch (e) {}
        actions.style.display = 'block'
        if (confirmBtn) confirmBtn.disabled = false
    })

    cancelBtn.addEventListener('click', () => {
        input.value = ''
        if (errEl) { errEl.textContent = ''; errEl.style.display = 'none' }
        // ideally reload original image; easiest is to reload page
        window.location.reload()
    })
})