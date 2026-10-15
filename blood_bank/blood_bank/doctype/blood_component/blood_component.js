frappe.ui.form.on("Blood Component", {
    refresh(frm) {
        setTimeout(() => auto_fill_blood_processing(frm), 250);
        setTimeout(() => auto_fill_blood_processing(frm), 900);
        apply_blood_component_colors(frm);
        setTimeout(() => apply_blood_component_colors(frm), 150);
        setTimeout(() => apply_blood_component_colors(frm), 600);
    },

    onload_post_render(frm) {
        setTimeout(() => auto_fill_blood_processing(frm), 350);
        setTimeout(() => auto_fill_blood_processing(frm), 1000);
        setTimeout(() => apply_blood_component_colors(frm), 150);
    }
});


// BB_AUTO_FILL_BLOOD_PROCESSING
async function auto_fill_blood_processing(frm) {
    if (!frm || !frm.is_new() || frm.doc.blood_processing) return;

    const screening = frm.doc.blood_screening;
    const unit = frm.doc.blood_unit;
    const donor = frm.doc.donor;
    const bag = frm.doc.bag_number;

    if (!screening && !unit && !(donor && bag)) return;

    const token = [screening || "", unit || "", donor || "", bag || ""].join("|");
    if (
        frm.__bb_processing_lookup_running === token ||
        frm.__bb_processing_lookup_done === token
    ) return;

    frm.__bb_processing_lookup_running = token;

    try {
        const find_processing = (filters) =>
            frappe.db.get_list("Blood Processing", {
                filters: {
                    ...filters,
                    processing_status: "Component Separation"
                },
                fields: ["name"],
                limit: 2
            });

        let rows = [];

        // Prefer an exact match to the accepted screening.
        if (screening) {
            rows = await find_processing({ blood_screening: screening });
        }

        // If no direct screening link exists, match the same blood unit.
        if ((!rows || rows.length === 0) && unit) {
            rows = await find_processing({ blood_unit: unit });
        }

        // Last fallback: only accept a unique donor + bag match.
        if ((!rows || rows.length === 0) && donor && bag) {
            rows = await find_processing({
                donor: donor,
                bag_number: bag
            });
        }

        if (rows && rows.length === 1 && !frm.doc.blood_processing) {
            await frm.set_value("blood_processing", rows[0].name);
            frm.__bb_processing_lookup_done = token;
            frappe.show_alert({
                message: "تم تعبئة معالجة الدم تلقائيًا: " + rows[0].name,
                indicator: "green"
            });
        } else if (rows && rows.length > 1) {
            frm.__bb_processing_lookup_done = token;
            frappe.msgprint(
                "وجد النظام أكثر من سجل معالجة مطابق. " +
                "لم تتم تعبئة الحقل تلقائيًا لتجنب ربط المكوّن بسجل خاطئ."
            );
        }
    } catch (e) {
        console.error("Blood Processing auto-fill failed:", e);
    } finally {
        frm.__bb_processing_lookup_running = null;
    }
}

/* BB_AUTO_FILL_ON_LINK_CHANGE */
frappe.ui.form.on("Blood Component", {
    blood_screening(frm) {
        setTimeout(() => auto_fill_blood_processing(frm), 350);
    },
    blood_unit(frm) {
        setTimeout(() => auto_fill_blood_processing(frm), 350);
    },
    donor(frm) {
        setTimeout(() => auto_fill_blood_processing(frm), 350);
    },
    bag_number(frm) {
        setTimeout(() => auto_fill_blood_processing(frm), 350);
    }
});

/* BB_CLIENT_REQUIRED_COMPONENT_AUTOFILL */
frappe.ui.form.on("Blood Component", {
    async validate(frm) {
        if (!frm.doc.preparation_date) {
            await frm.set_value(
                "preparation_date",
                frappe.datetime.get_today()
            );
        }

        // قيمة مؤقتة لا تُحفظ كما هي؛ الخادم يستبدلها برقم مولّد.
        if (!frm.doc.component_number && frm.is_new()) {
            await frm.set_value(
                "component_number",
                "PENDING-COMP-" + Date.now()
            );
        }

        if (!frm.doc.blood_processing) {
            await auto_fill_blood_processing(frm);
        }

        if (!frm.doc.blood_processing) {
            frappe.validated = false;
            frappe.msgprint(
                "لم يُعثر على معالجة مطابقة لوحدة الدم. "
                + "لن يُحفظ المكوّن قبل تحديد المعالجة الصحيحة."
            );
        }
    },

    blood_unit(frm) {
        setTimeout(() => auto_fill_blood_processing(frm), 200);
    },

    blood_screening(frm) {
        setTimeout(() => auto_fill_blood_processing(frm), 200);
    }
});

function apply_blood_component_colors(frm) {
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
