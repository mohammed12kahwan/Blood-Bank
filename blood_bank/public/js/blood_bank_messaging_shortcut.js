(function () {
    "use strict";
    if (window.__erUnifiedHospitalMessagingLoaded) return;
    window.__erUnifiedHospitalMessagingLoaded = true;

    const API = "custom_app.emergency_management.page.er_visit_console.er_visit_console";
    const BTN_ID = "er-unified-messaging-toggle";
    const PANEL_ID = "er-unified-messaging-panel";
    let context = null;
    let activeTab = "inbox";
    let buttonHost = null;

    const css = `
    #${PANEL_ID}{display:none;position:fixed;top:58px;right:16px;width:min(470px,calc(100vw - 32px));height:min(690px,calc(100vh - 76px));z-index:11000;background:var(--card-bg,#fff);color:var(--text-color,#222);border:1px solid var(--border-color,#d7dce0);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.22);overflow:hidden;direction:rtl;font-family:inherit}
    #${PANEL_ID} *{box-sizing:border-box}
    #${PANEL_ID} .hm-head{display:flex;align-items:center;justify-content:space-between;padding:13px 15px;background:var(--subtle-fg,#f5f7f9);border-bottom:1px solid var(--border-color,#ddd)}
    #${PANEL_ID} .hm-title{font-size:15px;font-weight:700}
    #${PANEL_ID} .hm-subtitle{font-size:11px;opacity:.7;margin-top:3px}
    #${PANEL_ID} .hm-close{border:0;background:transparent;font-size:22px;cursor:pointer}
    #${PANEL_ID} .hm-tabs{display:flex;gap:5px;padding:10px;border-bottom:1px solid var(--border-color,#ddd)}
    #${PANEL_ID} .hm-tab{flex:1;border:1px solid var(--border-color,#ddd);border-radius:7px;padding:8px 4px;background:transparent;cursor:pointer;font-size:12px}
    #${PANEL_ID} .hm-tab.active{background:var(--control-bg,#eaf2fb);font-weight:700;border-color:var(--primary,#7c9fc5)}
    #${PANEL_ID} .hm-content{height:calc(100% - 111px);overflow:auto;padding:12px}
    #${PANEL_ID} .hm-field{margin-bottom:11px}
    #${PANEL_ID} .hm-field label{display:block;font-size:12px;font-weight:600;margin-bottom:5px}
    #${PANEL_ID} .hm-field input,#${PANEL_ID} .hm-field select,#${PANEL_ID} .hm-field textarea{width:100%;border:1px solid var(--border-color,#cfd5da);border-radius:7px;padding:9px;background:var(--control-bg,#fff);color:inherit;font:inherit;font-size:13px}
    #${PANEL_ID} .hm-field textarea{min-height:100px;resize:vertical}
    #${PANEL_ID} .hm-button{border:1px solid var(--border-color,#ccd2d8);border-radius:7px;padding:8px 12px;background:var(--control-bg,#fff);color:inherit;cursor:pointer;font:inherit;font-size:12px}
    #${PANEL_ID} .hm-button.primary{background:var(--primary,#2490ef);color:#fff;border-color:transparent}
    #${PANEL_ID} .hm-button:disabled{opacity:.55;cursor:not-allowed}
    #${PANEL_ID} .hm-card{border:1px solid var(--border-color,#d9dee3);border-radius:9px;padding:11px;margin-bottom:10px}
    #${PANEL_ID} .hm-cardhead{display:flex;justify-content:space-between;gap:8px;margin-bottom:7px;font-size:12px}
    #${PANEL_ID} .hm-cardbody{font-size:13px;line-height:1.65;overflow-wrap:anywhere}
    #${PANEL_ID} .hm-meta{font-size:11px;opacity:.72;margin-top:7px}
    #${PANEL_ID} .hm-unread{border-right:3px solid var(--primary,#2490ef)}
    #${PANEL_ID} .hm-note{padding:12px;border-radius:8px;background:var(--subtle-fg,#f5f7f9);font-size:12px;line-height:1.7}
    #${PANEL_ID} .hm-actions{display:flex;justify-content:flex-start;gap:7px;margin-top:10px}
    #${BTN_ID}{margin-inline:5px}
    `;

    function escapeHTML(value) {
        return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
            return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c];
        });
    }

    function notify(message, indicator) {
        if (window.frappe && frappe.show_alert) {
            frappe.show_alert({message: escapeHTML(message), indicator: indicator || "green"}, 5);
        } else {
            window.alert(message);
        }
    }

    async function call(method, args) {
        const response = await frappe.call({
            method: API + "." + method,
            args: args || {}
        });
        if (response && response.exc) throw new Error("تعذر تنفيذ العملية. راجع سجل الخطأ في Frappe.");
        return response ? response.message : null;
    }

    function ensurePanel() {
        if (document.getElementById(PANEL_ID)) return;
        if (!document.getElementById("er-unified-messaging-style")) {
            const style = document.createElement("style");
            style.id = "er-unified-messaging-style";
            style.textContent = css;
            document.head.appendChild(style);
        }

        const panel = document.createElement("section");
        panel.id = PANEL_ID;
        panel.innerHTML = `
            <div class="hm-head">
                <div><div class="hm-title">مراسلات المستشفى</div><div class="hm-subtitle">المراسلات الداخلية الموحدة</div></div>
                <button type="button" class="hm-close" aria-label="إغلاق">×</button>
            </div>
            <div class="hm-tabs">
                <button type="button" class="hm-tab" data-tab="inbox">الوارد</button>
                <button type="button" class="hm-tab" data-tab="outbox">المرسل</button>
                <button type="button" class="hm-tab" data-tab="compose">رسالة جديدة</button>
            </div>
            <div class="hm-content"><div class="hm-note">جاري تحميل المراسلات...</div></div>
        `;
        document.body.appendChild(panel);

        panel.querySelector(".hm-close").addEventListener("click", closePanel);
        panel.querySelectorAll(".hm-tab").forEach(function (tab) {
            tab.addEventListener("click", function () {
                renderTab(tab.dataset.tab);
            });
        });

        panel.addEventListener("click", async function (event) {
            const readButton = event.target.closest("[data-mark-read]");
            if (!readButton) return;
            readButton.disabled = true;
            try {
                await call("mark_er_department_messaging_read", {
                    notification: readButton.dataset.markRead
                });
                notify("تم تحديد الرسالة كمقروءة.");
                await renderTab("inbox");
                await refreshButtonBadge();
            } catch (err) {
                readButton.disabled = false;
                notify(err.message || "تعذر تحديث حالة الرسالة.", "red");
            }
        });

        document.addEventListener("mousedown", function (event) {
            const p = document.getElementById(PANEL_ID);
            const b = document.getElementById(BTN_ID);
            if (p && p.style.display === "block" &&
                !p.contains(event.target) && !(b && b.contains(event.target))) {
                closePanel();
            }
        });
        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape") closePanel();
        });
    }

    async function refreshButtonBadge() {
        const badge = document.querySelector(
            "#" + BTN_ID + " .er-unified-messaging-badge"
        );
        if (!badge) return;

        try {
            const result = await call("get_er_department_messaging_inbox");
            const count = Math.max(
                0,
                Number(result && result.unread_count || 0)
            );
            badge.textContent = count > 99 ? "99+" : String(count);
            badge.style.display = count > 0 ? "inline-flex" : "none";
        } catch (err) {
            badge.style.display = "none";
        }
    }

    function ensureButton() {
        if (!window.frappe || !frappe.session || frappe.session.user === "Guest") {
            return;
        }

        if (!document.getElementById("er-unified-messaging-original-css")) {
            const cssLink = document.createElement("link");
            cssLink.id = "er-unified-messaging-original-css";
            cssLink.rel = "stylesheet";
            cssLink.href = "/assets/custom_app/css/er_visit_console/main.css";
            document.head.appendChild(cssLink);
        }

        const existing = document.getElementById(BTN_ID);
        if (existing) {
            existing.style.setProperty("display", "inline-flex", "important");
            existing.style.setProperty("visibility", "visible", "important");
            existing.style.setProperty("opacity", "1", "important");
            return;
        }

        const nav =
            document.querySelector(".navbar .navbar-right") ||
            document.querySelector(".navbar .navbar-nav.navbar-right") ||
            document.querySelector(".navbar .navbar-collapse") ||
            document.querySelector(".navbar .container-fluid") ||
            document.querySelector(".navbar");

        if (!nav) {
            console.warn("[Blood Bank Messaging] لم يُعثر على شريط التنقل بعد.");
            return;
        }

        const btn = document.createElement("button");
        btn.type = "button";
        btn.id = BTN_ID;
        btn.className = "er-action-btn er-notif-btn";
        btn.innerHTML =
            '<span aria-hidden="true">💬</span>' +
            '<span class="er-unified-messaging-badge" aria-live="polite" ' +
            'style="display:none;margin-right:6px;padding:2px 7px;' +
            'border-radius:10px;background:#d9534f;color:#fff;' +
            'font-size:11px;font-weight:700;">0</span>';
        btn.title = "مراسلات الأقسام";
        btn.setAttribute("aria-label", "مراسلات الأقسام");

        // احتياط لضمان الظهور داخل شريط تنقل Frappe.
        const styles = {
            display: "inline-flex",
            visibility: "visible",
            opacity: "1",
            position: "relative",
            "z-index": "1000",
            "align-items": "center",
            "justify-content": "center",
            gap: "6px",
            margin: "4px 8px",
            padding: "6px 10px",
            "min-height": "34px",
            color: "var(--text-color, #222)",
            background: "var(--control-bg, #fff)",
            border: "1px solid var(--border-color, #d7dce0)",
            "border-radius": "6px",
            cursor: "pointer"
        };
        for (const [key, value] of Object.entries(styles)) {
            btn.style.setProperty(key, value, "important");
        }

        btn.addEventListener("click", async function (event) {
            event.preventDefault();
            event.stopPropagation();

            ensurePanel();
            const panel = document.getElementById(PANEL_ID);
            if (panel.style.display === "block") {
                closePanel();
                return;
            }

            panel.style.display = "block";
            panel.querySelector(".hm-content").innerHTML =
                '<div class="hm-note">جاري تحميل المراسلات...</div>';

            try {
                context = await call("get_er_department_messaging_context");
                await renderTab("inbox");
                await refreshButtonBadge();
            } catch (err) {
                panel.querySelector(".hm-content").innerHTML =
                    '<div class="hm-note">' +
                    escapeHTML(err.message || "تعذر تحميل المراسلات.") +
                    '</div>';
            }
        });

        if (nav.tagName.toLowerCase() === "ul") {
            const li = document.createElement("li");
            li.className = "nav-item";
            li.style.setProperty("display", "flex", "important");
            li.style.setProperty("align-items", "center", "important");
            li.style.setProperty("list-style", "none", "important");
            li.appendChild(btn);
            nav.appendChild(li);
        } else {
            nav.appendChild(btn);
        }

        buttonHost = btn;
        refreshButtonBadge();
    }

    function closePanel() {
        const panel = document.getElementById(PANEL_ID);
        if (panel) panel.style.display = "none";
    }

    async function renderTab(tab) {
        activeTab = tab;
        const panel = document.getElementById(PANEL_ID);
        if (!panel || panel.style.display !== "block") return;
        panel.querySelectorAll(".hm-tab").forEach(function (button) {
            button.classList.toggle("active", button.dataset.tab === tab);
        });
        const content = panel.querySelector(".hm-content");
        content.innerHTML = '<div class="hm-note">جاري التحميل...</div>';

        try {
            if (!context) context = await call("get_er_department_messaging_context");
            if (tab === "compose") {
                renderComposer(content);
                return;
            }

            const result = await call(
                tab === "inbox"
                    ? "get_er_department_messaging_inbox"
                    : "get_er_department_messaging_outbox"
            );
            const messages = result && result.messages ? result.messages : [];
            content.innerHTML = messages.length
                ? messages.map(function (row) { return renderMessage(row, tab); }).join("")
                : '<div class="hm-note">' +
                    (tab === "inbox" ? "لا توجد رسائل واردة حتى الآن." : "لا توجد رسائل مرسلة حتى الآن.") +
                  '</div>';
        } catch (err) {
            content.innerHTML = '<div class="hm-note">' +
                escapeHTML(err.message || "تعذر تحميل قائمة الرسائل.") + '</div>';
        }
    }

    function renderMessage(row, tab) {
        const heading = tab === "inbox"
            ? ("من: " + (row.source_label || row.sender_name || "غير معروف"))
            : ("إلى: " + (row.target_label || "غير معروف"));
        const readMark = tab === "inbox"
            ? (row.is_read ? "مقروءة" : "جديدة")
            : "مرسلة";
        const body = escapeHTML(row.message || "").replace(/\n/g, "<br>");
        const button = tab === "inbox" && row.notification && !row.is_read
            ? '<div class="hm-actions"><button type="button" class="hm-button" data-mark-read="' +
                escapeHTML(row.notification) + '">تحديد كمقروءة</button></div>'
            : "";
        return '<article class="hm-card ' + (tab === "inbox" && !row.is_read ? "hm-unread" : "") + '">' +
            '<div class="hm-cardhead"><strong>' + escapeHTML(row.subject || "رسالة داخلية") +
            '</strong><span>' + readMark + '</span></div>' +
            '<div class="hm-meta">' + escapeHTML(heading) + '</div>' +
            '<div class="hm-cardbody">' + body + '</div>' +
            '<div class="hm-meta">' + escapeHTML(row.sent_on || "") + '</div>' +
            button + '</article>';
    }

    function renderComposer(content) {
        const departments = (context && context.departments) || [];
        const senders = departments.filter(function (d) { return d.can_send; });
        const users = (context && context.users) || [];
        const targets = departments;

        if (!senders.length) {
            content.innerHTML = '<div class="hm-note">لا توجد جهة إرسال مسموحة لهذا الحساب وفق أدواره الحالية. لا تغيّر صلاحيات الموظفين عشوائيًا؛ اربط الحساب بالدور الصحيح للقسم.</div>';
            return;
        }

        content.innerHTML = `
            <form id="er-unified-message-form">
                <div class="hm-field"><label>جهة الإرسال</label>
                    <select name="source_department" required>
                        <option value="">اختر قسم الإرسال</option>
                        ${senders.map(d => `<option value="${escapeHTML(d.key)}">${escapeHTML(d.label)}</option>`).join("")}
                    </select>
                </div>
                <div class="hm-field"><label>نوع المستلم</label>
                    <select name="target_type" required>
                        <option value="department">قسم كامل</option>
                        <option value="user">موظف محدد</option>
                    </select>
                </div>
                <div class="hm-field" data-target-department><label>القسم المستلم</label>
                    <select name="target_department">
                        <option value="">اختر القسم</option>
                        ${targets.map(d => `<option value="${escapeHTML(d.key)}">${escapeHTML(d.label)} — ${d.member_count} موظف</option>`).join("")}
                    </select>
                </div>
                <div class="hm-field" data-target-user style="display:none"><label>الموظف المستلم</label>
                    <select name="target_user">
                        <option value="">اختر الموظف</option>
                        ${users.map(u => `<option value="${escapeHTML(u.user)}">${escapeHTML(u.label)} — ${escapeHTML(u.user)}</option>`).join("")}
                    </select>
                </div>
                <div class="hm-field"><label>الموضوع</label>
                    <input name="subject" maxlength="200" required placeholder="موضوع الرسالة"/>
                </div>
                <div class="hm-field"><label>نص الرسالة</label>
                    <textarea name="message" maxlength="10000" required placeholder="اكتب الرسالة هنا"></textarea>
                </div>
                <div class="hm-actions"><button type="submit" class="hm-button primary">إرسال الرسالة</button></div>
            </form>
        `;

        const form = content.querySelector("#er-unified-message-form");
        const typeSelect = form.elements.target_type;
        const deptField = form.querySelector("[data-target-department]");
        const userField = form.querySelector("[data-target-user]");
        const deptSelect = form.elements.target_department;
        const userSelect = form.elements.target_user;

        function toggleTarget() {
            const direct = typeSelect.value === "user";
            deptField.style.display = direct ? "none" : "";
            userField.style.display = direct ? "" : "none";
            deptSelect.required = !direct;
            userSelect.required = direct;
        }
        typeSelect.addEventListener("change", toggleTarget);
        toggleTarget();

        form.addEventListener("submit", async function (event) {
            event.preventDefault();
            const submit = form.querySelector('button[type="submit"]');
            submit.disabled = true;
            try {
                const args = {
                    source_department: form.elements.source_department.value,
                    target_type: form.elements.target_type.value,
                    target_department: form.elements.target_department.value,
                    target_user: form.elements.target_user.value,
                    subject: form.elements.subject.value,
                    message: form.elements.message.value
                };
                const result = await call("send_er_department_message_general", args);
                notify((result && result.message) || "تم إرسال الرسالة.");
                await renderTab("outbox");
            } catch (err) {
                notify(err.message || "تعذر إرسال الرسالة.", "red");
                submit.disabled = false;
            }
        });
    }

    function init() {
        ensureButton();
        if (window.frappe && frappe.router && typeof frappe.router.on === "function") {
            frappe.router.on("change", function () {
                window.setTimeout(ensureButton, 300);
            });
        }
        window.setTimeout(ensureButton, 800);
        window.setTimeout(ensureButton, 2200);
        window.setTimeout(ensureButton, 4000);
        if (document.body && !window.__bbMessagingNavbarObserver) {
            window.__bbMessagingNavbarObserver = new MutationObserver(function () {
                if (!document.getElementById(BTN_ID)) ensureButton();
            });
            window.__bbMessagingNavbarObserver.observe(
                document.body, { childList: true, subtree: true }
            );
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
