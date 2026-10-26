frappe.pages["blood-bank-component-work"].on_page_load = function (wrapper) {
    const node = wrapper && wrapper[0] ? wrapper[0] : wrapper;
    if (node.__bbComponentWorkController) return;

    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: "متابعة مكونات الدم",
        single_column: true
    });

    $(page.main).html(frappe.render_template("blood_bank_component_work"));
    const root = $(page.main).find("#bb-cw-root");

    const STAGES = [
        {
            doctype: "Blood Component",
            status: "component_status",
            rows: "component_records",
            title: "Blood Component — المكوّن",
            description: "إنشاء مكوّن مرتبط بالمعالجة ووحدة الدم التابعة لرقم التبرع."
        },
        {
            doctype: "Blood Screening",
            status: "screening_status",
            rows: "screening_records",
            title: "Blood Screening — فحص الدم",
            description: "تسجيل الفحص ومراجعة النتائج وقبولها أو رفضها."
        },
        {
            doctype: "Blood Component Quality Check",
            status: "qc_status",
            rows: "quality_records",
            title: "Blood Component Quality Check — فحص الجودة",
            description: "فحص المكوّن بعد اكتمال فحص الدم وقبوله."
        },
        {
            doctype: "Blood Storage",
            status: "storage_status",
            rows: "storage_records",
            title: "Blood Storage — التخزين",
            description: "تسجيل التخزين بعد نجاح فحص الجودة."
        }
    ];

    const API = {
        context: "blood_bank.blood_bank.page.blood_bank_component_work.blood_bank_component_work.get_donation_context",
        schema: "blood_bank.blood_bank.page.blood_bank_component_work.ui_api.get_stage_schema",
        save: "blood_bank.blood_bank.page.blood_bank_component_work.stage_ops.save_stage_document",
        transitions: "blood_bank.blood_bank.page.blood_bank_component_work.stage_ops.get_stage_transitions",
        catalog: "blood_bank.blood_bank.page.blood_bank_component_work.stage_ops.get_workflow_action_catalog",
        action: "blood_bank.blood_bank.page.blood_bank_component_work.stage_ops.apply_stage_action"
    };

    const state = {
        donation: "",
        context: null,
        schemas: {},
        index: 0,
        name: "",
        doc: null,
        isNew: false,
        controls: {},
        loading: false,
        // BB_COMPONENT_FLICKER_GUARD_V4
        suppressIntermediateActions: false
    };

    const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);

    async function call(method, args = {}) {
        const response = await frappe.call({ method, args });
        return response.message;
    }

    function notify(message, indicator = "blue") {
        frappe.show_alert({ message, indicator }, 5);
    }

    /*
     * Frappe Date values use the internal YYYY-MM-DD format.
     * Never pass a DocField default token such as "Today" to a Date control.
     */
    function resolveFieldValue(field, savedValue) {
        if (savedValue !== undefined && savedValue !== null && savedValue !== "") {
            // BB_DATE_FIELD_STRIP_TIME_V1
            // Date controls receive YYYY-MM-DD, never a full timestamp.
            if (field.fieldtype === "Date") {
                const rawDate = String(savedValue).trim();
                const dateTimeMatch = rawDate.match(
                    /^(\d{4}-\d{2}-\d{2})(?:[ T].*)?$/
                );
                if (dateTimeMatch) {
                    return dateTimeMatch[1];
                }
            }
            return savedValue;
        }

        const defaultValue = field.default;
        const token = String(defaultValue ?? "").trim().toLowerCase();

        if (field.fieldtype === "Date" && token === "today") {
            return frappe.datetime.get_today();
        }

        if (field.fieldtype === "Datetime" && (token === "now" || token === "today")) {
            return frappe.datetime.now_datetime();
        }

        if (field.fieldtype === "Date" && token === "now") {
            return frappe.datetime.get_today();
        }

        if (
            (field.fieldtype === "Date" || field.fieldtype === "Datetime") &&
            ["today", "now"].includes(token)
        ) {
            return "";
        }

        return defaultValue ?? "";
    }


    const stageSnapshots = STAGES.map(() => ({
        name: "",
        doc: null,
        isNew: false,
        controls: {},
        values: null,
        source: null
    }));

    function stagePanel(index = state.index) {
        return root.find(
            '.bb-cw-stage-card[data-stage-card="' + Number(index) + '"]'
        );
    }

    function stageSourceValue(index, key) {
        return stagePanel(index)
            .find('[data-source-key="' + key + '"]')
            .val() || "";
    }

    function saveStageSnapshot(index = state.index) {
        index = Number(index);
        if (!STAGES[index]) return;

        const old = stageSnapshots[index] || {};
        const active = index === Number(state.index);
        const controls = active ? (state.controls || {}) : (old.controls || {});
        const values = {};

        Object.keys(controls).forEach(fieldname => {
            try {
                values[fieldname] = controls[fieldname].get_value();
            } catch (error) {
                // تجاهل عنصر تحكم تم إزالته من الصفحة.
            }
        });

        const panel = stagePanel(index);
        const source = {};
        ["unit", "component", "qc"].forEach(key => {
            const select = panel.find('[data-source-key="' + key + '"]');
            if (select.length) source[key] = select.val() || "";
        });

        stageSnapshots[index] = {
            name: active ? state.name : (old.name || ""),
            doc: active ? state.doc : (old.doc || null),
            isNew: active ? Boolean(state.isNew) : Boolean(old.isNew),
            controls,
            values: Object.keys(values).length ? values : (old.values || null),
            source: Object.keys(source).length ? source : (old.source || null)
        };
    }

    function restoreStageSnapshot(index) {
        index = Number(index);
        const snapshot = stageSnapshots[index] || {};
        state.index = index;
        state.name = snapshot.name || "";
        state.doc = snapshot.doc || null;
        state.isNew = Boolean(snapshot.isNew);
        state.controls = snapshot.controls || {};
    }

    function currentStageRows() {
        return state.context?.[STAGES[state.index].rows] || [];
    }

    function names(rows) {
        return new Set((rows || []).map(row => row.name));
    }

    function acceptedScreeningExists(component) {
        if (!component) return false;
        return (state.context?.screening_records || []).some(screening =>
            screening.blood_unit === component.blood_unit &&
            screening.screening_status === "Accepted" &&
            screening.overall_result === "Passed"
        );
    }

    function canOpenStage(index) {
        if (!state.context) return false;

        const context = state.context;
        const components = context.component_records || [];
        const qualityChecks = context.quality_records || [];

        if (index === 0) {
            return Boolean(context.source_link_check?.ready_for_component) ||
                components.length > 0;
        }

        if (index === 1) {
            return components.length > 0;
        }

        if (index === 2) {
            return components.some(component =>
                component.component_status === "Quality Check" &&
                acceptedScreeningExists(component)
            );
        }

        if (index === 3) {
            return qualityChecks.some(qc =>
                qc.qc_status === "Passed" &&
                qc.overall_result === "Passed" &&
                components.some(component =>
                    component.name === qc.blood_component &&
                    component.component_status === "Quality Check" &&
                    acceptedScreeningExists(component)
                )
            );
        }

        return false;
    }


    /* BB_COMPONENT_GROUP_VERIFICATION_BUTTON_V1 */
    /* BB_DYNAMIC_SINGLE_GROUP_VERIFICATION_BUTTON_V1 */
    function updateGroupVerificationButton() {
        const wrap = root.find("#bb-cw-screening-actions");
        const button = root.find("#bb-cw-group-verification");
        const visible = Number(state.index) === 1;

        if (!wrap.length || !button.length) return;

        wrap.prop("hidden", !visible);
        wrap.css("display", visible ? "flex" : "none");

        // إزالة أي زر اعتماد إضافي قديم؛ نستخدم زر HTML الأصلي فقط.
        wrap.find("#bb-cw-approve-previous-group-test").remove();

        if (!visible) {
            button.prop("disabled", true);
            button.attr("data-bb-group-mode", "blocked");
            return;
        }

        const screening = state.doc || {};
        const unitName =
            screening.blood_unit ||
            state.context?.source_link_check?.unit?.name ||
            "";

        if (!unitName) {
            button.text(__("حدد وحدة الدم أولًا"));
            button.prop("disabled", true);
            button.attr("data-bb-group-mode", "blocked");
            return;
        }

        button.prop("disabled", true);
        button.text(__("جارٍ التحقق من النتيجة السابقة..."));

        frappe.call({
            method: "blood_bank.blood_bank.doctype.blood_group_verification.blood_group_verification.get_group_verification_button_state",
            args: { unit_name: unitName },
            callback: function (r) {
                const current = state.doc || {};
                const currentUnit =
                    current.blood_unit ||
                    state.context?.source_link_check?.unit?.name ||
                    "";

                // تجاهل نتيجة طلب قديم إذا تغير السجل أو المرحلة.
                if (Number(state.index) !== 1 || currentUnit !== unitName) return;

                if (!r.message) {
                    button.text(__("تعذر تحديد حالة النتيجة"));
                    button.prop("disabled", true);
                    button.attr("data-bb-group-mode", "blocked");
                    return;
                }

                button.text(__(r.message.label));
                button.attr("data-bb-group-mode", r.message.mode);
                button.prop("disabled", !r.message.enabled);
            },
            error: function () {
                button.text(__("تعذر التحقق؛ أعد المحاولة"));
                button.prop("disabled", true);
                button.attr("data-bb-group-mode", "blocked");
            }
        });
    }

    function openGroupVerificationDialog() {
        if (Number(state.index) !== 1) return;

        const screening = state.doc || {};
        const unitName =
            screening.blood_unit ||
            state.context?.source_link_check?.unit?.name ||
            "";

        if (!unitName) {
            frappe.msgprint(
                __("لا توجد وحدة دم مرتبطة بمرحلة الفحص الحالية. اربط وحدة الدم بالتبرع والمعالجة أولاً.")
            );
            return;
        }

        frappe.prompt(
            [
                {
                    fieldname: "screening_name",
                    fieldtype: "Link",
                    label: __("Blood Screening / سجل فحص العينة"),
                    options: "Blood Screening",
                    default: screening.blood_unit ? screening.name : "",
                    get_query: function () {
                        return {
                            filters: {
                                blood_unit: unitName,
                                screening_status: [
                                    "in",
                                    ["Screening", "Results Review"]
                                ],
                                sample_id: ["!=", ""]
                            }
                        };
                    },
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
                    label: __("تمت مطابقة بطاقة العينة الفعلية مع سجل الفحص"),
                    default: 0,
                    reqd: 1
                },
                {
                    fieldname: "test_notes",
                    fieldtype: "Small Text",
                    label: __("Test Notes / ملاحظات الفحص")
                },
                {
                    fieldname: "confirm_same_user_approval",
                    fieldtype: "Check",
                    label: __("أؤكد مطابقة العينة وأعتمد نتيجة الفصيلة بنفسي"),
                    default: 0
                }
            ],
            function (values) {
                if (!values.sample_identity_confirmed) {
                    frappe.msgprint(
                        __("يجب تأكيد مطابقة بطاقة العينة الفعلية قبل التسجيل.")
                    );
                    return;
                }

                if (!values.confirm_same_user_approval) {
                    frappe.msgprint(__("يجب تأكيد اعتماد النتيجة بواسطة المستخدم الحالي."));
                    return;
                }

                frappe.call({
                    method: "blood_bank.blood_bank.doctype.blood_group_verification.blood_group_verification.record_group_test",
                    args: {
                        unit_name: unitName,
                        screening_name: values.screening_name,
                        tested_abo_group: values.tested_abo_group,
                        tested_rh_factor: values.tested_rh_factor,
                        test_method: values.test_method,
                        test_reference: values.test_reference,
                        sample_identity_confirmed: values.sample_identity_confirmed,
                        test_notes: values.test_notes,
                        approve_same_user: values.confirm_same_user_approval ? 1 : 0
                    },
                    freeze: true,
                    callback: function (r) {
                        if (!r.message) return;
                        frappe.msgprint(r.message.message);
                        if (state.donation) loadDonation(state.donation);
                    }
                });
            },
            __("Record Blood Group Test / تسجيل نتيجة الفحص"),
            __("Save Test Record / حفظ سجل الفحص")
        );
    }


    // BB_PREVIOUS_GROUP_RESULT_APPROVAL_BUTTON_V1
    function openPreviousGroupVerificationDialog() {
        if (Number(state.index) !== 1) return;

        const screening = state.doc || {};
        const unitName =
            screening.blood_unit ||
            state.context?.source_link_check?.unit?.name ||
            "";

        if (!unitName) {
            frappe.msgprint(__("حدد سجل فحص مرتبطًا بوحدة الدم أولًا."));
            return;
        }

        frappe.call({
            method: "blood_bank.blood_bank.doctype.blood_group_verification.blood_group_verification.get_pending_group_test",
            args: { unit_name: unitName },
            freeze: true,
            callback: function (r) {
                if (!r.message) return;
                const record = r.message;
                const message = [
                    "سجل التحقق السابق: " + record.name,
                    "الوحدة: " + record.unit,
                    "رقم العينة: " + record.sample_id,
                    "سجل فحص الدم: " + record.screening,
                    "النتيجة المحفوظة: " + record.abo + " " + record.rh,
                    "طريقة الفحص: " + (record.test_method || "—"),
                    "منفذ الفحص: " + record.tested_by,
                    "",
                    "سيتم اعتماد هذا السجل نفسه دون إنشاء سجل جديد."
                ].join("\n");

                frappe.confirm(message, function () {
                    frappe.call({
                        method: "blood_bank.blood_bank.doctype.blood_group_verification.blood_group_verification.approve_pending_group_test",
                        args: { verification_name: record.name },
                        freeze: true,
                        callback: function (result) {
                            if (!result.message) return;
                            frappe.msgprint(result.message.message);
                            if (state.donation) loadDonation(state.donation);
                        }
                    });
                });
            }
        });
    }

