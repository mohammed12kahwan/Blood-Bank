(() => {
    function mount_blood_donation(frm) {
        const field = frm.get_field("blood_donation_embedded_form");
        if (!field || !field.$wrapper) return;

        const host = field.$wrapper.get(0);
        if (!host || host.__bb_child_form) return;

        frappe.model.with_doctype("Blood Donation", () => {
            const page = $("<div></div>");

            field.$wrapper.empty();
            field.$wrapper.append(page);

            const child_frm = new frappe.ui.form.Form(
                "Blood Donation",
                page,
                false
            );

            child_frm.__bb_embedded = true;
            host.__bb_child_form = child_frm;

            const name = frappe.model.make_new_doc_and_get_name(
                "Blood Donation",
                true
            );

            child_frm.refresh(name);

            setTimeout(() => {
                const layout_wrapper = child_frm.layout && child_frm.layout.wrapper;

                if (!layout_wrapper) {
                    console.error("Blood Bank: Blood Donation layout not found");
                    return;
                }

                field.$wrapper.empty();
                field.$wrapper.append(layout_wrapper);

                $(layout_wrapper).css({
                    width: "100%",
                    margin: "0",
                    padding: "0",
                    minHeight: "0"
                });

                $(layout_wrapper).find(".form-page").css({
                    width: "100%",
                    margin: "0",
                    padding: "0"
                });

                $(layout_wrapper).find(".form-section").css({
                    width: "100%",
                    marginBottom: "6px"
                });

                $(layout_wrapper).find(".form-column").css({
                    paddingLeft: "4px",
                    paddingRight: "4px"
                });
            }, 700);
        });
    }

    frappe.ui.form.on("Blood Donor", {
        refresh(frm) {
            setTimeout(() => mount_blood_donation(frm), 300);
        },

        onload_post_render(frm) {
            setTimeout(() => mount_blood_donation(frm), 300);
        }
    });
})();
