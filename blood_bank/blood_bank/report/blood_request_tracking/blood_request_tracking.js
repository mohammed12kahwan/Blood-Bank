frappe.query_reports["Blood Request Tracking"] = {
    filters: [
        {
            fieldname: "request_id",
            label: __("رقم الطلب | Request ID"),
            fieldtype: "Data"
        },
        {
            fieldname: "patient",
            label: __("المريض | Patient"),
            fieldtype: "Link",
            options: "Patient"
        },
        {
            fieldname: "request_status",
            label: __("حالة الطلب | Request Status"),
            fieldtype: "Select",
            options: "\nDraft\nSubmitted\nApproved"
        },
        {
            fieldname: "request_type",
            label: __("نوع الطلب | Request Type"),
            fieldtype: "Select",
            options: "\nRoutine\nUrgent\nEmergency"
        },
        {
            fieldname: "component_type",
            label: __("المكوّن | Component Type"),
            fieldtype: "Select",
            options: "\nWhole Blood\nPacked Red Cells\nFresh Frozen Plasma\nPlatelets\nCryoprecipitate\nOther"
        },
        {
            fieldname: "from_date",
            label: __("من تاريخ | From Date"),
            fieldtype: "Date"
        },
        {
            fieldname: "to_date",
            label: __("إلى تاريخ | To Date"),
            fieldtype: "Date"
        },
        {
            fieldname: "query",
            label: __("بحث عام | Search"),
            fieldtype: "Data"
        }
    ],

    formatter: function(value, row, column, data, default_formatter) {
        const rendered = default_formatter(value, row, column, data);
        if (!data || !data.name) {
            return rendered;
        }

        const id = frappe.utils.escape_html(String(data.name));
        const content = rendered || "&nbsp;";

        return (
            '<span class="bb-request-tracking-cell" ' +
            'data-request-id="' + id + '" ' +
            'title="' + __("فتح متابعة طلب الدم") + '" ' +
            'style="display:block;width:100%;min-height:24px;cursor:pointer;">' +
            content +
            '</span>'
        );
    },

    onload: function(report) {
        const wrapper = report.page.wrapper;

        // BB-REPORT-FILTERS-ONE-ROW-V1
        $(wrapper)
            .removeClass("bb-donation-tracking-report bb-request-tracking-report")
            .addClass("bb-request-tracking-report");

        if (!document.getElementById("bbRequestTrackingFilterLayout")) {
            const style = document.createElement("style");
            style.id = "bbRequestTrackingFilterLayout";
            style.textContent = `
/* BB-REPORT-FILTERS-ONE-ROW-V1 */
.bb-request-tracking-report .page-form.row {
    display: flex !important;
    flex-flow: row nowrap !important;
    align-items: flex-end !important;
    gap: 6px !important;
    width: 100% !important;
    min-width: 0 !important;
    margin: 0 0 10px !important;
    padding: 8px 0 10px !important;
}
.bb-request-tracking-report .page-form.row::before,
.bb-request-tracking-report .page-form.row::after {
    display: none !important;
    content: none !important;
}
.bb-request-tracking-report .page-form.row > .frappe-control {
    float: none !important;
    flex: 1 1 0 !important;
    width: auto !important;
    min-width: 0 !important;
    max-width: none !important;
    margin: 0 !important;
    padding: 0 3px !important;
}
.bb-request-tracking-report .page-form .control-label {
    display: block !important;
    visibility: visible !important;
    white-space: normal !important;
    overflow-wrap: anywhere;
    font-size: 11px !important;
    line-height: 1.35 !important;
    margin-bottom: 4px !important;
}
.bb-request-tracking-report .page-form .form-control,
.bb-request-tracking-report .page-form input,
.bb-request-tracking-report .page-form select {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
}
@media (max-width: 1050px) {
    .bb-request-tracking-report .page-form.row {
        flex-wrap: wrap !important;
    }
    .bb-request-tracking-report .page-form.row > .frappe-control {
        flex: 1 1 calc(25% - 6px) !important;
        min-width: 145px !important;
    }
}
@media (max-width: 600px) {
    .bb-request-tracking-report .page-form.row > .frappe-control {
        flex: 1 1 calc(50% - 6px) !important;
        min-width: 125px !important;
    }
}
`;
            document.head.appendChild(style);
        }



        // BB_GLOBAL_NAV_REPORT
        if (!report.page.__bbGlobalNavAdded) {
            report.page.__bbGlobalNavAdded = true;
            const navigationItems = [
                ["⌂ قائمة عمل بنك الدم", "workspace"],
                ["🩸 قائمة مكونات الدم", "donation_report"],
                ["📋 قائمة طلبات الدم", "request_report"],
                ["🧪 قوائم بنك الدم", "component_work"],
                ["🩸 متابعة طلبات الدم", "request_work"]
            ];
            const navigationRoutes = {
                workspace: () => frappe.set_route("blood-bank-ui-test"),
                donation_report: () => frappe.set_route("query-report", "Blood Donation Tracking"),
                request_report: () => frappe.set_route("query-report", "Blood Request Tracking"),
                component_work: () => frappe.set_route("blood-bank-component-work"),
                request_work: () => frappe.set_route("blood-bank-request-work")
            };
            navigationItems.forEach(([label, target]) => {
                report.page.add_inner_button(__(label), function() {
                    navigationRoutes[target]();
                });
            });
        }


        wrapper.off("click.bbRequestTracking", ".dt-cell");
        wrapper.on("click.bbRequestTracking", ".dt-cell", function(event) {
            if ($(event.target).closest(".dt-cell--header").length) {
                return;
            }

            const cell = $(this);
            let requestId = cell
                .find(".bb-request-tracking-cell")
                .attr("data-request-id");

            // Support clicks on any part of a row, including whitespace
            // in cells whose displayed value is empty.
            if (!requestId) {
                requestId = cell
                    .closest(".dt-row")
                    .find(".bb-request-tracking-cell")
                    .first()
                    .attr("data-request-id");
            }

            if (!requestId) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            try {
                sessionStorage.setItem(
                    "bb_request_work_request_id",
                    requestId
                );
            } catch (e) {}

            frappe.route_options = {
                blood_request: requestId
            };

            frappe.set_route("blood-bank-request-work");
        });
    }
};
