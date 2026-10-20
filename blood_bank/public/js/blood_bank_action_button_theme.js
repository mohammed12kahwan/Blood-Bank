/* BB_ACTION_BUTTON_THEME_V1 */
(function () {
    "use strict";

    if (window.__bbActionButtonThemeInstalled) return;
    window.__bbActionButtonThemeInstalled = true;

    // نستهدف أشرطة الإجراءات المعروفة فقط حتى لا نغير
    // ألوان التبويبات أو روابط الانتقال العامة.
    const selector = [
        ".bb-navigation-root .bb-nav-main-btn",
        ".bb-navigation-root .bb-nav-windows-btn",

        "#bb-cw-root .bb-cw-toolbar button",
        "#bb-cw-root .bb-cw-toolbar .btn",
        "#bb-cw-root #bb-cw-workflow-actions button",
        "#bb-cw-root #bb-cw-workflow-actions .btn",

        "#bb-rw-root .bb-rw-toolbar button",
        "#bb-rw-root .bb-rw-toolbar .btn",
        "#bb-rw-root #bb-rw-workflow-actions button",
        "#bb-rw-root #bb-rw-workflow-actions .btn",

        ".bb-iw-root .bb-iw-toolbar button",
        ".bb-iw-root .bb-iw-toolbar .btn",
        ".bb-iw-root .bb-iw-shared-buttons button",
        ".bb-iw-root .bb-iw-shared-buttons .btn",
        ".bb-iw-root .bb-iw-workflow-action",

        ".bb-staff-page button",
        ".bb-staff-page .btn"
    ].join(",");

    const rules = [
        {
            key: "cancel", icon: "✖️",
            re: /إلغاء|الغاء|\bcancel\b|\babort\b|رفض|reject/
        },
        {
            key: "delete", icon: "🗑️",
            re: /حذف|\bdelete\b|\bremove\b/
        },
        {
            key: "quarantine", icon: "⚠️",
            re: /حجر|عزل|\bquarantine\b/
        },
        {
            key: "units", icon: "🩸",
            re: /وحدات الدم|قائمة وحدات|قائمة الوحدات|\bblood units?\b|\bunit list\b/
        },
        {
            key: "create", icon: "➕",
            re: /إضافة|اضافة|أضف|اضف|سجل جديد|طلب جديد|\badd new\b|\bnew record\b|\bcreate\b/
        },
        {
            key: "save", icon: "💾",
            re: /حفظ|\bsave\b|\bsubmit\b/
        },
        {
            key: "refresh", icon: "🔄",
            re: /تحديث|جلب أحدث|إعادة تحميل|اعادة تحميل|\brefresh\b|\breload\b|\bupdate data\b/
        },
        {
            key: "previous", icon: "◀️",
            re: /السابق|\bprevious\b|\bprev\b|رجوع|عودة|\bback\b/
        },
        {
            key: "next", icon: "▶️",
            re: /التالي|\bnext\b/
        },
        {
            key: "home", icon: "🏠",
            re: /الصفحة الرئيسية|مساحة العمل|\bworkspace\b|\bhome\b/
        },
        {
            key: "bank", icon: "🩸",
            re: /بنك الدم|\bblood bank\b/
        },
        {
            key: "list", icon: "📋",
            re: /قائمة|عرض السجلات|عرض الكل|\blist\b|\brecords\b/
        },
        {
            key: "print", icon: "🖨️",
            re: /طباعة|\bprint\b/
        },
        {
            key: "reserve", icon: "📌",
            re: /حجز|\breserve\b|\breservation\b/
        },
        {
            key: "collect", icon: "🩸",
            re: /جمع الدم|جمع التبرع|إتمام التبرع|\bcollection\b|\bcollected\b|\bcollect\b/
        },
        {
            key: "issue", icon: "📤",
            re: /صرف الدم|صرف الوحدة|\bissue\b|\brelease\b/
        },
        {
            key: "handover", icon: "🤝",
            re: /تسليم|\bhandover\b/
        },
        {
            key: "transfusion", icon: "🩸",
            re: /نقل الدم|\btransfusion\b/
        },
        {
            key: "verify", icon: "🔬",
            re: /فحص|مطابقة|جودة|تحقق|\bscreening\b|\bcrossmatch\b|\bquality check\b|\bverify\b/
        },
        {
            key: "approve", icon: "✅",
            re: /اعتماد|تأكيد|موافقة|\bapprove\b|\bconfirm\b/
        },
        {
            key: "complete", icon: "✅",
            re: /إكمال|اكمال|إتمام|اتمام|إنهاء|انهاء|\bcomplete\b|\bfinish\b/
        },
        {
            key: "start", icon: "▶️",
            re: /بدء|ابدأ|ابدء|\bstart\b|\bbegin\b/
        }
    ];

    const leadingIconPattern =
        /^\s*[\u2300-\u23FF\u2600-\u27BF\u{1F000}-\u{1FAFF}]+\uFE0F?\s*/u;

    function buttonLabel(button) {
        const clone = button.cloneNode(true);

        clone.querySelectorAll(".bb-action-icon").forEach(function (el) {
            el.remove();
        });

        return (clone.innerText || clone.textContent || "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function stripExistingTextIcon(button) {
        const hasNativeIcon = button.querySelector(
            ".bb-action-icon, .bb-nav-window-icon, svg, " +
            ".fa, [class*='fa-'], [class*='-icon'], [data-icon], .octicon"
        );

        if (hasNativeIcon) return;

        const walker = document.createTreeWalker(
            button,
            NodeFilter.SHOW_TEXT
        );

        let node;
        while ((node = walker.nextNode())) {
            if (!node.nodeValue.trim()) continue;

            const match = leadingIconPattern.exec(node.nodeValue);
            if (match) {
                const leadingSpace = (match[0].match(/^\s*/) || [""])[0];
                node.nodeValue =
                    leadingSpace + node.nodeValue.slice(match[0].length);
            }
            break;
        }
    }

    function findAction(label) {
        for (const rule of rules) {
            if (rule.re.test(label)) return rule;
        }
        return null;
    }

    function applyTheme(button) {
        if (!button || !button.isConnected) return;

        const label = buttonLabel(button);
        if (!label) return;

        const action = findAction(label);

        // لا نغيّر الأزرار غير المعروفة ولا التبويبات العامة.
        if (!action) {
            if (button.classList.contains("bb-action-themed")) {
                button.classList.remove("bb-action-themed");
                button.removeAttribute("data-bb-action");

                const oldIcon = button.querySelector(".bb-action-icon");
                if (oldIcon) oldIcon.remove();
            }
            return;
        }

        button.dataset.bbAction = action.key;
        button.classList.add("bb-action-themed");

        // لا نكرر الأيقونة عند تحديث النافذة أو إعادة رسم الزر.
        if (button.querySelector(".bb-action-icon")) return;

        stripExistingTextIcon(button);

        const icon = document.createElement("span");
        icon.className = "bb-action-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = action.icon;

        button.insertBefore(icon, button.firstChild);
    }

    let queued = false;

    function scan() {
        queued = false;
        document.querySelectorAll(selector).forEach(applyTheme);
    }

    function scheduleScan() {
        if (queued) return;
        queued = true;
        window.setTimeout(scan, 60);
    }

    function install() {
        scan();

        if (document.documentElement && !window.__bbActionButtonObserver) {
            window.__bbActionButtonObserver = new MutationObserver(
                scheduleScan
            );
            window.__bbActionButtonObserver.observe(
                document.documentElement,
                {
                    childList: true,
                    subtree: true,
                    characterData: true
                }
            );
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", install, { once: true });
    } else {
        install();
    }
})();
/* END BB_ACTION_BUTTON_THEME_V1 */
