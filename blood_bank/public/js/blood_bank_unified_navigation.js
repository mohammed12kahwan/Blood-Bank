/* BB_UNIFIED_NAVIGATION_ASSETS_V1 */
(function () {
    "use strict";

    if (window.__bbUnifiedNavigationInstalled) return;
    window.__bbUnifiedNavigationInstalled = true;

    const pages = [
        {
            id: "workspace",
            label: "⌂ مساحة العمل الرئيسية",
            type: "page",
            route: "blood-bank-ui-test"
        },
        {
            id: "initial",
            label: "🩸 نافذة العمل الأولية",
            type: "page",
            route: "blood-bank-initial-work"
        },
        {
            id: "staff",
            label: "👨‍⚕️ عمليات الموظفين",
            type: "page",
            route: "blood-bank-staff-operations"
        },
        {
            id: "component",
            label: "🧪 متابعة المكونات",
            type: "page",
            route: "blood-bank-component-work"
        },
        {
            id: "request",
            label: "📦 متابعة طلبات الدم",
            type: "page",
            route: "blood-bank-request-work"
        },
        {
            id: "donation-report",
            label: "📊 تقرير التبرعات",
            type: "report",
            route: "Blood Donation Tracking"
        },
        {
            id: "request-report",
            label: "📋 تقرير طلبات الدم",
            type: "report",
            route: "Blood Request Tracking"
        },
        {
            id: "initial-report",
            label: "🗂️ تقرير نافذة العمل",
            type: "report",
            route: "Blood Initial Work Tracking"
        }
    ];

    const supportedPages = new Set(
        pages.filter(function (item) {
            return item.type === "page" && item.id !== "workspace";
        }).map(function (item) {
            return item.route;
        })
    );

    const supportedReports = new Set(
        pages.filter(function (item) {
            return item.type === "report";
        }).map(function (item) {
            return item.route;
        })
    );

    function routeParts() {
        try {
            return typeof frappe.get_route === "function"
                ? (frappe.get_route() || [])
                : [];
        } catch (e) {
            return [];
        }
    }

    function routeKey(parts) {
        if (parts[0] === "query-report" && parts[1]) {
            return "report:" + parts[1];
        }
        return "page:" + String(parts[0] || "");
    }

    function isSupported(parts) {
        if (parts[0] === "query-report") {
            return supportedReports.has(parts[1]);
        }
        return supportedPages.has(parts[0]);
    }

    function asNode(value) {
        if (!value) return null;
        if (value.jquery) return value[0] || null;
        if (value.nodeType) return value;
        if (value[0] && value[0].nodeType) return value[0];
        return null;
    }

    function activePage(parts) {
        if (parts[0] === "query-report") {
            if (window.frappe && frappe.query_report) {
                if (frappe.query_report.page) {
                    return frappe.query_report.page;
                }
            }
        } else if (window.frappe && frappe.pages) {
            const def = frappe.pages[parts[0]];
            if (def && def.page) return def.page;
        }

        if (window.frappe && frappe.container && frappe.container.page) {
            return frappe.container.page;
        }
        return null;
    }

    function getMain(page) {
        if (!page) return null;

        let main = asNode(page.main);
        const wrapper = asNode(page.wrapper);

        if (
            main &&
            main.classList &&
            main.classList.contains("layout-main-section-wrapper")
        ) {
            main = main.querySelector(".layout-main-section") || main;
        }

        if (!main && wrapper) {
            main =
                wrapper.querySelector(".layout-main-section") ||
                wrapper.querySelector(".page-body") ||
                wrapper;
        }

        return main;
    }

    function targetKey(item) {
        return item.type === "report"
            ? "report:" + item.route
            : "page:" + item.route;
    }

    function navigate(item) {
        if (!window.frappe || typeof frappe.set_route !== "function") {
            return;
        }

        if (item.type === "report") {
            frappe.set_route("query-report", item.route);
        } else {
            frappe.set_route(item.route);
        }
    }

    function removeOldPageNavigation(main) {
        if (!main || !main.querySelectorAll) return;

        const selectors = [
            ".bb-cw-toolbar-navigation",
            ".bb-rw-toolbar-navigation",
            ".bb-bb-global-navigation"
        ].join(",");

        main.querySelectorAll(selectors).forEach(function (element) {
            if (!element.closest(".bb-unified-navigation")) {
                element.remove();
            }
        });
    }

    function buildNavigation(currentKey) {
        const nav = document.createElement("nav");
        nav.className = "bb-unified-navigation";
        nav.setAttribute("aria-label", "التنقل بين صفحات وتقارير بنك الدم");

        pages.forEach(function (item) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "btn btn-default bb-unified-nav-button";
            button.textContent = item.label;
            button.dataset.targetId = item.id;

            const active = targetKey(item) === currentKey;
            if (active) {
                button.classList.add("bb-unified-nav-active");
                button.setAttribute("aria-current", "page");
            }

            button.addEventListener("click", function (event) {
                event.preventDefault();
                navigate(item);
            });

            nav.appendChild(button);
        });

        return nav;
    }

    function mount() {
        if (!window.frappe || typeof frappe.get_route !== "function") {
            return;
        }

        const parts = routeParts();
        if (!isSupported(parts)) return;

        const page = activePage(parts);
        const main = getMain(page);
        if (!main || !main.insertBefore) return;

        const currentKey = routeKey(parts);

        removeOldPageNavigation(main);

        // Keep exactly one shared navigation bar at the top of the page content.
        const navElements = Array.from(
            main.querySelectorAll(".bb-unified-navigation")
        );

        let nav = navElements.shift() || null;

        navElements.forEach(function (element) {
            element.remove();
        });

        if (!nav || nav.dataset.routeKey !== currentKey) {
            if (nav) nav.remove();
            nav = buildNavigation(currentKey);
            nav.dataset.routeKey = currentKey;
        }

        if (nav.parentNode !== main || main.firstChild !== nav) {
            main.insertBefore(nav, main.firstChild);
        }
    }

    let queued = false;

    function scheduleMount() {
        if (queued) return;
        queued = true;

        window.setTimeout(function () {
            queued = false;
            try {
                mount();
            } catch (error) {
                console.warn("Blood Bank unified navigation:", error);
            }
        }, 80);
    }

    function start() {
        scheduleMount();

        if (document.body && !window.__bbUnifiedNavigationObserver) {
            window.__bbUnifiedNavigationObserver =
                new MutationObserver(scheduleMount);

            window.__bbUnifiedNavigationObserver.observe(document.body, {
                childList: true,
                subtree: true
            });
        }

        window.addEventListener("hashchange", scheduleMount);

        if (window.frappe && frappe.router &&
            typeof frappe.router.on === "function") {
            try {
                frappe.router.on("change", scheduleMount);
            } catch (e) {}
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();
