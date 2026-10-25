frappe.ui.form.on("Blood Crossmatch", {
    refresh(frm) {
        apply_blood_crossmatch_colors(frm);
        setTimeout(() => apply_blood_crossmatch_colors(frm), 150);
        setTimeout(() => apply_blood_crossmatch_colors(frm), 600);

        // Populate route-provided links when opening a new crossmatch.
        if (
            frm.doc.blood_request &&
            (
                !frm.doc.patient ||
                !frm.doc.required_blood_group ||
                !frm.doc.required_component_type
            )
        ) {
            bb_crossmatch_load_request_v3(frm, false);
        }

        if (
            frm.doc.candidate_storage &&
            (
                !frm.doc.candidate_component ||
                !frm.doc.candidate_blood_unit ||
                !frm.doc.candidate_blood_group
            )
        ) {
            bb_crossmatch_load_storage_v3(frm);
        }
    },

    blood_request(frm) {
        return bb_crossmatch_load_request_v3(frm, true);
    },

    candidate_storage(frm) {
        return bb_crossmatch_load_storage_v3(frm);
    },

    onload_post_render(frm) {
        setTimeout(() => apply_blood_crossmatch_colors(frm), 150);
    }
});

function apply_blood_crossmatch_colors(frm) {
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
            body: "#fff0f3",
            head: "#ffdfe6",
            border: "#e11d48",
            text: "#9f1239"
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



// BB_CROSSMATCH_OPEN_RESERVATION_V2
frappe.ui.form.on("Blood Crossmatch", {
    refresh(frm) {
        if (
            frm.is_new() ||
            frm.doc.crossmatch_status !== "Compatible" ||
            frm.doc.compatibility_result !== "Compatible" ||
            !frm.doc.candidate_storage
        ) {
            return;
        }

        frm.add_custom_button(
            __("الخطوة التالية: فتح / إنشاء الحجز"),
            () => {
                frappe.db.get_list("Blood Reservation", {
                    filters: {
                        blood_crossmatch: frm.doc.name
                    },
                    fields: ["name", "reservation_status"],
                    limit: 1
                }).then(rows => {
                    if (rows && rows.length) {
                        frappe.set_route(
                            "Form",
                            "Blood Reservation",
                            rows[0].name
                        );
                        return;
                    }

                    frappe.new_doc("Blood Reservation", {
                        blood_crossmatch: frm.doc.name,
                        reservation_status: "Draft",
                        reservation_date: frappe.datetime.get_today(),
                        naming_series: "RES-.YYYY.-.#####"
                    });
                }).catch(error => {
                    console.error("Could not open reservation:", error);
                    frappe.msgprint({
                        title: __("تعذر فتح الحجز"),
                        indicator: "red",
                        message: __(
                            "تعذر التحقق من سجل الحجز. أعد المحاولة بعد تحديث الصفحة."
                        )
                    });
                });
            },
            __("إجراءات")
        );
    }
});



// BB_CROSSMATCH_FIELDS_AUTOFILL_V3
function bb_crossmatch_load_request_v3(frm, resetCandidate) {
    const name = frm.doc.blood_request;

    if (!name) {
        const empty = {
            patient: "",
            patient_name: "",
            required_blood_group: "",
            required_component_type: ""
        };

        if (resetCandidate && frm.is_new()) {
            Object.assign(empty, {
                candidate_storage: "",
                candidate_component: "",
                candidate_blood_unit: "",
                candidate_blood_group: "",
                candidate_component_type: "",
                candidate_component_number: "",
                candidate_bag_number: "",
                compatibility_result: "Pending",
                crossmatch_status: "Draft"
            });
        }
        return frm.set_value(empty);
    }

    return frappe.model.with_doc("Blood Request", name).then(() => {
        const req = frappe.model.get_doc("Blood Request", name);
        if (!req) {
            frappe.msgprint(__("تعذر تحميل طلب الدم."));
            return;
        }

        const values = {
            patient: req.patient || "",
            patient_name: req.patient_name || "",
            required_blood_group: req.blood_group || "",
            required_component_type: req.component_type || ""
        };

        if (!frm.doc.crossmatch_date) {
            values.crossmatch_date = frappe.datetime.get_today();
        }
        if (!frm.doc.performed_by) {
            values.performed_by = frappe.session.user;
        }
        if (!frm.doc.compatibility_result) {
            values.compatibility_result = "Pending";
        }

        // Changing the request on a new crossmatch clears the old candidate.
        if (resetCandidate && frm.is_new()) {
            Object.assign(values, {
                candidate_storage: "",
                candidate_component: "",
                candidate_blood_unit: "",
                candidate_blood_group: "",
                candidate_component_type: "",
                candidate_component_number: "",
                candidate_bag_number: "",
                compatibility_result: "Pending",
                crossmatch_status: "Draft"
            });
        }

        return frm.set_value(values).then(() => {
            if (req.request_status !== "Approved") {
                frappe.msgprint({
                    title: __("الطلب غير معتمد"),
                    indicator: "orange",
                    message: __(
                        "يجب اعتماد طلب الدم قبل استكمال المطابقة."
                    )
                });
            }
        });
    }).catch(error => {
        console.error("Crossmatch request autofill failed:", error);
        frappe.msgprint({
            title: __("تعذر تحميل طلب الدم"),
            indicator: "red",
            message: __("تحقق من طلب الدم ثم أعد المحاولة.")
        });
    });
}

function bb_crossmatch_load_storage_v3(frm) {
    const name = frm.doc.candidate_storage;

    if (!name) {
        return frm.set_value({
            candidate_component: "",
            candidate_blood_unit: "",
            candidate_blood_group: "",
            candidate_component_type: "",
            candidate_component_number: "",
            candidate_bag_number: ""
        });
    }

    return frappe.model.with_doc("Blood Storage", name).then(() => {
        const storage = frappe.model.get_doc("Blood Storage", name);
        if (!storage) {
            frappe.msgprint(__("تعذر تحميل سجل التخزين."));
            return;
        }

        const values = {
            candidate_component: storage.blood_component || "",
            candidate_blood_unit: storage.blood_unit || "",
            candidate_blood_group: storage.blood_group || "",
            candidate_component_type: storage.component_type || "",
            candidate_component_number: storage.component_number || "",
            candidate_bag_number: storage.bag_number || ""
        };

        return frm.set_value(values).then(() => {
            if (storage.storage_status !== "Available") {
                frappe.msgprint({
                    title: __("المخزون غير متاح"),
                    indicator: "orange",
                    message: __(
                        "هذا السجل ليس في حالة Available. لا يمكن إكمال المطابقة عليه."
                    )
                });
            }
        });
    }).catch(error => {
        console.error("Crossmatch storage autofill failed:", error);
        frappe.msgprint({
            title: __("تعذر تحميل المخزون"),
            indicator: "red",
            message: __("تحقق من سجل التخزين ثم أعد المحاولة.")
        });
    });
}


/* BB_CROSSMATCH_AVAILABLE_STORAGE_QUERY_V1
 * A new crossmatch can select only available storage.
 */
frappe.ui.form.on("Blood Crossmatch", {
    setup(frm) {
        frm.set_query("candidate_storage", function () {
            return {
                filters: {
                    storage_status: "Available"
                }
            };
        });
    }
});
