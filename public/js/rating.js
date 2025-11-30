const activeClass = "icon icon-md g-star";
const inactiveClass = "icon icon-md g-star-toggle";
const halfClass = "icon icon-md g-star-half";

document.addEventListener('DOMContentLoaded', () => {
    const groups = Array.from(document.querySelectorAll('.cr-star-group'));

    groups.forEach(group => {
        const maxStars = 5;

        // render li elements if not already present
        let lis = Array.from(group.querySelectorAll('li'));
        if (lis.length < maxStars) {
            group.innerHTML = ''; // ensure clean
            for (let i = 0; i < maxStars; i++) {
                const li = document.createElement('li');
                li.dataset.index = String(i);
                li.className = inactiveClass;
                // make li focusable for accessibility
                li.setAttribute('role', 'button');
                li.setAttribute('tabindex', '0');
                group.appendChild(li);
            }
            lis = Array.from(group.querySelectorAll('li'));
        }

        // helper: render given numeric value (can be integer or .5)
        function renderStars(value) {
            const v = Number(value) || 0;
            for (let i = 0; i < maxStars; i++) {
                const li = lis[i];
                const starNum = i + 1;
                if (starNum <= Math.floor(v)) {
                    li.className = activeClass;
                } else if (Math.abs(v - (i + 0.5)) < 0.001) {
                    li.className = halfClass;
                } else {
                    li.className = inactiveClass;
                }
            }
        }

        // initialize from data-stars attribute if present
        const initial = parseFloat(group.getAttribute('data-stars') || '0');
        renderStars(initial);

        // determine associated hidden input (prefer within same form)
        const parentForm = group.closest('form');
        // IMPORTANT: only consider a hidden input when the star group is inside a form.
        // previous code used a global document.querySelector which made non-form/display groups interactive.
        const hiddenInput = parentForm
            ? (parentForm.querySelector('input[name="rv-stars"], input[name="stars"], input[id="cr-star-input"]') || null)
            : null;

        // interactive only when group has 'hov3' class or there's an input in the same form
        const interactive = group.classList.contains('hov3') || !!hiddenInput;

        if (!interactive) {
            // nothing more to do for display-only groups
            return;
        }

        // update the hidden input and data-stars attribute
        function setValue(val) {
            const n = Number(val) || 0;
            group.setAttribute('data-stars', String(n));
            if (hiddenInput) {
                hiddenInput.value = String(n);
                hiddenInput.setAttribute('value', String(n));
            }
            renderStars(n);
        }

        // attach click and keyboard handlers to each li
        lis.forEach((li, idx) => {
            li.addEventListener('click', (e) => {
                const rect = li.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const half = (clickX < rect.width / 2) ? 0.5 : 1;
                const value = idx + half;
                setValue(value);
            });

            // keyboard support: Enter -> full, Space -> toggle half/full based on current
            li.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const current = parseFloat(group.getAttribute('data-stars') || '0') || 0;
                    // toggle: if current equals this full, remove; else if it's this half, make full; else set half
                    const full = idx + 1;
                    const halfVal = idx + 0.5;
                    if (Math.abs(current - full) < 0.001) {
                        // clicking already-full -> remove
                        setValue(0);
                    } else if (Math.abs(current - halfVal) < 0.001) {
                        setValue(full);
                    } else {
                        setValue(halfVal);
                    }
                }
            });

            // hover preview (optional): show preview while moving mouse
            li.addEventListener('mousemove', (e) => {
                const rect = li.getBoundingClientRect();
                const hoverX = e.clientX - rect.left;
                const half = (hoverX < rect.width / 2) ? 0.5 : 1;
                renderStars(idx + half);
            });
            // restore display when leaving
            li.addEventListener('mouseleave', () => {
                const cur = parseFloat(group.getAttribute('data-stars') || '0') || 0;
                renderStars(cur);
            });
        });

        // expose setValue to external code by storing on element (if needed)
        group.setValue = setValue;
    });
});