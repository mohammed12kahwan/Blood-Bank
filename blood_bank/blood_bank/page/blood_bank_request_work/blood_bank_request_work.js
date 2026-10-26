frappe.pages["blood-bank-request-work"].on_page_load = function (wrapper) {
    const pageNode = wrapper && wrapper[0] ? wrapper[0] : wrapper;
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("متابعة طلبات الدم"),
        single_column: true
    });

    const state = {
        page: page,
        schema: [],
        requestName: null,
        request: null,
        records: {},
        units: [],
        index: 0,
        selectedNames: {},
        currentName: null,
        currentIsNew: false,
        currentValues: {},
        controls: {},
        requestPicker: null,
        busy: false,
        initializing: true,

        // BB_UNIFIED_WORKFLOW_V2
        combinedControls: {},
        combinedValues: {},
        combinedFormMeta: {},
        combinedDefaults: {},
        combinedRequestKey: null,
        combinedRenderToken: 0
    };

    const API = "blood_bank.blood_bank.page.blood_bank_request_work.ui_api.";

    const PROTECTED_FIELDS = {
        "Blood Request": ["name", "naming_series", "request_status"],
        "Blood Reservation": [
            "name", "naming_series", "reservation_status", "blood_request"
        ],
        "Blood Crossmatch": [
            "name", "naming_series", "crossmatch_status", "blood_request"
        ],
        "Blood Issue": [
            "name", "naming_series", "issue_status", "blood_request"
        ],
        "Blood Handover": [
            "name", "naming_series", "handover_status", "blood_request"
        ],
        "Blood Transfusion": [
            "name", "naming_series", "transfusion_status", "blood_request"
        ],
        "Blood Unit Disposition": [
            "name", "naming_series", "disposition_status"
        ]
    };

    function escapeHTML(value) {
        const text = String(value === null || value === undefined ? "" : value);
        if (frappe.utils && frappe.utils.escape_html) {
            return frappe.utils.escape_html(text);
        }
        return $("<div>").text(text).html();
    }

    function call(method, args) {
        return frappe.call({
            method: API + method,
            args: args || {}
        }).then(function (response) {
            return response.message;
        });
    }

    function stage() {
        return state.schema[state.index];
    }

    function stageRecords(doctype) {
        return state.records[doctype] || [];
    }

    function selectedRecord(doctype) {
        const records = stageRecords(doctype);
        const selectedName = state.selectedNames[doctype];
        return records.find(function (record) {
            return record.name === selectedName;
        }) || null;
    }

    function showMessage(selector, message, kind) {
        const $element = page.main.find(selector);
        $element.removeClass("text-muted text-danger text-success text-warning");
        if (kind) {
            $element.addClass(kind);
        }
        $element.text(message || "");
    }

    function setBusy(value) {
        state.busy = !!value;
        page.set_indicator(
            state.busy ? __("جارٍ التنفيذ") : "",
            state.busy ? "orange" : "blue"
        );
    }

    function buildRequestPicker(value) {
        const $parent = page.main.find("#bb-rw-request-picker");
        $parent.empty();

        state.requestPicker = frappe.ui.form.make_control({
            parent: $parent,
            render_input: true,
            df: {
                fieldname: "request_picker",
                label: __("اختر طلب الدم | Select Request"),
                fieldtype: "Link",
                options: "Blood Request",
                reqd: 1
            }
        });

        state.requestPicker.set_value(value || "");
    }

    function updateRequestSummary() {
        const request = state.request || {};

        page.main.find("#bb-rw-request-id").text(request.name || "—");
        page.main.find("#bb-rw-patient").text(
            request.patient_name || request.patient || "—"
        );
        page.main.find("#bb-rw-request-status").text(
            request.request_status || "—"
        );
        page.main.find("#bb-rw-request-date").text(
            normalizeFieldValue({fieldtype: "Date"}, request.request_date) || "—"
        );
        page.main.find("#bb-rw-request-blood-group").text(
            request.blood_group || "—"
        );

        const component = request.component_type || "—";
        const quantity = request.requested_quantity;
        const unit = request.quantity_unit || "";

        let componentText = component;
        if (quantity !== null && quantity !== undefined && quantity !== "") {
            componentText += " · " + quantity + (unit ? " " + unit : "");
        }

        page.main.find("#bb-rw-request-component").text(componentText);

        const message = request.name
            ? __("تُعرض السجلات المرتبطة بهذا الطلب فقط.")
            : __("اختر طلبًا لعرض مراحله وسجلاته.");

        showMessage("#bb-rw-source-message", message, "text-muted");
    }

    /* BB-RW-CONSOLIDATED-WORKFLOW-V1 */
    /* BB_REQUEST_TABS_ALL_STAGES_V1 */
    /* BB_REQUEST_TABS_NATIVE_V3 */
    function renderTabs() {
        const $tabs = page.main.find("#bb-rw-stage-tabs");
        const $combined = page.main.find("#bb-rw-combined-stage-tabs");
        const nums = ["١", "٢", "٣", "٤", "٥", "٦", "٧"];

        $tabs.empty();

        state.schema.forEach(function (item, index) {
            const active = index === state.index;
            const $tab = $("<button>", {
                type: "button",
                class: "bb-rw-tab",
                "data-stage-index": index,
                role: "tab",
                title: item.doctype,
                "aria-selected": String(active)
            }).toggleClass("is-active", active);

            $("<span>", {
                class: "bb-rw-tab-number",
                text: nums[index] || String(index + 1)
            }).appendTo($tab);

            $("<span>", {
                class: "bb-rw-tab-label",
                text: `${item.label} | ${item.doctype}`
            }).appendTo($tab);

            $tabs.append($tab);
        });

        // جميع المراحل في الشريط نفسه، ولا حاجة للشريط التجميعي القديم.
        $combined.empty()
            .prop("hidden", true)
            .attr("aria-hidden", "true")
            .hide();
    }

    function renderRecordList(item) {
        const $list = page.main.find("#bb-rw-records");
        $list.empty();

        const records = stageRecords(item.doctype);

        records.forEach(function (record) {
            const selected = record.name === state.selectedNames[item.doctype];
            const status = record[item.status_field] || "";

            const $button = $("<button>", {
                type: "button",
                class: "btn btn-default btn-sm bb-rw-record-btn"
            }).toggleClass("active", selected);

            $("<span>")
                .text(record.name || "")
                .appendTo($button);

            if (status) {
                $("<span>", {
                    class: "bb-rw-record-status",
                    text: status
                }).appendTo($button);
            }

            $button.on("click", function () {
                state.selectedNames[item.doctype] = record.name;
                state.currentName = record.name;
                state.currentIsNew = false;
                state.currentValues = Object.assign({}, record);
                renderStage();
            });

            $list.append($button);
        });

        if (!records.length) {
            $("<div>", {
                class: "bb-rw-empty",
                text: __("لا توجد سجلات مرتبطة بهذه المرحلة لهذا الطلب.")
            }).appendTo($list);
        }
    }

    function normalizeFieldValue(field, value) {
        if (value === null || value === undefined || value === "") {
            return "";
        }

        const type = String(field.fieldtype || "");
        const text = String(value).trim();
        const token = text.toLowerCase();

        if (type === "Date") {
            if (["today", "now", "now_datetime"].includes(token)) {
                return frappe.datetime.get_today();
            }

            const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
            return match ? match[1] : value;
        }

        if (type === "Datetime") {
            if (["today", "now", "now_datetime"].includes(token)) {
                return frappe.datetime.now_datetime();
            }

            const match = text.match(
                /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?(?:Z)?$/
            );

            if (match) {
                return match[1] + " " + match[2];
            }

            if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
                return text + " 00:00:00";
            }

            return value;
        }

        if (type === "Time") {
            if (["today", "now", "now_datetime"].includes(token)) {
                return frappe.datetime.now_datetime().slice(11, 19);
            }

            const match = text.match(
                /^\d{4}-\d{2}-\d{2}[ T](\d{2}:\d{2}:\d{2})/
            );

            if (match) {
                return match[1];
            }
        }

        return value;
    }

    function normalizeDefault(field) {
        return normalizeFieldValue(field, field.default);
    }

    function makeFieldContainerLayout(fields, targetRoot) {
        const $root = targetRoot ? $(targetRoot) : page.main.find("#bb-rw-stage-fields");
        $root.empty();

        state.controls = {};

        let $section = null;
        let $row = null;
        let $column = null;
        let columnIndex = 0;
        let requestIdentificationHeadingSeen = false;
        // BB-RW-THREE-COLUMN-BREAKS-PRESERVE-SECTION-STRUCTURE-V2

        function newSection(label) {
            $section = $('<div class="form-section bb-rw-panel bb-rw-field-section"></div>');
            if (label) {
                $('<div class="section-head bb-rw-subsection-head"></div>')
                    .text(label)
                    .appendTo($section);
            }
            $row = $('<div class="row"></div>').appendTo($section);
            $root.append($section);
            columnIndex = 0;
            newColumn();
        }

        function newColumn() {
            $column = $('<div class="bb-rw-field-column"></div>').appendTo($row);
        }

        function nextColumn() {
            if (columnIndex < 2) {
                columnIndex += 1;
                newColumn();
            } else {
                $row = $('<div class="row"></div>').appendTo($section);
                columnIndex = 0;
                newColumn();
            }
        }

        fields.forEach(function (field) {
            if (field.fieldtype === "Section Break") {
                const sectionLabel = String(field.label || "")
                    .replace(/\s+/g, " ")
                    .trim();

                const isRequestIdentification =
                    /request\s*identification|تعريف\s*الطلب/i.test(sectionLabel);

                const showHeading = !(
                    isRequestIdentification &&
                    requestIdentificationHeadingSeen
                );

                if (isRequestIdentification) {
                    requestIdentificationHeadingSeen = true;
                }

                // Preserve every section boundary; hide only repeated heading text.
                newSection(showHeading ? field.label : "");
                return;
            }

            if (field.fieldtype === "Column Break") {
                if (!$section) {
                    newSection(__("بيانات المرحلة"));
                } else {
                    nextColumn();
                }
                return;
            }

            if (field.fieldtype === "Tab Break" ||
                field.fieldtype === "Fold" ||
                field.fieldtype === "Heading" ||
                field.fieldtype === "HTML" ||
                field.fieldtype === "Button") {
                return;
            }

            if (!$section) {
                newSection(__("بيانات المرحلة"));
            }

            const protectedForType = PROTECTED_FIELDS[field.doctype] || [];
            const isProtected = protectedForType.includes(field.fieldname);
            const isStatus = field.fieldname === stage().status_field;

            const df = {
                fieldname: field.fieldname,
                label: field.label || field.fieldname,
                fieldtype: field.fieldtype || "Data",
                options: field.options || undefined,
                reqd: !!field.reqd,
                read_only: !!field.read_only || isProtected || isStatus,
                default: normalizeDefault(field) || undefined,
                description: field.description || undefined,
                depends_on: field.depends_on || undefined,
                mandatory_depends_on: field.mandatory_depends_on || undefined,
                read_only_depends_on: field.read_only_depends_on || undefined
            };

            // BB_CUSTOM_CROSSMATCH_STORAGE_QUERY_V1
            // Filter storage candidates in the custom workflow window.
            // Never offer issued or otherwise unavailable storage.
            if (
                field.fieldname === "candidate_storage" &&
                (field.options === "Blood Storage" || df.options === "Blood Storage")
            ) {
                df.get_query = function () {
                    const filters = {
                        storage_status: "Available"
                    };

                    function readCurrentValue(fieldname) {
                        const control = state.controls &&
                            state.controls[fieldname];

                        let value = "";
                        if (control && typeof control.get_value === "function") {
                            value = control.get_value();
                        }

                        if (
                            value === null ||
                            value === undefined ||
                            value === ""
                        ) {
                            value = (state.currentValues || {})[fieldname] || "";
                        }

                        return String(value || "").trim();
                    }

                    const group = readCurrentValue("required_blood_group");
                    const componentType = readCurrentValue(
                        "required_component_type"
                    );

                    if (group) {
                        filters.blood_group = group;
                    }
                    if (componentType) {
                        filters.component_type = componentType;
                    }

                    return { filters: filters };
                };
            }

            const control = frappe.ui.form.make_control({
                parent: $column,
                render_input: true,
                df: df
            });

            state.controls[field.fieldname] = control;

            let value = normalizeFieldValue(
                field,
                state.currentValues[field.fieldname]
            );

            if ((value === null || value === undefined || value === "") &&
                field.default) {
                value = normalizeDefault(field);
            }

            control.set_value(value === null || value === undefined ? "" : value);
        });
    }

    async function activateWorkflowStage(doctype, sourceName) {
        const index = state.schema.findIndex(function (item) {
            return item.doctype === doctype;
        });
        if (index < 0 || !state.requestName) {
            return;
        }

        bbUnifiedCaptureDrafts();
        state.index = index;
        const records = stageRecords(doctype);
        const sourceRecords = (
            doctype === "Blood Reservation" && sourceName
        ) ? records.filter(function (row) {
            return row.blood_crossmatch === sourceName;
        }) : (
            doctype === "Blood Issue" && sourceName
        ) ? records.filter(function (row) {
            return row.blood_reservation === sourceName;
        }) : records;

        const selectedName = state.selectedNames[doctype];
        const existing = sourceRecords.find(function (row) {
            return row.name === selectedName;
        }) || sourceRecords[0];

        if (existing) {
            state.selectedNames[doctype] = existing.name;
            state.currentName = existing.name;
            state.currentIsNew = false;
            state.currentValues = Object.assign({}, existing);
        } else {
            const defaults = await call("get_stage_defaults", {
                doctype: doctype,
                request_name: state.requestName,
                source_name: sourceName || null
            });
            state.selectedNames[doctype] = null;
            state.currentName = null;
            state.currentIsNew = true;
            state.currentValues = Object.assign({}, defaults || {});
        }

        renderStage();
    }


    // BB_REQUEST_COMPACT_COLOR_FIX_V2
    // ألوان إجراءات سير العمل وفق طبيعة الإجراء.
    function styleRequestActionButton($button, actionName) {
        const action = String(actionName || "").trim().toLowerCase();
        let color = "btn-primary";

        if (/reject|cancel|abort|discard|fail|void|revoke/.test(action)) {
            color = "btn-danger";
        } else if (/quarantin|hold|pending|defer|review|return/.test(action)) {
            color = "btn-warning";
        } else if (/accept|approve|pass|complete|release|issue|handover|transfus|available|eligible|submit/.test(action)) {
            color = "btn-success";
        } else if (/start|begin|schedule|check.?in|collect|screen|inspect|prepare|bleed|match|reserve/.test(action)) {
            color = "btn-info";
        }

        $button
            .removeClass("btn-default btn-primary btn-success btn-warning btn-danger btn-info")
            .addClass(color);
    }

    function renderWorkflowActions(item, record) {
        const $actions = page.main.find("#bb-rw-workflow-actions");
        $actions.empty();

        // BB_REQUEST_ACTION_MENU_ALWAYS_VISIBLE_V1
        // Keep the actions button visible for saved records.
        function renderActionMessage(message) {
            const $dropdown = $(
                '<div class="dropdown bb-rw-workflow-dropdown bb-workflow-actions-wrap"></div>'
            );

            const $toggle = $('<button type="button"></button>')
                .addClass(
                    "btn btn-default dropdown-toggle bb-rw-btn " +
                    "bb-workflow-actions-toggle"
                )
                .attr({
                    "data-toggle": "dropdown",
                    "aria-haspopup": "true",
                    "aria-expanded": "false",
                    "aria-controls": "bb-rw-actions-menu"
                })
                .append(
                    document.createTextNode(
                        "⚙ " + __("الإجراءات | Actions") + " "
                    )
                )
                .append('<span aria-hidden="true">▾</span>');

            const $menu = $(
                '<ul id="bb-rw-actions-menu" ' +
                'class="dropdown-menu dropdown-menu-right ' +
                'bb-workflow-actions-menu" role="menu" ' +
                'aria-label="إجراءات سير العمل"></ul>'
            );

            const $message = $("<li>")
                .attr("role", "presentation")
                .append(
                    $("<span>")
                        .text(message)
                        .css({
                            display: "block",
                            padding: "10px 12px",
                            whiteSpace: "normal",
                            color: "var(--text-muted)"
                        })
                );

            $menu.append($message);
            $dropdown.append($toggle, $menu);
            $actions.append($dropdown);
        }


        if (!record || !record.name) {
            $actions.text(__("احفظ السجل أولًا لعرض إجراءات سير العمل."));
            return;
        }

        const requestAtStart = state.requestName;
        const nameAtStart = record.name;
        const doctypeAtStart = item.doctype;

        call("get_stage_actions", {
            doctype: doctypeAtStart,
            request_name: requestAtStart,
            name: nameAtStart
        }).then(async function (result) {
            if (
                stage().doctype !== doctypeAtStart ||
                state.currentName !== nameAtStart ||
                state.requestName !== requestAtStart
            ) {
                return;
            }

            $actions.empty();
            const actions = (result && result.actions) || [];
            let catalogActions = [];

            try {
                const catalogResponse = await call("get_workflow_action_catalog", {
                    doctype: doctypeAtStart
                });
                catalogActions = Array.isArray(
                    catalogResponse && catalogResponse.actions
                ) ? catalogResponse.actions : [];
            } catch (catalogError) {
                console.warn(
                    "تعذر تحميل كتالوج إجراءات طلبات الدم:",
                    catalogError
                );
            }

            if (!actions.length && !catalogActions.length) {
                renderActionMessage(
                    __("لا توجد إجراءات انتقال متاحة للحالة الحالية أو للمستخدم.")
                );
                return;
            }

            const $dropdown = $('<div class="dropdown bb-rw-workflow-dropdown bb-workflow-actions-wrap"></div>');
            const $toggle = $('<button type="button"></button>')
                .addClass("btn btn-default dropdown-toggle bb-rw-btn bb-workflow-actions-toggle")
                .attr({
                    "data-toggle": "dropdown",
                    "aria-haspopup": "true",
                    "aria-expanded": "false",
                    "aria-controls": "bb-rw-actions-menu"
                })
                .append(document.createTextNode("⚙ " + __("الإجراءات | Actions") + " "))
                .append('<span aria-hidden="true">▾</span>');

            const $menu = $('<ul id="bb-rw-actions-menu" class="dropdown-menu dropdown-menu-right bb-workflow-actions-menu" role="menu" aria-label="إجراءات سير العمل"></ul>');

            actions.forEach(function (actionInfo) {
                const $item = $("<li>");
                const $link = $("<button>", {
                    type: "button",
                    text: actionInfo.action
                }).addClass(
                    "btn btn-primary btn-sm bb-rw-workflow-action-button"
                );
        styleRequestActionButton($link, actionInfo.action);

                if (actionInfo.next_state) {
                    $link.attr(
                        "title",
                        __("الحالة التالية: {0}", [actionInfo.next_state])
                    );
                }

                /* BB_INLINE_ACTION_CONFIRM_V1 */
                async function executeWorkflowAction(actionInfo) {
                    if (state.busy) return;

                    // جمع قيم الحقول الحالية دون إظهار نافذة تأكيد.
                    const values = {};
                    item.fields.forEach(function (field) {
                        const control = state.controls[field.fieldname];
                        if (control && typeof control.get_value === "function") {
                            values[field.fieldname] = control.get_value();
                        }
                    });

                    // إذا كان الإجراء يحوّل الصرف إلى Returned،
                    // اطلب السبب داخل النافذة الحالية قبل الاتصال بالخادم.
                    const transitionText = [
                        actionInfo.action,
                        actionInfo.next_state,
                        actionInfo.state
                    ].join(" ").toLowerCase();

                    const isReturnAction =
                        doctypeAtStart === "Blood Issue" &&
                        (
                            /\breturned\b|\breturn\b/.test(transitionText) ||
                            transitionText.includes("إرجاع") ||
                            transitionText.includes("مرتجع")
                        );

                    if (
                        isReturnAction &&
                        !String(values.return_reason || "").trim()
                    ) {
                        showMessage(
                            "#bb-rw-stage-message",
                            __("أدخل سبب الإرجاع في حقل «سبب الإرجاع» قبل تنفيذ الإجراء."),
                            "text-danger"
                        );
                        const reasonControl = state.controls.return_reason;
                        if (reasonControl && reasonControl.$input) {
                            reasonControl.$input.focus();
                            reasonControl.$input.addClass("bb-rw-field-error");
                        }
                        return;
                    }

                    setBusy(true);
                    showMessage(
                        "#bb-rw-stage-message",
                        __("جارٍ تنفيذ الإجراء..."),
                        "text-muted"
                    );

                    try {
                        const response = await call("apply_stage_action", {
                            doctype: doctypeAtStart,
                            request_name: requestAtStart,
                            name: nameAtStart,
                            action: actionInfo.action,
                            values: values
                        });

                        const status = String(response.status || "").trim();
                        const normalized = status.toLowerCase();
                        let nextDoctype = null;
                        let sourceName = null;

                        if (
                            doctypeAtStart === "Blood Request" &&
                            normalized === "approved"
                        ) {
                            nextDoctype = "Blood Crossmatch";
                            state.autoRoutedApprovedRequest = requestAtStart;
                        } else if (
                            doctypeAtStart === "Blood Crossmatch" &&
                            normalized === "compatible"
                        ) {
                            nextDoctype = "Blood Reservation";
                            sourceName = nameAtStart;
                            state.routingCompatibleCrossmatch = sourceName;
                        } else if (
                            doctypeAtStart === "Blood Reservation" &&
                            normalized === "ready for issue"
                        ) {
                            nextDoctype = "Blood Issue";
                            sourceName = nameAtStart;
                            state.routingReadyReservation = sourceName;
                        } else if (
                            doctypeAtStart === "Blood Issue" &&
                            normalized === "issued"
                        ) {
                            nextDoctype = "Blood Handover";
                        } else if (
                            doctypeAtStart === "Blood Handover" &&
                            normalized === "handed over"
                        ) {
                            nextDoctype = "Blood Transfusion";
                        } else if (
                            doctypeAtStart === "Blood Transfusion" &&
                            [
                                "completed", "complete", "transfused",
                                "finished", "successful"
                            ].includes(normalized)
                        ) {
                            nextDoctype = "Blood Unit Disposition";
                        }

                        if (nextDoctype) {
                            // تحديث السياق محاولة مستقلة؛ لا نمنع التنقل
                            // إذا تعذر تحديث قائمة السجلات.
                            try {
                                await refreshContext(true);
                            } catch (refreshError) {
                                console.warn(
                                    "تعذر تحديث سياق الطلب:",
                                    refreshError
                                );
                            }

                            await activateWorkflowStage(nextDoctype, sourceName);

                            if (doctypeAtStart === "Blood Crossmatch" && sourceName) {
                                state.autoRoutedCompatibleCrossmatch = sourceName;
                                state.routingCompatibleCrossmatch = null;
                            }
                            if (doctypeAtStart === "Blood Reservation" && sourceName) {
                                state.autoRoutedReadyReservation = sourceName;
                                state.routingReadyReservation = null;
                            }

                            showMessage(
                                "#bb-rw-stage-message",
                                __("تم تنفيذ الإجراء وفتح المرحلة التالية."),
                                "text-success"
                            );
                        } else {
                            await refreshContext(true);
                            showMessage(
                                "#bb-rw-stage-message",
                                __("تم تنفيذ الإجراء بنجاح. الحالة الحالية: {0}", [status || "—"]),
                                "text-success"
                            );
                        }
                    } catch (error) {
                        // لا نفتح نافذة منبثقة عند الخطأ.
                        showMessage(
                            "#bb-rw-stage-message",
                            (error && error.message) ||
                                __("تعذر تنفيذ الإجراء. راجع الحقول المطلوبة."),
                            "text-danger"
                        );

                        if (
                            error &&
                            String(error.message || "").toLowerCase().includes("return reason")
                        ) {
                            const reasonControl = state.controls.return_reason;
                            if (reasonControl && reasonControl.$input) {
                                reasonControl.$input.focus();
                                reasonControl.$input.addClass("bb-rw-field-error");
                            }
                        }
                    } finally {
                        setBusy(false);
                    }
                }

                $link.on("click", function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (state.busy) return;

                    $menu.find(".bb-workflow-confirm-item").remove();
                    $menu.find("li > a").hide();
                    $dropdown.addClass("open");
                    $toggle.attr("aria-expanded", "true");
                    const $confirmItem = $('<li class="bb-workflow-confirm-item"></li>');
                    const $confirm = $(
                        '<div class="bb-workflow-action-confirm" role="group"></div>'
                    );
                    $confirm.append($("<strong>").text("تأكيد تنفيذ الإجراء"));
                    $confirm.append($("<p>").text(
                        `هل تريد تنفيذ «${actionInfo.action}» على السجل ${nameAtStart}؟`
                    ));
                    if (actionInfo.next_state) {
                        $confirm.append($("<small>").text(
                            "الحالة التالية: " + actionInfo.next_state
                        ));
                    }

                    const $buttons = $(
                        '<div class="bb-workflow-action-confirm-buttons"></div>'
                    );
                    const $yes = $(
                        '<button type="button" class="btn btn-primary btn-sm">' +
                        'تأكيد التنفيذ</button>'
                    );
                    const $no = $(
                        '<button type="button" class="btn btn-default btn-sm">' +
                        'رجوع</button>'
                    );

                    $yes.on("click", async function (confirmEvent) {
                        confirmEvent.preventDefault();
                        confirmEvent.stopPropagation();
                        if (state.busy) return;
                        $yes.prop("disabled", true).text("جارٍ التنفيذ...");
                        await executeWorkflowAction(actionInfo);

                        if (document.body.contains($confirm[0])) {
                            $yes.prop("disabled", false).text("تأكيد التنفيذ");
                        }
                    });

                    $no.on("click", function (cancelEvent) {
                        cancelEvent.preventDefault();
                        cancelEvent.stopPropagation();
                        $confirmItem.remove();
                        $menu.find("li > a").show();
                        $dropdown.addClass("open");
                        $toggle.attr("aria-expanded", "true");
                    });

                    $buttons.append($yes, $no);
                    $confirm.append($buttons);
                    $confirmItem.append($confirm);
                    $menu.append($confirmItem);
                });
                $item.append($link);
                $menu.append($item);
            });


            const enabledRequestNames = new Set(
                actions.map(function (actionInfo) {
                    return String(
                        actionInfo && actionInfo.action || ""
                    ).trim();
                }).filter(Boolean)
            );

            catalogActions.forEach(function (knownItem) {
                const actionName = String(
                    (typeof knownItem === "string"
                        ? knownItem
                        : knownItem && knownItem.action) || ""
                ).trim();

                if (!actionName || enabledRequestNames.has(actionName)) return;

                const $item = $("<li>").addClass("bb-rw-disabled-action-item");
                const $button = $("<button>", {
                    type: "button",
                    text: actionName
                }).addClass(
                    "btn btn-default btn-sm bb-rw-workflow-action-button"
                ).prop("disabled", true).attr({
                    "aria-disabled": "true",
                    title: "غير متاح للحالة أو للصلاحية الحالية"
                });

                $item.append($button);
                $menu.append($item);
            });

            $dropdown.append($toggle, $menu);
            $actions.append($dropdown);
        }).catch(function (error) {
            if (
                stage().doctype !== doctypeAtStart ||
                state.currentName !== nameAtStart ||
                state.requestName !== requestAtStart
            ) {
                return;
            }

            const message = __("تعذر تحميل الإجراءات: {0}", [
                (error && error.message) || ""
            ]);

            renderActionMessage(message);
            showMessage(
                "#bb-rw-stage-message",
                message,
                "text-danger"
            );
        });
    }


    // BB_UNIFIED_WORKFLOW_V2
    // عرض الصرف والتسليم ونقل الدم في واجهة مشتركة.
    const BB_UNIFIED_INDICES = [3, 4, 5];

    function bbUnifiedCaptureDrafts() {
        const $root = page.main.find("#bb-rw-root");
        if (!$root.hasClass("bb-rw-unified-mode")) return;

        BB_UNIFIED_INDICES.forEach(function (index) {
            const item = state.schema[index];
            if (!item) return;

            const doctype = item.doctype;
            const meta = state.combinedFormMeta[doctype];
            const controls = state.combinedControls[doctype] || {};
            if (!meta) return;

            const base = meta.isNew
                ? (state.combinedDefaults[doctype] || {})
                : (stageRecords(doctype).find(
                    row => row.name === meta.name
                  ) || {});

            const protectedFields = PROTECTED_FIELDS[doctype] || [];
            const draft = {};

            (item.fields || []).forEach(function (field) {
                const name = field.fieldname;
                const control = controls[name];
                if (!name || !control ||
                    ["Section Break", "Column Break", "Tab Break",
                     "Heading", "Fold", "HTML", "Button"].includes(field.fieldtype)) {
                    return;
                }

                if (field.read_only || protectedFields.includes(name) ||
                    name === item.status_field) {
                    return;
                }

                try {
                    const value = control.get_value();
                    if (String(value ?? "") !== String(base[name] ?? "")) {
                        draft[name] = value;
                    }
                } catch (e) {
                    // تجاهل عناصر التحكم التي أزيلت أثناء إعادة العرض.
                }
            });

            state.combinedValues[doctype] = draft;
        });
    }

    function bbUnifiedInstallStyle() {
        if (document.getElementById("bb-rw-unified-style-v2")) return;

        const style = document.createElement("style");
        style.id = "bb-rw-unified-style-v2";
        style.textContent = `
            #bb-rw-root.bb-rw-unified-mode .bb-rw-record-column {
                display: none !important;
            }
            #bb-rw-root.bb-rw-unified-mode .bb-rw-content-row {
                display: block !important;
                margin: 0 !important;
            }
            #bb-rw-root.bb-rw-unified-mode .bb-rw-editor-column {
                width: 100% !important;
                max-width: 100% !important;
                flex: 0 0 100% !important;
                padding: 0 !important;
            }
            #bb-rw-root.bb-rw-unified-mode #bb-rw-stage-fields {
                display: grid !important;
                grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
                align-items: start !important;
                gap: 8px !important;
                width: 100% !important;
            }
            #bb-rw-root.bb-rw-unified-mode .bb-rw-unified-card {
                min-width: 0 !important;
                margin: 0 !important;
                padding: 7px !important;
                border: 1px solid var(--border-color, #d9e0e7) !important;
                border-radius: 7px !important;
                background: var(--card-bg, #fff) !important;
                box-sizing: border-box !important;
            }
            #bb-rw-root.bb-rw-unified-mode .bb-rw-unified-card.is-active {
                border-color: var(--primary, #922638) !important;
                box-shadow: inset 0 2px 0 var(--primary, #922638) !important;
            }
            #bb-rw-root.bb-rw-unified-mode .bb-rw-unified-card-header {
                margin: 0 0 6px !important;
                padding: 0 0 5px !important;
                border-bottom: 1px solid var(--border-color, #d9e0e7) !important;
            }
            #bb-rw-root.bb-rw-unified-mode .bb-rw-unified-title {
                margin: 0 0 4px !important;
                font-size: 12px !important;
                font-weight: 700 !important;
            }
            #bb-rw-root.bb-rw-unified-mode .bb-rw-unified-select {
                width: 100% !important;
                min-width: 0 !important;
                height: 27px !important;
                min-height: 27px !important;
                padding: 3px 5px !important;
                font-size: 10px !important;
            }
            #bb-rw-root.bb-rw-unified-mode .bb-rw-unified-fields
            .bb-rw-field-section {
                margin: 0 0 5px !important;
                padding: 5px 6px !important;
            }
            #bb-rw-root.bb-rw-unified-mode .bb-rw-unified-fields
            .bb-rw-field-section > .row {
                display: grid !important;
                grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
                gap: 5px 7px !important;
                margin: 0 !important;
            }
            #bb-rw-root.bb-rw-unified-mode .bb-rw-unified-fields
            .bb-rw-field-section > .row::before,
            #bb-rw-root.bb-rw-unified-mode .bb-rw-unified-fields
            .bb-rw-field-section > .row::after {
                display: none !important;
                content: none !important;
            }
            #bb-rw-root.bb-rw-unified-mode .bb-rw-unified-fields
            .bb-rw-field-column {
                float: none !important;
                width: auto !important;
                min-width: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
            }
            #bb-rw-root.bb-rw-unified-mode .bb-rw-unified-fields
            .control-label,
            #bb-rw-root.bb-rw-unified-mode .bb-rw-unified-fields
            .form-group > label {
                min-height: 0 !important;
                margin: 0 0 2px !important;
                font-size: 10px !important;
                line-height: 1.25 !important;
            }
            #bb-rw-root.bb-rw-unified-mode .bb-rw-unified-fields
            input.form-control:not([type="checkbox"]):not([type="radio"]),
            #bb-rw-root.bb-rw-unified-mode .bb-rw-unified-fields
            select.form-control,
            #bb-rw-root.bb-rw-unified-mode .bb-rw-unified-fields
            .link-field input,
            #bb-rw-root.bb-rw-unified-mode .bb-rw-unified-fields
            .input-with-feedback {
                width: 100% !important;
                min-width: 0 !important;
                height: 28px !important;
                min-height: 28px !important;
                padding: 3px 5px !important;
                font-size: 10px !important;
                box-sizing: border-box !important;
            }
            #bb-rw-root.bb-rw-unified-mode .bb-rw-unified-fields
            .form-group,
            #bb-rw-root.bb-rw-unified-mode .bb-rw-unified-fields
            .frappe-control {
                min-width: 0 !important;
                margin: 0 !important;
            }
            #bb-rw-root.bb-rw-unified-mode .bb-rw-unified-fields
            textarea.form-control {
                min-height: 42px !important;
                padding: 4px 5px !important;
            }
            @media (max-width: 1200px) {
                #bb-rw-root.bb-rw-unified-mode #bb-rw-stage-fields {
                    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
                }
                #bb-rw-root.bb-rw-unified-mode .bb-rw-unified-card:last-child {
                    grid-column: 1 / -1;
                }
            }
            @media (max-width: 760px) {
                #bb-rw-root.bb-rw-unified-mode #bb-rw-stage-fields {
                    grid-template-columns: minmax(0, 1fr) !important;
                }
                #bb-rw-root.bb-rw-unified-mode .bb-rw-unified-card:last-child {
                    grid-column: auto;
                }
            }
        `;
        document.head.appendChild(style);
    }

    async function bbRenderUnifiedStages() {
        const activeIndex = Number(state.index);
        if (!BB_UNIFIED_INDICES.includes(activeIndex) || !state.requestName) {
            return;
        }

        const requestKey = String(state.requestName);
        const token = ++state.combinedRenderToken;

        if (state.combinedRequestKey !== requestKey) {
            state.combinedControls = {};
            state.combinedValues = {};
            state.combinedFormMeta = {};
            state.combinedDefaults = {};
            state.combinedRequestKey = requestKey;
        } else {
            bbUnifiedCaptureDrafts();
        }

        const activeItem = state.schema[activeIndex];
        const activeType = activeItem.doctype;
        let activeMeta = state.combinedFormMeta[activeType];

        if (state.currentIsNew) {
            if (!activeMeta || !activeMeta.isNew) {
                state.combinedValues[activeType] = {};
                state.combinedControls[activeType] = {};
                activeMeta = { name: null, isNew: true };
                state.combinedFormMeta[activeType] = activeMeta;
            }
            if (state.currentValues &&
                Object.keys(state.currentValues).length) {
                state.combinedDefaults[activeType] =
                    Object.assign({}, state.currentValues);
            }
        } else if (state.currentName) {
            if (!activeMeta || activeMeta.name !== state.currentName) {
                state.combinedValues[activeType] = {};
                state.combinedControls[activeType] = {};
                activeMeta = {
                    name: state.currentName,
                    isNew: false
                };
                state.combinedFormMeta[activeType] = activeMeta;
            }
        }

        const descriptors = [];
        for (const index of BB_UNIFIED_INDICES) {
            const item = state.schema[index];
            if (!item) continue;

            const doctype = item.doctype;
            const rows = stageRecords(doctype);
            let meta = state.combinedFormMeta[doctype];

            if (!meta) {
                const selected = rows.find(
                    row => row.name === state.selectedNames[doctype]
                ) || (index === activeIndex && state.currentName
                    ? rows.find(row => row.name === state.currentName)
                    : null) || rows[0] || null;

                meta = selected
                    ? { name: selected.name, isNew: false }
                    : { name: null, isNew: true };

                state.combinedFormMeta[doctype] = meta;
            }

            if (meta.name && !rows.some(row => row.name === meta.name)) {
                meta = { name: null, isNew: true };
                state.combinedFormMeta[doctype] = meta;
                state.combinedValues[doctype] = {};
            }

            if (index === activeIndex) {
                if (state.currentIsNew) {
                    meta.name = null;
                    meta.isNew = true;
                } else if (state.currentName) {
                    meta.name = state.currentName;
                    meta.isNew = false;
                }
                state.combinedFormMeta[doctype] = meta;
            }

            state.selectedNames[doctype] = meta.name || null;
            descriptors.push({
                index,
                item,
                doctype,
                rows,
                meta,
                record: meta.name
                    ? rows.find(row => row.name === meta.name) || null
                    : null
            });
        }

        await Promise.all(descriptors.map(async function (d) {
            if (!d.meta.isNew ||
                Object.prototype.hasOwnProperty.call(
                    state.combinedDefaults, d.doctype
                )) return;

            try {
                state.combinedDefaults[d.doctype] =
                    await call("get_stage_defaults", {
                        doctype: d.doctype,
                        request_name: state.requestName
                    }) || {};
            } catch (error) {
                state.combinedDefaults[d.doctype] = {};
                console.warn("تعذر تحميل القيم الافتراضية:", d.doctype, error);
            }
        }));

        if (token !== state.combinedRenderToken ||
            String(state.requestName) !== requestKey) return;

        bbUnifiedInstallStyle();
        page.main.find("#bb-rw-root").addClass("bb-rw-unified-mode");

        const $host = page.main.find("#bb-rw-stage-fields");
        $host.empty();

        const cards = [];

        for (const d of descriptors) {
            const base = d.record ||
                state.combinedDefaults[d.doctype] || {};
            const values = Object.assign(
                {},
                base,
                state.combinedValues[d.doctype] || {}
            );

            state.index = d.index;
            state.currentName = d.meta.name || null;
            state.currentIsNew = !!d.meta.isNew;
            state.currentValues = values;

            // إرفاق نوع المستند بكل حقل كي تبقى الحقول المحمية صحيحة.
            const fields = (d.item.fields || []).map(
                field => Object.assign({}, field, { doctype: d.doctype })
            );

            // BB_UNIFIED_RENDER_ROOT_FIX_V1
            // ابنِ النموذج في حاوية مستقلة كي لا تُحذف البطاقة السابقة.
            const $buildHost = $('<div class="bb-rw-unified-build-host"></div>');
            makeFieldContainerLayout(fields, $buildHost);

            const controls = Object.assign({}, state.controls || {});
            state.combinedControls[d.doctype] = controls;

            // انقل حقول هذا النموذج وحده إلى بطاقته.
            const $fieldNodes = $buildHost.children().detach();
            const $card = $('<section class="bb-rw-unified-card"></section>');
            if (d.index === activeIndex) $card.addClass("is-active");

            const $header = $('<div class="bb-rw-unified-card-header"></div>');
            $('<h4 class="bb-rw-unified-title"></h4>')
                .text(d.item.label + " | " + d.doctype)
                .appendTo($header);

            const $select = $('<select class="form-control bb-rw-unified-select"></select>');
            $select.append($("<option>").val("__new__").text("سجل جديد"));

            d.rows.forEach(function (row) {
                const status = row[d.item.status_field] || "";
                $select.append(
                    $("<option>")
                        .val(row.name)
                        .text([row.name, status].filter(Boolean).join(" — "))
                );
            });

            $select.val(d.meta.name || "__new__");
            $header.append($select);
            $card.append($header);

            const $fields = $('<div class="bb-rw-unified-fields"></div>');
            $fields.append($fieldNodes);
            $card.append($fields);
            $host.append($card);
            cards.push({ descriptor: d, card: $card });

            // النقر داخل أي بطاقة يجعلها هدف الحفظ والإجراءات المشتركة
            // دون إعادة إنشاء الحقول أو فقدان التركيز.
            $card.on("focusin", ".frappe-control input, .frappe-control select, .frappe-control textarea", function () {
                if (state.index === d.index) return;

                bbUnifiedCaptureDrafts();
                state.index = d.index;
                state.currentName = d.meta.name || null;
                state.currentIsNew = !!d.meta.isNew;
                state.currentValues = Object.assign(
                    {},
                    d.record || state.combinedDefaults[d.doctype] || {},
                    state.combinedValues[d.doctype] || {}
                );
                state.controls = state.combinedControls[d.doctype] || {};

                cards.forEach(x => x.card.removeClass("is-active"));
                $card.addClass("is-active");

                page.main.find("#bb-rw-stage-title").text(
                    "الصرف والتسليم ونقل الدم | " + d.item.label
                );
                page.main.find("#bb-rw-stage-status").text(
                    d.record
                        ? d.record.name + " — " +
                          (d.record[d.item.status_field] || "—")
                        : "سجل جديد — " + d.item.label
                );

                renderTabs();
                renderWorkflowActions(d.item, d.record);
            });

            $select.on("change", async function () {
                bbUnifiedCaptureDrafts();

                const chosen = String($select.val() || "__new__");
                const oldKey = d.meta.isNew ? "__new__" : d.meta.name;

                const switchRecord = async function () {
                    state.index = d.index;
                    state.combinedValues[d.doctype] = {};
                    state.combinedControls[d.doctype] = {};

                    if (chosen === "__new__") {
                        state.combinedFormMeta[d.doctype] = {
                            name: null,
                            isNew: true
                        };
                        delete state.combinedDefaults[d.doctype];

                        try {
                            state.combinedDefaults[d.doctype] =
                                await call("get_stage_defaults", {
                                    doctype: d.doctype,
                                    request_name: state.requestName
                                }) || {};
                        } catch (error) {
                            state.combinedDefaults[d.doctype] = {};
                            frappe.msgprint(
                                (error && error.message) ||
                                __("تعذر تحميل القيم الافتراضية.")
                            );
                        }

                        state.selectedNames[d.doctype] = null;
                        state.currentName = null;
                        state.currentIsNew = true;
                        state.currentValues =
                            Object.assign({}, state.combinedDefaults[d.doctype]);
                    } else {
                        const row = stageRecords(d.doctype)
                            .find(x => x.name === chosen);
                        if (!row) {
                            frappe.msgprint(__("السجل المختار غير موجود في طلب الدم الحالي."));
                            $select.val(oldKey || "__new__");
                            return;
                        }

                        state.combinedFormMeta[d.doctype] = {
                            name: chosen,
                            isNew: false
                        };
                        state.selectedNames[d.doctype] = chosen;
                        state.currentName = chosen;
                        state.currentIsNew = false;
                        state.currentValues = Object.assign({}, row);
                    }

                    renderStage();
                };

                if (Object.keys(state.combinedValues[d.doctype] || {}).length &&
                    chosen !== oldKey) {
                    frappe.confirm(
                        __("توجد تغييرات غير محفوظة في هذا القسم. هل تريد التخلص منها وتغيير السجل؟"),
                        switchRecord,
                        function () { $select.val(oldKey || "__new__"); }
                    );
                } else {
                    await switchRecord();
                }
            });
        }

        state.index = activeIndex;
        const active = descriptors.find(d => d.index === activeIndex);
        if (active) {
            state.currentName = active.meta.name || null;
            state.currentIsNew = !!active.meta.isNew;
            state.controls = state.combinedControls[active.doctype] || {};
            state.currentValues = Object.assign(
                {},
                active.record || state.combinedDefaults[active.doctype] || {},
                state.combinedValues[active.doctype] || {}
            );

            page.main.find("#bb-rw-stage-title").text(
                "الصرف والتسليم ونقل الدم | " + active.item.label
            );
            page.main.find("#bb-rw-stage-status").text(
                active.record
                    ? active.record.name + " — " +
                      (active.record[active.item.status_field] || "—")
                    : "سجل جديد — " + active.item.label
            );
            renderWorkflowActions(active.item, active.record);
        }

        page.main.find("#bb-rw-records").empty();
        renderTabs();
    }

    function renderStage() {
        if (!state.schema.length) {
            return;
        }

        const activeStage = stage();
        if (
            activeStage.doctype === "Blood Request" &&
            state.request &&
            state.request.request_status === "Approved" &&
            state.autoRoutedApprovedRequest !== state.request.name
        ) {
            state.autoRoutedApprovedRequest = state.request.name;
            activateWorkflowStage("Blood Crossmatch").catch(function (error) {
                frappe.msgprint({
                    title: __("تعذر فتح المطابقة"),
                    message: (error && error.message) ||
                        __("تعذر تحميل بيانات المطابقة من طلب الدم.")
                });
            });
            return;
        }

        // BB_CROSSMATCH_RESERVATION_FALLBACK_V7
        const activeCrossmatch = activeStage.doctype === "Blood Crossmatch"
            ? selectedRecord("Blood Crossmatch")
            : null;

        if (
            activeCrossmatch &&
            String(activeCrossmatch.crossmatch_status || "").trim().toLowerCase() === "compatible" &&
            state.autoRoutedCompatibleCrossmatch !== activeCrossmatch.name &&
            state.routingCompatibleCrossmatch !== activeCrossmatch.name
        ) {
            const sourceName = activeCrossmatch.name;
            state.routingCompatibleCrossmatch = sourceName;

            activateWorkflowStage("Blood Reservation", sourceName).then(function () {
                state.autoRoutedCompatibleCrossmatch = sourceName;
                state.routingCompatibleCrossmatch = null;
            }).catch(function (error) {
                state.routingCompatibleCrossmatch = null;
                frappe.msgprint({
                    title: __("تعذر فتح الحجز"),
                    message: (error && error.message) ||
                        __("تعذر فتح الحجز المرتبط بالمطابقة المتوافقة.")
                });
            });
            return;
        }

        // BB_RESERVATION_READY_AUTO_ROUTE_V1
        const activeReservation = activeStage.doctype === "Blood Reservation"
            ? selectedRecord("Blood Reservation")
            : null;

        if (
            activeReservation &&
            String(activeReservation.reservation_status || "").trim().toLowerCase() === "ready for issue" &&
            state.autoRoutedReadyReservation !== activeReservation.name &&
            state.routingReadyReservation !== activeReservation.name
        ) {
            const reservationName = activeReservation.name;
            state.routingReadyReservation = reservationName;

            activateWorkflowStage("Blood Issue", reservationName).then(function () {
                state.autoRoutedReadyReservation = reservationName;
                state.routingReadyReservation = null;
            }).catch(function (error) {
                state.routingReadyReservation = null;
                frappe.msgprint({
                    title: __("تعذر فتح الصرف"),
                    message: (error && error.message) ||
                        __("تعذر فتح نافذة الصرف المرتبطة بالحجز.")
                });
            });
            return;
        }

        // BB_UNIFIED_WORKFLOW_V2
        if (BB_UNIFIED_INDICES.includes(Number(state.index)) && state.requestName) {
            bbRenderUnifiedStages().catch(function (error) {
                console.error("Unified blood workflow render failed:", error);
                showMessage(
                    "#bb-rw-stage-message",
                    (error && error.message) ||
                        __("تعذر عرض نماذج الصرف والتسليم ونقل الدم."),
                    "text-danger"
                );
            });
            return;
        }

        page.main.find("#bb-rw-root").removeClass("bb-rw-unified-mode");

        const item = stage();
        const records = stageRecords(item.doctype);
        let record = selectedRecord(item.doctype);

        if (item.doctype === "Blood Request" && state.request) {
            record = state.request;
            state.selectedNames[item.doctype] = state.request.name;
        }

        page.main.find("#bb-rw-stage-title").text(
            item.label + " | " + item.doctype
        );

        page.main.find("#bb-rw-stage-status").text(
            record ? (record[item.status_field] || "—") :
                (state.currentIsNew ? __("سجل جديد") : "")
        );

        renderTabs();
        renderRecordList(item);

        const sameCurrent = state.currentName &&
            record &&
            state.currentName === record.name &&
            !state.currentIsNew;

        if (sameCurrent) {
            state.currentValues = Object.assign({}, record);
        } else if (!state.currentIsNew) {
            state.currentName = record ? record.name : null;
            state.currentValues = record ? Object.assign({}, record) : {};
        }

        const canShowEditor = !!record || state.currentIsNew;

        if (!canShowEditor) {
            page.main.find("#bb-rw-stage-fields").empty();
            page.main.find("#bb-rw-unsaved-message").empty();
            page.main.find("#bb-rw-workflow-actions").empty();

            showMessage(
                "#bb-rw-stage-message",
                __("اختر سجلًا من القائمة أو اضغط «سجل جديد» لإنشاء سجل لهذه المرحلة."),
                "text-muted"
            );
            renderWorkflowActions(item, null);
            return;
        }

        showMessage("#bb-rw-stage-message", "", null);

        if (state.currentIsNew) {
            page.main.find("#bb-rw-unsaved-message")
                .html(
                    $('<div class="alert alert-info"></div>').text(
                        __("هذا سجل جديد غير محفوظ. ستُطبق قواعد التحقق الأصلية عند الحفظ.")
                    )
                );
        } else {
            page.main.find("#bb-rw-unsaved-message").empty();
        }

        makeFieldContainerLayout(item.fields);

        if (state.currentIsNew) {
            renderWorkflowActions(item, null);
        } else {
            renderWorkflowActions(item, record);
        }
    }

    async function refreshContext(preserveSelection) {
        if (!state.requestName) {
            return;
        }

        const savedSelections = Object.assign({}, state.selectedNames);
        const result = await call("load_request_context", {
            request_name: state.requestName
        });

        state.request = result.request;
        state.records = result.records || {};
        state.units = result.units || [];
        state.currentIsNew = false;

        state.schema.forEach(function (item) {
            const records = stageRecords(item.doctype);
            const previous = preserveSelection
                ? savedSelections[item.doctype]
                : null;

            if (item.doctype === "Blood Request") {
                state.selectedNames[item.doctype] = state.request.name;
            } else if (
                previous &&
                records.some(function (row) {
                    return row.name === previous;
                })
            ) {
                state.selectedNames[item.doctype] = previous;
            } else {
                state.selectedNames[item.doctype] =
                    records.length ? records[0].name : null;
            }
        });

        updateRequestSummary();

        const current = stage();
        const name = state.selectedNames[current.doctype];
        state.currentName = name || null;
        state.currentValues = Object.assign(
            {},
            selectedRecord(current.doctype) || {}
        );

        renderStage();
    }

    async function openRequest(requestName) {
        if (!requestName) {
            frappe.msgprint(__("اختر رقم طلب صحيحًا."));
            return;
        }

        setBusy(true);

        try {
            const result = await call("load_request_context", {
                request_name: requestName
            });

            state.requestName = result.request.name;
            state.request = result.request;
            state.records = result.records || {};
            state.units = result.units || [];
            state.currentIsNew = false;

            state.schema.forEach(function (item) {
                const records = stageRecords(item.doctype);

                if (item.doctype === "Blood Request") {
                    state.selectedNames[item.doctype] = result.request.name;
                } else {
                    state.selectedNames[item.doctype] =
                        records.length ? records[0].name : null;
                }
            });

            state.index = 0;
            state.currentName = state.requestName;
            state.currentValues = Object.assign({}, state.request);

            try {
                sessionStorage.setItem(
                    "bb_request_work_request_id",
                    state.requestName
                );
            } catch (e) {}

            if (state.requestPicker) {
                state.requestPicker.set_value(state.requestName);
            }

            updateRequestSummary();
            renderStage();
        } catch (error) {
            frappe.msgprint({
                title: __("تعذر فتح طلب الدم"),
                message: (error && error.message) ||
                    __("تعذر تحميل الطلب أو لا توجد صلاحية لقراءته.")
            });
        } finally {
            setBusy(false);
        }
    }

    /* BB_ALERT_TARGET_RESTORE_V1 */
    async function openAlertRecordFromRoute(requestName, targetDoctype, targetName) {
        if (!requestName) return;

        await openRequest(requestName);
        if (!state.request || state.request.name !== requestName) return;
        if (!targetDoctype || !targetName) return;

        const index = state.schema.findIndex(
            item => item.doctype === targetDoctype
        );
        const exists = targetDoctype === "Blood Request"
            ? state.request.name === targetName
            : stageRecords(targetDoctype).some(row => row.name === targetName);

        if (index < 0 || !exists) {
            frappe.msgprint({
                title: __("السجل غير موجود في سياق طلب الدم"),
                message: __(
                    "تم فتح صفحة متابعة الطلبات، لكن السجل المحدد لم يظهر ضمن " +
                    "سجلات الطلب المرتبط. لم يتم اختيار سجل بديل."
                )
            });
            return;
        }

        state.index = index;
        state.selectedNames[targetDoctype] = targetName;
        state.currentName = targetName;
        state.currentIsNew = false;
        const record = targetDoctype === "Blood Request"
            ? state.request : selectedRecord(targetDoctype);
        state.currentValues = Object.assign({}, record || {});
        renderStage();
    }


    async function newRecord() {
        const item = stage();

        if (!state.requestName && item.doctype !== "Blood Request") {
            frappe.msgprint(__("اختر طلب دم أولًا."));
            return;
        }

        if (item.doctype === "Blood Request") {
            setBusy(true);
            try {
                const defaults = await call("get_new_blood_request_defaults", {});
                state.requestName = null;
                state.request = null;
                state.records = {};
                state.units = [];
                state.selectedNames[item.doctype] = null;
                state.currentName = null;
                state.currentIsNew = true;
                state.currentValues = Object.assign({}, defaults || {});
                updateRequestSummary();
                renderStage();
            } catch (error) {
                frappe.msgprint({
                    title: __("تعذر بدء طلب جديد"),
                    message: (error && error.message) ||
                        __("تعذر تحميل القيم الافتراضية للطلب.")
                });
            } finally {
                setBusy(false);
            }
            return;
        }

        setBusy(true);

        try {
            const defaults = await call("get_stage_defaults", {
                doctype: item.doctype,
                request_name: state.requestName
            });

            state.selectedNames[item.doctype] = null;
            state.currentName = null;
            state.currentIsNew = true;
            state.currentValues = Object.assign({}, defaults || {});

            renderStage();
        } catch (error) {
            frappe.msgprint({
                title: __("تعذر بدء سجل جديد"),
                message: (error && error.message) || __("تعذر تحميل قيم الحقول.")
            });
        } finally {
            setBusy(false);
        }
    }

    async function saveCurrentStage() {
        const item = stage();
        const creatingRequest =
            item.doctype === "Blood Request" && state.currentIsNew;

        if (!state.requestName && !creatingRequest) {
            frappe.msgprint(__("اختر طلب دم أولًا."));
            return;
        }

        if (state.busy) {
            return;
        }

        if (item.doctype === "Blood Request" &&
            !creatingRequest &&
            state.currentName !== state.requestName) {
            frappe.msgprint(__("لا يمكن تبديل الطلب الحالي من خلال زر الحفظ."));
            return;
        }

        const values = {};

        for (const field of item.fields) {
            const control = state.controls[field.fieldname];
            if (!control) {
                continue;
            }

            const value = control.get_value();

            if (
                field.reqd &&
                !field.read_only &&
                !PROTECTED_FIELDS[item.doctype]?.includes(field.fieldname) &&
                (value === null || value === undefined || value === "")
            ) {
                frappe.msgprint({
                    title: __("حقل مطلوب"),
                    message: __("أدخل قيمة الحقل: {0}", [
                        field.label || field.fieldname
                    ])
                });
                if (control.$input) {
                    control.$input.focus();
                }
                return;
            }

            values[field.fieldname] = value;
        }

        setBusy(true);
        showMessage("#bb-rw-save-message", __("جارٍ الحفظ..."), "text-muted");

        try {
            let result;

            if (creatingRequest) {
                result = await call("create_blood_request_in_window", {
                    values: values
                });
                // اربط النافذة بالطلب الذي أنشئ للتو قبل تحميل السياق.
                state.requestName = result.name;
                state.request = null;
            } else {
                result = await call("save_stage_document", {
                    doctype: item.doctype,
                    request_name: state.requestName,
                    name: state.currentIsNew ? null : state.currentName,
                    values: values
                });
            }

            state.currentName = result.name;
            state.currentIsNew = false;
            state.selectedNames[item.doctype] = result.name;

            frappe.show_alert({
                message: __("تم الحفظ: {0}", [result.name]),
                indicator: "green"
            });

            await refreshContext(true);

            state.selectedNames[item.doctype] = result.name;
            state.currentName = result.name;

            const saved = selectedRecord(item.doctype);
            state.currentValues = Object.assign(
                {},
                saved || result.doc || {}
            );

            // BB_UNIFIED_WORKFLOW_V2
            // إعادة قراءة السجل المحفوظ بدل إعادة تطبيق مسودة قديمة عليه.
            if (BB_UNIFIED_INDICES.includes(Number(state.index))) {
                state.combinedValues[item.doctype] = {};
                state.combinedControls[item.doctype] = {};
                state.combinedFormMeta[item.doctype] = {
                    name: result.name,
                    isNew: false
                };
            }

            renderStage();

            showMessage(
                "#bb-rw-save-message",
                __("تم الحفظ بنجاح: {0}", [result.name]),
                "text-success"
            );
        } catch (error) {
            frappe.msgprint({
                title: __("تعذر حفظ السجل"),
                message: (error && error.message) ||
                    __("راجع الحقول المطلوبة وروابط السجل.")
            });
            showMessage(
                "#bb-rw-save-message",
                __("لم يكتمل الحفظ. لم تُعتبر العملية ناجحة."),
                "text-danger"
            );
        } finally {
            setBusy(false);
        }
    }

    function changeStage(nextIndex) {
        if (nextIndex < 0 || nextIndex >= state.schema.length) {
            return;
        }

        bbUnifiedCaptureDrafts();
        state.index = nextIndex;
        const item = stage();

        state.currentIsNew = false;
        state.currentName = state.selectedNames[item.doctype] || null;
        state.currentValues = Object.assign(
            {},
            selectedRecord(item.doctype) ||
            (item.doctype === "Blood Request" ? state.request : {}) ||
            {}
        );

        renderStage();
    }

    function bindEvents() {
        page.main.on(
            "click",
            "#bb-rw-stage-tabs button[data-stage-index]",
            function (event) {
                event.preventDefault();
                const index = parseInt($(this).attr("data-stage-index"), 10);
                if (!Number.isFinite(index)) return;
                changeStage(index);
            }
        );

        page.main.on(
            "click",
            "#bb-rw-combined-stage-tabs button[data-stage-index]",
            function (event) {
                event.preventDefault();
                const index = parseInt(
                    $(this).attr("data-stage-index"), 10
                );
                if (Number.isFinite(index) && index >= 3 && index <= 6) {
                    changeStage(index);
                }
            }
        );

        page.main.on("click", "#bb-rw-open-request", function () {
            const requestName = state.requestPicker
                ? state.requestPicker.get_value()
                : null;
            openRequest(requestName);
        });

        page.main.on("click", "#bb-rw-save", saveCurrentStage);
        page.main.on("click", "#bb-rw-new", newRecord);

        page.main.on("click", "#bb-rw-refresh", function () {
            if (!state.requestName) {
                frappe.msgprint(__("اختر طلب دم أولًا."));
                return;
            }

            setBusy(true);
            refreshContext(true)
                .catch(function (error) {
                    frappe.msgprint(
                        (error && error.message) || __("تعذر التحديث.")
                    );
                })
                .finally(function () {
                    setBusy(false);
                });
        });

        page.main.on("click", "#bb-rw-prev", function () {
            changeStage(state.index - 1);
        });

        page.main.on("click", "#bb-rw-next", function () {
            changeStage(state.index + 1);
        });


        // BB_GLOBAL_NAV_HANDLER
        page.main.on("click", ".bb-bb-nav-button[data-bb-target]", function() {
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

    }

    async function boot() {
        page.main.html(frappe.render_template("blood_bank_request_work"));

        // BB_REQUEST_SEPARATE_ACTIONS_SECTION_V3
        // فصل إجراءات سير العمل عن أزرار التنقل العامة.
        (function separateWorkflowActionsSection() {
            const styleId = "bb-rw-separated-actions-style-v3";
            if (!document.getElementById(styleId)) {
                const style = document.createElement("style");
                style.id = styleId;
                style.textContent = `
                    #bb-rw-root #bb-rw-workflow-actions-section {
                        display: flex !important;
                        flex-direction: column !important;
                        align-items: stretch !important;
                        gap: 4px !important;
                        width: 100% !important;
                        min-width: 0 !important;
                        margin: 0 0 7px !important;
                        padding: 5px 8px !important;
                        border: 1px solid var(--border-color, #d9e0e7) !important;
                        border-radius: 7px !important;
                        background: var(--card-bg, #fff) !important;
                        box-sizing: border-box !important;
                    }
                    #bb-rw-root .bb-rw-actions-section-title {
                        display: block !important;
                        margin: 0 !important;
                        padding: 0 0 3px !important;
                        border-bottom: 1px solid var(--border-color, #e1e5ea) !important;
                        color: var(--text-muted, #687483) !important;
                        font-size: 10px !important;
                        font-weight: 700 !important;
                        line-height: 1.2 !important;
                    }
                    #bb-rw-root #bb-rw-workflow-actions-section > #bb-rw-workflow-actions {
                        display: flex !important;
                        flex-flow: row nowrap !important;
                        align-items: center !important;
                        justify-content: flex-start !important;
                        gap: 5px !important;
                        width: 100% !important;
                        min-width: 0 !important;
                        min-height: 0 !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                    #bb-rw-root #bb-rw-workflow-actions-section .bb-rw-workflow-dropdown {
                        display: inline-flex !important;
                        flex: 0 1 auto !important;
                        flex-flow: row nowrap !important;
                        align-items: center !important;
                        gap: 4px !important;
                        min-width: 0 !important;
                        margin: 0 !important;
                    }
                    #bb-rw-root #bb-rw-workflow-actions-section .bb-workflow-actions-toggle {
                        flex: 0 0 auto !important;
                        min-height: 26px !important;
                        margin: 0 !important;
                        padding: 3px 8px !important;
                        font-size: 10px !important;
                        line-height: 1.2 !important;
                        white-space: nowrap !important;
                    }
                    #bb-rw-root #bb-rw-workflow-actions-section
                    .bb-rw-workflow-dropdown.open > .bb-workflow-actions-menu {
                        display: flex !important;
                        flex-flow: row nowrap !important;
                        align-items: center !important;
                        justify-content: flex-start !important;
                        gap: 5px !important;
                        width: max-content !important;
                        max-width: 90vw !important;
                        max-height: 45vh !important;
                        overflow-x: auto !important;
                        overflow-y: auto !important;
                        padding: 5px !important;
                    }
                    #bb-rw-root #bb-rw-workflow-actions-section
                    .bb-workflow-actions-menu > li {
                        display: block !important;
                        flex: 0 0 auto !important;
                        float: none !important;
                        width: auto !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                    #bb-rw-root #bb-rw-workflow-actions-section
                    .bb-rw-workflow-action-button {
                        flex: 0 0 auto !important;
                        width: auto !important;
                        min-height: 27px !important;
                        margin: 0 !important;
                        padding: 3px 8px !important;
                        font-size: 10px !important;
                        line-height: 1.2 !important;
                        white-space: nowrap !important;
                    }
                    #bb-rw-root #bb-rw-workflow-actions-section
                    .bb-rw-workflow-action-button.btn-primary {
                        color: #fff !important;
                        background: #922638 !important;
                        border-color: #922638 !important;
                    }
                    #bb-rw-root #bb-rw-workflow-actions-section
                    .bb-rw-workflow-action-button.btn-success {
                        color: #fff !important;
                        background: #218653 !important;
                        border-color: #218653 !important;
                    }
                    #bb-rw-root #bb-rw-workflow-actions-section
                    .bb-rw-workflow-action-button.btn-info {
                        color: #fff !important;
                        background: #147fa3 !important;
                        border-color: #147fa3 !important;
                    }
                    #bb-rw-root #bb-rw-workflow-actions-section
                    .bb-rw-workflow-action-button.btn-warning {
                        color: #302400 !important;
                        background: #f2c94c !important;
                        border-color: #e1b837 !important;
                    }
                    #bb-rw-root #bb-rw-workflow-actions-section
                    .bb-rw-workflow-action-button.btn-danger {
                        color: #fff !important;
                        background: #c93c45 !important;
                        border-color: #c93c45 !important;
                    }
                    #bb-rw-root #bb-rw-workflow-actions-section
                    .bb-rw-workflow-action-button:disabled {
                        opacity: .6 !important;
                        cursor: not-allowed !important;
                        filter: grayscale(.5) !important;
                    }
                    #bb-rw-root .bb-rw-toolbar-main,
                    #bb-rw-root .bb-rw-toolbar-navigation {
                        justify-content: center !important;
                    }
                `;
                document.head.appendChild(style);
            }

            const $main = page.main;
            const $toolbar = $main.find(".bb-rw-toolbar").first();
            const $actions = $main.find("#bb-rw-workflow-actions").first();

            if (!$toolbar.length || !$actions.length) {
                console.warn(
                    "Blood Request: تعذر فصل الإجراءات؛ عنصر الشريط أو الإجراءات غير موجود."
                );
                return;
            }

            let $section = $main.find(
                "#bb-rw-workflow-actions-section"
            ).first();

            if (!$section.length) {
                $section = $(
                    '<section id="bb-rw-workflow-actions-section" ' +
                    'aria-label="إجراءات سير العمل"></section>'
                );
                $section.append(
                    $('<div class="bb-rw-actions-section-title"></div>')
                        .text("إجراءات سير العمل")
                );
                $toolbar.after($section);
            }

            // نقل نفس العنصر يحافظ على هويته ومعالجات الأحداث المفوضة.
            $actions.appendTo($section);
        })();


        buildRequestPicker("");
        bindEvents();

        try {
            setBusy(true);
            state.schema = await call("get_page_schema", {});

            if (!Array.isArray(state.schema) || state.schema.length !== 7) {
                throw new Error("Unexpected workflow stage schema.");
            }

            renderTabs();

            let requestName = null;
            let alertTargetDoctype = "";
            let alertTargetName = "";

            if (frappe.route_options) {
                requestName = frappe.route_options.blood_request ||
                    frappe.route_options.request_name || null;
                alertTargetDoctype =
                    frappe.route_options.bb_alert_target_doctype || "";
                alertTargetName =
                    frappe.route_options.bb_alert_target_name || "";

                delete frappe.route_options.blood_request;
                delete frappe.route_options.request_name;
                delete frappe.route_options.bb_alert_target_doctype;
                delete frappe.route_options.bb_alert_target_name;
            }

            if (!requestName) {
                try {
                    requestName = sessionStorage.getItem(
                        "bb_request_work_request_id"
                    );
                } catch (e) {}
            }

            if (requestName) {
                await openAlertRecordFromRoute(
                    requestName, alertTargetDoctype, alertTargetName
                );
            } else {
                updateRequestSummary();
                showMessage(
                    "#bb-rw-stage-message",
                    __("اختر طلبًا من حقل البحث ثم اضغط «فتح الطلب المحدد»."),
                    "text-muted"
                );
            }
        } catch (error) {
            frappe.msgprint({
                title: __("تعذر تهيئة صفحة متابعة الطلب"),
                message: (error && error.message) ||
                    __("تعذر تحميل بيانات النوافذ.")
            });
        } finally {
            state.initializing = false;
            setBusy(false);
        }
    }

    pageNode.__bbRequestWorkController = {
        isReady: () => state.schema.length === 7 && !state.initializing,
        openAlertRecordFromRoute
    };

    boot();
};


/* BB_REQUEST_WORK_ALERT_PAGE_SHOW_V1 */
frappe.pages["blood-bank-request-work"].on_page_show = function (wrapper) {
    const node = wrapper && wrapper[0] ? wrapper[0] : wrapper;
    const controller = node && node.__bbRequestWorkController;
    if (!controller || !controller.isReady()) return;

    const options = frappe.route_options || {};
    const requestName = options.blood_request || options.request_name || "";
    const targetDoctype = options.bb_alert_target_doctype || "";
    const targetName = options.bb_alert_target_name || "";
    if (!requestName) return;

    delete options.blood_request;
    delete options.request_name;
    delete options.bb_alert_target_doctype;
    delete options.bb_alert_target_name;

    controller.openAlertRecordFromRoute(
        requestName, targetDoctype, targetName
    );
};
