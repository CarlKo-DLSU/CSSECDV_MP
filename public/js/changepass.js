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
    const cur = document.getElementById('current_password')
    const np = document.getElementById('new_password')
    const cp = document.getElementById('confirm_password')
    if (cur) cur.setAttribute('maxlength', PASSWORD_MAX)
    if (np) np.setAttribute('maxlength', PASSWORD_MAX)
    if (cp) cp.setAttribute('maxlength', PASSWORD_MAX)
}

if (cpForm) {
    cpForm.addEventListener('submit', async (e) => {
        e.preventDefault()
        showMsg('')

        // robustly find inputs by id or name (handles template id/name mismatches)
        const curEl = document.getElementById('current_password') || cpForm.querySelector('input[name="current_password"]')
        const newEl = document.getElementById('new_password') || cpForm.querySelector('input[name="new_password"]')
        const confEl = document.getElementById('confirm_password') || cpForm.querySelector('input[name="confirm_password"]')

        const current = (curEl && curEl.value) || ''
        const np = (newEl && newEl.value) || ''
        const cp = (confEl && confEl.value) || ''

        if (!current || !np || !cp) {
            showMsg('Please fill all fields.')
            return
        }
        if (np.length < PASSWORD_MIN || np.length > PASSWORD_MAX) {
            showMsg(`❌ Password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters.`)
            return
        }
        // block forbidden characters in passwords
        if (FORBIDDEN_RE.test(np) || FORBIDDEN_RE.test(current) || FORBIDDEN_RE.test(cp)) {
            showMsg('❌ Password contains invalid characters.')
            return
        }
        if (np !== cp) {
            showMsg('❌ New passwords do not match.')
            return
        }
        if (!/[0-9]/.test(np) || !/[!@#%^&*(),.?":{}|<>_\-;'`~+=\/;]/.test(np)) {
            showMsg('❌ Password must include a number and a special character.')
            return
        }

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