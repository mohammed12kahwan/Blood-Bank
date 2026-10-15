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
        loading: false
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

    function renderTabs() {
        root.find("[data-stage]").each(function () {
            const index = Number(this.dataset.stage);
            const enabled = canOpenStage(index);

            $(this).closest("li")
                .toggleClass("disabled", !enabled)
                .toggleClass("active", index === state.index);

            $(this).attr("aria-disabled", String(!enabled));
        });
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

    function makeFieldControl(parent, field, doc = {}) {
        const df = {
            fieldname: field.fieldname,
            label: field.label,
            fieldtype: field.fieldtype || "Data",
            options: field.options || "",
            reqd: Boolean(field.reqd),
            read_only: Boolean(field.read_only),
            description: field.description || ""
        };

        let value = resolveFieldValue(field, doc[field.fieldname]);

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
        const host = root.find("#bb-cw-source-controls").empty();
        const context = state.context;

        if (!context) return;

        function addSelect(id, label, rows, selected, display) {
            const col = $('<div class="col-md-6"></div>').appendTo(host);
            const group = $('<div class="form-group"></div>').appendTo(col);

            $("<label>").attr("for", id).text(label).appendTo(group);

            const select = $('<select class="form-control"></select>')
                .attr("id", id)
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
        const select = root.find("#bb-cw-record").empty();
        const rows = currentStageRows();

        select.append($("<option>").val("").text("— اختر سجلًا أو أنشئ جديدًا —"));

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

    function renderFields(doc = {}) {
        const host = root.find("#bb-cw-stage-fields").empty();
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
            makeFieldControl(col[0], field, doc);
        });
    }

    async function renderActions() {
        const host = root.find("#bb-cw-workflow-actions").empty();

        if (!state.donation || !state.name || state.isNew) {
            host.text("احفظ السجل أولًا لعرض إجراءات سير العمل.");
            return;
        }

        try {
            const actions = await call(API.transitions, {
                doctype: STAGES[state.index].doctype,
                name: state.name,
                donation_name: state.donation
            });

            if (!Array.isArray(actions) || !actions.length) {
                host.text("لا توجد إجراءات متاحة للحالة الحالية أو للمستخدم.");
                return;
            }

            actions.forEach(item => {
                const action = typeof item === "string" ? item : item.action;
                if (!action) return;

                const button = $(
                    `<button type="button" class="btn btn-default btn-sm">${esc(action)}</button>`
                ).css("margin", "0 0 6px 6px");

                button.on("click", () => runAction(action));
                host.append(button);
            });
        } catch (error) {
            console.error(error);
            host.text("تعذر تحميل إجراءات سير العمل.");
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
        root.find("#bb-cw-stage-status").text(
            `${name} — ${doc[STAGES[state.index].status] || "—"}`
        );

        populateSourceControls();
        renderFields(doc);
        await renderActions();
    }

    async function renderStage() {
        const stage = STAGES[state.index];

        root.find("#bb-cw-stage-title").text(stage.title);
        root.find("#bb-cw-stage-description").text(stage.description);

        renderRecordSelector();
        renderTabs();

        if (!state.donation) {
            state.name = "";
            state.doc = null;
            state.isNew = false;

            root.find("#bb-cw-stage-status").text("غير محدد");
            populateSourceControls();
            renderFields({});
            root.find("#bb-cw-workflow-actions").text(
                "افتح تقرير التبرعات واختر تبرعًا."
            );
            return;
        }

        if (!canOpenStage(state.index)) {
            state.name = "";
            state.doc = null;
            state.isNew = false;

            root.find("#bb-cw-stage-status").text("بانتظار المتطلبات");
            populateSourceControls();
            renderFields({});
            root.find("#bb-cw-workflow-actions").text(
                "لا توجد إجراءات حتى تكتمل المرحلة السابقة."
            );
            return;
        }

        const rows = currentStageRows();

        if (state.name && rows.some(row => row.name === state.name)) {
            await loadRecord(state.name);
        } else if (rows.length === 1) {
            await loadRecord(rows[0].name);
        } else if (!rows.length) {
            state.name = "";
            state.doc = null;
            state.isNew = true;
            root.find("#bb-cw-stage-status").text("سجل جديد");
            populateSourceControls();
            renderFields({});
            await renderActions();
        } else {
            state.name = "";
            state.doc = null;
            state.isNew = false;
            root.find("#bb-cw-stage-status").text("اختر سجلًا");
            populateSourceControls();
            renderFields({});
            root.find("#bb-cw-workflow-actions").text(
                "اختر سجلًا من القائمة، أو ابدأ سجلًا جديدًا."
            );
        }
    }

    async function loadDonation(donationName) {
        if (!donationName || state.loading) return;

        state.loading = true;
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
            await renderStage();
        } catch (error) {
            console.error(error);
            notify("تعذر تحميل التبرع أو التحقق من الروابط.", "red");
        } finally {
            state.loading = false;
        }
    }

    async function refreshCurrent() {
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

        await renderStage();
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
            values.blood_unit = root.find("#bb-cw-source-unit").val() || "";
        } else if (state.index === 2) {
            values.blood_component = root.find("#bb-cw-source-component").val() || "";
        } else if (state.index === 3) {
            values.blood_component = root.find("#bb-cw-source-component").val() || "";
            values.quality_check = root.find("#bb-cw-source-qc").val() || "";
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

            await refreshCurrent();
            state.name = result.name;
            await loadRecord(result.name);

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
        if (!state.donation) {
            notify("اختر تبرعًا من التقرير أولًا.", "orange");
            return;
        }

        if (!canOpenStage(state.index)) {
            notify("لا يمكن إنشاء سجل قبل اكتمال المتطلبات.", "orange");
            return;
        }

        state.name = "";
        state.doc = null;
        state.isNew = true;

        root.find("#bb-cw-record").val("");
        root.find("#bb-cw-stage-status").text("سجل جديد");

        populateSourceControls();
        renderFields({});
        root.find("#bb-cw-workflow-actions").text(
            "احفظ السجل أولًا لعرض إجراءات سير العمل."
        );
    }

    async function runAction(action) {
        if (!state.name || !state.donation) return;

        frappe.confirm(
            `هل تريد تنفيذ الإجراء "${action}" على ${state.name}؟`,
            async () => {
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

                    // After screening acceptance, the Component transition
                    // Send to Quality Check must occur before the QC stage.
                    if (
                        oldIndex === 1 &&
                        action === "Accept Screening"
                    ) {
                        state.index = 0;
                        state.name = "";
                        state.doc = null;
                        state.isNew = false;
                    }

                    await renderStage();
                    notify(`تم تنفيذ الإجراء: ${action}`, "green");
                } catch (error) {
                    console.error(error);
                    notify(error?.message || `تعذر تنفيذ ${action}.`, "red");
                }
            }
        );
    }

    async function setStage(index) {
        if (index < 0 || index >= STAGES.length) return;

        if (!canOpenStage(index)) {
            notify("هذه المرحلة غير متاحة قبل استكمال المتطلبات.", "orange");
            return;
        }

        state.index = index;
        state.name = "";
        state.doc = null;
        state.isNew = false;

        await renderStage();
    }

    async function restoreDonationFromRoute() {
        const routeOptions = frappe.route_options || {};
        const routeDonation = routeOptions.donation_id || "";
        const cachedDonation =
            sessionStorage.getItem("bb_component_work_donation_id") || "";

        const donationName = routeDonation || cachedDonation;

        if (routeDonation && frappe.route_options) {
            delete frappe.route_options.donation_id;
        }

        if (donationName) {
            sessionStorage.removeItem("bb_component_work_donation_id");
            await loadDonation(donationName);
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


    root.on("click", "[data-stage]", function (event) {
        event.preventDefault();

        if ($(this).closest("li").hasClass("disabled")) return;
        setStage(Number(this.dataset.stage));
    });

    root.find("#bb-cw-record").on("change", async function () {
        if (this.value) {
            await loadRecord(this.value);
        } else {
            await newRecord();
        }
    });

    root.on("change", "#bb-cw-source-component", function () {
        if (state.index === 3) {
            populateSourceControls();
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
