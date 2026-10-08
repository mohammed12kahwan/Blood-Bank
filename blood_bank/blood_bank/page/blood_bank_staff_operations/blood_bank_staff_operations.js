frappe.pages["blood-bank-staff-operations"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("عمل موظف بنك الدم"),
        single_column: true,
    });

    $(frappe.render_template("blood_bank_staff_operations")).appendTo(
        page.body.addClass("no-border")
    );

    const body = $(page.body);
    const frame = body.find("#bb-staff-frame");

    const WORKFLOW = [
        { doctype: "Blood Donor", route: "blood-donor", label: "المتبرع" },
        { doctype: "Blood Donation", route: "blood-donation", label: "التبرع" },
        { doctype: "Blood Processing", route: "blood-processing", label: "المعالجة" },
        { doctype: "Blood Unit", route: "blood-unit", label: "وحدة الدم" },
        { doctype: "Blood Screening", route: "blood-screening", label: "الفحص" },
        { doctype: "Blood Component Quality Check", route: "blood-component-quality-check", label: "جودة المكوّن" },
        { doctype: "Blood Component", route: "blood-component", label: "المكوّن" },
        { doctype: "Blood Storage", route: "blood-storage", label: "التخزين" },
        { doctype: "Blood Request", route: "blood-request", label: "طلب الدم" },
        { doctype: "Blood Reservation", route: "blood-reservation", label: "الحجز" },
        { doctype: "Blood Crossmatch", route: "blood-crossmatch", label: "المطابقة" },
        { doctype: "Blood Issue", route: "blood-issue", label: "الصرف" },
        { doctype: "Blood Handover", route: "blood-handover", label: "التسليم" },
        { doctype: "Blood Transfusion", route: "blood-transfusion", label: "نقل الدم" },
        { doctype: "Blood Unit Disposition", route: "blood-unit-disposition", label: "مصير الوحدة" }
    ];

    let pending_transfer = null;
    let bind_timer = null;

    function current_item() {
        const route = body.find(".bb-window.active").attr("data-route");
        return WORKFLOW.find(x => x.route === route);
    }

    function next_item(doctype) {
        const i = WORKFLOW.findIndex(x => x.doctype === doctype);
        return i >= 0 ? WORKFLOW[i + 1] : null;
    }

    function transfer_data(from_doctype, doc) {
        if (from_doctype === "Blood Donor") {
            return {
                donor: doc.name || "",
                donor_name: doc.full_name || ""
            };
        }

        if (from_doctype === "Blood Donation") {
            let processing_type = "";

            if (doc.donation_type === "Whole Blood") {
                processing_type = "Whole Blood Processing";
            } else if (doc.donation_type === "Apheresis") {
                processing_type = "Apheresis Processing";
            } else if (doc.donation_type === "Other") {
                processing_type = "Other";
            }

            return {
                donor: doc.donor || "",
                donor_name: doc.donor_name || "",
                bag_number: doc.bag_number || "",
                processing_date: doc.donation_date || "",
                processing_type: processing_type
            };
        }

        if (from_doctype === "Blood Processing") {
            let unit_type = "";

            if (doc.processing_type === "Whole Blood Processing") {
                unit_type = "Whole Blood";
            } else if (doc.processing_type === "Apheresis Processing") {
                unit_type = "Apheresis";
            } else if (doc.processing_type === "Other") {
                unit_type = "Other";
            }

            return {
                donor: doc.donor || "",
                donor_name: doc.donor_name || "",
                blood_group: doc.blood_group || "",
                bag_number: doc.bag_number || "",
                unit_type: unit_type
            };
        }

        if (from_doctype === "Blood Unit") {
            return {
                blood_unit: doc.name || "",
                donor: doc.donor || "",
                donor_name: doc.donor_name || "",
                blood_group: doc.blood_group || "",
                bag_number: doc.bag_number || "",
                screening_date: doc.donation_date || ""
            };
        }

        return {};
    }

    function apply_transfer(frm) {
        if (!pending_transfer || pending_transfer.to_doctype !== frm.doctype) {
            return;
        }

        const data = pending_transfer.data || {};
        pending_transfer = null;

        Object.keys(data).forEach(fieldname => {
            if (frm.fields_dict[fieldname]) {
                frm.set_value(fieldname, data[fieldname]);
            }
        });
    }

    function bind_child_form() {
        clearTimeout(bind_timer);

        try {
            const child = frame[0]?.contentWindow;
            const frm = child?.cur_frm;

            if (!child || !child.frappe || !frm || !frm.doctype) {
                bind_timer = setTimeout(bind_child_form, 250);
                return;
            }

            if (frm.__bb_staff_flow_bound) {
                apply_transfer(frm);
                return;
            }

            frm.__bb_staff_flow_bound = true;

            child.frappe.ui.form.on(frm.doctype, {
                before_save(saved_frm) {
                    if (saved_frm.doctype === "Blood Unit") {
                        saved_frm.set_value("unit_status", "Quarantine");
                    }
                },

                after_save(saved_frm) {
                    if (saved_frm !== frm) {
                        return;
                    }

                    const next = next_item(saved_frm.doctype);

                    if (!next) {
                        return;
                    }

                    pending_transfer = {
                        from_doctype: saved_frm.doctype,
                        to_doctype: next.doctype,
                        data: transfer_data(saved_frm.doctype, saved_frm.doc)
                    };

                    body.find(".bb-window").removeClass("active");

                    const next_button = body
                        .find(`.bb-window[data-route="${next.route}"]`);

                    next_button.addClass("active");

                    body.find(".bb-staff-current-title").text(next.label);

                    frame.attr("src", `/app/${next.route}/new`);
                }
            });

            apply_transfer(frm);

        } catch (e) {
            console.warn("Blood Bank staff flow:", e);
            bind_timer = setTimeout(bind_child_form, 250);
        }
    }

    frame.on("load.bbflow", function () {
        bind_child_form();
    });

    body.on("click", ".bb-window", function () {
        const btn = $(this);
        const route = btn.attr("data-route");

        if (!route) {
            return;
        }

        body.find(".bb-window").removeClass("active");
        btn.addClass("active");

        const item = WORKFLOW.find(x => x.route === route);

        if (item) {
            body.find(".bb-staff-current-title").text(item.label);
        }

        pending_transfer = null;

        body.find(".bb-dashboard").hide();
        body.find(".bb-staff-workspace").show();

        frame.attr("src", `/app/${route}/new`);
    });

    function set_count(id, value) {
        body.find(id).text(Number(value || 0).toLocaleString("en-US"));
    }

    frappe.call({
        method: "blood_bank.blood_bank.page.blood_bank_staff_operations.blood_bank_staff_operations.get_dashboard_data",
        callback: function (r) {
            const d = r.message || {};

            set_count("#bb-count-donors", d.donors);
            set_count("#bb-count-donations", d.donations);
            set_count("#bb-count-units", d.units);
            set_count("#bb-count-requests", d.requests);
            set_count("#bb-count-reservations", d.reservations);
            set_count("#bb-count-issues", d.issues);
            set_count("#bb-count-transfusions", d.transfusions);

            body.find("#bb-dashboard-time").text(d.system_time || "--");
        }
    });
};

