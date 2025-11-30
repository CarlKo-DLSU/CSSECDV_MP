const name = document.getElementById('edit-name')
const desc = document.getElementById('edit-description')
const avatar = document.getElementById('edit-avatar')
const msg = document.getElementById('edit-msg')
const cancel = document.getElementById('edit-cancel')
const save = document.getElementById('edit-save')
const imgShown = document.getElementById('edit-avatar-img')
const img = document.getElementById('lor-user-avatar-link')
const form = document.getElementById('edit-form')

// store original name so we can allow unchanged-name saves
const originalName = name ? String(name.value || '') : ''

const EDITPROFILENAME_FORBIDDEN_RE = /[\x00-\x20\x7F\\\$\[\]]/
const EDITPROFILEDESC_FORBIDDEN_RE = /[\x00-\x1F\x7F\\\$\[\]]/
const submitInput = document.getElementById('edit-submit') // actual submit input

function emptyMsg() {
    if (msg) msg.innerHTML = ""
}

// guard listeners in case elements are missing
if (name) name.addEventListener('focus', emptyMsg)
if (desc) desc.addEventListener('focus', emptyMsg)
if (avatar) avatar.addEventListener('change', () => {
    if (!form || !imgShown) return
    const data = new FormData(form)
    const newAvatar = URL.createObjectURL(data.get("avatar"))
    imgShown.setAttribute("src", newAvatar)
})

if (form) {
    form.addEventListener("submit", (e) => {
        const rawName = name ? String(name.value || '') : ''
        const rawDesc = desc ? String(desc.value || '') : ''
        if (EDITPROFILENAME_FORBIDDEN_RE.test(rawName) || EDITPROFILEDESC_FORBIDDEN_RE.test(rawDesc)) {
           e.preventDefault()
            if (msg) msg.innerHTML = "❌ Invalid character detected in field/s"
            if (name && EDITPROFILEDESC_FORBIDDEN_RE.test(rawName)) name.classList.add("required-error")
            if (desc && EDITPROFILEDESC_FORBIDDEN_RE.test(rawDesc)) desc.classList.add("required-error")
            if (submitInput) submitInput.disabled = true
            return
        }

        e.preventDefault()
        if (!name) return

        // basic client-side empty-name guard
        if (name.value === "") {
            name.classList.add("required-error")
            if (msg) msg.innerHTML = ""
            return
        } else {
            name.classList.remove("required-error")
        }

        const data = new FormData(form)

        // if username unchanged, skip nametaken check and submit directly
        const trimmed = String(name.value || '').trim()
        if (trimmed === String(originalName || '').trim()) {
            // submit update immediately
            let send = new XMLHttpRequest()
            send.onreadystatechange = () => {
                if (send.readyState != 4) {
                    return
                }

                if (send.status == 200) {
                    if (msg) msg.innerHTML = "✅ Profile Saved."
                    if (img) img.setAttribute("href", `/profile/id/${name.value}`)
                    if (cancel) cancel.setAttribute("href", `/profile/id/${name.value}`)
                } else {
                    if (msg) msg.innerHTML = "❌ Failed to update. Please Try Again."
                }
            }

            send.open("POST", `/edit/profile`, true)
            send.send(data)
            return
        }

        // otherwise check name availability first (send JSON with appropriate header)
        let xhttp = new XMLHttpRequest()
        xhttp.open("POST", `/auth/nametaken`, true)
        xhttp.setRequestHeader('Content-Type', 'application/json; charset=UTF-8')

        xhttp.onreadystatechange = () => {
            if (xhttp.readyState != 4) {
                return
            }

            if (xhttp.status == 200) {
                // name available -> proceed to send the multipart form
                let send = new XMLHttpRequest()
                send.onreadystatechange = () => {
                    if (send.readyState != 4) {
                        return
                    }

                    if (send.status == 200) {
                        if (msg) msg.innerHTML = "✅ Profile Saved."
                        if (img) img.setAttribute("href", `/profile/id/${name.value}`)
                        if (cancel) cancel.setAttribute("href", `/profile/id/${name.value}`)
                    } else {
                        if (msg) msg.innerHTML = "❌ Failed to update. Please Try Again."
                    }
                }

                send.open("POST", `/edit/profile`, true)
                send.send(data)
            } else if (xhttp.status == 409) {
                if (msg) msg.innerHTML = "❌ Name Already Taken."
            } else {
                // treat other errors as invalid username or server error
                if (msg) msg.innerHTML = "❌ Invalid username or server error."
            }
        }

        try {
            xhttp.send(JSON.stringify({ "username": name.value }))
        } catch (err) {
            if (msg) msg.innerHTML = "❌ Network error — try again."
        }
    })
}

if (name) {
    name.addEventListener('input', () => {
        const raw = String(name.value || '')
        const rawDesc = desc ? String(desc.value || '') : ''
        if (EDITPROFILENAME_FORBIDDEN_RE.test(raw) || EDITPROFILEDESC_FORBIDDEN_RE.test(rawDesc)) {
            if (msg) msg.innerHTML = "❌ Invalid character detected in field/s"
            if (name && EDITPROFILENAME_FORBIDDEN_RE.test(raw)) name.classList.add('required-error')
            if (desc && EDITPROFILEDESC_FORBIDDEN_RE.test(rawDesc)) desc.classList.add('required-error')
            if (submitInput) submitInput.disabled = true
        } else {
            if (msg) msg.innerHTML = ""
            if (name) name.classList.remove('required-error')
            if (desc) desc.classList.remove('required-error')
            if (submitInput) submitInput.disabled = false
        }
    })
}

if (desc) {
    desc.addEventListener('input', () => {
        const raw = String(desc.value || '')
        const rawName = name ? String(name.value || '') : ''
        if (EDITPROFILEDESC_FORBIDDEN_RE.test(raw) || EDITPROFILENAME_FORBIDDEN_RE.test(rawName)) {
            if (msg) msg.innerHTML = "❌ Invalid character detected in field/s"
            if (desc && EDITPROFILEDESC_FORBIDDEN_RE.test(raw)) desc.classList.add('required-error')
            if (name && EDITPROFILENAME_FORBIDDEN_RE.test(rawName)) name.classList.add('required-error')
            if (submitInput) submitInput.disabled = true
        } else {
           if (msg) msg.innerHTML = ""
            if (desc) desc.classList.remove('required-error')
            if (name) name.classList.remove('required-error')
            if (submitInput) submitInput.disabled = false
        }
    })
}