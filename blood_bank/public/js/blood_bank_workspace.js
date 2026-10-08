
(function () {

    const mapping = [
        ["المتبرع", "bb-donor"],
        ["التبرع بالدم", "bb-donation"],
        ["معالجة الدم", "bb-processing"],
        ["وحدة الدم", "bb-unit"],

        ["فحص الدم", "bb-screening"],
        ["فحص جودة المكونات", "bb-quality"],
        ["Quality Check", "bb-quality"],

        ["مكونات الدم", "bb-component"],
        ["تخزين الدم", "bb-storage"],

        ["طلب الدم", "bb-request"],
        ["حجز الدم", "bb-reservation"],
        ["مطابقة الدم", "bb-crossmatch"],

        ["صرف الدم", "bb-issue"],
        ["تسليم الدم", "bb-handover"],
        ["نقل الدم", "bb-transfusion"],

        ["التصرف في وحدة الدم", "bb-disposition"],
        ["Unit Disposition", "bb-disposition"]
    ];


    function styleBloodBankCards() {

        /*
         * IMPORTANT:
         * Do NOT require .workspace.
         * Frappe source confirms the actual card:
         *
         * .widget.links-widget-box
         */

        const boxes = document.querySelectorAll(
            ".widget.links-widget-box"
        );

        boxes.forEach(function (box) {

            const text = (
                box.innerText ||
                box.textContent ||
                ""
            ).replace(/\s+/g, " ").trim();

            if (!text) {
                return;
            }

            let matched = false;

            for (const item of mapping) {

                if (text.includes(item[0])) {

                    box.classList.add(
                        "bb-blood-card",
                        item[1]
                    );

                    matched = true;
                    break;
                }
            }

            if (!matched) {
                return;
            }
        });
    }


    function run() {
        try {
            styleBloodBankCards();
        } catch (e) {
            console.warn(
                "Blood Bank Workspace:",
                e
            );
        }
    }


    document.addEventListener(
        "DOMContentLoaded",
        function () {

            run();

            setTimeout(run, 300);
            setTimeout(run, 800);
            setTimeout(run, 1500);
            setTimeout(run, 2500);
        }
    );


    const observer = new MutationObserver(
        function () {
            run();
        }
    );

    observer.observe(
        document.body,
        {
            childList: true,
            subtree: true
        }
    );

})();

