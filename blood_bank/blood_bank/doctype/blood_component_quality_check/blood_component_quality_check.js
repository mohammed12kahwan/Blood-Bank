frappe.ui.form.on("Blood Component Quality Check", {
    refresh(frm) {
        apply_qc_colors(frm);
        setTimeout(() => apply_qc_colors(frm), 150);
        setTimeout(() => apply_qc_colors(frm), 600);
    },

    onload_post_render(frm) {
        setTimeout(() => apply_qc_colors(frm), 150);
    }
});

function apply_qc_colors(frm) {
    const colors = [
        {
            body: "#e8f0ff",
            head: "#d5e4ff",
            border: "#2563eb",
            text: "#1e3a8a"
        },
        {
            body: "#fff0f3",
            head: "#ffdfe6",
            border: "#e11d48",
            text: "#9f1239"
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