/* BB_COMPONENT_TABS_NATIVE_V3 */


    function renderTabs() {
        const active = Number(state.index);
        root.find("#bb-cw-active-window-title").text(
            STAGES[active].title || STAGES[active].doctype
        );
        const activeGroup = active < 2 ? 0 : 1;

        root.find("[data-stage-group]").each(function () {
            const group = Number(this.dataset.stageGroup);
            const selected = group === activeGroup;
            $(this)
                .toggleClass("is-active", selected)
                .attr("aria-selected", String(selected));
        });

        root.find("[data-stage-screen]").each(function () {
            const group = Number(this.dataset.stageScreen);
            $(this).prop("hidden", group !== activeGroup);
        });

        root.find("[data-stage-card]").each(function () {
            const index = Number(this.dataset.stageCard);
            const ready = canOpenStage(index);
            const isActive = index === active;

            $(this)
                .toggleClass("is-active", isActive)
                .toggleClass("is-blocked", !ready)
                .attr("aria-current", isActive ? "step" : "false");

            const button = $(this).find("[data-activate-stage]");
            button
                .prop("disabled", false)
                .attr("aria-disabled", "false")
                .attr(
                    "title",
                    ready
                        ? "فتح هذه النافذة"
                        : "يمكن فتح النافذة وتعبئة الحقول؛ يبقى الحفظ والإجراء مشروطين بمتطلبات سير العمل."
                );
        });

        updateGroupVerificationButton();
    }



    function renderDonationSummary() {
        const context = state.context;
        if (!context) return;

        const donation = context.donation || {};
        const source = context.source_link_check || {};

        root.find("#bb-cw-donation-id").text(donation.name || "—");
        root.find("#bb-cw-donor").text(donation.donor_name || donation.donor || "—");
        root.find("#bb-cw-bag").text(donation.bag_number || "—");
        root.find("#bb-cw-processing").text(source.processing?.name || "—");
        root.find("#bb-cw-unit").text(source.unit?.name || "—");
        root.find("#bb-cw-source-result").text(
            source.ready_for_component ? "المصدر صالح" : "يتطلب التحقق"
        );
        root.find("#bb-cw-source-message")
            .removeClass("alert-info alert-warning alert-danger")
            .addClass(source.ready_for_component ? "alert-info" : "alert-warning")
            .text(source.reason || "");

        renderTabs();
    }

    // BB_COMPONENT_UI_SOURCE_AUTOFILL_V3
    function deriveSourceFieldValue(fieldname, doc = {}) {
        const context = state.context || {};
        const source = context.source_link_check || {};
        const doctype = STAGES[state.index]?.doctype || "";
        const donation = context.donation || {};
        const components = context.component_records || [];
        const units = context.unit_records || [];
        const processingRows = context.processing_records || [];
        const screenings = context.screening_records || [];

        const componentName =
            stageSourceValue(state.index, "component") ||
            doc.blood_component ||
            state.doc?.blood_component ||
            "";

        const component = components.find(
            row => row.name === componentName
        ) || {};

        const unitName =
            (doctype === "Blood Screening"
                ? stageSourceValue(state.index, "unit")
                : "") ||
            component.blood_unit ||
            doc.blood_unit ||
            state.doc?.blood_unit ||
            source.unit?.name ||
            "";

        const unit = units.find(row => row.name === unitName) ||
            (source.unit?.name === unitName ? source.unit : {}) ||
            {};

        const processing = processingRows.find(row =>
            row.name === component.blood_processing ||
            row.name === unit.blood_processing ||
            row.name === source.processing?.name
        ) || source.processing || {};

        const screening = screenings.find(row =>
            row.name === component.blood_screening
        ) || screenings.find(row =>
            row.blood_unit === unitName &&
            row.screening_status === "Accepted" &&
            row.overall_result === "Passed"
        ) || screenings.find(row => row.blood_unit === unitName) || {};

        const derived = {
            blood_processing:
                component.blood_processing ||
                unit.blood_processing ||
                processing.name || "",
            blood_unit:
                component.blood_unit || unit.name || unitName || "",
            blood_screening:
                component.blood_screening ||
                screening.name ||
                processing.blood_screening || "",
            donor:
                component.donor || unit.donor ||
                processing.donor || donation.donor || "",
            donor_name:
                component.donor_name || unit.donor_name ||
                processing.donor_name || donation.donor_name || "",
            blood_group:
                component.blood_group || unit.blood_group ||
                processing.blood_group || "",
            bag_number:
                component.bag_number || unit.bag_number ||
                processing.bag_number || donation.bag_number || "",
            component_type: component.component_type || "",
            component_number: component.component_number || "",
            component_volume: component.volume ?? "",
            sample_id: screening.sample_id || ""
        };

        return derived[fieldname] ?? "";
    }

    function makeFieldControl(parent, field, doc = {}) {
        const doctype = STAGES[state.index].doctype;
        const actorField = {
            "Blood Component": "prepared_by",
            "Blood Screening": "screened_by",
            "Blood Component Quality Check": "inspected_by",
            "Blood Storage": "stored_by"
        }[doctype];

        const controlledActor =
            field.fieldname === actorField ||
            (doctype === "Blood Storage" && field.fieldname === "available_by");

        const df = {
            fieldname: field.fieldname,
            label: field.label,
            fieldtype: field.fieldtype || "Data",
            options: field.options || "",
            reqd: Boolean(field.reqd),
            read_only: Boolean(field.read_only) || controlledActor,
            description: field.description || ""
        };

        let value = resolveFieldValue(field, doc[field.fieldname]);

        if (value === null || value === undefined || value === "") {
            const derived = deriveSourceFieldValue(field.fieldname, doc);
            if (derived !== null && derived !== undefined && derived !== "") {
                value = derived;
            }
        }

        if (state.isNew && controlledActor && !value) {
            value = frappe.session.user || "";
        }

        // BB_STORAGE_UNIT_VISIBLE_IN_STORAGE_V1
        // Display the unit belonging to the selected component in storage.
        if (
            STAGES[state.index].doctype === "Blood Storage" &&
            field.fieldname === "blood_unit" &&
            !value
        ) {
            const selectedComponentName =
                stageSourceValue(state.index, "component") ||
                doc.blood_component ||
                state.doc?.blood_component ||
                "";

            const components = state.context?.component_records || [];
            const selectedComponent = components.find(
                row => row.name === selectedComponentName
            ) || (components.length === 1 ? components[0] : null);

            value = selectedComponent?.blood_unit || "";
        }

        // BB_STORAGE_REFERENCE_CURRENT_USER_V1
        // Fill the storage reference from the logged-in account on new records.
        if (
            STAGES[state.index].doctype === "Blood Storage" &&
            field.fieldname === "storage_reference" &&
            !value
        ) {
            value = frappe.session.user || "";
        }

        if (
            STAGES[state.index].doctype === "Blood Component" &&
            field.fieldname === "component_number" &&
            !value
        ) {
            // The DocType controller generates the real component number.
            df.reqd = false;
        }

        const control = frappe.ui.form.make_control({
            parent,
            df,
            render_input: true
        });

        control.refresh();

        /*
         * Critical date fix:
         * defaults such as "Today" are normalized before set_value().
         */
        control.set_value(value);

        state.controls[field.fieldname] = control;
    }

    function populateSourceControls() {
        const host = stagePanel(state.index).find("[data-stage-source-controls]").empty();
        const context = state.context;

        if (!context) return;


        function addSelect(id, label, rows, selected, display) {
            const col = $('<div class="col-md-6"></div>').appendTo(host);
            const group = $('<div class="form-group"></div>').appendTo(col);
            const key = /-unit$/.test(id) ? "unit" :
                (/-component$/.test(id) ? "component" : "qc");
            const actualId = id + "-" + state.index;
            const savedSource = stageSnapshots[state.index]?.source;

            if (
                savedSource &&
                Object.prototype.hasOwnProperty.call(savedSource, key)
            ) {
                selected = savedSource[key];
            }

            $("<label>").attr("for", actualId).text(label).appendTo(group);

            const select = $('<select class="form-control"></select>')
                .attr("id", actualId)
                .attr("data-source-key", key)
                .appendTo(group);

            select.append($("<option>").val("").text("— اختر —"));

            (rows || []).forEach(row => {
                const option = $("<option>")
                    .val(row.name)
                    .text(display(row))
                    .appendTo(select);
                if (row.name === selected) option.prop("selected", true);
            });
        }


        if (state.index === 0) {
            const source = context.source_link_check || {};
            const col = $('<div class="col-md-12"></div>').appendTo(host);
            const alert = $('<div class="alert alert-info"></div>').appendTo(col);

            alert.text(
                `المعالجة: ${source.processing?.name || "—"} | ` +
                `وحدة الدم: ${source.unit?.name || "—"}`
            );
        }

        if (state.index === 1) {
            const selected =
                state.doc?.blood_unit ||
                context.source_link_check?.unit?.name ||
                "";

            addSelect(
                "bb-cw-source-unit",
                "وحدة الدم",
                context.unit_records || [],
                selected,
                row => `${row.name} — ${row.unit_status || "—"} — ${row.blood_group || ""}`
            );
        }

        if (state.index === 2 || state.index === 3) {
            const components = context.component_records || [];
            const selected =
                state.doc?.blood_component ||
                (components.length === 1 ? components[0].name : "");

            addSelect(
                "bb-cw-source-component",
                "مكوّن الدم",
                components,
                selected,
                row => `${row.name} — ${row.component_type || "مكوّن"} — ${row.component_status || "—"}`
            );

            if (state.index === 3) {
                const qcRows = (context.quality_records || []).filter(row =>
                    row.blood_component === selected &&
                    row.qc_status === "Passed" &&
                    row.overall_result === "Passed"
                );

                const selectedQC =
                    state.doc?.quality_check ||
                    (qcRows.length === 1 ? qcRows[0].name : "");

                addSelect(
                    "bb-cw-source-qc",
                    "فحص الجودة الناجح",
                    qcRows,
                    selectedQC,
                    row => `${row.name} — ${row.qc_status}`
                );
            }
        }
    }


    function renderRecordSelector() {
        const select = stagePanel(state.index).find("[data-stage-record]").empty();
        const rows = currentStageRows();

        select.append(
            $("<option>").val("").text("— اختر سجلًا أو أنشئ جديدًا —")
        );

        rows.forEach(row => {
            select.append(
                $("<option>")
                    .val(row.name)
                    .text(`${row.name} — ${row[STAGES[state.index].status] || "—"}`)
            );
        });

        if (state.name && rows.some(row => row.name === state.name)) {
            select.val(state.name);
        } else {
            select.val("");
        }
    }


    // BB_STORAGE_UNIT_VISIBLE_IN_STORAGE_V1
    // Keep the read-only Blood Unit field synchronized with component selection.
    root.off("change.bbStorageUnit", "#bb-cw-source-component");
    root.on("change.bbStorageUnit", "#bb-cw-source-component", function () {
        if (Number(state.index) !== 3) return;

        const selectedName = $(this).val();
        const components = state.context?.component_records || [];
        const component = components.find(row => row.name === selectedName);

        if (state.controls.blood_unit) {
            state.controls.blood_unit.set_value(component?.blood_unit || "");
        }
    });

    // BB_COMPONENT_UI_SOURCE_AUTOFILL_V3
    const SOURCE_DISPLAY_FIELDS = new Set([
        "blood_processing", "blood_unit", "blood_screening",
        "donor", "donor_name", "blood_group", "bag_number",
        "component_type", "component_number", "component_volume", "sample_id"
    ]);

    function syncSourceDisplayFields() {
        Object.keys(state.controls || {}).forEach(fieldname => {
            if (!SOURCE_DISPLAY_FIELDS.has(fieldname)) return;
            const control = state.controls[fieldname];
            if (!control) return;
            const value = deriveSourceFieldValue(fieldname, state.doc || {});
            control.set_value(value || "");
        });
    }

    root.off(
        "change.bbComponentSourceFields",
        "#bb-cw-source-component, #bb-cw-source-unit"
    );
    root.on(
        "change.bbComponentSourceFields",
        '[data-source-key="component"], [data-source-key="unit"]',
        syncSourceDisplayFields
    );

    function renderFields(doc = {}) {
        const host = stagePanel(state.index).find("[data-stage-fields]").empty();
        state.controls = {};

        const stage = STAGES[state.index];
        const schema = state.schemas[stage.doctype];

        if (!state.donation) {
            host.html(
                '<div class="col-md-12"><div class="alert alert-info">' +
                'افتح تقرير التبرعات واختر تبرعًا أولًا.</div></div>'
            );
            return;
        }

        if (!canOpenStage(state.index)) {
            host.html(
                '<div class="col-md-12"><div class="alert alert-warning">' +
                'هذه المرحلة مقفلة حتى اكتمال متطلبات المرحلة السابقة.</div></div>'
            );
            return;
        }

        if (!schema) {
            host.html(
                '<div class="col-md-12"><div class="alert alert-warning">' +
                'تعذر تحميل تعريفات الحقول.</div></div>'
            );
            return;
        }

        schema.fields.forEach(field => {
            const col = $('<div class="col-md-6"></div>').appendTo(host);
            makeFieldControl(col[0], field, { ...(doc || {}), ...(stageSnapshots[state.index]?.values || {}) });
        });
    }


    async function renderActions() {
        // BB_COMPONENT_FLICKER_GUARD_V4
        // أثناء تحديث المراحل، يُعاد إنشاء شريط الإجراءات مرة واحدة فقط.
        if (state.suppressIntermediateActions) return;

        /* BB_COMPONENT_ACTION_COLORS_V6 */
        const styleActionButton = (button, actionName) => {
            const action = String(actionName || "").toLowerCase();
            let color = "btn-primary";
            if (/reject|cancel|abort|discard|fail|void/.test(action)) {
                color = "btn-danger";
            } else if (/quarantin|hold|pending|defer|review|return/.test(action)) {
                color = "btn-warning";
            } else if (/accept|approve|pass|complete|release|issue|handover|transfus|store|eligible|send to quality/.test(action)) {
                color = "btn-success";
            } else if (/start|begin|schedule|check in|collect|screen|inspect|prepare|bleed/.test(action)) {
                color = "btn-info";
            }
            button.removeClass(
                "btn-default btn-primary btn-success btn-warning btn-danger btn-info"
            ).addClass(color);
        };

        const stageIndexAtStart = Number(state.index);
        const stage = STAGES[stageIndexAtStart];
        const nameAtStart = state.name || "";
        const donationAtStart = state.donation || "";
        const hasRecord = Boolean(
            donationAtStart && nameAtStart && !state.isNew
        );

        const host = root.find("#bb-cw-workflow-actions").empty();
        const wrap = $('<div class="bb-workflow-actions-wrap bb-iw-shared-actions-wrap"></div>');
        const toggle = $(
            '<button type="button" id="bb-cw-actions-toggle" ' +
            'class="btn btn-default bb-workflow-actions-toggle" ' +
            'aria-haspopup="menu" aria-expanded="true" ' +
            'aria-controls="bb-cw-actions-menu">' +
            'الإجراءات | Actions</button>'
        );

        const menu = $(
            '<div id="bb-cw-actions-menu" class="bb-workflow-actions-menu bb-iw-actions-menu bb-iw-actions-toolbar" ' +
            'role="region" aria-label="إجراءات سير العمل"></div>'
        );

        wrap.append(toggle, menu);
        host.append(wrap);

        const stale = () =>
            Number(state.index) !== stageIndexAtStart ||
            (state.name || "") !== nameAtStart ||
            (state.donation || "") !== donationAtStart;

        const addMessage = message => {
            menu.append(
                $("<div>").addClass("bb-workflow-action-message bb-iw-actions-menu-message").text(message)
            );
        };

        let knownActionNames = [];
        let actions = [];
        let transitionFailed = false;

        try {
            const catalogResponse = await call(API.catalog, {
                doctype: stage.doctype
            });
            const catalogList = Array.isArray(catalogResponse)
                ? catalogResponse
                : (catalogResponse && Array.isArray(catalogResponse.actions)
                    ? catalogResponse.actions : []);

            knownActionNames = catalogList;
        } catch (error) {
            console.warn("تعذر تحميل قائمة الإجراءات:", error);
        }

        if (stale()) return;

        if (hasRecord) {
            try {
                const actionResponse = await call(API.transitions, {
                    doctype: stage.doctype,
                    name: nameAtStart,
                    donation_name: donationAtStart
                });

                actions = Array.isArray(actionResponse)
                    ? actionResponse
                    : (actionResponse && Array.isArray(actionResponse.actions)
                        ? actionResponse.actions : []);
            } catch (error) {
                transitionFailed = true;
                console.warn("تعذر تحميل إجراءات الحالة الحالية:", error);
            }
        }

        if (stale()) return;

        if (!hasRecord) {
            addMessage(
                "اختر سجلًا محفوظًا أو احفظ السجل بعد استيفاء المتطلبات لتفعيل الإجراءات."
            );
        } else if (transitionFailed) {
            addMessage(
                "تعذر جلب الإجراءات المتاحة الآن؛ أعد تحديث البيانات. لن تُفعّل إجراءات غير متحقق منها."
            );
        }

        if (hasRecord) {
            menu.append(
                $('<div class="bb-workflow-action-summary bb-iw-actions-menu-summary"></div>').append(
                    $("<div>").append(
                        $("<strong>").text(stage.title || stage.doctype)
                    ),
                    $("<div>").append(
                        $("<span>").text("رقم السجل: "),
                        $("<strong>").text(nameAtStart)
                    )
                )
            );
        }

        const list = $('<div class="bb-workflow-action-list bb-iw-action-toolbar-buttons"></div>');
        const availableNames = new Set();

        actions.forEach(item => {
            const actionName = String(
                (typeof item === "string" ? item : item && item.action) || ""
            ).trim();

            if (!actionName || availableNames.has(actionName)) return;
            availableNames.add(actionName);

            const row = $('<div class="bb-workflow-action-row bb-iw-action-row"></div>');
            const button = $(
                '<button type="button" class="btn btn-default btn-sm ' +
                'bb-iw-workflow-action bb-cw-workflow-action-button bb-cw-workflow-action"></button>'
            ).text(actionName);
                styleActionButton(button, actionName);

            button.on("click", function (event) {
                event.preventDefault();
                event.stopPropagation();

                if (button.prop("disabled") || stale() || state.busy) return;

                menu.find(".bb-workflow-action-confirm").remove();

                const panel = $(
                    '<div class="bb-workflow-action-confirm bb-iw-actions-menu-confirm" role="group"></div>'
                );
                panel.append($("<strong>").text("تأكيد تنفيذ الإجراء"));
                panel.append($("<p>").text(
                    `هل تريد تنفيذ «${actionName}» على السجل ${nameAtStart}؟`
                ));

                const nextState = item && typeof item === "object"
                    ? (item.next_state || item.nextState || "")
                    : "";

                if (nextState) {
                    panel.append($("<small>").text(
                        "الحالة التالية: " + nextState
                    ));
                }

                const buttons = $(
                    '<div class="bb-workflow-action-confirm-buttons bb-iw-actions-menu-confirm-buttons"></div>'
                );
                const yes = $(
                    '<button type="button" class="btn btn-primary btn-sm">' +
                    'تأكيد التنفيذ</button>'
                );
                const no = $(
                    '<button type="button" class="btn btn-default btn-sm">' +
                    'رجوع</button>'
                );

                yes.on("click", async function (confirmEvent) {
                    confirmEvent.preventDefault();
                    confirmEvent.stopPropagation();

                    if (
                        state.busy ||
                        Number(state.index) !== stageIndexAtStart ||
                        state.name !== nameAtStart ||
                        state.donation !== donationAtStart
                    ) {
                        panel.remove();
                        notify("تغير السجل المحدد؛ اختر الإجراء من النافذة الحالية.", "orange");
                        return;
                    }

                    yes.prop("disabled", true).text("جارٍ التنفيذ...");
                    await runAction(actionName);
                });

                no.on("click", function (confirmEvent) {
                    confirmEvent.preventDefault();
                    confirmEvent.stopPropagation();
                    panel.remove();
                });

                buttons.append(yes, no);
                panel.append(buttons);
                menu.append(panel);
            });

            row.append(button);
            list.append(row);
        });

        knownActionNames.forEach(knownItem => {
            const actionName = String(
                (typeof knownItem === "string"
                    ? knownItem
                    : knownItem && knownItem.action) || ""
            ).trim();

            if (!actionName || availableNames.has(actionName)) return;
            availableNames.add(actionName);

            const row = $('<div class="bb-workflow-action-row bb-iw-action-row"></div>');
            const button = $(
                '<button type="button" disabled aria-disabled="true" ' +
                'class="btn btn-default btn-sm bb-iw-workflow-action bb-cw-workflow-action-button ' +
                'bb-cw-workflow-action"></button>'
            ).text(actionName).attr(
                "title",
                "هذا الإجراء غير متاح للحالة الحالية أو لصلاحية المستخدم."
            );

            row.append(button);
            list.append(row);
        });

        if (!list.children().length) {
            addMessage(
                hasRecord
                    ? "لا توجد إجراءات متاحة للحالة الحالية أو للمستخدم."
                    : "ستظهر أسماء إجراءات هذه المرحلة هنا عند تحميل تعريفاتها."
            );
        } else {
            menu.append(list);
        }
    }


    async function loadRecord(name) {
        const doc = await call("frappe.client.get", {
            doctype: STAGES[state.index].doctype,
            name
        });

        state.name = name;
        state.doc = doc;
        state.isNew = false;

        renderRecordSelector();
        stagePanel(state.index).find("[data-stage-status]").text(
            `${name} — ${doc[STAGES[state.index].status] || "—"}`
        );

        populateSourceControls();
        renderFields(doc);
        await renderActions();
        saveStageSnapshot(state.index);
    }


    async function renderActiveStage() {
        const index = Number(state.index);
        const stage = STAGES[index];
        const panel = stagePanel(index);
        const snapshot = stageSnapshots[index] || {};

        panel.find("[data-stage-title]").text(stage.title);
        panel.find("[data-stage-description]").text(stage.description);
        renderRecordSelector();

        if (!state.donation || !state.context) {
            state.name = "";
            state.doc = null;
            state.isNew = false;

            panel.find("[data-stage-status]").text("اختر تبرعًا أولًا");
            populateSourceControls();
            renderFields(snapshot.values || {});
            await renderActions();
            saveStageSnapshot(index);
            return;
        }

        const rows = currentStageRows();

        if (state.name && rows.some(row => row.name === state.name)) {
            await loadRecord(state.name);
            return;
        }

        if (rows.length === 1 && !snapshot.isNew) {
            await loadRecord(rows[0].name);
            return;
        }

        if (!rows.length || snapshot.isNew) {
            state.name = "";
            state.doc = null;
            state.isNew = true;

            panel.find("[data-stage-status]").text(
                canOpenStage(index)
                    ? "سجل جديد"
                    : "بانتظار المتطلبات — النموذج مفتوح"
            );

            populateSourceControls();
            renderFields(snapshot.values || {});
            await renderActions();
            saveStageSnapshot(index);
            return;
        }

        state.name = "";
        state.doc = null;
        state.isNew = false;

        panel.find("[data-stage-status]").text("اختر سجلًا");
        populateSourceControls();
        renderFields(snapshot.values || {});
        await renderActions();
        saveStageSnapshot(index);
    }




    async function renderStage(renderAll = false) {
        const selectedIndex = Number(state.index);

        // BB_COMPONENT_STOP_SIDEWINDOW_FLICKER_V5
        // في الحفظ والإجراءات نحدّث المرحلة المحددة فقط.
        // لا نعيد إنشاء بطاقات المراحل المجاورة دون حاجة.
        if (!renderAll) {
            saveStageSnapshot(selectedIndex);
            await renderActiveStage();
            saveStageSnapshot(selectedIndex);
            renderTabs();
            return;
        }

        // التهيئة الكاملة محفوظة عند تحميل تبرع أو طلب تحديث شامل.
        state.suppressIntermediateActions = true;
        try {
            for (let index = 0; index < STAGES.length; index++) {
                saveStageSnapshot(index);
            }

            for (let index = 0; index < STAGES.length; index++) {
                restoreStageSnapshot(index);
                await renderActiveStage();
                saveStageSnapshot(index);
            }
        } finally {
            state.suppressIntermediateActions = false;
        }

        restoreStageSnapshot(selectedIndex);
        renderTabs();
        await renderActions();
    }


    async function loadDonation(donationName) {
        if (!donationName || state.loading) return;

        state.loading = true;
        stageSnapshots.forEach((_, index) => {
            stageSnapshots[index] = {
                name: "", doc: null, isNew: false,
                controls: {}, values: null, source: null
            };
        });
        state.donation = donationName;
        state.context = null;
        state.index = 0;
        state.name = "";
        state.doc = null;
        state.isNew = false;

        try {
            state.context = await call(API.context, {
                donation_name: donationName
            });

            renderDonationSummary();
            await renderStage(true);
        } catch (error) {
            console.error(error);
            notify("تعذر تحميل التبرع أو التحقق من الروابط.", "red");
        } finally {
            state.loading = false;
        }
    }

    async function refreshCurrent(renderAll = true) {
        if (!state.donation) {
            notify("اختر تبرعًا من تقرير التبرعات أولًا.", "orange");
            return;
        }

        const currentName = state.name;

        state.context = await call(API.context, {
            donation_name: state.donation
        });

        renderDonationSummary();
        state.name = currentName;

        // BB_COMPONENT_STOP_SIDEWINDOW_FLICKER_V5
        // false يعني تحديث السياق دون إعادة رسم الواجهة؛
        // يستخدمه الحفظ قبل تحميل السجل المحفوظ مرة واحدة.
        if (renderAll !== false) {
            await renderStage(true);
        }

        notify("تم تحديث البيانات.", "green");
    }

    async function saveCurrentStage() {
        if (!state.donation || !state.context) {
            notify("اختر تبرعًا من تقرير التبرعات أولًا.", "orange");
            return;
        }

        if (!canOpenStage(state.index)) {
            notify("لم تكتمل متطلبات المرحلة السابقة.", "orange");
            return;
        }

        if (!state.isNew && !state.name) {
            notify("اختر سجلًا أو ابدأ سجلًا جديدًا.", "orange");
            return;
        }

        const stage = STAGES[state.index];
        const values = {};

        Object.keys(state.controls).forEach(field => {
            values[field] = state.controls[field].get_value();
        });

        if (state.index === 1) {
            values.blood_unit = stageSourceValue(state.index, "unit") || "";
        } else if (state.index === 2) {
            values.blood_component = stageSourceValue(state.index, "component") || "";
        } else if (state.index === 3) {
            values.blood_component = stageSourceValue(state.index, "component") || "";
            values.quality_check = stageSourceValue(state.index, "qc") || "";
        }

        if (state.index === 0 && !values.component_number) {
            values.component_number = "PENDING-COMP-AUTO";
        }

        try {
            const result = await call(API.save, {
                doctype: stage.doctype,
                donation_name: state.donation,
                values: JSON.stringify(values),
                name: state.isNew ? "" : state.name
            });

            state.name = result.name;
            state.isNew = false;

            await refreshCurrent(false);
            state.name = result.name;
            await loadRecord(result.name);

            /* BB_COMPONENT_AUTO_ADVANCE_TO_SCREENING_V2 */
            if (state.index === 0) {
                const unitName =
                    state.doc?.blood_unit ||
                    state.context?.source_link_check?.unit?.name ||
                    "";

                const screeningRows = (
                    state.context?.screening_records || []
                ).filter(row => row.blood_unit === unitName);

                const passedRows = screeningRows.filter(row =>
                    row.screening_status === "Accepted" &&
                    row.overall_result === "Passed"
                );

                // إذا كان الفحص مقبولًا مسبقًا، انتقل إلى الجودة
                // بعد التأكد من حالة المكوّن.
                if (passedRows.length === 1) {
                    const savedComponent = (
                        state.context?.component_records || []
                    ).find(row => row.name === result.name);

                    if (savedComponent?.component_status === "Created") {
                        await call(API.action, {
                            doctype: "Blood Component",
                            name: result.name,
                            donation_name: state.donation,
                            action: "Send to Quality Check"
                        });

                        state.context = await call(API.context, {
                            donation_name: state.donation
                        });
                        renderDonationSummary();
                    } else if (
                        savedComponent?.component_status !== "Quality Check"
                    ) {
                        notify(
                            "تعذر الانتقال التلقائي إلى الجودة: حالة المكوّن غير متوقعة.",
                            "orange"
                        );
                        return;
                    }

                    saveStageSnapshot(0);
                    restoreStageSnapshot(2);
                    state.name = "";
                    state.doc = null;
                    state.isNew = false;
                    await renderStage();
                    notify(
                        "تم تحديد فحص دم مقبول والانتقال إلى فحص الجودة.",
                        "green"
                    );
                    return;
                }

                saveStageSnapshot(0);
                restoreStageSnapshot(1);
                state.doc = null;
                state.name = "";

                const usableScreens = screeningRows.filter(
                    row => row.screening_status !== "Rejected"
                );

                if (usableScreens.length === 1) {
                    state.name = usableScreens[0].name;
                    state.isNew = false;
                    await renderStage();
                    await loadRecord(usableScreens[0].name);
                } else if (usableScreens.length === 0) {
                    state.isNew = true;
                    await renderStage();
                } else {
                    // عند وجود أكثر من فحص، لا نختار سجلًا عشوائيًا.
                    state.isNew = false;
                    await renderStage();
                }

                notify(
                    "تم حفظ المكوّن والانتقال تلقائيًا إلى نافذة فحص الدم.",
                    "green"
                );
                return;
            }

            notify(`تم حفظ ${result.name} بنجاح.`, "green");
        } catch (error) {
            console.error(error);
            notify(
                error?.message || "فشل الحفظ. تحقق من الحقول المطلوبة وربط المصدر.",
                "red"
            );
        }
    }


    async function newRecord() {
        if (!state.donation || !state.context) {
            notify("اختر تبرعًا من التقرير أولًا لربط السجل بمصدره.", "orange");
            return;
        }

        const index = Number(state.index);
        state.name = "";
        state.doc = null;
        state.isNew = true;

        stageSnapshots[index].name = "";
        stageSnapshots[index].doc = null;
        stageSnapshots[index].isNew = true;
        stageSnapshots[index].values = null;
        stageSnapshots[index].source = null;

        stagePanel(index).find("[data-stage-record]").val("");
        stagePanel(index).find("[data-stage-status]").text(
            canOpenStage(index)
                ? "سجل جديد"
                : "بانتظار المتطلبات — النموذج مفتوح"
        );

        populateSourceControls();
        renderFields({});
        await renderActions();
        saveStageSnapshot(index);
    }


    async function runAction(action) {
        if (!state.name || !state.donation) return;

        try {
            await call(API.action, {
                doctype: STAGES[state.index].doctype,
                name: state.name,
                donation_name: state.donation,
                action
            });

            const oldIndex = state.index;
            state.context = await call(API.context, {
                donation_name: state.donation
            });
            renderDonationSummary();

            let actionNotice = `تم تنفيذ الإجراء: ${action}`;
            let actionNoticeColor = "green";

            if (oldIndex === 1 && action === "Accept Screening") {
                saveStageSnapshot(oldIndex);
                restoreStageSnapshot(2);
                state.name = "";
                state.doc = null;
                state.isNew = false;
                actionNotice =
                    "تم قبول فحص الدم والانتقال تلقائيًا إلى نافذة فحص الجودة.";
            }

            if (oldIndex === 2 && action === "Pass Quality Check") {
                const passedRecord = (
                    state.context?.quality_records || []
                ).some(qc =>
                    qc.name === state.name &&
                    qc.qc_status === "Passed" &&
                    qc.overall_result === "Passed"
                );

                if (passedRecord && canOpenStage(3)) {
                    saveStageSnapshot(oldIndex);
                    restoreStageSnapshot(3);
                    state.name = "";
                    state.doc = null;
                    state.isNew = false;
                    actionNotice =
                        "نجح فحص الجودة، وتم الانتقال تلقائيًا إلى نافذة التخزين.";
                } else {
                    actionNotice =
                        "تم تنفيذ الإجراء، لكن شروط فتح التخزين لم تكتمل. تحقق من حالة الجودة وفحص الدم.";
                    actionNoticeColor = "orange";
                }
            }

            await renderStage();
            notify(actionNotice, actionNoticeColor);
        } catch (error) {
            console.error(error);
            notify(error?.message || `تعذر تنفيذ ${action}.`, "red");
            await renderActions();
        }
    }



    async function setStage(index, allowBlocked = true) {
        index = Number(index);
        if (index < 0 || index >= STAGES.length) return;

        for (let i = 0; i < STAGES.length; i++) {
            saveStageSnapshot(i);
        }

        restoreStageSnapshot(index);
        renderTabs();
        await renderActions();
    }



    /* BB_ALERT_TARGET_RESTORE_V1 */
    async function restoreDonationFromRoute() {
        // Do not consume route options before this page has loaded its schema.
        if (state.loading || !Object.keys(state.schemas).length) return;

        const options = frappe.route_options || {};
        const routeDonation = options.donation_id || "";
        const targetDoctype = options.bb_alert_target_doctype || "";
        const targetName = options.bb_alert_target_name || "";
        const cachedDonation =
            sessionStorage.getItem("bb_component_work_donation_id") || "";
        const donationName = routeDonation || cachedDonation;

        if (frappe.route_options) {
            delete frappe.route_options.donation_id;
            delete frappe.route_options.bb_alert_target_doctype;
            delete frappe.route_options.bb_alert_target_name;
        }

        try {
            if (donationName) {
                sessionStorage.removeItem("bb_component_work_donation_id");
                if (routeDonation || !state.context || state.donation !== donationName) {
                    await loadDonation(donationName);
                }
            }

            if (!targetDoctype || !targetName) return;

            const targetIndex = STAGES.findIndex(
                item => item.doctype === targetDoctype
            );
            if (targetIndex < 0) {
                notify("نوع السجل غير موجود في نافذة متابعة المكونات.", "orange");
                return;
            }
            if (!state.donation || !state.context) {
                notify("تعذر تحميل التبرع المرتبط بالسجل.", "red");
                return;
            }
            if (!canOpenStage(targetIndex)) {
                notify("لا يمكن فتح هذه المرحلة قبل استكمال المتطلبات السابقة.", "orange");
                return;
            }

            state.index = targetIndex;
            state.name = targetName;
            state.doc = null;
            state.isNew = false;

            const rows = currentStageRows();
            if (rows.some(row => row.name === targetName)) {
                await renderStage();
            } else {
                // Load the requested record, never silently select another one.
                await loadRecord(targetName);
            }
        } catch (error) {
            console.error("Blood Bank alert component selection:", error);
            notify("تعذر تحميل السجل المحدد داخل نافذة متابعة المكونات.", "red");
        }
    }

    async function boot() {
        try {
            const schema = await call(API.schema);

            (schema || []).forEach(item => {
                state.schemas[item.doctype] = item;
            });

            await restoreDonationFromRoute();
            renderTabs();

            if (!state.donation) {
                renderFields({});
            }
        } catch (error) {
            console.error(error);
            notify("تعذر تحميل النوافذ. تحقق من تعريفات الصفحة.", "red");
        }
    }

    // Shared toolbar: preserve the existing workflow functions.
    root.find("#bb-cw-save").on("click", saveCurrentStage);
    root.find("#bb-cw-new").on("click", newRecord);
    root.find("#bb-cw-refresh").on("click", refreshCurrent);
    root.find("#bb-cw-prev").on("click", () => setStage(state.index - 1));
    root.find("#bb-cw-next").on("click", () => setStage(state.index + 1));


    // BB_GLOBAL_NAV_HANDLER
    root.on("click", ".bb-bb-nav-button[data-bb-target]", function() {
        const button = this;

        const target = button.dataset.bbTarget;
        const routes = {
            workspace: () => frappe.set_route("blood-bank-ui-test"),
            donation_report: () => frappe.set_route("query-report", "Blood Donation Tracking"),
            request_report: () => frappe.set_route("query-report", "Blood Request Tracking"),
            component_work: () => frappe.set_route("blood-bank-component-work"),
            request_work: () => frappe.set_route("blood-bank-request-work")
        };
        if (routes[target]) routes[target]();

    });


    root.on("click", "#bb-cw-group-verification", function (event) {
        event.preventDefault();

        const mode = $(this).attr("data-bb-group-mode");
        if (mode === "register") {
            openGroupVerificationDialog();
        } else if (mode === "approve_previous") {
            openPreviousGroupVerificationDialog();
        } else if (mode === "verified") {
            frappe.msgprint(__("فصيلة الوحدة معتمدة بالفعل."));
        } else if (!$(this).prop("disabled")) {
            frappe.msgprint(__("حالة النتيجة لا تسمح بهذا الإجراء."));
        }
    });

    root.on("click", "[data-activate-stage]", function (event) {
        event.preventDefault();
        if (this.disabled) return;
        setStage(Number(this.dataset.activateStage));
    });

    root.on("click", "[data-stage-group]", async function (event) {
        event.preventDefault();
        const group = Number(this.dataset.stageGroup);
        if (group === (Number(state.index) < 2 ? 0 : 1)) return;
        await setStage(group === 0 ? 0 : 2, true);
    });

    root.on("change", "[data-stage-record]", async function () {
        const index = Number(this.dataset.stageRecord);
        const chosenName = this.value || "";

        saveStageSnapshot(state.index);
        restoreStageSnapshot(index);

        stageSnapshots[index].values = null;
        stageSnapshots[index].source = null;

        if (chosenName) {
            await loadRecord(chosenName);
        } else {
            await newRecord();
        }
        saveStageSnapshot(index);
        renderTabs();
    });

    root.on("change", "[data-source-key]", function () {
        const index = Number($(this).closest("[data-stage-card]").attr("data-stage-card"));
        if (!Number.isInteger(index)) return;

        saveStageSnapshot(index);

        if (index === 3 && this.dataset.sourceKey === "component") {
            populateSourceControls();
            saveStageSnapshot(index);
        }
    });

    node.__bbComponentWorkController = {
        restoreDonationFromRoute,
        refreshCurrent
    };

    boot();
};

frappe.pages["blood-bank-component-work"].on_page_show = function (wrapper) {
    const node = wrapper && wrapper[0] ? wrapper[0] : wrapper;

    if (node.__bbComponentWorkController) {
        node.__bbComponentWorkController.restoreDonationFromRoute();
    }
};
