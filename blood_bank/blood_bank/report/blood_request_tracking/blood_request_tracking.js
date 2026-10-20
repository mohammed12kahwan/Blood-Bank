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
