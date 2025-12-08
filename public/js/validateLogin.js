const regForm = document.getElementById('lor-register-form')
// primary lookup by id; if that id accidentally targets a non-input (duplicate ids), fall back to the input inside the form
let regUsername = document.getElementById('lor-register-username')
if (regUsername && regUsername.tagName !== 'INPUT') {
    const fallback = document.querySelector('#lor-register-form input[name="username"]')
    if (fallback) regUsername = fallback
}
const regPassword = document.getElementById('lor-register-password')
const regConPassword = document.getElementById('lor-register-confirm-password')
const regAlr = document.getElementById('lor-reg-alr')
const regCon = document.getElementById('lor-reg-con')

const logForm = document.getElementById('lor-login-form')
const logUsername = document.getElementById('lor-login-username')
const logPassword = document.getElementById('lor-login-password')
const logAlr = document.getElementById('lor-log-alr')
const logRememberMe = document.getElementById('lor-remember-me')

const normalIcon = "-40px -80px";
const errorIcon = "-60px -80px";

// defensive constants (mirror server)
const USERNAME_MAX = 30
const PASSWORD_MIN = 8
const PASSWORD_MAX = 128
// use a file-unique name to avoid global redeclaration collisions with other client scripts
const LOGIN_FORBIDDEN_RE = /[\x00-\x1F\x7F\\\$\[\]]/

// apply maxlength attributes if inputs exist
if (regUsername) regUsername.setAttribute('maxlength', USERNAME_MAX)
if (regPassword) regPassword.setAttribute('maxlength', PASSWORD_MAX)
if (regConPassword) regConPassword.setAttribute('maxlength', PASSWORD_MAX)
if (logUsername) logUsername.setAttribute('maxlength', USERNAME_MAX)
if (logPassword) logPassword.setAttribute('maxlength', PASSWORD_MAX)

// attach only when form exists (prevents silent failure if script runs before DOM or id differs)
if (regForm) {
    regForm.addEventListener('submit', regValidateContent)
} else {
    console.warn('Register form (lor-register-form) not found - client validation may be bypassed')
}

if (logForm) {
    logForm.addEventListener('submit', logValidateContent)
} else {
    console.warn('Login form (lor-login-form) not found - client validation may be bypassed')
}

// debounce for username-availability checks
let nameCheckTimer = 0
if (regUsername) {
    regUsername.addEventListener("keyup", () => {
        resetReg()
        const raw = String(regUsername.value || '')
        const username = raw.trim()

        // quick client-side rejects
        if (username.length === 0) {
            regAlr.textContent = ""
            return
        }
        // reject raw input that contains forbidden chars or has leading/trailing whitespace
        if (LOGIN_FORBIDDEN_RE.test(raw) || raw !== raw.trim() || username.length > USERNAME_MAX) {
            regAlr.textContent = "❌ Invalid username."
            return
        }

        clearTimeout(nameCheckTimer)
        nameCheckTimer = setTimeout(async () => {
            try {
                const controller = new AbortController()
                const t = setTimeout(() => controller.abort(), 8000)

                // send trimmed username for availability check (only after raw passes validation)
                const res = await fetch('/auth/nametaken', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json; charset=UTF-8', 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ "username": username }),
                    signal: controller.signal
                })
                clearTimeout(t)
                if (res.ok) {
                    regAlr.textContent = ""
                } else {
                    regAlr.textContent = "❌ Already Taken."
                }
            } catch (e) {
                // network or timeout - don't block registration, show soft warning
                console.warn('Name check failed', e)
            }
        }, 300)
    })
}

if (regPassword) regPassword.addEventListener("keyup", () => { resetReg(); validateRegPassword(); })
if (regConPassword) regConPassword.addEventListener("keyup", () => { resetReg(); validateRegPassword(); })

