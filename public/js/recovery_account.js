console.log('recovery_account.js loaded')

document.addEventListener('DOMContentLoaded', function () {
    (function(){
        // client-side constraints (mirror server)
        const USERNAME_MAX = 30
        const ANSWER_MAX = 50
        const PASSWORD_MIN = 8
        const PASSWORD_MAX = 128
        const FORBIDDEN_RE = /[\x00-\x1F\x7F\\\$\[\]]/
        const VERIFY_TIMEOUT = 10000
        const RESET_TIMEOUT = 10000

        const verifyForm = document.getElementById('verify-form')
        const raUsername = document.getElementById('ra-username')
        const raQuestion = document.getElementById('ra-question')
        const raAnswer = document.getElementById('ra-answer')
        const verifyMsg = document.getElementById('ra-verify-msg')

        const resetSection = document.getElementById('recovery-reset')
        const resetForm = document.getElementById('reset-form')
        const newPwd = document.getElementById('ra-new-password')
        const confPwd = document.getElementById('ra-confirm-password')
        const resetMsg = document.getElementById('ra-reset-msg')

        // set defensive maxlengths
        if (raUsername) raUsername.setAttribute('maxlength', USERNAME_MAX)
        if (raAnswer) raAnswer.setAttribute('maxlength', ANSWER_MAX)
        if (newPwd) newPwd.setAttribute('maxlength', PASSWORD_MAX)
        if (confPwd) confPwd.setAttribute('maxlength', PASSWORD_MAX)

        function showVerifyMsg(text, success = false) {
            verifyMsg && (verifyMsg.textContent = text)
            if (verifyMsg) verifyMsg.style.color = success ? 'green' : ''
        }
        function showResetMsg(text, success = false) {
            resetMsg && (resetMsg.textContent = text)
            if (resetMsg) resetMsg.style.color = success ? 'green' : ''
        }

        function sanitizeTrim(s) {
            return (s || '').toString().trim()
        }

        // If page was reached via non-AJAX redirect after successful verify,
        // the query string will contain verified=1 — show reset UI automatically.
        try {
            const params = new URLSearchParams(window.location.search)
            if (params.get('verified') === '1' || params.get('verified') === 'true') {
                if (raUsername) raUsername.setAttribute('disabled', 'disabled')
                if (raQuestion) raQuestion.setAttribute('disabled', 'disabled')
                if (raAnswer) raAnswer.setAttribute('disabled', 'disabled')
                showVerifyMsg('Verified. You may now set a new password.', true)
                if (resetSection) resetSection.style.display = 'block'
            }
        } catch (e) { /* ignore if URLSearchParams not present */ }

        // VERIFY handler (AJAX)
        if (verifyForm) {
            verifyForm.addEventListener('submit', async (e) => {
                e.preventDefault()
                showVerifyMsg('')

                const username = sanitizeTrim(raUsername && raUsername.value)
                const question = String((raQuestion && raQuestion.value) || '')
                const answer = sanitizeTrim(raAnswer && raAnswer.value)

                if (!username) { showVerifyMsg('❌ Please enter your username.'); raUsername && raUsername.focus(); return }
                if (username.length > USERNAME_MAX || FORBIDDEN_RE.test(username)) { showVerifyMsg('❌ Invalid username.'); raUsername && raUsername.focus(); return }
                if (!question) { showVerifyMsg('❌ Please select a recovery question.'); raQuestion && raQuestion.focus(); return }
                if (!answer) { showVerifyMsg('❌ Please provide an answer.'); raAnswer && raAnswer.focus(); return }
                if (answer.length > ANSWER_MAX || FORBIDDEN_RE.test(answer)) { showVerifyMsg('❌ Invalid answer.'); raAnswer && raAnswer.focus(); return }

                const payload = { username, question, answer }
                const controller = new AbortController()
                const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT)

                try {
                    const res = await fetch(verifyForm.action, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json; charset=UTF-8',
                            'Accept': 'application/json',
                            'X-Requested-With': 'XMLHttpRequest'
                        },
                        credentials: 'same-origin',
                        body: JSON.stringify(payload),
                        signal: controller.signal
                    })
                    clearTimeout(timeout)
                    const data = await res.json().catch(() => ({}))
                    if (res.ok && data.verified) {
                        if (raUsername) raUsername.setAttribute('disabled', 'disabled')
                        if (raQuestion) raQuestion.setAttribute('disabled', 'disabled')
                        if (raAnswer) raAnswer.setAttribute('disabled', 'disabled')
                        showVerifyMsg('Verified. You may now set a new password.', true)
                        if (resetSection) { resetSection.style.display = 'block'; resetSection.scrollIntoView({ behavior: 'smooth' }) }
                        return
                    }
                    showVerifyMsg(data.error || 'Verification failed.')
                } catch (err) {
                    clearTimeout(timeout)
                    showVerifyMsg(err && err.name === 'AbortError' ? 'Request timed out.' : 'Network error — try again.')
                }
            })
        }

        // RESET handler (AJAX)
        if (resetForm) {
            resetForm.addEventListener('submit', async (e) => {
                e.preventDefault()
                showResetMsg('')

                const np = (newPwd && newPwd.value) || ''
                const cp = (confPwd && confPwd.value) || ''

                if (!np || !cp) { showResetMsg('❌ Please fill both password fields.'); return }
                if (np !== cp) { showResetMsg('❌ Passwords do not match.'); return }
                if (np.length < PASSWORD_MIN || np.length > PASSWORD_MAX) { showResetMsg(`❌ Password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters.`); return }
                if (FORBIDDEN_RE.test(np) || FORBIDDEN_RE.test(cp)) { showResetMsg('❌ Password contains invalid characters.'); return }
                if (!/[0-9]/.test(np) || !/[!@#%^&*(),.?":{}|<>_\-;'`~+=\/;]/.test(np)) {
                    showResetMsg('❌ Password must include a number and a special character.')
                    return
                }

                const payload = { new_password: np, confirm_password: cp }
                const controller = new AbortController()
                const timeout = setTimeout(() => controller.abort(), RESET_TIMEOUT)

                try {
                    const res = await fetch(resetForm.action, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json; charset=UTF-8',
                            'Accept': 'application/json',
                            'X-Requested-With': 'XMLHttpRequest'
                        },
                        credentials: 'same-origin',
                        body: JSON.stringify(payload),
                        signal: controller.signal
                    })
                    clearTimeout(timeout)
                    const data = await res.json().catch(() => ({}))
                    if (res.ok && data.success) {
                        showResetMsg('Password changed. Redirecting...', true)
                        setTimeout(() => { window.location.href = data.redirect || '/' }, 700)
                        return
                    }
                    showResetMsg(data.error || 'Failed to change password.')
                } catch (err) {
                    clearTimeout(timeout)
                    showResetMsg(err && err.name === 'AbortError' ? 'Request timed out.' : 'Network error — try again.')
                }
            })
        }
    })();
});