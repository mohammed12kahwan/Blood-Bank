frappe.ui.form.on("Blood Group Verification", {
    refresh(frm) {
        if (frm.doc.verification_status !== "Pending Review") return;
        if (!(frappe.user_roles || []).includes("Laboratory User")) return;
        if (frm.doc.tested_by === frappe.session.user) return;

        frm.add_custom_button(
            __("Verify / اعتماد"),
            function () {
                ask_group_review(frm, "Verify");
            },
            __("Laboratory Review / مراجعة المختبر")
        );

        frm.add_custom_button(
            __("Reject / رفض"),
            function () {
                ask_group_review(frm, "Reject");
            },
            __("Laboratory Review / مراجعة المختبر")
        );
    }
});

function ask_group_review(frm, decision) {
    frappe.prompt(
        [{
            fieldname: "review_notes",
            fieldtype: "Small Text",
            label: __("Review Notes / ملاحظات المراجعة"),
            reqd: 1
        }],
        function (values) {
            frappe.call({
                method: "blood_bank.blood_bank.doctype.blood_group_verification.blood_group_verification.review_group_test",
                args: {
                    name: frm.doc.name,
                    decision: decision,
                    review_notes: values.review_notes
                },
                freeze: true,
                callback: function (r) {
                    if (!r.message) return;
                    frappe.msgprint(r.message.message);
                    frm.reload_doc();
                }
            });
        },
        decision === "Verify"
            ? __("Independent Review / المراجعة المستقلة")
            : __("Reject Verification / رفض التحقق"),
        decision === "Verify" ? __("Verify") : __("Reject")
    );
}