// proactive validation for login fields: show invalid-char message and disable submit
if (logUsername) {
    logUsername.addEventListener('input', () => {
        const raw = String(logUsername.value || '')
        const submitBtn = logForm && logForm.querySelector('input[type="submit"]')
        if (LOGIN_FORBIDDEN_RE.test(raw) || raw !== raw.trim()) {
            if (logAlr) logAlr.textContent = "❌ Invalid character/s detected."
            logUsername.classList.add('required-error')
            if (submitBtn) submitBtn.disabled = true
        } else {
            if (logAlr) logAlr.textContent = ""
            logUsername.classList.remove('required-error')
            if (submitBtn) submitBtn.disabled = false
        }
    })
}
if (logPassword) {
    logPassword.addEventListener('input', () => {
        const raw = String(logPassword.value || '')
        const submitBtn = logForm && logForm.querySelector('input[type="submit"]')
        if (LOGIN_FORBIDDEN_RE.test(raw)) {
            if (logAlr) logAlr.textContent = "❌ Invalid character/s detected."
            logPassword.classList.add('required-error')
            if (submitBtn) submitBtn.disabled = true
        } else {
            if (logAlr) logAlr.textContent = ""
            logPassword.classList.remove('required-error')
            if (submitBtn) submitBtn.disabled = false
        }
    })
}

function resetReg() {
    if (regUsername) regUsername.classList.remove("required-error")
    if (regPassword) regPassword.classList.remove("required-error")
    if (regConPassword) regConPassword.classList.remove("required-error")
    if (regCon) regCon.textContent = ""
}

function resetLog() {
    if (logUsername) logUsername.classList.remove("required-error")
    if (logPassword) logPassword.classList.remove("required-error")
    if (logAlr) logAlr.textContent = ""
}

function isValidUsernameClient(u) {
    if (!u || typeof u !== 'string') return false
    if (LOGIN_FORBIDDEN_RE.test(u)) return false
    const s = u.trim()
    if (s.length === 0 || s.length > USERNAME_MAX) return false
    return true
}

function isValidPasswordClient(p) {
    if (!p || typeof p !== 'string') return false
    if (p.length < PASSWORD_MIN || p.length > PASSWORD_MAX) return false
    if (LOGIN_FORBIDDEN_RE.test(p)) return false
    return true
}

function regValidateContent(e) {
    // ensure we check password rules first so message is set
    const pwdOk = validateRegPassword()
    const usernameRaw = regUsername ? String(regUsername.value || '') : ''
    const usernameVal = usernameRaw.trim()
    const usernameEmpty = usernameVal.length === 0
    // validate against the raw value so control chars anywhere are detected
    const usernamesEmpty = !isValidUsernameClient(usernameRaw)
    const passwordsEmpty = !regPassword || regPassword.value.trim() == ""
    const notMatch = regPassword && regConPassword && regPassword.value.trim() !== regConPassword.value.trim()
    const nameTaken = regAlr && regAlr.textContent !== ""

    if (usernamesEmpty || passwordsEmpty || notMatch || nameTaken || !pwdOk) {
        // disable button / stop submission
        e.preventDefault()
        e.stopImmediatePropagation()
        if (regUsername) regUsername.classList.add("required-error")
        if (regPassword) regPassword.classList.add("required-error")
        if (regConPassword) regConPassword.classList.add("required-error")

        if (usernameEmpty && regAlr) {
            regAlr.textContent = "❌ Username should not be empty"
        } else if (regAlr && !nameTaken) {
            regAlr.textContent = ""
        }

        if (notMatch && regCon) {
            regCon.textContent = "❌ Passwords do not match."
        } else if (!pwdOk) {
            // validateRegPassword already sets a message
        } else if (regCon) {
            regCon.textContent = ""
        }
        return false
    }

    // All client-side checks passed: submit via AJAX to redirect to recovery setup
    e.preventDefault()

    const payload = {
        username: usernameRaw,
        password: regPassword.value,
        confirm_password: regConPassword.value,
        rememberMe: false
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    fetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify(payload),
        credentials: 'same-origin',
        signal: controller.signal
    }).then(async (res) => {
        clearTimeout(timeout)
        if (res.ok) {
            // server returns JSON { redirect: '/auth/recovery_setup' } on success
            const data = await res.json().catch(() => ({}))
            if (data && data.redirect) {
                window.location.href = data.redirect
                return
            }
            // fallback
            window.location.href = '/'
            return
        }

        // show inline messages, do not redirect
        let text = ''
        try {
            const j = await res.json().catch(() => null)
            if (j && j.error) text = j.error
        } catch (err) { /* ignore */ }
        if (!text) {
            text = await res.text().catch(() => 'Server error')
        }

        if (res.status === 409) {
            if (regAlr) regAlr.textContent = '❌ Already Taken.'
            if (regUsername) regUsername.classList.add('required-error')
        } else if (res.status === 400) {
            if (regCon) regCon.textContent = `❌ ${text}`
            if (regPassword) regPassword.classList.add('required-error')
            if (regConPassword) regConPassword.classList.add('required-error')
            if (regUsername) regUsername.classList.add('required-error')
        } else {
            if (regCon) regCon.textContent = '❌ Server error — try again.'
        }
    }).catch((err) => {
        clearTimeout(timeout)
        if (regCon) regCon.textContent = (err && err.name === 'AbortError') ? '❌ Request timed out.' : '❌ Network error — try again.'
    })

    return false
}

