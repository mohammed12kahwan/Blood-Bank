(() => {
    const LABEL = "عمل موظف بنك الدم";
    const CLASS_NAME = "bb-blood-bank-shortcut";

    function enhance_shortcut() {
        document.querySelectorAll(".shortcut-widget-box").forEach((widget) => {
            const title = widget.querySelector(".widget-title");
            if (!title) return;

            const text = title.textContent.trim();
            if (!text.includes(LABEL)) return;

            widget.classList.add(CLASS_NAME);

            let icon = widget.querySelector(".bb-shortcut-icon");
            if (!icon) {
                icon = document.createElement("span");
                icon.className = "bb-shortcut-icon";
                icon.textContent = "🩸";
                title.prepend(icon);
            }

            let badge = widget.querySelector(".bb-shortcut-alert");
            if (!badge) {
                badge = document.createElement("span");
                badge.className = "bb-shortcut-alert";
                badge.textContent = "0";
                title.appendChild(badge);
            }

            if (!widget.dataset.bbCountLoaded) {
                widget.dataset.bbCountLoaded = "1";

                frappe.db.count("Blood Request", {
                    filters: {
                        docstatus: 0
                    }
                }).then((count) => {
                    badge.textContent = Number(count || 0).toLocaleString("en-US");
                    badge.style.display = "inline-flex";
                }).catch(() => {
                    badge.style.display = "none";
                });
            }
        });
    }

    function start() {
        enhance_shortcut();

        const observer = new MutationObserver(() => {
            enhance_shortcut();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        setInterval(enhance_shortcut, 3000);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();

/* BB_WORKSPACE_ALERTS_V1 */
(() => {
    "use strict";

    const PANEL_ID = "bb-workspace-alert-panel";
    let observer = null;
    let checkQueued = false;

    function getRouteText() {
        try {
            const route = typeof frappe.get_route === "function"
                ? frappe.get_route()
                : [];
            return (route || []).map(String).join(" ").toLowerCase();
        } catch (error) {
            return "";
        }
    }

    function isTargetWorkspace() {
        const route = getRouteText();
        const normalized = route.replace(/_/g, "-");

        if (
            normalized.includes("blood-bank-ui-test") ||
            route.includes("blood bank ui test")
        ) {
            return true;
        }

        const titleNodes = document.querySelectorAll(
            ".page-head .title-text, .page-head .title-area, .page-head h3"
        );

        for (const node of titleNodes) {
            const text = (node.textContent || "").trim().toLowerCase();
            if (text === "blood bank ui test") {
                return true;
            }
        }

        return false;
    }

    function getHost() {
        return document.querySelector(".layout-main-section");
    }


    async function loadAlertRecordPage(details) {
        const state = details.__bbAlertState;
        if (!state || state.loading) return;

        state.loading = true;
        const moreButton = details.querySelector("[data-bb-alert-load-more]");
        if (moreButton) {
            moreButton.disabled = true;
            moreButton.textContent = "جارٍ تحميل السجلات…";
        }

        try {
            const records = await frappe.db.get_list(state.doctype, {
                filters: state.filters,
                fields: state.fields,
                order_by: "modified desc",
                limit_start: state.offset,
                limit_page_length: state.pageSize
            });

            if (!details.isConnected) return;

            if (!Array.isArray(records)) {
                throw new Error("Unexpected records response");
            }

            records.forEach(function (record) {
                const row = document.createElement("article");
                row.className = "bb-wa-record-item";

                const identifier = document.createElement("button");
                identifier.type = "button";
                identifier.className = "bb-wa-record-name bb-wa-record-open";
                identifier.dataset.bbAlertRecordOpen = "1";
                identifier.dataset.bbAlertRecordDoctype = String(state.doctype || "");
                identifier.dataset.bbAlertRecordName = String(record.name || "");
                identifier.textContent = "رقم السجل: " + String(record.name || "—");
                identifier.title = "فتح السجل داخل نافذة عمل بنك الدم";
                identifier.style.cssText =
                    "border:0;background:transparent;padding:0;" +
                    "font:inherit;font-weight:700;color:#0369a1;" +
                    "text-decoration:underline;cursor:pointer;text-align:start;";
                row.appendChild(identifier);

                const values = document.createElement("div");
                values.className = "bb-wa-record-fields";

                state.fields.forEach(function (fieldname) {
                    if (fieldname === "name") return;

                    const value = record[fieldname];
                    if (value === null || value === undefined || value === "") {
                        return;
                    }

                    const fieldLine = document.createElement("span");
                    fieldLine.className = "bb-wa-record-field";

                    const label = document.createElement("b");
                    label.textContent =
                        (state.labels[fieldname] || fieldname) + ": ";

                    const valueText = document.createElement("span");
                    valueText.textContent = String(value);

                    fieldLine.append(label, valueText);
                    values.appendChild(fieldLine);
                });

                row.appendChild(values);
                state.list.appendChild(row);
            });

            state.offset += records.length;
            state.loaded += records.length;

            const total = state.total;
            state.status.textContent = (
                total > state.loaded
                    ? `تم عرض ${state.loaded} من ${total} سجلًا مطابقًا.`
                    : `تم عرض ${state.loaded} سجلًا مطابقًا.`
            );

            if (state.loaded === 0) {
                state.status.textContent =
                    "لا توجد سجلات متاحة للعرض بهذه الشروط أو لا تتوفر صلاحية قراءتها.";
            }

            if (moreButton) {
                const hasMore =
                    records.length === state.pageSize &&
                    state.offset < total;

                moreButton.hidden = !hasMore;
                moreButton.disabled = false;
                moreButton.textContent = "تحميل المزيد";
            }
        } catch (error) {
            console.error("Blood Bank alert records:", error);
            state.status.textContent =
                "تعذر تحميل السجلات. تحقق من الصلاحيات والاتصال ثم حاول مجددًا.";

            if (moreButton) {
                moreButton.hidden = false;
                moreButton.disabled = false;
                moreButton.textContent = "إعادة المحاولة";
            }
        } finally {
            state.loading = false;
            if (moreButton && moreButton.isConnected && !moreButton.disabled) {
                moreButton.textContent = "تحميل المزيد";
            }
        }
    }


    /* BB_ALERT_RECORD_NAVIGATION_V1 */
    const BB_ALERT_INITIAL_DOCTYPES = new Set([
        "Blood Donor", "Blood Donation", "Blood Processing", "Blood Unit"
    ]);

    const BB_ALERT_COMPONENT_DOCTYPES = new Set([
        "Blood Component", "Blood Screening",
        "Blood Component Quality Check", "Blood Storage"
    ]);

    const BB_ALERT_REQUEST_DOCTYPES = new Set([
        "Blood Request", "Blood Reservation", "Blood Crossmatch",
        "Blood Issue", "Blood Handover", "Blood Transfusion",
        "Blood Unit Disposition"
    ]);

    async function bbAlertFindRelatedRecord(startDoctype, startName, targetDoctype) {
        const donationTypes = new Set([
            "Blood Donation", "Blood Processing", "Blood Unit",
            "Blood Component", "Blood Screening",
            "Blood Component Quality Check", "Blood Storage"
        ]);
        const requestTypes = new Set([
            "Blood Request", "Blood Reservation", "Blood Crossmatch",
            "Blood Issue", "Blood Handover", "Blood Transfusion",
            "Blood Unit Disposition", "Blood Unit", "Blood Storage"
        ]);
        const allowed = targetDoctype === "Blood Donation"
            ? donationTypes : requestTypes;

        const fallback = {
            blood_donation: "Blood Donation",
            donation: "Blood Donation",
            donation_id: "Blood Donation",
            blood_unit: "Blood Unit",
            blood_component: "Blood Component",
            blood_processing: "Blood Processing",
            blood_screening: "Blood Screening",
            blood_request: "Blood Request",
            request_name: "Blood Request",
            blood_reservation: "Blood Reservation",
            blood_crossmatch: "Blood Crossmatch",
            blood_issue: "Blood Issue",
            blood_handover: "Blood Handover",
            blood_transfusion: "Blood Transfusion"
        };

        const queue = [{ doctype: startDoctype, name: startName }];
        const seen = new Set();

        while (queue.length && seen.size < 20) {
            const current = queue.shift();
            if (!current || !current.name || !current.doctype) continue;

            const key = current.doctype + "|" + current.name;
            if (seen.has(key)) continue;
            seen.add(key);

            if (current.doctype === targetDoctype) return current.name;

            const response = await frappe.call({
                method: "frappe.client.get",
                args: { doctype: current.doctype, name: current.name }
            });
            const doc = response && response.message;
            if (!doc) continue;

            let fields = [];
            try {
                const meta = frappe.get_meta(current.doctype);
                fields = meta && Array.isArray(meta.fields) ? meta.fields : [];
            } catch (e) {}

            const inspected = new Set();
            for (const field of fields) {
                if (field.fieldtype !== "Link" || !field.fieldname) continue;
                inspected.add(field.fieldname);
                const value = doc[field.fieldname];
                const linkedType = field.options;
                if (!value || typeof value !== "string" || !linkedType) continue;
                if (linkedType === targetDoctype) return value;
                if (allowed.has(linkedType)) {
                    queue.push({ doctype: linkedType, name: value });
                }
            }

            for (const [fieldname, linkedType] of Object.entries(fallback)) {
                if (inspected.has(fieldname)) continue;
                const value = doc[fieldname];
                if (!value || typeof value !== "string") continue;
                if (linkedType === targetDoctype) return value;
                if (allowed.has(linkedType)) {
                    queue.push({ doctype: linkedType, name: value });
                }
            }
        }
        return "";
    }

    async function bbAlertOpenRecord(button) {
        const doctype = button.dataset.bbAlertRecordDoctype || "";
        const name = button.dataset.bbAlertRecordName || "";
        if (!doctype || !name) {
            frappe.msgprint(__("رقم السجل أو نوعه غير محدد."));
            return;
        }

        button.disabled = true;
        try {
            if (BB_ALERT_INITIAL_DOCTYPES.has(doctype)) {
                sessionStorage.setItem(
                    "bb_initial_work_report_selection",
                    JSON.stringify({ doctype, name })
                );
                frappe.set_route("blood-bank-initial-work");
                return;
            }

            if (BB_ALERT_COMPONENT_DOCTYPES.has(doctype)) {
                const donation = await bbAlertFindRelatedRecord(
                    doctype, name, "Blood Donation"
                );
                if (!donation) {
                    frappe.msgprint(__(
                        "تعذر تحديد التبرع المرتبط؛ لم يُفتح نموذج DocType القياسي."
                    ));
                    return;
                }
                frappe.route_options = Object.assign({}, frappe.route_options || {}, {
                    donation_id: donation,
                    bb_alert_target_doctype: doctype,
                    bb_alert_target_name: name
                });
                frappe.set_route("blood-bank-component-work");
                return;
            }

            if (BB_ALERT_REQUEST_DOCTYPES.has(doctype)) {
                const request = await bbAlertFindRelatedRecord(
                    doctype, name, "Blood Request"
                );
                if (!request) {
                    frappe.msgprint(__(
                        "تعذر تحديد طلب الدم المرتبط؛ لم يُفتح نموذج DocType القياسي."
                    ));
                    return;
                }
                frappe.route_options = Object.assign({}, frappe.route_options || {}, {
                    blood_request: request,
                    bb_alert_target_doctype: doctype,
                    bb_alert_target_name: name
                });
                frappe.set_route("blood-bank-request-work");
                return;
            }

            frappe.msgprint(__("لا توجد صفحة عمل مخصصة مرتبطة بهذا النوع من السجلات."));
        } catch (error) {
            console.error("Blood Bank alert navigation:", error);
            frappe.msgprint({
                title: __("تعذر فتح السجل"),
                message: (error && error.message) || __("حدث خطأ أثناء فتح السجل.")
            });
        } finally {
            if (button.isConnected) button.disabled = false;
        }
    }

    async function showAlertRecords(panel, card) {
        const doctype = card.dataset.bbAlertDoctype;
        const titleNode = card.querySelector(".bb-wa-title");
        const alertTitle = titleNode
            ? titleNode.textContent
            : "السجلات المرتبطة بالتنبيه";

        let filters;
        try {
            filters = JSON.parse(card.dataset.bbAlertFilters || "{}");
        } catch (error) {
            console.error("Invalid Blood Bank alert filters:", error);
            frappe.msgprint(__("تعذر قراءة شروط التنبيه."));
            return;
        }

        if (!doctype || !filters || typeof filters !== "object") {
            frappe.msgprint(__("بيانات التنبيه غير مكتملة."));
            return;
        }

        const signature = doctype + "|" + JSON.stringify(filters);
        const previous = panel.querySelector(".bb-wa-record-details");

        if (previous && previous.dataset.signature === signature) {
            previous.hidden = !previous.hidden;
            if (!previous.hidden) {
                previous.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest"
                });
            }
            return;
        }

        if (previous) previous.remove();

        const details = document.createElement("section");
        details.className = "bb-wa-record-details";
        details.dataset.signature = signature;

        const header = document.createElement("div");
        header.className = "bb-wa-record-details-header";

        const heading = document.createElement("h4");
        heading.textContent = alertTitle + " — السجلات المطابقة";

        const close = document.createElement("button");
        close.type = "button";
        close.className = "btn btn-default btn-sm";
        close.dataset.bbAlertDetailsClose = "1";
        close.textContent = "إغلاق ✕";
        close.setAttribute("aria-label", "إغلاق تفاصيل السجلات");

        header.append(heading, close);

        const status = document.createElement("p");
        status.className = "bb-wa-record-status";
        status.textContent = "جارٍ تحميل السجلات المطابقة…";

        const list = document.createElement("div");
        list.className = "bb-wa-record-list";

        const more = document.createElement("button");
        more.type = "button";
        more.className = "btn btn-default btn-sm bb-wa-load-more";
        more.dataset.bbAlertLoadMore = "1";
        more.textContent = "تحميل المزيد";
        more.hidden = true;

        details.append(header, status, list, more);

        const alertGrid = panel.querySelector(".bb-wa-grid");
        if (alertGrid) {
            alertGrid.insertAdjacentElement("afterend", details);
        } else {
            panel.appendChild(details);
        }

        let meta = null;
        try {
            if (typeof frappe.get_meta === "function") {
                meta = frappe.get_meta(doctype);
            }
        } catch (error) {
            console.warn("Blood Bank alert metadata:", error);
        }

        const definitions = meta && Array.isArray(meta.fields)
            ? meta.fields
            : [];

        const validFields = new Set(
            ["name"].concat(
                definitions.map(field => field.fieldname).filter(Boolean)
            )
        );

        const candidates = [
            meta && meta.title_field,
            ...Object.keys(filters)
        ];

        const fields = ["name"];
        candidates.forEach(function (fieldname) {
            if (
                fieldname &&
                validFields.has(fieldname) &&
                !fields.includes(fieldname)
            ) {
                fields.push(fieldname);
            }
        });

        const labels = {};
        definitions.forEach(function (field) {
            if (field.fieldname) {
                labels[field.fieldname] = field.label || field.fieldname;
            }
        });
        labels.name = "رقم السجل";

        details.__bbAlertState = {
            doctype: doctype,
            filters: filters,
            fields: fields,
            labels: labels,
            offset: 0,
            loaded: 0,
            pageSize: 50,
            total: Number(card.dataset.bbAlertCount || 0),
            loading: false,
            status: status,
            list: list
        };

        await loadAlertRecordPage(details);

        if (details.isConnected) {
            details.scrollIntoView({
                behavior: "smooth",
                block: "nearest"
            });
        }
    }

    function getChecks() {
        const today = frappe.datetime.get_today();
        const nextWeek = frappe.datetime.add_days(today, 7);
        const now = frappe.datetime.now_datetime();

        const activeUnitStates = [
            "Created", "Quarantine", "Accepted", "Processing",
            "Available", "Reserved", "Returned"
        ];

        return [
            {
                title: "متبرعون بانتظار مراجعة الأهلية",
                message: "راجع نتيجة الأهلية قبل بدء تبرع جديد.",
                doctype: "Blood Donor",
                filters: { eligibility_status: "Pending" },
                level: "warning",
                route: "initial"
            },
            {
                title: "تبرعات لم تكتمل إجراءاتها",
                message: "توجد تبرعات في مراحل أولية تحتاج إلى متابعة.",
                doctype: "Blood Donation",
                filters: {
                    donation_status: [
                        "in", ["Draft", "Scheduled", "Checked In", "Bleeding"]
                    ]
                },
                level: "info",
                route: "initial"
            },
            {
                title: "تبرعات موجودة في الحجر",
                message: "تحقق من نتيجة الفحص والإجراء المعتمد لكل تبرع.",
                doctype: "Blood Donation",
                filters: { donation_status: "Quarantine" },
                level: "critical",
                route: "initial"
            },
            {
                title: "معالجة الدم قيد التنفيذ",
                message: "تابع إكمال المعالجة حسب إجراءات العمل.",
                doctype: "Blood Processing",
                filters: { processing_status: "Processing" },
                level: "warning",
                route: "initial"
            },
            {
                title: "فحوص دم تحتاج إلى متابعة",
                message: "تشمل الفحص الأولي ومراجعة النتائج.",
                doctype: "Blood Screening",
                filters: {
                    screening_status: [
                        "in", ["Draft", "Screening", "Results Review"]
                    ]
                },
                level: "warning",
                route: "staff"
            },
            {
                title: "مكونات بانتظار فحص الجودة",
                message: "تحقق من استكمال فحص الجودة قبل متابعة المكوّن.",
                doctype: "Blood Component",
                filters: { component_status: "Quality Check" },
                level: "warning",
                route: "component"
            },
            {
                title: "وحدات دم بحالة الإنشاء",
                message: "تحقق من اكتمال خطوات تجهيز الوحدة وقبولها.",
                doctype: "Blood Unit",
                filters: { unit_status: "Created" },
                level: "info",
                route: "initial"
            },
            {
                title: "وحدات دم موجودة في الحجر",
                message: "لا تعتبر الوحدة متاحة للصرف قبل استكمال إجراءاتها.",
                doctype: "Blood Unit",
                filters: { unit_status: "Quarantine" },
                level: "critical",
                route: "component"
            },
            {
                title: "وحدات تجاوزت تاريخ الصلاحية",
                message: "وحدات بتاريخ صلاحية منتهٍ وما زالت بحالة تشغيلية.",
                doctype: "Blood Unit",
                filters: {
                    expiry_date: ["<=", today],
                    unit_status: ["in", activeUnitStates]
                },
                level: "critical",
                route: "component"
            },
            {
                title: "وحدات تقترب من انتهاء الصلاحية",
                message: "تاريخ الصلاحية اليوم أو خلال الأيام السبعة القادمة.",
                doctype: "Blood Unit",
                filters: {
                    expiry_date: ["between", [today, nextWeek]],
                    unit_status: ["in", activeUnitStates]
                },
                level: "warning",
                route: "component"
            },
            {
                title: "سجلات تخزين مصنفة منتهية الصلاحية",
                message: "راجع حالة التخزين والإجراء المطلوب للوحدة.",
                doctype: "Blood Storage",
                filters: { storage_status: "Expired" },
                level: "critical",
                route: "component"
            },
            {
                title: "طلبات دم تنتظر الاستكمال أو الاعتماد",
                message: "تابع الطلبات المسجلة كمسودة أو مقدّمة.",
                doctype: "Blood Request",
                filters: {
                    request_status: ["in", ["Draft", "Submitted"]]
                },
                level: "warning",
                route: "request"
            },
            {
                title: "طلبات تجاوزت الموعد المطلوب",
                message: "توجد طلبات بموعد مطلوب سابق وما زالت بحاجة إلى متابعة.",
                doctype: "Blood Request",
                filters: {
                    required_by: ["<", now],
                    request_status: ["in", ["Submitted", "Approved"]]
                },
                level: "critical",
                route: "request"
            },
            {
                title: "حجوزات جاهزة للصرف",
                message: "تحقق من المطابقة والإجراءات المطلوبة قبل الصرف.",
                doctype: "Blood Reservation",
                filters: { reservation_status: "Ready for Issue" },
                level: "info",
                route: "request"
            },
            {
                title: "مطابقات توافق الدم قيد التنفيذ",
                message: "تابع نتيجة المطابقة قبل اتخاذ الخطوة التالية.",
                doctype: "Blood Crossmatch",
                filters: { crossmatch_status: "Matching" },
                level: "warning",
                route: "request"
            },
            {
                title: "عمليات صرف تحتاج إلى متابعة",
                message: "راجع حالة التحقق أو أهلية الصرف قبل استكمال الإجراء.",
                doctype: "Blood Issue",
                filters: {
                    issue_status: [
                        "in",
                        [
                            "Draft", "Final Verification", "Stop Issue",
                            "Return Evaluation", "Eligible"
                        ]
                    ]
                },
                level: "warning",
                route: "request"
            },
            {
                title: "عمليات تسليم لم تكتمل",
                message: "راجع عمليات التسليم التي لم تصل إلى حالة التسليم النهائي.",
                doctype: "Blood Handover",
                filters: {
                    handover_status: ["in", ["Draft", "Handover"]]
                },
                level: "info",
                route: "request"
            },
            {
                title: "عمليات نقل دم تحتاج إلى متابعة",
                message: "راجع مراحل النقل والتقييم والنتيجة المسجلة.",
                doctype: "Blood Transfusion",
                filters: {
                    transfusion_status: [
                        "in", ["Draft", "Transfusion", "Assessment"]
                    ]
                },
                level: "warning",
                route: "request"
            }
        ];
    }

    function getAlertIcon(item) {
        const title = String(item.title || "");

        if (/انتهاء الصلاحية|تجاوزت تاريخ الصلاحية|الصلاحية/.test(title)) {
            return "⏳";
        }
        if (/الحجر/.test(title)) return "🧪";
        if (/متبرع|الأهلية/.test(title)) return "👤";
        if (/تبرعات|التبرع/.test(title)) return "🩸";
        if (/معالجة/.test(title)) return "⚙️";
        if (/فحوص|الفحص|الجودة|مكونات/.test(title)) return "🔬";
        if (/طلبات|الطلب/.test(title)) return "📋";
        if (/حجوزات|الحجز/.test(title)) return "📦";
        if (/مطابقات|المطابقة/.test(title)) return "🧬";
        if (/صرف/.test(title)) return "🩸";
        if (/تسليم/.test(title)) return "🤝";
        if (/نقل دم/.test(title)) return "💉";

        if (item.level === "critical") return "🚨";
        if (item.level === "warning") return "⚠️";
        return "ℹ️";
    }

    function makeCard(item) {
        const card = document.createElement("button");
        card.type = "button";
        card.className = `bb-wa-card bb-wa-${item.level}`;
        card.dataset.bbAlertRoute = item.route;
        card.dataset.bbAlertDoctype = item.doctype;
        card.dataset.bbAlertFilters = JSON.stringify(item.filters || {});
        card.dataset.bbAlertCount = String(Number(item.count || 0));
        card.setAttribute(
            "aria-label",
            `${item.title}: ${Number(item.count).toLocaleString("en-US")}`
        );

        const topline = document.createElement("span");
        topline.className = "bb-wa-topline";

        const icon = document.createElement("span");
        icon.className = "bb-wa-icon";
        icon.textContent = getAlertIcon(item);
        icon.setAttribute("aria-hidden", "true");

        const count = document.createElement("span");
        count.className = "bb-wa-count";
        count.textContent = Number(item.count).toLocaleString("en-US");

        const title = document.createElement("span");
        title.className = "bb-wa-title";
        title.textContent = item.title;

        const message = document.createElement("span");
        message.className = "bb-wa-message";
        message.textContent = item.message;

        const action = document.createElement("span");
        action.className = "bb-wa-action";
        action.textContent = "عرض السجلات المطابقة ←";

        topline.append(icon, count);
        card.append(topline, title, message, action);
        return card;
    }


    // BB_ALERT_SUMMARY_CARDS_V1
    function renderLevelSummary(container, active) {
        const categories = [
            {
                level: "critical",
                icon: "🚨",
                title: "تنبيه عاجل",
                message: "الوحدات الموجودة في الحجر أو منتهية الصلاحية"
            },
            {
                level: "warning",
                icon: "⚠️",
                title: "تحذير",
                message: "فحوص الجودة والطلبات التي تنتظر المتابعة"
            },
            {
                level: "info",
                icon: "ℹ️",
                title: "معلومات",
                message: "الحجوزات الجاهزة للصرف ومراحل العمل"
            }
        ];

        container.replaceChildren();

        categories.forEach((category) => {
            const matching = active.filter(
                item => item.level === category.level
            );

            // عدد مطابقات قواعد التنبيه لهذا المستوى.
            // قد تنطبق أكثر من قاعدة على السجل نفسه.
            const total = matching.reduce(
                (sum, item) => sum + Number(item.count || 0),
                0
            );

            const card = document.createElement("button");
            card.type = "button";
            card.className =
                "bb-wa-summary-card bb-wa-summary-" + category.level;
            card.setAttribute(
                "aria-label",
                category.title + ": " + total
            );
            card.title = "اضغط لعرض تفاصيل التنبيهات";

            const icon = document.createElement("span");
            icon.className = "bb-wa-summary-icon";
            icon.textContent = category.icon;
            icon.setAttribute("aria-hidden", "true");

            const content = document.createElement("span");
            content.className = "bb-wa-summary-content";

            const title = document.createElement("strong");
            title.className = "bb-wa-summary-title";
            title.textContent = category.title;

            const message = document.createElement("span");
            message.className = "bb-wa-summary-message";
            message.textContent = category.message;

            content.append(title, message);

            const count = document.createElement("span");
            count.className = "bb-wa-summary-count";
            count.textContent = total.toLocaleString("en-US");

            card.append(icon, content, count);
            container.appendChild(card);
        });
    }

    function createPanel() {
        const panel = document.createElement("section");
        panel.id = PANEL_ID;
        panel.className = "bb-wa-panel";
        panel.setAttribute("aria-live", "polite");

        const header = document.createElement("div");
        header.className = "bb-wa-header";

        const heading = document.createElement("div");
        heading.className = "bb-wa-heading";
        heading.innerHTML =
            "<h3>🔔 تنبيهات بنك الدم</h3>" +
            "<p>متابعة الحالات التي تحتاج إلى مراجعة أو إجراء.</p>";

        const refresh = document.createElement("button");
        refresh.type = "button";
        refresh.className = "btn btn-default bb-wa-refresh";
        refresh.dataset.bbAlertRefresh = "1";
        refresh.textContent = "↻ تحديث التنبيهات";

        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "btn btn-default bb-wa-toggle";
        toggle.dataset.bbAlertToggle = "1";
        toggle.textContent = "عرض التنبيهات";
        toggle.setAttribute("aria-expanded", "false");

        header.append(heading, toggle, refresh);

        const summary = document.createElement("div");
        summary.className = "bb-wa-summary";

        const levelSummary = document.createElement("div");
        levelSummary.className = "bb-wa-level-summary";
        levelSummary.setAttribute("aria-label", "ملخص مستويات التنبيه");
        summary.textContent = "جارٍ تحميل التنبيهات…";

        const errors = document.createElement("div");
        errors.className = "bb-wa-errors";
        errors.hidden = true;

        const grid = document.createElement("div");
        grid.className = "bb-wa-grid";

        const footer = document.createElement("p");
        footer.className = "bb-wa-footer";
        footer.textContent =
            "التنبيهات للمتابعة فقط، ولا تغيّر حالات السجلات تلقائيًا. " +
            "تحقق من سجل الوحدة أو الطلب قبل اتخاذ الإجراء.";

        panel.append(header, summary, levelSummary, errors, grid, footer);

        panel.addEventListener("click", (event) => {
            const levelCard = event.target.closest(".bb-wa-summary-card");
            if (levelCard && panel.contains(levelCard)) {
                panel.classList.add("bb-wa-expanded");
                const toggleButton = panel.querySelector(".bb-wa-toggle");
                if (toggleButton) {
                    toggleButton.textContent = "إخفاء التنبيهات";
                    toggleButton.setAttribute("aria-expanded", "true");
                }
                const grid = panel.querySelector(".bb-wa-grid");
                if (grid) {
                    grid.scrollIntoView({ behavior: "smooth", block: "nearest" });
                }
                return;
            }

            const toggleButton = event.target.closest("[data-bb-alert-toggle]");
            if (toggleButton) {
                const expanded = panel.classList.toggle("bb-wa-expanded");
                toggleButton.textContent = expanded
                    ? "إخفاء التنبيهات"
                    : "عرض التنبيهات";
                toggleButton.setAttribute("aria-expanded", String(expanded));
                return;
            }

            const refreshButton = event.target.closest("[data-bb-alert-refresh]");
            if (refreshButton) {
                refreshAlerts(panel);
                return;
            }

            const closeDetails = event.target.closest(
                "[data-bb-alert-details-close]"
            );
            if (closeDetails && panel.contains(closeDetails)) {
                const details = panel.querySelector(".bb-wa-record-details");
                if (details) details.remove();
                return;
            }

            const loadMore = event.target.closest("[data-bb-alert-load-more]");
            if (loadMore && panel.contains(loadMore)) {
                const details = loadMore.closest(".bb-wa-record-details");
                if (details) loadAlertRecordPage(details);
                return;
            }

            const recordButton = event.target.closest("[data-bb-alert-record-open]");
            if (recordButton && panel.contains(recordButton)) {
                bbAlertOpenRecord(recordButton);
                return;
            }

            const routeButton = event.target.closest("[data-bb-alert-route]");
            if (routeButton && panel.contains(routeButton)) {
                showAlertRecords(panel, routeButton);
            }
        });

        return panel;
    }

    async function refreshAlerts(panel) {
        if (panel.dataset.loading === "1") return;

        panel.dataset.loading = "1";

        const refreshButton = panel.querySelector(".bb-wa-refresh");
        const summary = panel.querySelector(".bb-wa-summary");
        const levelSummary = panel.querySelector(".bb-wa-level-summary");
        const errors = panel.querySelector(".bb-wa-errors");
        const grid = panel.querySelector(".bb-wa-grid");

        refreshButton.disabled = true;
        refreshButton.textContent = "جارٍ التحديث…";
        summary.textContent = "جارٍ فحص الحالات المسجلة…";
        errors.hidden = true;
        errors.textContent = "";
        const openDetails = panel.querySelector(".bb-wa-record-details");
        if (openDetails) openDetails.remove();
        grid.replaceChildren();

        try {
            const checks = getChecks();

            const results = await Promise.all(checks.map(async (item) => {
                try {
                    const count = await frappe.db.count(item.doctype, {
                        filters: item.filters
                    });
                    return { ...item, count: Number(count || 0) };
                } catch (error) {
                    return { ...item, count: null };
                }
            }));

            const failed = results.filter((item) => item.count === null);
            const active = results.filter((item) => item.count > 0);
            renderLevelSummary(levelSummary, active);

            summary.textContent = active.length
                ? `${active.length} نوع من التنبيهات يحتاج إلى مراجعة`
                : "لا توجد تنبيهات مسجلة ضمن الشروط التي تم فحصها.";

            if (failed.length) {
                errors.hidden = false;
                errors.textContent =
                    `تعذرت قراءة ${failed.length} فحوص. ` +
                    "تحقق من صلاحيات المستخدم واتصال النظام، ثم أعد التحديث.";
            }

            active.forEach((item) => {
                grid.appendChild(makeCard(item));
            });

            if (!active.length && !failed.length) {
                const empty = document.createElement("div");
                empty.className = "bb-wa-empty";
                empty.textContent =
                    "لا توجد تنبيهات تستدعي المتابعة حاليًا وفق البيانات المقروءة.";
                grid.appendChild(empty);
            }

            panel.querySelector(".bb-wa-last-update").textContent =
                "آخر تحديث: " + new Date().toLocaleTimeString("ar");
        } catch (error) {
            summary.textContent = "تعذر تحميل التنبيهات.";
            errors.hidden = false;
            errors.textContent =
                "تحقق من اتصال النظام وصلاحيات قراءة السجلات، ثم أعد المحاولة.";
            console.error("Blood Bank workspace alerts:", error);
        } finally {
            panel.dataset.loading = "0";
            refreshButton.disabled = false;
            refreshButton.textContent = "↻ تحديث التنبيهات";
        }
    }


    function getShortcutAnchor(host) {
        const widgets = Array.from(
            host.querySelectorAll(".shortcut-widget-box")
        ).filter(widget => !widget.closest("#" + PANEL_ID));

        if (!widgets.length) return null;

        const containsAll = node =>
            widgets.every(widget => node.contains(widget));

        const depth = node => {
            let value = 0;
            while (node) {
                value++;
                node = node.parentElement;
            }
            return value;
        };

        const selectors = [
            ".widget-group-body",
            ".widget-group-content",
            ".widget-group",
            ".workspace-content",
            ".workspace-container"
        ];

        const candidates = Array.from(
            host.querySelectorAll(selectors.join(","))
        ).filter(containsAll);

        if (candidates.length) {
            candidates.sort((a, b) => depth(b) - depth(a));
            return candidates[0];
        }

        let anchor = widgets[0].parentElement;
        while (
            anchor &&
            anchor !== host &&
            !containsAll(anchor)
        ) {
            anchor = anchor.parentElement;
        }

        if (anchor && anchor !== host) return anchor;

        return null;
    }

    function syncWorkspacePanel() {
        if (!window.frappe || typeof frappe.get_route !== "function") {
            return;
        }

        const existing = document.getElementById(PANEL_ID);

        if (!isTargetWorkspace()) {
            if (existing) existing.remove();
            return;
        }

        const host = getHost();
        if (!host) return;

        // لا نعرض التنبيهات قبل تحديد مجموعة روابط مساحة العمل.
        const anchor = getShortcutAnchor(host);
        if (!anchor) return;

        let panel = existing;

        if (!panel) {
            panel = createPanel();

            const lastUpdate = document.createElement("span");
            lastUpdate.className = "bb-wa-last-update";
            lastUpdate.textContent = "لم يتم التحديث بعد";
            panel.querySelector(".bb-wa-header").appendChild(lastUpdate);
        }

        // وضع اللوحة بعد مجموعة الاختصارات بدل أعلى الصفحة.
        if (
            panel.parentElement !== anchor.parentElement ||
            panel.previousElementSibling !== anchor
        ) {
            anchor.insertAdjacentElement("afterend", panel);
        }

        if (panel.dataset.bbAlertsLoaded !== "1") {
            panel.dataset.bbAlertsLoaded = "1";
            refreshAlerts(panel);
        }
    }

    function queueSync() {
        if (checkQueued) return;
        checkQueued = true;

        window.requestAnimationFrame(() => {
            checkQueued = false;
            syncWorkspacePanel();
        });
    }

    function start() {
        syncWorkspacePanel();

        if (document.body && !observer) {
            observer = new MutationObserver(queueSync);
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }

        window.addEventListener("popstate", queueSync);
        window.addEventListener("hashchange", queueSync);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();
