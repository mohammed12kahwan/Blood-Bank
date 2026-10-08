(() => {
    const LABEL = "عمل موظف بنك الدم";
    const CLASS_NAME = "bb-blood-bank-shortcut";

    function enhance_shortcut() {
        document.querySelectorAll(".shortcut-widget-box").forEach((widget) => {
            const title = widget.querySelector(".widget-title");
            if (!title) return;

            const text = title.textContent.trim();
            if (!text.includes(LABEL)) return;

            widget.classList.add(CLASS_NAME);

            let icon = widget.querySelector(".bb-shortcut-icon");
            if (!icon) {
                icon = document.createElement("span");
                icon.className = "bb-shortcut-icon";
                icon.textContent = "🩸";
                title.prepend(icon);
            }

            let badge = widget.querySelector(".bb-shortcut-alert");
            if (!badge) {
                badge = document.createElement("span");
                badge.className = "bb-shortcut-alert";
                badge.textContent = "0";
                title.appendChild(badge);
            }

            if (!widget.dataset.bbCountLoaded) {
                widget.dataset.bbCountLoaded = "1";

                frappe.db.count("Blood Request", {
                    filters: {
                        docstatus: 0
                    }
                }).then((count) => {
                    badge.textContent = Number(count || 0).toLocaleString("en-US");
                    badge.style.display = "inline-flex";
                }).catch(() => {
                    badge.style.display = "none";
                });
            }
        });
    }

    function start() {
        enhance_shortcut();

        const observer = new MutationObserver(() => {
            enhance_shortcut();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        setInterval(enhance_shortcut, 3000);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();
