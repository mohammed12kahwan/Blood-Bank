(() => {
    const WORKFLOW = [
        { name: "Blood Donor", label: "المتبرع", icon: "👤", route: "blood-donor" },
        { name: "Blood Donation", label: "التبرع", icon: "🩸", route: "blood-donation" },
        { name: "Blood Processing", label: "المعالجة", icon: "⚙️", route: "blood-processing" },
        { name: "Blood Unit", label: "وحدة الدم", icon: "🧪", route: "blood-unit" },
        { name: "Blood Screening", label: "فحص الدم", icon: "🔬", route: "blood-screening" },
        { name: "Blood Component Quality Check", label: "فحص جودة المكوّن", icon: "✅", route: "blood-component-quality-check" },
        { name: "Blood Component", label: "مكوّن الدم", icon: "🧫", route: "blood-component" },
        { name: "Blood Storage", label: "التخزين", icon: "❄️", route: "blood-storage" },
        { name: "Blood Request", label: "طلب الدم", icon: "📋", route: "blood-request" },
        { name: "Blood Reservation", label: "الحجز", icon: "🔒", route: "blood-reservation" },
        { name: "Blood Crossmatch", label: "المطابقة", icon: "🔄", route: "blood-crossmatch" },
        { name: "Blood Issue", label: "صرف الدم", icon: "📦", route: "blood-issue" },
        { name: "Blood Unit Disposition", label: "مصير الوحدة", icon: "🗑️", route: "blood-unit-disposition" }
    ];

    function open_windows(frm) {
        const current = frm.doctype;
        const items = WORKFLOW.filter(item => item.name !== current);

        const dialog = new frappe.ui.Dialog({
            title: "نوافذ بنك الدم",
            size: "large",
            fields: [
                {
                    fieldtype: "HTML",
                    fieldname: "windows"
                }
            ]
        });

        const html = `
            <div class="bb-nav-dialog">
                <div class="bb-nav-dialog-title">
                    جميع نوافذ بنك الدم
                </div>

                <div class="bb-nav-grid">
                    ${items.map(item => `
                        <button
                            type="button"
                            class="bb-nav-window-btn"
                            data-route="${item.route}">
                            <span class="bb-nav-window-icon">${item.icon}</span>
                            <span class="bb-nav-window-label">${item.label}</span>
                        </button>
                    `).join("")}
                </div>
            </div>
        `;

        dialog.fields_dict.windows.$wrapper.html(html);

        dialog.fields_dict.windows.$wrapper
            .find(".bb-nav-window-btn")
            .on("click", function () {
                const route = this.dataset.route;
                dialog.hide();
                frappe.set_route(route);
            });

        dialog.show();
    }

    function build_navigation(frm) {
        const wrapper = frm.wrapper;
        if (!wrapper) return;

        const old = wrapper.querySelector(".bb-navigation-root");
        if (old) old.remove();

        const currentIndex = WORKFLOW.findIndex(item => item.name === frm.doctype);
        if (currentIndex === -1) return;

        const previous = WORKFLOW[currentIndex - 1];
        const next = WORKFLOW[currentIndex + 1];

        const root = document.createElement("div");
        root.className = "bb-navigation-root";

        const mainBar = document.createElement("div");
        mainBar.className = "bb-navigation-main";

        const mainButtons = [];

        const addButton = document.createElement("button");
        addButton.className = "bb-nav-main-btn bb-btn-new";
        addButton.innerHTML = "➕ <span>إضافة جديد</span>";
        addButton.onclick = () => frappe.new_doc(frm.doctype);
        mainButtons.push(addButton);

        const saveButton = document.createElement("button");
        saveButton.className = "bb-nav-main-btn bb-btn-save";
        saveButton.innerHTML = "💾 <span>حفظ</span>";
        saveButton.onclick = async () => {
            await frm.save();
            build_navigation(frm);
        };
        mainButtons.push(saveButton);

        /*
         * Safe Refresh:
         * - New/unsaved form: redraw only, keeping all entered values.
         * - Dirty form: redraw only, never discard unsaved values.
         * - Saved clean form: reload the latest data from the server.
         */
        const refreshButton = document.createElement("button");
        refreshButton.className =
            "bb-nav-main-btn bb-btn-refresh";
        refreshButton.innerHTML =
            "🔄 <span>تحديث البيانات</span>";

        refreshButton.onclick = async () => {
            if (!frm || !frm.doc) {
                return;
            }

            /*
             * Never reload a new or unsaved form.
             * This prevents entered values from disappearing.
             */
            if (
                frm.is_new() ||
                !frm.doc.name ||
                frm.is_dirty()
            ) {
                frm.refresh();

                frappe.show_alert({
                    message:
                        "تم تحديث عرض النموذج مع الإبقاء على البيانات غير المحفوظة.",
                    indicator: "blue"
                });

                return;
            }

            refreshButton.disabled = true;

            try {
                await frm.reload_doc();

                frappe.show_alert({
                    message:
                        "تم تحديث البيانات من الخادم.",
                    indicator: "green"
                });
            } catch (error) {
                console.error(
                    "Blood Bank safe refresh:",
                    error
                );

                frappe.show_alert({
                    message:
                        "تعذر تحديث البيانات من الخادم.",
                    indicator: "red"
                });
            } finally {
                refreshButton.disabled = false;
            }
        };

        mainButtons.push(refreshButton);

        /*
         * Build business context for Previous / Next navigation.
         * Workflow/status/actor/system fields are deliberately excluded.
         */
        const build_window_context = () => {
            const data = {};
            const doc = frm.doc || {};

            Object.keys(doc).forEach((fieldname) => {
                const value = doc[fieldname];

                if (
                    value === undefined ||
                    value === null ||
                    value === ""
                ) {
                    return;
                }

                const lower = fieldname.toLowerCase();

                if (
                    [
                        "doctype",
                        "name",
                        "owner",
                        "creation",
                        "modified",
                        "modified_by",
                        "docstatus",
                        "idx",
                        "parent",
                        "parentfield",
                        "parenttype",
                        "naming_series"
                    ].includes(fieldname)
                ) {
                    return;
                }

                if (
                    lower.includes("status") ||
                    lower.includes("workflow") ||
                    lower.endsWith("_state") ||
                    lower === "state" ||
                    lower.endsWith("_by") ||
                    lower.includes("reviewer") ||
                    lower.includes("employee") ||
                    lower.includes("operator") ||
                    lower.includes("staff")
                ) {
                    return;
                }

                data[fieldname] = value;
            });

            /*
             * Permanent donor identity.
             */
            if (frm.doctype === "Blood Donor") {
                data.donor = frm.doc.name || "";
                data.donor_name = frm.doc.full_name || "";
            } else {
                data.donor =
                    frm.doc.donor ||
                    data.donor ||
                    "";

                data.donor_name =
                    frm.doc.donor_name ||
                    data.donor_name ||
                    "";
            }

            /*
             * Known stage conversions.
             */
            if (frm.doc.donation_date) {
                data.processing_date =
                    frm.doc.donation_date;

                data.screening_date =
                    frm.doc.donation_date;
            }

            if (frm.doc.processing_date) {
                data.screening_date =
                    frm.doc.processing_date;
            }

            if (frm.doc.donation_type) {
                if (frm.doc.donation_type === "Whole Blood") {
                    data.processing_type =
                        "Whole Blood Processing";
                } else if (
                    frm.doc.donation_type === "Apheresis"
                ) {
                    data.processing_type =
                        "Apheresis Processing";
                } else if (
                    frm.doc.donation_type === "Other"
                ) {
                    data.processing_type = "Other";
                }
            }

            if (frm.doc.processing_type) {
                if (
                    frm.doc.processing_type ===
                    "Whole Blood Processing"
                ) {
                    data.unit_type = "Whole Blood";
                } else if (
                    frm.doc.processing_type ===
                    "Apheresis Processing"
                ) {
                    data.unit_type = "Apheresis";
                } else if (
                    frm.doc.processing_type === "Other"
                ) {
                    data.unit_type = "Other";
                }
            }

            if (frm.doctype === "Blood Unit") {
                data.blood_unit =
                    frm.doc.name || "";

                if (frm.doc.blood_donation) {
                    data.blood_donation =
                        frm.doc.blood_donation;
                }
            }

            if (frm.doc.bag_number) {
                data.bag_number =
                    frm.doc.bag_number;
            }

            if (frm.doc.blood_group) {
                data.blood_group =
                    frm.doc.blood_group;
            }

            return data;
        };

        const open_window_with_context = (target) => {
            if (!target) {
                return;
            }

            const data = build_window_context();

            try {
                frappe.route_options = data;
                frappe.new_doc(target.name);
            } catch (e) {
                console.warn(
                    "Blood Bank navigation context:",
                    e
                );

                frappe.set_route(target.route);
            }
        };

        const prevButton = document.createElement("button");
        prevButton.className = "bb-nav-main-btn bb-btn-prev";

        /*
         * Blood Donor is the first workflow window, so there is no
         * previous workflow step. Reuse the same button position to
         * open the list of existing donors.
         *
         * All other workflow windows keep the original Previous behavior.
         */
        if (frm.doctype === "Blood Donor") {
            prevButton.innerHTML = "👥 <span>قائمة المتبرعين</span>";
            prevButton.disabled = false;
            prevButton.onclick = () => {
                frappe.set_route("List", "Blood Donor");
            };
        } else {
            prevButton.innerHTML = "◀ <span>السابق</span>";
            prevButton.disabled = !previous;
            prevButton.onclick = () => {
                if (previous) {
                    open_window_with_context(previous);
                }
            };
        }

        mainButtons.push(prevButton);

        const nextButton = document.createElement("button");
        nextButton.className = "bb-nav-main-btn bb-btn-next";
        nextButton.innerHTML = "▶ <span>التالي</span>";

        const donor_ready =
            frm.doctype === "Blood Donor" &&
            frm.doc &&
            frm.doc.donor_status === "Ready for Donation";

        nextButton.disabled =
            !next ||
            (
                frm.doctype === "Blood Donor" &&
                !donor_ready
            );

        nextButton.onclick = () => {
            if (!next) {
                return;
            }

            if (
                frm.doctype === "Blood Donor" &&
                (
                    !frm.doc ||
                    frm.doc.donor_status !==
                        "Ready for Donation"
                )
            ) {
                frappe.msgprint(
                    "يجب إكمال واعتماد المتبرع أولاً قبل الانتقال إلى التبرع."
                );
                return;
            }

            open_window_with_context(next);
        };

        mainButtons.push(nextButton);

        /*
         * Every workflow window gets access to its own existing records.
         * Blood Donor already uses the Previous button position for
         * "قائمة المتبرعين", so no duplicate donor-list button is added.
         */
        if (frm.doctype !== "Blood Donor") {
            const listLabels = {
                "Blood Donation": "قائمة التبرعات",
                "Blood Processing": "قائمة المعالجة",
                "Blood Unit": "قائمة وحدات الدم",
                "Blood Screening": "قائمة الفحوصات",
                "Blood Component Quality Check": "قائمة فحوصات الجودة",
                "Blood Component": "قائمة مكوّنات الدم",
                "Blood Storage": "قائمة التخزين",
                "Blood Request": "قائمة طلبات الدم",
                "Blood Reservation": "قائمة الحجوزات",
                "Blood Crossmatch": "قائمة المطابقات",
                "Blood Issue": "قائمة الصرف",
                "Blood Handover": "قائمة التسليم",
                "Blood Transfusion": "قائمة نقل الدم",
                "Blood Unit Disposition": "قائمة مصائر وحدات الدم"
            };

            const listButton = document.createElement("button");
            listButton.className = "bb-nav-main-btn bb-btn-list";
            listButton.innerHTML =
                `📋 <span>${listLabels[frm.doctype] || "القائمة"}</span>`;

            listButton.onclick = () => {
                frappe.set_route("List", frm.doctype);
            };

            mainButtons.push(listButton);
        }

        const bankButton = document.createElement("button");
        bankButton.className = "bb-nav-main-btn bb-btn-bank";
        bankButton.innerHTML = "🩸 <span>بنك الدم</span>";
        bankButton.onclick = () => frappe.set_route("blood-bank");
        mainButtons.push(bankButton);

        const homeButton = document.createElement("button");
        homeButton.className = "bb-nav-main-btn bb-btn-home";
        homeButton.innerHTML = "⌂ <span>الصفحة الرئيسية</span>";
        homeButton.onclick = () => frappe.set_route("");
        mainButtons.push(homeButton);

        mainButtons.forEach(btn => mainBar.appendChild(btn));

        const windowsBar = document.createElement("div");
        windowsBar.className = "bb-navigation-windows";

        const windowsButton = document.createElement("button");
        windowsButton.className = "bb-nav-windows-btn";
        windowsButton.innerHTML = `
            ☷
            <span>نوافذ بنك الدم</span>
            <b>${WORKFLOW.length - 1}</b>
        `;
        windowsButton.onclick = () => open_windows(frm);

        windowsBar.appendChild(windowsButton);

        /*
         * ------------------------------------------------------------
         * CURRENT RECORD NUMBER
         *
         * Every Blood Bank window gets a dedicated record-number area.
         * New records show "Unsaved" until Save creates the real name.
         * Saved records always show their actual Frappe document name.
         * ------------------------------------------------------------
         */

        const recordLabels = {
            "Blood Donor": "رقم المتبرع | Donor No.",
            "Blood Donation": "رقم التبرع | Donation No.",
            "Blood Processing": "رقم المعالجة | Processing No.",
            "Blood Unit": "رقم وحدة الدم | Blood Unit No.",
            "Blood Screening": "رقم الفحص | Screening No.",
            "Blood Component Quality Check": "رقم فحص الجودة | Quality Check No.",
            "Blood Component": "رقم المكوّن | Component No.",
            "Blood Storage": "رقم التخزين | Storage No.",
            "Blood Request": "رقم الطلب | Request No.",
            "Blood Reservation": "رقم الحجز | Reservation No.",
            "Blood Crossmatch": "رقم المطابقة | Crossmatch No.",
            "Blood Issue": "رقم الصرف | Issue No.",
            "Blood Handover": "رقم التسليم | Handover No.",
            "Blood Transfusion": "رقم نقل الدم | Transfusion No.",
            "Blood Unit Disposition": "رقم مصير الوحدة | Disposition No."
        };

        const recordNumber =
            frm &&
            frm.doc &&
            frm.doc.name &&
            !frm.is_new()
                ? frm.doc.name
                : "غير محفوظ | Unsaved";

        const recordBox = document.createElement("div");
        recordBox.className = "bb-record-number-box";

        recordBox.innerHTML = `
            <div class="bb-record-number-label">
                ${recordLabels[frm.doctype] || "رقم السجل | Record No."}
            </div>
            <div class="bb-record-number-value">
                ${recordNumber}
            </div>
        `;

        recordBox.style.cssText = `
            width: 100%;
            box-sizing: border-box;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            margin: 10px 0 12px;
            padding: 10px 16px;
            border: 1px solid rgba(0, 0, 0, 0.12);
            border-radius: 10px;
            background: rgba(255, 255, 255, 0.96);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
            direction: rtl;
        `;

        const recordLabelElement =
            recordBox.querySelector(".bb-record-number-label");

        if (recordLabelElement) {
            recordLabelElement.style.cssText = `
                font-weight: 700;
                font-size: 13px;
                white-space: nowrap;
            `;
        }

        const recordValueElement =
            recordBox.querySelector(".bb-record-number-value");

        if (recordValueElement) {
            recordValueElement.style.cssText = `
                direction: ltr;
                text-align: left;
                font-weight: 800;
                font-size: 14px;
                font-family: monospace;
                padding: 5px 12px;
                border-radius: 7px;
                background: rgba(0, 0, 0, 0.05);
                min-width: 190px;
            `;
        }

        root.appendChild(mainBar);
        root.appendChild(recordBox);
        root.appendChild(windowsBar);

        const target = wrapper.querySelector(".form-layout")
            || wrapper.querySelector(".form-page")
            || wrapper.firstElementChild
            || wrapper;

        target.parentNode.insertBefore(root, target);
    }

    WORKFLOW.forEach(item => {
        frappe.ui.form.on(item.name, {
            refresh(frm) { if (frm.__bb_embedded) return;
                build_navigation(frm);
            },
            onload_post_render(frm) { if (frm.__bb_embedded) return;
                build_navigation(frm);
            }
        });
    });
})();

