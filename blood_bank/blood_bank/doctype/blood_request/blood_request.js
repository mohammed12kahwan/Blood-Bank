frappe.ui.form.on("Blood Request", {
    refresh(frm) {
        // BB_REQUEST_OPEN_CROSSMATCH_V1
        bb_request_open_crossmatch_v1(frm);

        apply_blood_request_colors(frm);
        setTimeout(() => apply_blood_request_colors(frm), 150);
        setTimeout(() => apply_blood_request_colors(frm), 600);
    },

    onload_post_render(frm) {
        setTimeout(() => apply_blood_request_colors(frm), 150);
    }
});

function apply_blood_request_colors(frm) {
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
            body: "#fff5dc",
            head: "#ffe8b3",
            border: "#d97706",
            text: "#92400e"
        },
        {
            body: "#e6f8ea",
            head: "#d3f0d9",
            border: "#16a34a",
            text: "#166534"
        },
        {
            body: "#ffecec",
            head: "#ffdada",
            border: "#dc2626",
            text: "#991b1b"
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



// BB_REQUEST_OPEN_CROSSMATCH_HELPER_V1
function bb_request_open_crossmatch_v1(frm) {
    if (
        !frm ||
        frm.is_new() ||
        !frm.doc.name ||
        frm.doc.request_status !== "Approved"
    ) {
        return;
    }

    frm.add_custom_button(
        __("الخطوة التالية: المطابقة"),
        () => {
            frappe.db.get_list("Blood Crossmatch", {
                filters: { blood_request: frm.doc.name },
                fields: ["name", "crossmatch_status", "modified"],
                order_by: "modified desc",
                limit: 1
            }).then(rows => {
                // Reuse an existing attempt instead of duplicating it.
                if (rows && rows.length) {
                    frappe.set_route(
                        "Form",
                        "Blood Crossmatch",
                        rows[0].name
                    );
                    return;
                }

                frappe.new_doc("Blood Crossmatch", {
                    blood_request: frm.doc.name,
                    crossmatch_status: "Draft",
                    crossmatch_date: frappe.datetime.get_today(),
                    performed_by: frappe.session.user,
                    compatibility_result: "Pending"
                });
            }).catch(error => {
                console.error("Could not open crossmatch:", error);
                frappe.msgprint({
                    title: __("تعذر فتح المطابقة"),
                    indicator: "red",
                    message: __(
                        "تعذر البحث عن سجل المطابقة. حدّث الصفحة وحاول مجددًا."
                    )
                });
            });
        },
        __("سير العمل")
    );
}
