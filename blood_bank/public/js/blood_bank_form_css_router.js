(function () {
    "use strict";

    if (window.__bbFormCssRouterInstalled) return;
    window.__bbFormCssRouterInstalled = true;

    const styles = {
        "Blood Donor": "/assets/blood_bank/css/blood_donor_form.css?v=6",
        "Blood Donation": "/assets/blood_bank/css/blood_donation_form.css?v=4",
        "Blood Processing": "/assets/blood_bank/css/blood_processing_form.css?v=1",
        "Blood Unit": "/assets/blood_bank/css/blood_unit_form.css?v=1",
        "Blood Screening": "/assets/blood_bank/css/blood_screening_form.css?v=1",
        "Blood Component": "/assets/blood_bank/css/blood_component_form.css?v=1",
        "Blood Component Quality Check": "/assets/blood_bank/css/blood_component_quality_check_form.css?v=1",
        "Blood Storage": "/assets/blood_bank/css/blood_storage_form.css?v=1",
        "Blood Request": "/assets/blood_bank/css/blood_request_form.css?v=1",
        "Blood Reservation": "/assets/blood_bank/css/blood_reservation_form.css?v=1",
        "Blood Crossmatch": "/assets/blood_bank/css/blood_crossmatch_form.css?v=1",
        "Blood Issue": "/assets/blood_bank/css/blood_issue_form.css?v=1",
        "Blood Handover": "/assets/blood_bank/css/blood_handover_form.css?v=1",
        "Blood Transfusion": "/assets/blood_bank/css/blood_transfusion_form.css?v=1",
        "Blood Unit Disposition": "/assets/blood_bank/css/blood_unit_disposition_form.css?v=1"
    };

    const selector = 'link[data-bb-form-css-router="1"]';

    function syncStyles() {
        let doctype = null;

        if (window.frappe && typeof frappe.get_route === "function") {
            const route = frappe.get_route();
            if (Array.isArray(route) && route[0] === "Form") {
                doctype = route[1];
            }
        }

        const target = doctype ? styles[doctype] : null;
        let retained = false;

        document.querySelectorAll(selector).forEach(function (link) {
            if (target && !retained && link.getAttribute("href") === target) {
                retained = true;
            } else {
                link.remove();
            }
        });

        if (!target || retained) return;

        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = target;
        link.setAttribute("data-bb-form-css-router", "1");
        link.setAttribute("data-bb-form-doctype", doctype);
        document.head.appendChild(link);
    }

    function bindRouter() {
        if (
            window.frappe &&
            frappe.router &&
            typeof frappe.router.on === "function" &&
            !window.__bbFormCssRouterBound
        ) {
            frappe.router.on("change", function () {
                window.setTimeout(syncStyles, 80);
            });
            window.__bbFormCssRouterBound = true;
        }
    }

    bindRouter();
    syncStyles();
    window.setTimeout(bindRouter, 500);
    window.setTimeout(syncStyles, 600);
})();
