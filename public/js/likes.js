const likeOn = "pro-toggle-like"
const dislikeOn = "pro-toggle-dislike"

function selectVote(form, value) {
    const [likeButton, dislikeButton] = form.getElementsByTagName("label")

    if (!likeButton || !dislikeButton) return

    if (value === "like") {
        likeButton.classList.add(likeOn)
        dislikeButton.classList.remove(dislikeOn)
    } else if (value === "dislike") {
        likeButton.classList.remove(likeOn)
        dislikeButton.classList.add(dislikeOn)
    } else {
        // remove both
        likeButton.classList.remove(likeOn)
        dislikeButton.classList.remove(dislikeOn)
    }

    // persist state on the form
    form.setAttribute("data-state", value || "")
}

function castVote(id, vote, el) {
    const xhttp = new XMLHttpRequest()
    xhttp.open("POST", "/review/vote", true) 
    xhttp.setRequestHeader("Content-type", "application/json; charset=UTF-8")
    xhttp.onreadystatechange = () => {
        if (xhttp.readyState != 4) return

        if (xhttp.status == 200) {
            // server returns a simple count (text/number)
            try {
                el.innerText = xhttp.responseText
            } catch (e) {
                el.innerText = xhttp.responseText
            }
        } else {
            console.log("Server side error!", xhttp.status, xhttp.responseText)
        }
    }

    xhttp.send(JSON.stringify({
        "id": id,
        "vote": vote // "like", "dislike", or "remove"
    }))
}


window.onload = function() {
    const forms = Array.from(document.getElementsByClassName('vote-form'))

    const xhttp = new XMLHttpRequest()
    xhttp.open("GET", "/auth/authorized", true)
    xhttp.onreadystatechange = () => {
        if (xhttp.readyState != 4) {
            return
        }

        for (let i = 0; i < forms.length; i++) {
            const form = forms[i]
            const inputs = form.querySelectorAll("input[name='vote']")
            const countEl = form.getElementsByClassName("pro-like-count")[0]
            const revId = form.getAttribute("data-review")
            const [likeLabel, dislikeLabel] = form.getElementsByTagName("label")

            if (xhttp.status == 200) {
                if (likeLabel) {
                    likeLabel.addEventListener("click", (e) => {
                        e.preventDefault()
                        const currentStateNow = form.getAttribute("data-state") || ""
                        if (currentStateNow === "like") {
                            // remove existing like
                            selectVote(form, null)
                            castVote(revId, "remove", countEl)
                        } else {
                            selectVote(form, "like")
                            castVote(revId, "like", countEl)
                        }
                    })
                }
                if (dislikeLabel) {
                    dislikeLabel.addEventListener("click", (e) => {
                        e.preventDefault()
                        const currentStateNow = form.getAttribute("data-state") || ""
                        if (currentStateNow === "dislike") {
                            // remove existing dislike
                            selectVote(form, null)
                            castVote(revId, "remove", countEl)
                        } else {
                            selectVote(form, "dislike")
                            castVote(revId, "dislike", countEl)
                        }
                    })
                }
            } else {
                inputs.forEach(input => setUpPopup(input, lor_container))
            }
        }
    }

    xhttp.send()

    forms.forEach(f => {
        selectVote(f, f.getAttribute("data-state"))    
    })
}