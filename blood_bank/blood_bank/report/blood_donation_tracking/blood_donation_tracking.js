frappe.query_reports["Blood Donation Tracking"] = {
    filters: [
        {
            fieldname: "donation_id",
            label: __("رقم التبرع"),
            fieldtype: "Data"
        },
        {
            fieldname: "donor",
            label: __("رقم المتبرع"),
            fieldtype: "Link",
            options: "Blood Donor"
        },
        {
            fieldname: "donor_name",
            label: __("اسم المتبرع"),
            fieldtype: "Data"
        },
        {
            fieldname: "bag_number",
            label: __("رقم الكيس"),
            fieldtype: "Data"
        },
        {
            fieldname: "donation_status",
            label: __("حالة التبرع"),
            fieldtype: "Select",
            options: [
                "",
                "Draft",
                "Scheduled",
                "Checked In",
                "Bleeding",
                "Collected",
                "Quarantine",
                "Cancelled",
                "Aborted"
            ]
        },
        {
            fieldname: "donation_type",
            label: __("نوع التبرع"),
            fieldtype: "Select",
            options: [
                "",
                "Whole Blood",
                "Apheresis",
                "Other"
            ]
        },
        {
            fieldname: "from_date",
            label: __("من تاريخ"),
            fieldtype: "Date"
        },
        {
            fieldname: "to_date",
            label: __("إلى تاريخ"),
            fieldtype: "Date"
        },
        {
            fieldname: "query",
            label: __("بحث عام"),
            fieldtype: "Data"
        }
    ],

    formatter: function (value, row, column, data, default_formatter) {
        const formatted = default_formatter(
            value,
            row,
            column,
            data
        );

        if (!data || !data.name) {
            return formatted;
        }

        const donationId = String(data.name)
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        return `
            <span
                class="bb-donation-report-cell"
                data-donation-id="${donationId}"
                role="link"
                tabindex="0"
                title="${__("فتح نوافذ متابعة المكوّن")}"
                style="cursor:pointer;display:block;min-height:100%;"
            >${formatted}</span>
        `;
    },

    onload: function (report) {
        const wrapper = report.page.wrapper;

        // BB-REPORT-FILTERS-ONE-ROW-V1
        $(wrapper)
            .removeClass("bb-donation-tracking-report bb-request-tracking-report")
            .addClass("bb-donation-tracking-report");

        if (!document.getElementById("bbDonationTrackingFilterLayout")) {
            const style = document.createElement("style");
            style.id = "bbDonationTrackingFilterLayout";
            style.textContent = `
/* BB-REPORT-FILTERS-ONE-ROW-V1 */
.bb-donation-tracking-report .page-form.row {
    display: flex !important;
    flex-flow: row nowrap !important;
    align-items: flex-end !important;
    gap: 6px !important;
    width: 100% !important;
    min-width: 0 !important;
    margin: 0 0 10px !important;
    padding: 8px 0 10px !important;
}
.bb-donation-tracking-report .page-form.row::before,
.bb-donation-tracking-report .page-form.row::after {
    display: none !important;
    content: none !important;
}
.bb-donation-tracking-report .page-form.row > .frappe-control {
    float: none !important;
    flex: 1 1 0 !important;
    width: auto !important;
    min-width: 0 !important;
    max-width: none !important;
    margin: 0 !important;
    padding: 0 3px !important;
}
.bb-donation-tracking-report .page-form .control-label {
    display: block !important;
    visibility: visible !important;
    white-space: normal !important;
    overflow-wrap: anywhere;
    font-size: 11px !important;
    line-height: 1.35 !important;
    margin-bottom: 4px !important;
}
.bb-donation-tracking-report .page-form .form-control,
.bb-donation-tracking-report .page-form input,
.bb-donation-tracking-report .page-form select {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
}
@media (max-width: 1050px) {
    .bb-donation-tracking-report .page-form.row {
        flex-wrap: wrap !important;
    }
    .bb-donation-tracking-report .page-form.row > .frappe-control {
        flex: 1 1 calc(25% - 6px) !important;
        min-width: 145px !important;
    }
}
@media (max-width: 600px) {
    .bb-donation-tracking-report .page-form.row > .frappe-control {
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


        $(wrapper)
            .off("click.bbDonationTracking", ".bb-donation-report-cell")
            .on(
                "click.bbDonationTracking",
                ".bb-donation-report-cell",
                function (event) {
                    event.preventDefault();
                    event.stopPropagation();

                    const donationId = this.dataset.donationId;
                    if (!donationId) return;

                    sessionStorage.setItem(
                        "bb_component_work_donation_id",
                        donationId
                    );

                    frappe.route_options = {
                        donation_id: donationId
                    };

                    frappe.route_options = {
                        donation_id: donationId
                    };
                    frappe.set_route("blood-bank-component-work");
                }
            )
            .off("keydown.bbDonationTracking", ".bb-donation-report-cell")
            .on(
                "keydown.bbDonationTracking",
                ".bb-donation-report-cell",
                function (event) {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        $(this).trigger("click");
                    }
                }
            );
    }
};
