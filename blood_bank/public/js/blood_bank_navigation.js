(() => {
    const WORKFLOW = [
        { name: "Blood Donor", label: "المتبرع", icon: "👤", route: "blood-donor" },
        { name: "Blood Donation", label: "التبرع", icon: "🩸", route: "blood-donation" },
        { name: "Blood Processing", label: "المعالجة", icon: "⚙️", route: "blood-processing" },
        { name: "Blood Unit", label: "وحدة الدم", icon: "🧪", route: "blood-unit" },
        { name: "Blood Screening", label: "فحص الدم", icon: "🔬", route: "blood-screening" },
        { name: "Blood Component Quality Check", label: "فحص جودة المكوّن", icon: "✅", route: "blood-component-quality-check" },
        { name: "Blood Component", label: "مكوّن الدم", icon: "🧫", route: "blood-component" },
        { name: "Blood Storage", label: "التخزين", icon: "❄️", route: "blood-storage" },
        { name: "Blood Request", label: "طلب الدم", icon: "📋", route: "blood-request" },
        { name: "Blood Reservation", label: "الحجز", icon: "🔒", route: "blood-reservation" },
        { name: "Blood Crossmatch", label: "المطابقة", icon: "🔄", route: "blood-crossmatch" },
        { name: "Blood Issue", label: "صرف الدم", icon: "📦", route: "blood-issue" },
        { name: "Blood Handover", label: "تسليم الدم", icon: "🤝", route: "blood-handover" },
        { name: "Blood Transfusion", label: "نقل الدم", icon: "💉", route: "blood-transfusion" },
        { name: "Blood Unit Disposition", label: "مصير الوحدة", icon: "🗑️", route: "blood-unit-disposition" }
    ];

    function open_windows(frm) {
        const current = frm.doctype;
        const items = WORKFLOW.filter(item => item.name !== current);

        const dialog = new frappe.ui.Dialog({
            title: "نوافذ بنك الدم",
            size: "large",
            fields: [
                {
                    fieldtype: "HTML",
                    fieldname: "windows"
                }
            ]
        });

        const html = `
            <div class="bb-nav-dialog">
                <div class="bb-nav-dialog-title">
                    جميع نوافذ بنك الدم
                </div>

                <div class="bb-nav-grid">
                    ${items.map(item => `
                        <button
                            type="button"
                            class="bb-nav-window-btn"
                            data-route="${item.route}">
                            <span class="bb-nav-window-icon">${item.icon}</span>
                            <span class="bb-nav-window-label">${item.label}</span>
                        </button>
                    `).join("")}
                </div>
            </div>
        `;

        dialog.fields_dict.windows.$wrapper.html(html);

        dialog.fields_dict.windows.$wrapper
            .find(".bb-nav-window-btn")
            .on("click", function () {
                const route = this.dataset.route;
                dialog.hide();
                frappe.set_route(route);
            });

        dialog.show();
    }

    function build_navigation(frm) {
        const wrapper = frm.wrapper;
        if (!wrapper) return;

        const old = wrapper.querySelector(".bb-navigation-root");
        if (old) old.remove();

        const currentIndex = WORKFLOW.findIndex(item => item.name === frm.doctype);
        if (currentIndex === -1) return;

        const previous = WORKFLOW[currentIndex - 1];
        const next = WORKFLOW[currentIndex + 1];

        const root = document.createElement("div");
        root.className = "bb-navigation-root";

        const mainBar = document.createElement("div");
        mainBar.className = "bb-navigation-main";

        const mainButtons = [];

        const addButton = document.createElement("button");
        addButton.className = "bb-nav-main-btn bb-btn-new";
        addButton.innerHTML = "➕ <span>إضافة جديد</span>";
        addButton.onclick = () => frappe.new_doc(frm.doctype);
        mainButtons.push(addButton);

        const prevButton = document.createElement("button");
        prevButton.className = "bb-nav-main-btn bb-btn-prev";
        prevButton.innerHTML = "◀ <span>السابق</span>";
        prevButton.disabled = !previous;
        prevButton.onclick = () => {
            if (previous) frappe.set_route(previous.route);
        };
        mainButtons.push(prevButton);

        const nextButton = document.createElement("button");
        nextButton.className = "bb-nav-main-btn bb-btn-next";
        nextButton.innerHTML = "▶ <span>التالي</span>";
        nextButton.disabled = !next;
        nextButton.onclick = () => {
            if (next) frappe.set_route(next.route);
        };
        mainButtons.push(nextButton);

        const bankButton = document.createElement("button");
        bankButton.className = "bb-nav-main-btn bb-btn-bank";
        bankButton.innerHTML = "🩸 <span>بنك الدم</span>";
        bankButton.onclick = () => frappe.set_route("blood-bank");
        mainButtons.push(bankButton);

        const homeButton = document.createElement("button");
        homeButton.className = "bb-nav-main-btn bb-btn-home";
        homeButton.innerHTML = "⌂ <span>الصفحة الرئيسية</span>";
        homeButton.onclick = () => frappe.set_route("");
        mainButtons.push(homeButton);

        mainButtons.forEach(btn => mainBar.appendChild(btn));

        const windowsBar = document.createElement("div");
        windowsBar.className = "bb-navigation-windows";

        const windowsButton = document.createElement("button");
        windowsButton.className = "bb-nav-windows-btn";
        windowsButton.innerHTML = `
            ☷
            <span>نوافذ بنك الدم</span>
            <b>${WORKFLOW.length - 1}</b>
        `;
        windowsButton.onclick = () => open_windows(frm);

        windowsBar.appendChild(windowsButton);

        root.appendChild(mainBar);
        root.appendChild(windowsBar);

        const target = wrapper.querySelector(".form-layout")
            || wrapper.querySelector(".form-page")
            || wrapper.firstElementChild
            || wrapper;

        target.parentNode.insertBefore(root, target);
    }

    WORKFLOW.forEach(item => {
        frappe.ui.form.on(item.name, {
            refresh(frm) { if (frm.__bb_embedded) return;
                build_navigation(frm);
            },
            onload_post_render(frm) { if (frm.__bb_embedded) return;
                build_navigation(frm);
            }
        });
    });
})();
