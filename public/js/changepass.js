const cpForm = document.getElementById('changepass-form')
const msgContainer = document.querySelector('.cp-box')

// validation limits
const PASSWORD_MIN = 8
const PASSWORD_MAX = 128
const FORBIDDEN_RE = /[\0\r\n\t\$]/ // disallow control chars and dollar sign

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
    const curEl = cpForm.querySelector('input[name="current_password"]')
    const newEl = cpForm.querySelector('input[name="new_password"]')
    const confEl = cpForm.querySelector('input[name="confirm_password"]')
    if (curEl) curEl.setAttribute('maxlength', PASSWORD_MAX)
    if (newEl) newEl.setAttribute('maxlength', PASSWORD_MAX)
    if (confEl) confEl.setAttribute('maxlength', PASSWORD_MAX)
}

if (cpForm) {
    cpForm.addEventListener('submit', async (e) => {
        e.preventDefault()

        // read values and ensure strings
        const current = String(cpForm.querySelector('input[name="current_password"]').value || '')
        const nw = String(cpForm.querySelector('input[name="new_password"]').value || '')
        const conf = String(cpForm.querySelector('input[name="confirm_password"]').value || '')

        // basic presence checks
        if (!current || !nw || !conf) {
            showMsg('❌ Missing required fields.')
            return
        }

        // max length / control char checks
        if (current.length > PASSWORD_MAX || nw.length > PASSWORD_MAX || conf.length > PASSWORD_MAX) {
            showMsg(`❌ Password must be at most ${PASSWORD_MAX} characters.`)
            return
        }
        if (FORBIDDEN_RE.test(current) || FORBIDDEN_RE.test(nw) || FORBIDDEN_RE.test(conf)) {
            showMsg('❌ Invalid characters in password.')
            return
        }

        if (nw !== conf) {
            showMsg('❌ New passwords do not match.')
            return
        }

        if (nw.length < PASSWORD_MIN || !/[0-9]/.test(nw) || !/[!@#$%^&*(),.?":{}|<>_\-\\\[\];\'`~+=\/;]/.test(nw)) {
            showMsg('❌ Password must be at least 8 chars, include a number and a special character.')
            return
        }

        const payload = { current_password: current, new_password: nw, confirm_password: conf }

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
                cpForm.querySelector('input[name="current_password"]').value = ''
                cpForm.querySelector('input[name="new_password"]').value = ''
                cpForm.querySelector('input[name="confirm_password"]').value = ''
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