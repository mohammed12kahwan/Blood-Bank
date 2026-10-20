frappe.ui.form.on("Blood Unit", {
    refresh(frm) {
        apply_blood_unit_colors(frm);
        add_group_verification_button(frm);
        setTimeout(() => apply_blood_unit_colors(frm), 150);
        setTimeout(() => apply_blood_unit_colors(frm), 600);
    },

    onload_post_render(frm) {
        setTimeout(() => apply_blood_unit_colors(frm), 150);
    }
});

function apply_blood_unit_colors(frm) {
    const colors = [
        {
            body: "#e8f0ff",
            head: "#d5e4ff",
            border: "#2563eb",
            text: "#1e3a8a"
        },
        {
            body: "#e4f6ff",
            head: "#d2efff",
            border: "#0284c7",
            text: "#075985"
        },
        {
            body: "#ffecec",
            head: "#ffdada",
            border: "#dc2626",
            text: "#991b1b"
        },
        {
            body: "#e6f8ea",
            head: "#d3f0d9",
            border: "#16a34a",
            text: "#166534"
        },
        {
            body: "#fff5dc",
            head: "#ffe8b3",
            border: "#d97706",
            text: "#92400e"
        },
        {
            body: "#f4edff",
            head: "#e6d9ff",
            border: "#7c3aed",
            text: "#5b21b6"
        },
        {
            body: "#e9f7f7",
            head: "#d2eeee",
            border: "#0891b2",
            text: "#155e75"
        }
    ];

    const sections = $(frm.wrapper).find(".form-section").toArray();

    sections.forEach((section, index) => {
        const cfg = colors[index];
        if (!cfg) return;

        section.style.setProperty(
            "background-color", cfg.body, "important"
        );

        section.style.setProperty(
            "border", "1px solid " + cfg.border, "important"
        );

        section.style.setProperty(
            "border-radius", "8px", "important"
        );


        section.style.setProperty(
            "margin-bottom", "7px", "important"
        );

        const head = section.querySelector(".section-head");

        if (head) {
            head.style.setProperty(
                "background-color", cfg.head, "important"
            );

            head.style.setProperty(
                "color", cfg.text, "important"
            );

            head.style.setProperty(
                "border-inline-start",
                "4px solid " + cfg.border,
                "important"
            );

            head.style.setProperty(
                "font-weight", "700", "important"
            );
        }

        const body = section.querySelector(".section-body");

        if (body) {
            body.style.setProperty(
                "background-color", cfg.body, "important"
            );

            body.style.setProperty(
                "padding", "5px 6px 2px", "important"
            );
        }

        section.querySelectorAll(".form-column").forEach(column => {
            column.style.setProperty(
                "background-color", cfg.body, "important"
            );
        });
    });
}


/* BB_GROUP_VERIFICATION_ENTRY_BUTTON_V1 */
function add_group_verification_button(frm) {
    if (frm.is_new() || frm.doc.unit_status !== "Quarantine") return;
    if (frm.doc.blood_group_verified) return;
    // Visibility is not authorization; the server enforces Laboratory User.

    frm.add_custom_button(
        __("Record Laboratory Group Test / تسجيل فحص الفصيلة"),
        function () {
            frappe.prompt([
                {
                    fieldname: "screening_name",
                    fieldtype: "Link",
                    label: __("Blood Screening / سجل فحص العينة"),
                    options: "Blood Screening",
                    reqd: 1
                },
                {
                    fieldname: "tested_abo_group",
                    fieldtype: "Select",
                    label: __("Observed ABO / نتيجة ABO"),
                    options: "\nA\nB\nAB\nO",
                    reqd: 1
                },
                {
                    fieldname: "tested_rh_factor",
                    fieldtype: "Select",
                    label: __("Observed Rh / نتيجة Rh"),
                    options: "\nPositive\nNegative",
                    reqd: 1
                },
                {
                    fieldname: "test_method",
                    fieldtype: "Data",
                    label: __("Test Method / طريقة الفحص"),
                    reqd: 1
                },
                {
                    fieldname: "test_reference",
                    fieldtype: "Data",
                    label: __("Lab Reference / مرجع المختبر")
                },
                {
                    fieldname: "sample_identity_confirmed",
                    fieldtype: "Check",
                    label: __("I matched the physical sample label to the screening record / تحققت من مطابقة بطاقة العينة الفعلية"),
                    default: 0,
                    reqd: 1
                },
                {
                    fieldname: "test_notes",
                    fieldtype: "Small Text",
                    label: __("Test Notes / ملاحظات الفحص")
                }
            ], function (values) {
                if (!values.sample_identity_confirmed) {
                    frappe.msgprint(
                        __("Confirm the physical sample label before saving.")
                    );
                    return;
                }

                frappe.call({
                    method: "blood_bank.blood_bank.doctype.blood_group_verification.blood_group_verification.record_group_test",
                    args: {
                        unit_name: frm.doc.name,
                        screening_name: values.screening_name,
                        tested_abo_group: values.tested_abo_group,
                        tested_rh_factor: values.tested_rh_factor,
                        test_method: values.test_method,
                        test_reference: values.test_reference,
                        sample_identity_confirmed: values.sample_identity_confirmed,
                        test_notes: values.test_notes
                    },
                    freeze: true,
                    callback: function (r) {
                        if (!r.message) return;
                        frappe.msgprint(r.message.message);
                        if (r.message.name) {
                            frappe.set_route(
                                "Form", "Blood Group Verification", r.message.name
                            );
                        } else {
                            frm.reload_doc();
                        }
                    }
                });
            },
            __("Record Blood Group Test / تسجيل نتيجة الفحص"),
            __("Save Test Record / حفظ سجل الفحص")
        );
    }
    );
}
