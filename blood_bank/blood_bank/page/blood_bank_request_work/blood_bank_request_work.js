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
        initializing: true
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

    function makeFieldContainerLayout(fields) {
        const $root = page.main.find("#bb-rw-stage-fields");
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
        }).then(function (result) {
            if (
                stage().doctype !== doctypeAtStart ||
                state.currentName !== nameAtStart ||
                state.requestName !== requestAtStart
            ) {
                return;
            }

            $actions.empty();
            const actions = (result && result.actions) || [];

            if (!actions.length) {
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
                const $link = $("<a>", {
                    href: "#",
                    text: actionInfo.action
                });

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
