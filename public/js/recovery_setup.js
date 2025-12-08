console.log('recovery_setup.js loaded');

document.addEventListener('DOMContentLoaded', function () {
    (function () {
        const ANSWER_MAX = 50
        const FORBIDDEN_RE = /[\x00-\x1F\x7F\\\$\[\]]/
        const TIMEOUT = 10000

        const form = document.getElementById('recovery-setup-form')
        const question = document.getElementById('reco-question')
        const answer = document.getElementById('reco-answer')
        const errEl = document.getElementById('reco-error')
        const submitBtn = document.getElementById('reco-submit')

        if (!form) return

        if (answer) answer.setAttribute('maxlength', ANSWER_MAX)

        function showError(msg, success = false) {
            if (errEl) {
                errEl.textContent = msg
                errEl.style.color = success ? 'green' : ''
            }
        }

        function sanitizeTrim(s) { return (s || '').toString().trim() }

        function validateInputs() {
            if (!submitBtn) return true
            // clear previous field outlines
            if (question) question.classList.remove('required-error')
            if (answer) answer.classList.remove('required-error')

            const qVal = String((question && question.value) || '')
            const aRaw = (answer && answer.value) || ''
            const aVal = sanitizeTrim(aRaw)

            if (!qVal) {
                showError('❌ Please select a recovery question.')
                if (question) question.classList.add('required-error')
                submitBtn.disabled = true
                return false
            }
            if (!aVal) {
                showError('❌ Please provide an answer.')
                if (answer) answer.classList.add('required-error')
                submitBtn.disabled = true
                return false
            }
            if (aVal.length > ANSWER_MAX) {
                showError('❌ Answer is too long.')
                if (answer) answer.classList.add('required-error')
                submitBtn.disabled = true
                return false
            }
            if (FORBIDDEN_RE.test(aRaw)) {
                showError('❌ Answer contains invalid characters.')
                if (answer) answer.classList.add('required-error')
                submitBtn.disabled = true
                return false
            }

            // all good
            showError('')
            submitBtn.disabled = false
            return true
        }

        // attach listeners for live validation
        if (question) question.addEventListener('change', validateInputs)
        if (answer) answer.addEventListener('input', validateInputs)
        // initial validation state
        validateInputs()

        form.addEventListener('submit', async (e) => {
            if (!validateInputs()) {
                e.preventDefault()
                return
            }
            e.preventDefault()
            showError('')

            const qVal = String((question && question.value) || '')
            const aRaw = (answer && answer.value) || ''
            const aVal = sanitizeTrim(aRaw)

            // server-safety checks (duplicate of client checks)
            if (Array.isArray(aRaw) || typeof aRaw !== 'string') {
                showError('Invalid answer.')
                return
            }
            if (!qVal) { showError('❌ Please select a recovery question.'); question && question.focus(); return }
            if (!aVal) { showError('❌ Please provide an answer.'); answer && answer.focus(); return }
            if (aVal.length > ANSWER_MAX) { showError('❌ Answer is too long.'); answer && answer.focus(); return }
            if (FORBIDDEN_RE.test(aRaw)) { showError('❌ Answer contains invalid characters.'); answer && answer.focus(); return }

            submitBtn && (submitBtn.disabled = true)

            const controller = new AbortController()
            const t = setTimeout(() => controller.abort(), TIMEOUT)

            try {
                const res = await fetch(form.action, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json; charset=UTF-8',
                        'Accept': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    credentials: 'same-origin',
                    body: JSON.stringify({ question: qVal, answer: aRaw }),
                    signal: controller.signal
                })
                clearTimeout(t)

                if (res.ok) {
                    const data = await res.json().catch(() => ({}))
                    window.location.href = (data && data.redirect) || '/'
                    return
                }

                let text = ''
                try {
                    const j = await res.json().catch(() => null)
                    if (j && j.error) text = j.error
                } catch (err) { /* ignore */ }
                if (!text) text = await res.text().catch(() => 'Failed to complete registration. Try again.')
                showError(text)
            } catch (err) {
                showError(err && err.name === 'AbortError' ? 'Request timed out. Try again.' : 'Network error — try again.')
            } finally {
                clearTimeout(t)
                submitBtn && (submitBtn.disabled = false)
            }
        })
    })()
})