function logValidateContent(e) {
    e.preventDefault()
    if (!logUsername || !logPassword || !logForm) {
        // fallback: submit normally if elements missing
        return logForm && logForm.submit()
    }

    const payload = {
        username: String(logUsername.value || ''),
        password: String(logPassword.value || ''),
        rememberMe: !!(logRememberMe && logRememberMe.checked)
    }

    // basic client-side check
    if (!isValidUsernameClient(payload.username) || !isValidPasswordClient(payload.password)) {
        if (logAlr) logAlr.textContent = "❌ Invalid Credential/s."
        logUsername.classList.add("required-error")
        logPassword.classList.add("required-error")
        return
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    fetch('/auth/validatecredentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
        signal: controller.signal
    }).then(async (res) => {
        clearTimeout(timeout)
        if (res.status === 200) {
            if (logAlr) logAlr.textContent = ""
            // submit the real login form to establish session via /auth/login
            logForm.submit()
            return
        }

        if (res.status === 423) {
            if (logAlr) logAlr.textContent = "❌ Please try again in a few minutes."
            logUsername.classList.add("required-error")
            logPassword.classList.add("required-error")
            return
        }

        if (res.status === 400 || res.status === 401) {
            if (logAlr) logAlr.textContent = "❌ Invalid Credential/s."
            logUsername.classList.add("required-error")
            logPassword.classList.add("required-error")
            return
        }

        if (logAlr) logAlr.textContent = "❌ Network or server error — try again."
    }).catch((err) => {
        clearTimeout(timeout)
        if (logAlr) logAlr.textContent = (err && err.name === 'AbortError') ? '❌ Request timed out.' : "❌ Network or server error — try again."
    })
}

function validateRegPassword() {
    const pwd = (regPassword && regPassword.value || "").trim()
    const conf = (regConPassword && regConPassword.value || "").trim()
    const lengthOk = pwd.length >= PASSWORD_MIN && pwd.length <= PASSWORD_MAX
    const numberOk = /[0-9]/.test(pwd)
    const specialOk = /[!@#%^&*(),.?":{}|<>_\-;'`~+=\/;]/.test(pwd)

    if (!lengthOk || !numberOk || !specialOk || LOGIN_FORBIDDEN_RE.test(pwd)) {
        if (regCon) regCon.textContent = "❌ Password must be at least 8 characters and include a number and a special character (excluding \\ and \$)"
        if (regPassword) regPassword.classList.add("required-error")
        return false
    }

    // if passwords do not match, show that instead
    if (conf !== "" && pwd !== conf) {
        if (regCon) regCon.textContent = "❌ Passwords do not match."
        return false
    }

    if (regCon) regCon.textContent = ""
    if (regPassword) regPassword.classList.remove("required-error")
    return true
}