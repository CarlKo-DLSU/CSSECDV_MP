document.addEventListener('DOMContentLoaded', function () {
    // Client-side validation for manager forms
    const DESCRIPTION_MAX = 300
    const FORBIDDEN_RE = /[\x00-\x1F\x7F\\\$\[\]]/

    // Get all manager forms
    const editUserForm = document.getElementById('manager-edit-user-form')
    const addRestoForm = document.getElementById('manager-add-restaurant-form')

    function setupFormValidation(form) {
        if (!form) return

        const descriptionInputs = form.querySelectorAll('.manager-description-input')
        const descriptionErr = form.querySelector('.manager-description-err')
        const submitBtn = form.querySelector('button[type="submit"]')

        // Real-time description validation for each textarea
        descriptionInputs.forEach((descInput) => {
            if (descInput) {
                descInput.addEventListener('input', () => {
                    const raw = String(descInput.value || '')

                    if (raw.length > DESCRIPTION_MAX) {
                        descInput.classList.add('required-error')
                        if (descriptionErr) descriptionErr.textContent = `❌ Description must be ${DESCRIPTION_MAX} characters or less.`
                        if (submitBtn) submitBtn.disabled = true
                        return
                    }

                    if (FORBIDDEN_RE.test(raw)) {
                        descInput.classList.add('required-error')
                        if (descriptionErr) descriptionErr.textContent = '❌ Description contains invalid characters.'
                        if (submitBtn) submitBtn.disabled = true
                        return
                    }

                    descInput.classList.remove('required-error')
                    if (descriptionErr) descriptionErr.textContent = ''
                    if (submitBtn) submitBtn.disabled = false
                })
            }
        })

        // Form submission validation
        form.addEventListener('submit', (e) => {
            let valid = true
            let errorMsg = ''

            descriptionInputs.forEach((descInput) => {
                const raw = String(descInput.value || '')

                if (raw.length > DESCRIPTION_MAX) {
                    descInput.classList.add('required-error')
                    if (descriptionErr) descriptionErr.textContent = `❌ Description must be ${DESCRIPTION_MAX} characters or less.`
                    valid = false
                }

                if (FORBIDDEN_RE.test(raw)) {
                    descInput.classList.add('required-error')
                    if (descriptionErr) descriptionErr.textContent = '❌ Description contains invalid characters.'
                    valid = false
                }
            })

            if (!valid) {
                e.preventDefault()
            }
        })
    }

    // Setup validation for both forms
    setupFormValidation(editUserForm)
    setupFormValidation(addRestoForm)
})
