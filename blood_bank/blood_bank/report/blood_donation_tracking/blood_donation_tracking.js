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
        /* BB_REPORT_PRINT_BUTTON_V3_DIRECT */
        if (!$(report.page.wrapper).find(".bb-report-print-button").length) {
            if (!document.getElementById("bbReportPrintButtonStyle")) {
                const printStyle = document.createElement("style");
                printStyle.id = "bbReportPrintButtonStyle";
                printStyle.textContent = `
                    .bb-report-print-button {
                        background: #0369a1 !important;
                        border-color: #0369a1 !important;
                        color: #fff !important;
                        font-weight: 700 !important;
                        border-radius: 5px !important;
                    }
                    .bb-report-print-button:hover {
                        background: #075985 !important;
                        border-color: #075985 !important;
                        color: #fff !important;
                    }
                `;
                document.head.appendChild(printStyle);
            }

            const printButton = report.page.add_inner_button(
                "🖨️ طباعة التقرير",
                function () {
                    if (
                        !report.report_doc ||
                        typeof report.print_report !== "function"
                    ) {
                        frappe.msgprint({
                            title: __("تعذر الطباعة"),
                            message: __("لا تتوفر وظيفة طباعة التقرير حاليًا.")
                        });
                        return;
                    }

                    const refDoctype = report.report_doc.ref_doctype;
                    if (
                        refDoctype &&
                        frappe.model &&
                        typeof frappe.model.can_print === "function" &&
                        !frappe.model.can_print(refDoctype)
                    ) {
                        frappe.msgprint({
                            title: __("صلاحية الطباعة"),
                            message: __("ليس لديك صلاحية طباعة هذا التقرير.")
                        });
                        return;
                    }

                    const visibleColumns =
                        typeof report.get_visible_columns === "function"
                            ? report.get_visible_columns()
                            : [];

                    // طباعة مباشرة باستخدام قالب التقرير الافتراضي،
                    // من دون فتح نافذة إعدادات الطباعة في Frappe.
                    const printSettings = {
                        orientation: visibleColumns.length > 5
                            ? "Landscape"
                            : "Portrait",
                        include_filters: true,
                        columns: [],
                        with_letter_head: !!report.report_doc.letter_head,
                        letter_head_name: report.report_doc.letter_head || null
                    };

                    Promise.resolve(
                        report.print_report(printSettings)
                    ).catch(function (error) {
                        console.error("Blood Bank direct report print:", error);
                        frappe.msgprint({
                            title: __("تعذر الطباعة"),
                            message: __("تعذر تجهيز التقرير للطباعة. راجع سجل المتصفح.")
                        });
                    });
                },
                null,
                "primary"
            );

            if (printButton && typeof printButton.addClass === "function") {
                printButton
                    .addClass("bb-report-print-button")
                    .attr("title", __("طباعة التقرير مباشرة"));
            }
        }
        /* END BB_REPORT_PRINT_BUTTON_V3_DIRECT */


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
