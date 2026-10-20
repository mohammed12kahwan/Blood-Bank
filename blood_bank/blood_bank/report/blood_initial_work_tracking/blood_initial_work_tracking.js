frappe.query_reports["Blood Initial Work Tracking"] = {
    filters: [
        {
            fieldname: "work_window",
            label: __("نافذة العمل"),
            fieldtype: "Select",
            options: [
                "",
                "Blood Donor",
                "Blood Donation",
                "Blood Processing",
                "Blood Unit"
            ],
            default: ""
        },
        {
            fieldname: "status",
            label: __("الحالة"),
            fieldtype: "Select",
            options: [
                "",
                "Pending",
                "Eligible",
                "Deferred",
                "Rejected",
                "New",
                "Under Assessment",
                "Ready for Donation",
                "Draft",
                "Scheduled",
                "Checked In",
                "Bleeding",
                "Collected",
                "Quarantine",
                "Cancelled",
                "Aborted",
                "Processing",
                "Component Separation",
                "Created",
                "Accepted",
                "Available",
                "Reserved",
                "Issued",
                "Returned",
                "Expired",
                "Discarded",
                "Transfused"
            ],
            default: ""
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
        const formatted = default_formatter(value, row, column, data);

        if (
            !data ||
            !data.record_id ||
            column.fieldname !== "record_id"
        ) {
            return formatted;
        }

        const escape = frappe.utils.escape_html;
        const name = escape(String(data.record_id));
        const doctype = escape(String(data.source_doctype || ""));

        return `
            <span
                class="bb-iw-report-record"
                data-record-id="${name}"
                data-source-doctype="${doctype}"
                role="button"
                tabindex="0"
                title="${__("فتح السجل داخل نافذة العمل الأولية")}"
                style="cursor:pointer;display:block;min-height:22px;"
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


        $(wrapper).addClass("bb-initial-work-tracking-report");

        $(wrapper)
            .off("click.bbInitialWorkReport", ".bb-iw-report-record")
            .on(
                "click.bbInitialWorkReport",
                ".bb-iw-report-record",
                function (event) {
                    event.preventDefault();
                    event.stopPropagation();

                    const selection = {
                        doctype: this.dataset.sourceDoctype,
                        name: this.dataset.recordId
                    };

                    if (!selection.doctype || !selection.name) return;

                    try {
                        sessionStorage.setItem(
                            "bb_initial_work_report_selection",
                            JSON.stringify(selection)
                        );
                    } catch (error) {
                        frappe.msgprint(
                            __("تعذر تمرير السجل إلى نافذة العمل الأولية.")
                        );
                        return;
                    }

                    frappe.set_route("blood-bank-initial-work");
                }
            )
            .off("keydown.bbInitialWorkReport", ".bb-iw-report-record")
            .on(
                "keydown.bbInitialWorkReport",
                ".bb-iw-report-record",
                function (event) {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        $(this).trigger("click");
                    }
                }
            );
    }
};