/* Hide the real Frappe desk toolbar inside every embedded Blood Bank window */
(function () {
    function hide_toolbar() {
        const frame = document.querySelector("#bb-staff-frame");
        if (!frame) return;

        try {
            const win = frame.contentWindow;
            const doc = frame.contentDocument;

            if (!win || !doc || !doc.head) return;

            /* Prevent the hidden toolbar from reserving vertical space */
            doc.documentElement.style.setProperty("--navbar-height", "0px", "important");

            let style = doc.getElementById("bb-hide-real-toolbar");

            if (!style) {
                style = doc.createElement("style");
                style.id = "bb-hide-real-toolbar";
                style.textContent = `
                    header.navbar.navbar-expand,
                    header.navbar.navbar-expand[role="navigation"],
                    body > header.navbar,
                    body > nav.navbar {
                        display: none !important;
                        visibility: hidden !important;
                        height: 0 !important;
                        min-height: 0 !important;
                        max-height: 0 !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        overflow: hidden !important;
                    }

                    .page-head {
                        display: flex !important;
                        visibility: visible !important;
                    }
                `;
                doc.head.appendChild(style);
            }

            const toolbar = doc.querySelector(
                'header.navbar.navbar-expand[role="navigation"]'
            ) || doc.querySelector("header.navbar.navbar-expand")
              || doc.querySelector("body > header.navbar")
              || doc.querySelector("body > nav.navbar");

            if (toolbar) {
                toolbar.style.setProperty("display", "none", "important");
                toolbar.style.setProperty("visibility", "hidden", "important");
                toolbar.style.setProperty("height", "0", "important");
                toolbar.style.setProperty("min-height", "0", "important");
                toolbar.style.setProperty("max-height", "0", "important");
                toolbar.style.setProperty("margin", "0", "important");
                toolbar.style.setProperty("padding", "0", "important");
            }

            if (!frame.__bb_toolbar_observer) {
                frame.__bb_toolbar_observer = new MutationObserver(function () {
                    const el =
                        doc.querySelector('header.navbar.navbar-expand[role="navigation"]') ||
                        doc.querySelector("header.navbar.navbar-expand") ||
                        doc.querySelector("body > header.navbar") ||
                        doc.querySelector("body > nav.navbar");

                    if (el) {
                        el.style.setProperty("display", "none", "important");
                        el.style.setProperty("visibility", "hidden", "important");
                        el.style.setProperty("height", "0", "important");
                    }
                });

                frame.__bb_toolbar_observer.observe(doc.documentElement, {
                    childList: true,
                    subtree: true
                });
            }

            if (!frame.__bb_toolbar_interval) {
                frame.__bb_toolbar_interval = setInterval(hide_toolbar, 500);
            }

        } catch (e) {
            console.warn("Blood Bank toolbar hide:", e);
        }
    }

    document.addEventListener("DOMContentLoaded", function () {
        const frame = document.querySelector("#bb-staff-frame");

        if (frame) {
            frame.addEventListener("load", function () {
                setTimeout(hide_toolbar, 100);
                setTimeout(hide_toolbar, 500);
                setTimeout(hide_toolbar, 1000);
                setTimeout(hide_toolbar, 2000);
            });
        }

        hide_toolbar();
    });

    setTimeout(hide_toolbar, 500);
    setTimeout(hide_toolbar, 1500);
    setTimeout(hide_toolbar, 3000);
})();


