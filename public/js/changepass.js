const cpForm = document.getElementById('changepass-form')
const msgContainer = document.querySelector('.cp-box')

// validation limits
const PASSWORD_MIN = 8
const PASSWORD_MAX = 128
const FORBIDDEN_RE = /[\x00-\x1F\x7F\\\$\[\]]/ // disallow control chars and dollar sign

function showMsg(text, success = false) {
    let el = msgContainer.querySelector('.err-msg') || msgContainer.querySelector('.success-msg')
    if (!el) {
        el = document.createElement('p')
        el.className = success ? 'success-msg' : 'err-msg'
        msgContainer.insertBefore(el, cpForm)
    }
    el.textContent = text
    el.className = success ? 'success-msg' : 'err-msg'
}

// set maxlength attributes defensively if inputs exist
if (cpForm) {
    const curEl = document.getElementById('current_password') || cpForm.querySelector('input[name="current_password"]')
    const newEl = document.getElementById('new_password') || cpForm.querySelector('input[name="new_password"]')
    const confEl = document.getElementById('confirm_password') || cpForm.querySelector('input[name="confirm_password"]')
    const submitBtn = cpForm.querySelector('input[type="submit"], button[type="submit"]')

    // live validation helper: outlines only offending fields, shows message, disables submit
    function validateFields() {
        // clear previous outlines
        if (curEl) curEl.classList.remove('required-error')
        if (newEl) newEl.classList.remove('required-error')
        if (confEl) confEl.classList.remove('required-error')
        if (!submitBtn) {}

        const current = (curEl && curEl.value) || ''
        const np = (newEl && newEl.value) || ''
        const cp = (confEl && confEl.value) || ''

        // empty fields
        if (!current || !np || !cp) {
            if (!current && curEl) curEl.classList.add('required-error')
            if (!np && newEl) newEl.classList.add('required-error')
            if (!cp && confEl) confEl.classList.add('required-error')
            showMsg('❌ Input field/s should not be empty')
            if (submitBtn) submitBtn.disabled = true
            return false
        }
        // length
        if (np.length < PASSWORD_MIN || np.length > PASSWORD_MAX) {
            if (newEl) newEl.classList.add('required-error')
            showMsg(`❌ Password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters.`)
            if (submitBtn) submitBtn.disabled = true
            return false
        }
        // forbidden chars
        if (FORBIDDEN_RE.test(np) || FORBIDDEN_RE.test(current) || FORBIDDEN_RE.test(cp)) {
            if (FORBIDDEN_RE.test(current) && curEl) curEl.classList.add('required-error')
            if (FORBIDDEN_RE.test(np) && newEl) newEl.classList.add('required-error')
            if (FORBIDDEN_RE.test(cp) && confEl) confEl.classList.add('required-error')
            showMsg('❌ Password contains invalid characters.')
            if (submitBtn) submitBtn.disabled = true
            return false
        }
        // mismatch
        if (np !== cp) {
            if (newEl) newEl.classList.add('required-error')
            if (confEl) confEl.classList.add('required-error')
            showMsg('❌ New passwords do not match.')
            if (submitBtn) submitBtn.disabled = true
            return false
        }
        // complexity
        if (!/[0-9]/.test(np) || !/[!@#%^&*(),.?":{}|<>_\-;'`~+=\/;]/.test(np)) {
            if (newEl) newEl.classList.add('required-error')
            showMsg('❌ Password must include a number and a special character.')
            if (submitBtn) submitBtn.disabled = true
            return false
        }
        // all good
        showMsg('')
        if (submitBtn) submitBtn.disabled = false
        return true
    }

    // attach live listeners to inputs
    if (curEl) curEl.addEventListener('input', validateFields)
    if (newEl) newEl.addEventListener('input', validateFields)
    if (confEl) confEl.addEventListener('input', validateFields)
    // initial validation state
    validateFields()

    cpForm.addEventListener('submit', async (e) => {
        if (!validateFields()) {
            e.preventDefault()
            return
        }
        e.preventDefault()
        showMsg('')

        const current = (curEl && curEl.value) || ''
        const np = (newEl && newEl.value) || ''
        const cp = (confEl && confEl.value) || ''

        const payload = { current_password: current, new_password: np, confirm_password: cp }

        // use fetch with timeout and explicit headers
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 10000) // 10s timeout

        try {
            const res = await fetch('/changepass', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                credentials: 'same-origin',
                body: JSON.stringify(payload),
                signal: controller.signal
            })
            clearTimeout(timeout)

            if (res.ok) {
                showMsg('✅ Password changed successfully.', true)
                if (curEl) curEl.value = ''
                if (newEl) newEl.value = ''
                if (confEl) confEl.value = ''
                return
            }

            // prefer JSON error if provided
            let errText = ''
            try {
                const j = await res.json().catch(() => null)
                if (j && j.error) errText = j.error
            } catch (e) { /* ignore */ }

            if (!errText) {
                errText = await res.text().catch(() => 'Server error')
            }

            showMsg(`❌ ${errText}`)
        } catch (err) {
            if (err.name === 'AbortError') {
                showMsg('❌ Request timed out. Try again.')
            } else {
                showMsg('❌ Network error — try again.')
            }
        } finally {
            clearTimeout(timeout)
        }
    })
}