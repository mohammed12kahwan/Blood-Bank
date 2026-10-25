frappe.ui.form.on("Blood Reservation", {
    refresh(frm) {
        apply_blood_reservation_colors(frm);

        setTimeout(() => apply_blood_reservation_colors(frm), 150);
        setTimeout(() => apply_blood_reservation_colors(frm), 600);
    },

    onload_post_render(frm) {
        setTimeout(() => apply_blood_reservation_colors(frm), 150);
    }
});

function apply_blood_reservation_colors(frm) {
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



// BB_RESERVATION_AUTOFILL_V2
function bb_reservation_load_crossmatch_v2(frm) {
    const crossmatch_name = frm.doc.blood_crossmatch;
    if (!crossmatch_name) return Promise.resolve();

    return frappe.model.with_doc("Blood Crossmatch", crossmatch_name)
        .then(() => {
            const cm = frappe.model.get_doc("Blood Crossmatch", crossmatch_name);
            if (!cm) {
                frappe.msgprint(__("تعذر تحميل سجل المطابقة."));
                return;
            }

            const linked = {
                blood_request: cm.blood_request,
                patient: cm.patient,
                patient_name: cm.patient_name,
                blood_storage: cm.candidate_storage,
                blood_component: cm.candidate_component,
                blood_unit: cm.candidate_blood_unit,
                blood_group: cm.candidate_blood_group,
                component_type: cm.candidate_component_type,
                bag_number: cm.candidate_bag_number
            };

            const values = {};
            Object.keys(linked).forEach(field => {
                if (frm.fields_dict[field]) {
                    values[field] = linked[field] || "";
                }
            });

            if (!frm.doc.reservation_date) {
                values.reservation_date = frappe.datetime.get_today();
            }
            if (!frm.doc.naming_series) {
                values.naming_series = "RES-.YYYY.-.#####";
            }
            if (!frm.doc.reservation_status) {
                values.reservation_status = "Draft";
            }

            return frm.set_value(values).then(() => {
                if (
                    cm.crossmatch_status !== "Compatible" ||
                    cm.compatibility_result !== "Compatible"
                ) {
                    frappe.msgprint({
                        title: __("المطابقة غير مكتملة"),
                        indicator: "orange",
                        message: __(
                            "تم تحميل البيانات، لكن يجب أن تكون حالة المطابقة والنتيجة Compatible قبل الحجز."
                        )
                    });
                }
            });
        })
        .catch(error => {
            console.error("Reservation crossmatch load failed:", error);
            frappe.msgprint({
                title: __("تعذر تحميل بيانات الحجز"),
                indicator: "red",
                message: __(
                    "تعذر جلب بيانات المطابقة. تحقق من سجل المطابقة وحاول مجددًا."
                )
            });
        });
}

frappe.ui.form.on("Blood Reservation", {
    blood_crossmatch(frm) {
        return bb_reservation_load_crossmatch_v2(frm);
    },

    refresh(frm) {
        // Route options may prefill the crossmatch when opened from its form.
        if (
            frm.doc.blood_crossmatch &&
            (
                frm.is_new() ||
                !frm.doc.blood_storage ||
                !frm.doc.blood_unit
            )
        ) {
            bb_reservation_load_crossmatch_v2(frm);
        }
    }
});