/* BB WORKFLOW CONTEXT + ACTOR ENGINE */

/* BB WORKFLOW CONTEXT + ACTOR ENGINE */

(() => {
    // Local workflow list for the context/actor engine.
    // The original WORKFLOW belongs to a different IIFE.
    const WORKFLOW = [
        { name: "Blood Donor" },
        { name: "Blood Donation" },
        { name: "Blood Processing" },
        { name: "Blood Unit" },
        { name: "Blood Screening" },
        { name: "Blood Component Quality Check" },
        { name: "Blood Component" },
        { name: "Blood Storage" },
        { name: "Blood Request" },
        { name: "Blood Reservation" },
        { name: "Blood Crossmatch" },
        { name: "Blood Issue" },
        { name: "Blood Handover" },
        { name: "Blood Transfusion" },
        { name: "Blood Unit Disposition" }
    ];

    const CONTEXT_KEY = "bb_blood_bank_workflow_context_v1";

    const ACTOR_RULES = {
        "Blood Donor": {
            review: ["eligibility_reviewed_by"],
        },

        "Blood Donation": {
            bleed: ["collection_staff"],
            collection: ["collection_staff"],
        },

        "Blood Processing": {
            processing: ["processing_started_by"],
            separation: ["separation_started_by"],
        },

        "Blood Unit": {
            collection: ["collection_staff"],
        },

        "Blood Screening": {
            screen: ["screened_by"],
            review: ["reviewer"],
        },

        "Blood Component Quality Check": {
            inspect: ["inspected_by"],
            discard: ["discarded_by"],
        },

        "Blood Component": {
            prepare: ["prepared_by"],
        },

        "Blood Storage": {
            store: ["stored_by"],
            available: ["available_by"],
            discard: ["discarded_by"],
        },

        "Blood Request": {
            create: ["requested_by"],
        },

        "Blood Reservation": {
            reserve: ["reserved_by"],
            ready: ["ready_for_issue_by"],
        },

        "Blood Crossmatch": {
            match: ["performed_by"],
            complete: ["performed_by"],
        },

        "Blood Issue": {
            verification: ["verification_started_by"],
            issue: ["issued_by"],
            return: ["returned_by"],
        },

        "Blood Handover": {
            start: ["handover_started_by"],
            complete: ["handover_completed_by"],
        },

        "Blood Transfusion": {
            assessment: ["assessment_started_by"],
            start: ["transfusion_started_by"],
            transfus: ["transfused_by"],
            stop: ["stopped_by"],
            outcome: ["outcome_recorded_by"],
        },

        "Blood Unit Disposition": {
            reject: ["rejected_by"],
            discard: ["discarded_by"],
        },
    };

    const BLOCKED = new Set([
        "doctype",
        "name",
        "owner",
        "creation",
        "modified",
        "modified_by",
        "docstatus",
        "idx",
        "parent",
        "parentfield",
        "parenttype",
        "naming_series",
    ]);

    function is_actor_field(fieldname) {
        const f = String(fieldname || "").toLowerCase();

        return (
            f.endsWith("_by") ||
            f.includes("reviewer") ||
            f.includes("employee") ||
            f.includes("operator") ||
            f.includes("staff")
        );
    }

    function collect_context(frm) {
        const data = {};

        if (!frm || !frm.doc) {
            return data;
        }

        Object.keys(frm.doc).forEach((fieldname) => {
            if (!fieldname || BLOCKED.has(fieldname)) {
                return;
            }

            const lower = fieldname.toLowerCase();

            if (
                lower.includes("status") ||
                lower.includes("workflow") ||
                lower.endsWith("_state") ||
                lower === "state"
            ) {
                return;
            }

            if (is_actor_field(fieldname)) {
                return;
            }

            const value = frm.doc[fieldname];

            if (
                value !== undefined &&
                value !== null &&
                value !== ""
            ) {
                data[fieldname] = value;
            }
        });

        /*
         * Donor identity is the permanent identity of the whole
         * blood-bank workflow.
         */
        if (frm.doctype === "Blood Donor") {
            data.donor = frm.doc.name || "";
            data.donor_name = frm.doc.full_name || "";
        }

        /*
         * Keep the blood-unit identity for later stages.
         */
        if (frm.doctype === "Blood Unit") {
            data.blood_unit = frm.doc.name || "";
        }

        /*
         * Known stage conversions.
         */
        if (frm.doc.donation_date) {
            data.processing_date = frm.doc.donation_date;
            data.screening_date = frm.doc.donation_date;
        }

        if (frm.doc.processing_date) {
            data.screening_date = frm.doc.processing_date;
        }

        if (frm.doc.donation_type) {
            if (frm.doc.donation_type === "Whole Blood") {
                data.processing_type = "Whole Blood Processing";
            } else if (frm.doc.donation_type === "Apheresis") {
                data.processing_type = "Apheresis Processing";
            } else if (frm.doc.donation_type === "Other") {
                data.processing_type = "Other";
            }
        }

        if (frm.doc.processing_type) {
            if (frm.doc.processing_type === "Whole Blood Processing") {
                data.unit_type = "Whole Blood";
            } else if (frm.doc.processing_type === "Apheresis Processing") {
                data.unit_type = "Apheresis";
            } else if (frm.doc.processing_type === "Other") {
                data.unit_type = "Other";
            }
        }

        return {
            source_doctype: frm.doctype,
            data: data,
        };
    }

    function save_context(frm) {
        try {
            const payload = collect_context(frm);

            sessionStorage.setItem(
                CONTEXT_KEY,
                JSON.stringify(payload)
            );
        } catch (e) {
            console.warn("Blood Bank context save:", e);
        }
    }

    function load_context() {
        try {
            const raw = sessionStorage.getItem(CONTEXT_KEY);

            if (!raw) {
                return null;
            }

            return JSON.parse(raw);
        } catch (e) {
            console.warn("Blood Bank context read:", e);
            return null;
        }
    }

    function clear_context() {
        try {
            sessionStorage.removeItem(CONTEXT_KEY);
        } catch (e) {}
    }

    function apply_context(frm) {
        if (!frm || !frm.doc || !frm.is_new()) {
            return;
        }

        const payload = load_context();

        if (!payload || !payload.data) {
            return;
        }

        const data = payload.data;

        /*
         * Blood Donor receives the donor name when navigating back.
         */
        if (
            frm.doctype === "Blood Donor" &&
            data.donor_name &&
            frm.fields_dict.full_name &&
            !frm.doc.full_name
        ) {
            frm.set_value("full_name", data.donor_name);
        }

        Object.keys(data).forEach((fieldname) => {
            if (
                fieldname === "source_doctype" ||
                fieldname === "donor"
            ) {
                return;
            }

            if (!frm.fields_dict[fieldname]) {
                return;
            }

            if (is_actor_field(fieldname)) {
                return;
            }

            const current = frm.doc[fieldname];

            if (
                current === undefined ||
                current === null ||
                current === ""
            ) {
                frm.set_value(fieldname, data[fieldname]);
            }
        });

        /*
         * Donor Link has priority in all later stages.
         */
        if (
            frm.doctype !== "Blood Donor" &&
            data.donor &&
            frm.fields_dict.donor &&
            !frm.doc.donor
        ) {
            frm.set_value("donor", data.donor);
        }

        if (
            frm.doctype !== "Blood Donor" &&
            data.donor_name &&
            frm.fields_dict.donor_name &&
            !frm.doc.donor_name
        ) {
            frm.set_value("donor_name", data.donor_name);
        }

        clear_context();
    }

    function set_user_field(frm, fieldname) {
        if (!frm || !frm.fields_dict[fieldname]) {
            return;
        }

        if (
            frm.doc[fieldname] === undefined ||
            frm.doc[fieldname] === null ||
            frm.doc[fieldname] === ""
        ) {
            frm.set_value(fieldname, frappe.session.user);
        }
    }

    function apply_actor_by_action(frm) {
        if (!frm || !frm.doc) {
            return;
        }

        const action = String(
            frm.selected_workflow_action || ""
        ).toLowerCase();

        const rules = ACTOR_RULES[frm.doctype];

        if (!rules) {
            return;
        }

        Object.keys(rules).forEach((keyword) => {
            if (!action.includes(keyword)) {
                return;
            }

            rules[keyword].forEach(set_user_field.bind(null, frm));
        });

        /*
         * Blood Donor eligibility review has an automatic reviewer/date.
         */
        if (
            frm.doctype === "Blood Donor" &&
            action.includes("eligible")
        ) {
            set_user_field(frm, "eligibility_reviewed_by");

            if (frm.fields_dict.eligibility_review_date) {
                frm.set_value(
                    "eligibility_review_date",
                    frappe.datetime.get_today()
                );
            }
        }

        if (
            frm.doctype === "Blood Donor" &&
            (
                action.includes("defer") ||
                action.includes("reject")
            )
        ) {
            set_user_field(frm, "eligibility_reviewed_by");

            if (frm.fields_dict.eligibility_review_date) {
                frm.set_value(
                    "eligibility_review_date",
                    frappe.datetime.get_today()
                );
            }
        }
    }

    /*
     * Blood Request requester is the current logged-in user
     * when the record is first created.
     */
    frappe.ui.form.on("Blood Request", {
        refresh(frm) {
            apply_context(frm);

            if (
                frm.is_new() &&
                frm.fields_dict.requested_by &&
                !frm.doc.requested_by
            ) {
                set_user_field(frm, "requested_by");
            }
        },

        after_workflow_action(frm) {
            apply_actor_by_action(frm);
            save_context(frm);
        },
    });

    frappe.ui.form.on("Blood Donor", {
        refresh(frm) {
            apply_context(frm);
        },

        eligibility_status(frm) {
            if (
                frm.doc.eligibility_status &&
                frm.doc.eligibility_status !== "Pending"
            ) {
                set_user_field(frm, "eligibility_reviewed_by");

                if (frm.fields_dict.eligibility_review_date) {
                    frm.set_value(
                        "eligibility_review_date",
                        frappe.datetime.get_today()
                    );
                }
            }
        },

        after_workflow_action(frm) {
            apply_actor_by_action(frm);
            save_context(frm);
        },
    });

    /*
     * Register the same context/actor behavior for every Blood Bank window.
     */
    WORKFLOW.forEach((item) => {
        if (
            item.name === "Blood Request" ||
            item.name === "Blood Donor"
        ) {
            return;
        }

        frappe.ui.form.on(item.name, {
            refresh(frm) {
                apply_context(frm);
            },

            after_workflow_action(frm) {
                apply_actor_by_action(frm);
                save_context(frm);
            },
        });
    });

    /*
     * Capture Previous/Next BEFORE the existing navigation handler.
     * This preserves the current navigation buttons while attaching
     * the same business context to the next form.
     *
     * Blood Donor's Previous button is its donor-list button and is
     * intentionally excluded.
     */
    document.addEventListener(
        "click",
        function (event) {
            const button = event.target.closest(
                "button.bb-nav-main-btn"
            );

            if (!button) {
                return;
            }

            const is_next =
                button.classList.contains("bb-btn-next");

            const is_prev =
                button.classList.contains("bb-btn-prev");

            if (!is_next && !is_prev) {
                return;
            }

            const frm =
                (typeof cur_frm !== "undefined" && cur_frm) ||
                frappe.get_cur_frm?.();

            if (!frm || !frm.doc) {
                return;
            }

            if (
                is_prev &&
                frm.doctype === "Blood Donor"
            ) {
                return;
            }

            if (button.disabled) {
                return;
            }

            save_context(frm);
        },
        true
    );
})();
