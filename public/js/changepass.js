const cpForm = document.getElementById('changepass-form')
const msgContainer = document.querySelector('.cp-box')

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

if (cpForm) {
    cpForm.addEventListener('submit', (e) => {
        e.preventDefault()

        const current = cpForm.querySelector('input[name="current_password"]').value || ''
        const nw = cpForm.querySelector('input[name="new_password"]').value || ''
        const conf = cpForm.querySelector('input[name="confirm_password"]').value || ''

        if (!current || !nw || !conf) {
            showMsg('❌ Missing required fields.')
            return
        }
        if (nw !== conf) {
            showMsg('❌ New passwords do not match.')
            return
        }
        if (nw.length < 8 || !/[0-9]/.test(nw) || !/[!@#$%^&*(),.?":{}|<>_\-\\\[\];\'`~+=\/;]/.test(nw)) {
            showMsg('❌ Password must be at least 8 chars, include a number and a special character.')
            return
        }

        const payload = { current_password: current, new_password: nw, confirm_password: conf }

        let xhttp = new XMLHttpRequest()
        xhttp.open('POST', '/changepass', true)
        xhttp.setRequestHeader('Content-type', 'application/json; charset=UTF-8')
        xhttp.setRequestHeader('X-Requested-With', 'XMLHttpRequest')

        xhttp.onreadystatechange = () => {
            if (xhttp.readyState !== 4) return

            if (xhttp.status === 200) {
                showMsg('✅ Password changed successfully.', true)
                cpForm.querySelector('input[name="current_password"]').value = ''
                cpForm.querySelector('input[name="new_password"]').value = ''
                cpForm.querySelector('input[name="confirm_password"]').value = ''
            } else {
                const text = xhttp.responseText || 'Server error'
                showMsg(`❌ ${text}`)
            }
        }

        xhttp.send(JSON.stringify(payload))
    })
}