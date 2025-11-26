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

if (regUsername) {
    regUsername.addEventListener("keyup", () => {
        let xhttp = new XMLHttpRequest()
        xhttp.open("POST", `/auth/nametaken`, true)
        xhttp.setRequestHeader("Content-type", "application/json; charset=UTF-8")

        xhttp.onreadystatechange = () => {
            if (xhttp.readyState != 4) {
                return
            }

            if (xhttp.status == 200) {
                regAlr.textContent = ""
            } else {
                regAlr.textContent = "❌ Already Taken."
            }
        }

        xhttp.send(JSON.stringify({ "username": regUsername.value, }))
        resetReg()
    })
}

if (regPassword) regPassword.addEventListener("keyup", () => { resetReg(); validateRegPassword(); })
if (regConPassword) regConPassword.addEventListener("keyup", () => { resetReg(); validateRegPassword(); })
if (logUsername) logUsername.addEventListener("keyup", resetLog)
if (logPassword) logPassword.addEventListener("keyup", resetLog)

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

function regValidateContent(e) {
    // ensure we check password rules first so message is set
    const pwdOk = validateRegPassword()
    const usernamesEmpty = !regUsername || regUsername.value.trim() == ""
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
        username: regUsername.value.trim(),
        password: regPassword.value,
        confirm_password: regConPassword.value,
        rememberMe: false
    }

    fetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'same-origin'
    }).then(async (res) => {
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
        const text = await res.text().catch(() => 'Server error')

        if (res.status === 409) {
            if (regAlr) regAlr.textContent = '❌ Already Taken.'
            if (regUsername) regUsername.classList.add('required-error')
        } else if (res.status === 400) {
            if (regCon) regCon.textContent = `❌ ${text}`
            regPassword.classList.add('required-error')
            regConPassword.classList.add('required-error')
            regUsername.classList.add('required-error')
        } else {
            if (regCon) regCon.textContent = '❌ Server error — try again.'
        }
    }).catch(() => {
        if (regCon) regCon.textContent = '❌ Network error — try again.'
    })

    return false
}

function logValidateContent(e) {
    e.preventDefault()
    if (!logUsername || !logPassword || !logForm) {
        // fallback: submit normally if elements missing
        return logForm && logForm.submit()
    }

    let xhttp = new XMLHttpRequest()
    xhttp.open("POST", `/auth/validatecredentials`, true)
    xhttp.setRequestHeader("Content-type", "application/json; charset=UTF-8")
    xhttp.withCredentials = true

    xhttp.onreadystatechange = () => {
        if (xhttp.readyState != 4) {
            return
        }

        // success -> proceed to actual login
        if (xhttp.status === 200) {
            if (logAlr) logAlr.textContent = ""
            // submit the real login form to establish session via /auth/login
            logForm.submit()
            return
        }

        // locked out -> generic message (do NOT show exact time)
        if (xhttp.status === 423) {
            if (logAlr) logAlr.textContent = "❌ Please try again in a few minutes."
            logUsername.classList.add("required-error")
            logPassword.classList.add("required-error")
            return
        }

        // other client errors -> invalid credentials
        if (xhttp.status === 400 || xhttp.status === 401) {
            if (logAlr) logAlr.textContent = "❌ Invalid Credential/s."
            logUsername.classList.add("required-error")
            logPassword.classList.add("required-error")
            return
        }

        // fallback for server/network errors
        if (logAlr) logAlr.textContent = "❌ Network or server error — try again."
    }

    xhttp.send(JSON.stringify({
        "username": logUsername.value,
        "password": logPassword.value,
        "rememberMe": logRememberMe && logRememberMe.checked
    }))

}

function validateRegPassword() {
    const pwd = (regPassword && regPassword.value || "").trim()
    const conf = (regConPassword && regConPassword.value || "").trim()
    const lengthOk = pwd.length >= 8
    const numberOk = /[0-9]/.test(pwd)
    const specialOk = /[!@#$%^&*(),.?":{}|<>_\-\\\[\];'`~+=\/;]/.test(pwd)

    if (!lengthOk || !numberOk || !specialOk) {
        if (regCon) regCon.textContent = "❌ Password must be at least 8 characters and include a number and a special character."
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