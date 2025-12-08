document.addEventListener('DOMContentLoaded', function () {
    // Client-side validation for admin create forms
    const USERNAME_MAX = 31
    const PASSWORD_MIN = 8
    const PASSWORD_MAX = 31
    const FORBIDDEN_RE = /[\x00-\x1F\x7F\\\$\[\]]/

    // Get all admin create forms
    const managerForm = document.getElementById('admin-create-manager-form')
    const adminForm = document.getElementById('admin-create-admin-form')

    function setupFormValidation(form) {
        if (!form) return

        const usernameInput = form.querySelector('.admin-username-input')
        const passwordInput = form.querySelector('.admin-password-input')
        const usernameErr = form.querySelector('.admin-username-err')
        const passwordErr = form.querySelector('.admin-password-err')
        const submitBtn = form.querySelector('button[type="submit"]')

        if (usernameInput) usernameInput.setAttribute('maxlength', USERNAME_MAX)
        if (passwordInput) passwordInput.setAttribute('maxlength', PASSWORD_MAX)

        // Real-time username validation
        if (usernameInput) {
            usernameInput.addEventListener('input', () => {
                const raw = String(usernameInput.value || '')
                
                if (raw.length == USERNAME_MAX) {
                    usernameInput.classList.add('required-error')
                    if (usernameErr) usernameErr.textContent = `❌ Username must be ${USERNAME_MAX-1} characters or less.`
                    if (submitBtn) submitBtn.disabled = true
                    return
                }
                
                if (FORBIDDEN_RE.test(raw)) {
                    usernameInput.classList.add('required-error')
                    if (usernameErr) usernameErr.textContent = '❌ Username contains invalid characters.'
                    if (submitBtn) submitBtn.disabled = true
                    return
                }
                
                usernameInput.classList.remove('required-error')
                if (usernameErr) usernameErr.textContent = ''
                if (submitBtn) submitBtn.disabled = false
            })
        }

        // Real-time password validation
        if (passwordInput) {
            passwordInput.addEventListener('input', () => {
                const rawPwd = passwordInput.value || ''
                const pwd = rawPwd.trim()
                
                if (rawPwd.length < PASSWORD_MIN) {
                    passwordInput.classList.add('required-error')
                    if (passwordErr) passwordErr.textContent = `❌ Password must be at least ${PASSWORD_MIN} characters long.`
                    if (submitBtn) submitBtn.disabled = true
                    return
                }
                
                if (rawPwd.length == PASSWORD_MAX) {
                    passwordInput.classList.add('required-error')
                    if (passwordErr) passwordErr.textContent = `❌ Password must be ${PASSWORD_MAX-1} characters or less.`
                    if (submitBtn) submitBtn.disabled = true
                    return
                }
                
                if (!/[0-9]/.test(pwd)) {
                    passwordInput.classList.add('required-error')
                    if (passwordErr) passwordErr.textContent = '❌ Password must include at least one number.'
                    if (submitBtn) submitBtn.disabled = true
                    return
                }
                
                if (!/[!@#%^&*(),.?":{}|<>_\-;\'`~+=\/;]/.test(pwd)) {
                    passwordInput.classList.add('required-error')
                    if (passwordErr) passwordErr.textContent = '❌ Password must include at least one special character.'
                    if (submitBtn) submitBtn.disabled = true
                    return
                }
                
                if (FORBIDDEN_RE.test(pwd)) {
                    passwordInput.classList.add('required-error')
                    if (passwordErr) passwordErr.textContent = '❌ Password contains invalid characters (\\ and $ not allowed)'
                    if (submitBtn) submitBtn.disabled = true
                    return
                }
                
                passwordInput.classList.remove('required-error')
                if (passwordErr) passwordErr.textContent = ''
                if (submitBtn) submitBtn.disabled = false
            })
        }

        // Form submission validation
        form.addEventListener('submit', (e) => {
            const usernameVal = usernameInput ? usernameInput.value.trim() : ''
            const passwordVal = passwordInput ? passwordInput.value : ''
            
            let valid = true
            
            if (!usernameVal) {
                if (usernameErr) usernameErr.textContent = '❌ Please enter a username.'
                usernameInput.classList.add('required-error')
                valid = false
            }
            
            if (!passwordVal) {
                if (passwordErr) passwordErr.textContent = '❌ Please enter a password.'
                passwordInput.classList.add('required-error')
                valid = false
            }
            
            if (!valid) {
                e.preventDefault()
            }
        })
    }

    // Setup validation for both forms
    setupFormValidation(managerForm)
    setupFormValidation(adminForm)
})
