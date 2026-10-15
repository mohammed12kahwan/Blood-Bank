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

        if (!report.page.__bbInitialReportNavAdded) {
            report.page.__bbInitialReportNavAdded = true;

            const navigationItems = [
                ["⌂ قائمة عمل بنك الدم", () =>
                    frappe.set_route("blood-bank-ui-test")],
                ["🩸 قائمة مكونات الدم", () =>
                    frappe.set_route("query-report", "Blood Donation Tracking")],
                ["📋 قائمة طلبات الدم", () =>
                    frappe.set_route("query-report", "Blood Request Tracking")],
                ["👤 نافذة العمل الأولية", () =>
                    frappe.set_route("blood-bank-initial-work")],
                ["🧪 قوائم بنك الدم", () =>
                    frappe.set_route("blood-bank-component-work")],
                ["📋 متابعة طلبات الدم", () =>
                    frappe.set_route("blood-bank-request-work")],
                ["🩸 عمل موظف بنك الدم", () =>
                    frappe.set_route("blood-bank-staff-operations")]
            ];

            navigationItems.forEach(([label, action]) => {
                report.page.add_inner_button(__(label), action);
            });
        }

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