/* ============================================================
   GLOBAL STAFF OPERATIONS DROPDOWN FIX
   Applies to every Frappe form opened inside the Staff iframe.

   Goal:
   - Dropdown appears OUTSIDE section/card/table boundaries.
   - Dropdown does NOT change form height.
   - Native Frappe Link/Awesomeplete behavior is preserved.
   - Applies to ALL Blood Bank windows.
   ============================================================ */

(function () {

    function install_dropdown_fix(frame) {

        if (!frame) {
            return;
        }

        try {

            const win = frame.contentWindow;
            const doc = frame.contentDocument;

            if (!win || !doc || !doc.head) {
                return;
            }

            /* ------------------------------------------------
               GLOBAL OVERFLOW
               ------------------------------------------------ */

            let style =
                doc.getElementById(
                    "bb-staff-global-dropdown-style"
                );

            if (!style) {

                style =
                    doc.createElement("style");

                style.id =
                    "bb-staff-global-dropdown-style";

                style.textContent = `

                    html,
                    body,
                    .page-container,
                    .layout-main,
                    .layout-main-section,
                    .layout-main-section-wrapper,
                    .form-page,
                    .form-page-body,
                    .form-layout,
                    .form-layout .form-section,
                    .form-layout .section-body,
                    .form-layout .form-column,
                    .form-layout .frappe-control,
                    .form-layout .control-input,
                    .form-layout .control-input-wrapper,
                    .awesomplete {
                        overflow: visible !important;
                    }

                    /*
                     * Native Frappe Link dropdown
                     */
                    .awesomplete > ul {

                        z-index: 2147483647 !important;

                        max-height: 280px !important;

                        overflow-y: auto !important;

                        box-sizing: border-box !important;

                        margin-top: 2px !important;
                    }

                    /*
                     * Other Frappe/Bootstrap dropdowns
                     */
                    .link-autocomplete,
                    .dropdown-menu,
                    .form-select-options {
                        z-index: 2147483647 !important;
                    }

                    /*
                     * Never allow dropdown contents to
                     * enlarge the form section.
                     */
                    .awesomplete > ul {
                        height: auto !important;
                        min-height: 0 !important;
                    }
                `;

                doc.head.appendChild(style);
            }


            /* ------------------------------------------------
               PORTAL Frappe AWESOMEPLATE MENUS TO BODY
               This is the important part: the menu leaves
               the field/card container completely.
               ------------------------------------------------ */

            function portal_menus() {

                const menus =
                    Array.from(
                        doc.querySelectorAll(
                            ".awesomplete > ul"
                        )
                    );

                menus.forEach(function (menu) {

                    let anchor =
                        menu.__bb_anchor || null;

                    if (!anchor) {

                        const aw =
                            menu.parentElement;

                        if (aw) {

                            anchor =
                                aw.querySelector(
                                    "input"
                                );
                        }
                    }

                    if (!anchor) {
                        return;
                    }

                    menu.__bb_anchor =
                        anchor;

                    /*
                     * Move the native Frappe list
                     * outside the field/card DOM tree.
                     */
                    if (
                        menu.parentElement !==
                        doc.body
                    ) {
                        doc.body.appendChild(menu);
                    }

                    menu.style.setProperty(
                        "position",
                        "absolute",
                        "important"
                    );

                    menu.style.setProperty(
                        "z-index",
                        "2147483647",
                        "important"
                    );

                    function align_menu() {

                        if (
                            !anchor ||
                            !anchor.isConnected
                        ) {
                            return;
                        }

                        const rect =
                            anchor.getBoundingClientRect();

                        const left =
                            rect.left +
                            win.scrollX;

                        const top =
                            rect.bottom +
                            win.scrollY;

                        menu.style.setProperty(
                            "left",
                            `${left}px`,
                            "important"
                        );

                        menu.style.setProperty(
                            "top",
                            `${top + 2}px`,
                            "important"
                        );

                        menu.style.setProperty(
                            "width",
                            `${rect.width}px`,
                            "important"
                        );
                    }

                    align_menu();

                    if (
                        !menu.__bb_position_bound
                    ) {

                        menu.__bb_position_bound =
                            true;

                        win.addEventListener(
                            "resize",
                            align_menu,
                            true
                        );

                        doc.addEventListener(
                            "scroll",
                            align_menu,
                            true
                        );

                        anchor.addEventListener(
                            "input",
                            align_menu,
                            true
                        );

                        anchor.addEventListener(
                            "focus",
                            align_menu,
                            true
                        );
                    }

                });
            }


            if (!frame.__bb_global_dropdown_observer) {

                frame.__bb_global_dropdown_observer =
                    new MutationObserver(
                        function () {
                            portal_menus();
                        }
                    );

                frame.__bb_global_dropdown_observer.observe(
                    doc.body,
                    {
                        childList: true,
                        subtree: true
                    }
                );
            }


            if (!frame.__bb_global_dropdown_interval) {

                frame.__bb_global_dropdown_interval =
                    setInterval(
                        portal_menus,
                        300
                    );
            }


            portal_menus();

        } catch (e) {

            console.warn(
                "Blood Bank global dropdown fix:",
                e
            );
        }
    }


    function start_global_fix() {

        const frame =
            document.querySelector(
                "#bb-staff-frame"
            );

        if (!frame) {
            return;
        }

        frame.addEventListener(
            "load.bbglobaldropdown",
            function () {

                setTimeout(
                    function () {
                        install_dropdown_fix(frame);
                    },
                    100
                );

                setTimeout(
                    function () {
                        install_dropdown_fix(frame);
                    },
                    500
                );

                setTimeout(
                    function () {
                        install_dropdown_fix(frame);
                    },
                    1000
                );

                setTimeout(
                    function () {
                        install_dropdown_fix(frame);
                    },
                    2000
                );
            }
        );

        install_dropdown_fix(frame);
    }


    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            start_global_fix
        );

    } else {

        start_global_fix();
    }

})();

