frappe.pages["blood-bank-initial-work"].on_page_load = async function(wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("نظام بنك الدم"),
        single_column: true
    });

    page.main.html(frappe.render_template("blood_bank_initial_work"));

    const root = page.main[0].querySelector(".bb-iw-root");
    if (!root) {
        frappe.msgprint(__("تعذر تحميل قالب واجهة بنك الدم."));
        return;
    }

    // BB_INITIAL_WORK_COMBINED_BLOOD_GROUP_V1
    // Same eight canonical values as Blood Request.
    const BLOOD_GROUP_OPTIONS = [
        "A Positive",
        "A Negative",
        "B Positive",
        "B Negative",
        "AB Positive",
        "AB Negative",
        "O Positive",
        "O Negative"
    ];

    const BLOOD_GROUP_PARTS = {
        "A Positive":  { abo: "A",  rh: "Positive" },
        "A Negative":  { abo: "A",  rh: "Negative" },
        "B Positive":  { abo: "B",  rh: "Positive" },
        "B Negative":  { abo: "B",  rh: "Negative" },
        "AB Positive": { abo: "AB", rh: "Positive" },
        "AB Negative": { abo: "AB", rh: "Negative" },
        "O Positive":  { abo: "O",  rh: "Positive" },
        "O Negative":  { abo: "O",  rh: "Negative" }
    };

    const doctypes = [
        "Blood Donor",
        "Blood Donation",
        "Blood Processing",
        "Blood Unit"
    ];

    const routes = [
        "blood-donor",
        "blood-donation",
        "blood-processing",
        "blood-unit"
    ];

    const visible = [
        new Set([
            "full_name", "date_of_birth", "mobile_no", "gender",
            "eligibility_status", "abo_group",
            "blood_group_verified", "eligibility_review_date",
            "deferral_reason"
        ]),
        new Set([
            "donation_date", "donation_type", "collection_start",
            "collection_end", "volume_collected", "collection_unit",
            "collection_staff", "bag_number", "quarantine_date",
            "quarantine_reason", "remarks"
        ]),
        new Set([
            "blood_donation", "donor", "donor_name", "blood_group",
            "bag_number", "volume_collected", "collection_unit",
            "processing_date", "processing_type", "separation_method",
            "remarks"
        ]),
        new Set([
            "blood_donation", "donor", "donor_name", "donation_date",
            "blood_group", "unit_type", "bag_number", "volume",
            "volume_unit", "quarantine_date", "quarantine_reason",
            "expiry_date"
        ])
    ];

    // حقول داخلية لها قيمة افتراضية، ولا حاجة لعرضها في البطاقة المختصرة.
    const hiddenSystemFields = new Set([
        "naming_series", "donor_status", "donation_status",
        "processing_status", "unit_status", "donor_type"
    ]);

    const defaults = [
        {
            naming_series: "DON-.YYYY.-.#####",
            donor_status: "New",
            eligibility_status: "Pending"
        },
        {
            naming_series: "DONN-.YYYY.-.#####",
            donation_status: "Draft"
        },
        {
            naming_series: "PROC-.YYYY.-.#####",
            processing_status: "Draft"
        },
        {
            naming_series: "BU-.YYYY.-.#####",
            unit_status: "Created"
        }
    ];

    let metadata = {};
    let models = [];
    let selectedDonor = null;
    let selectedDonorProfile = null;
    let pendingDonorProfileName = "";
    let donorProfileSearchTimer = null;
    let donorProfileSearchSerial = 0;
    let settingDonorProfileName = false;
    let pendingDonorName = "";
    let donorSearchSerial = 0;
    let donorHistorySerial = 0;
    let donorPicker = null;
    let searchTimer = null;
    let ready = false;
    let activeWindow = 0;
    const windowTitles = [
        "المتبرع | Donor",
        "التبرع | Donation",
        "المعالجة | Processing",
        "وحدة الدم | Blood Unit"
    ];

    const messageBox = root.querySelector("#iw-message");

    function notify(text, type = "info") {
        messageBox.textContent = String(text || "");
        messageBox.className = `bb-iw-message is-${type}`;
        messageBox.hidden = false;
    }

    function isTrue(value) {
        return value === true || Number(value) === 1;
    }

    function esc(value) {
        return String(value ?? "").replace(/[&<>"']/g, ch => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[ch]);
    }

    function getMeta(doctype) {
        return metadata[doctype] || {};
    }

    function getFields(doctype) {
        const fields = getMeta(doctype).fields;
        return Array.isArray(fields) ? fields : [];
    }

    function resolveDefault(value) {
        if (value === "Today") return frappe.datetime.get_today();
        if (value === "Now") return frappe.datetime.now_datetime();
        return value;
    }

    function initializeModels() {
        models = doctypes.map((doctype, i) => {
            const values = {};

            getFields(doctype).forEach(field => {
                if (field.default !== undefined && field.default !== null) {
                    values[field.fieldname] = resolveDefault(field.default);
                }
            });

            Object.assign(values, getMeta(doctype).defaults || {}, defaults[i]);

            return {
                name: null,
                values,
                controls: {},
                dirty: false
            };
        });
    }

    function fieldsFor(i) {
        return getFields(doctypes[i]).filter(field => {
            const name = field.fieldname || "";

            if (!name || hiddenSystemFields.has(name)) return false;
            if (isTrue(field.hidden)) return false;

            if ([
                "Section Break", "Column Break", "Tab Break",
                "HTML", "Button", "Fold", "Table"
            ].includes(field.fieldtype)) return false;

            // في بطاقة التبرع نستخدم أداة اختيار الاسم، ونحفظ رابط المتبرع داخليًا.
            if (i === 1 && ["donor", "donor_name"].includes(name)) return false;

            // لا نعرض بيانات الهوية والبريد داخل بطاقة التبرع.
            if (i === 1 && /national|identity|email/i.test(name)) return false;

            return visible[i].has(name) || isTrue(field.reqd);
        });
    }

    function updateRecordId(i) {
        const el = root.querySelector(`#iw-id-${i}`);
        const name = models[i]?.name;

        el.textContent = name || "سجل جديد";
        el.title = name ? "السجل الحالي داخل نافذة العمل الأولية" : "";
        el.style.cursor = "default";
        el.onclick = null;
    }

    function getControlValue(control) {
        if (!control) return null;
        const value = control.get_value();
        return value === undefined ? null : value;
    }

    function setFieldValue(i, fieldname, value) {
        const model = models[i];
        if (!model) return;

        model.values[fieldname] = value;

        const control = model.controls[fieldname];
        if (control) {
            control.set_value(value === undefined || value === null ? "" : value);
        }
    }

    function renderOneField(i, field) {
        const model = models[i];
        const fieldname = field.fieldname;
        const holder = document.createElement("div");
        holder.className = "bb-iw-field";

        if (["Small Text", "Text", "Long Text"].includes(field.fieldtype)) {
            holder.classList.add("wide");
        }

        // نستخدم عنصر التحكم الأصلي في Frappe بدل input/select HTML يدوي.
        const isCombinedBloodGroup =
            i === 0 && fieldname === "abo_group";

        const df = {
            ...field,
            fieldname,
            fieldtype: isCombinedBloodGroup
                ? "Select"
                : field.fieldtype,
            options: isCombinedBloodGroup
                ? BLOOD_GROUP_OPTIONS.join("\n")
                : field.options,
            label: field.label || fieldname,
            reqd: isCombinedBloodGroup
                ? 1
                : (isTrue(field.reqd) ? 1 : 0),
            read_only: isCombinedBloodGroup
                ? 0
                : (isTrue(field.read_only) ? 1 : 0),
            hidden: 0
        };

        const control = frappe.ui.form.make_control({
            parent: $(holder),
            df,
            render_input: true
        });

        // BB_INITIAL_WORK_ABO_FULL_GROUP_FIELD_V2
        // The ABO control displays all eight complete blood groups.
        if (i === 0 && fieldname === "abo_group" && control.$input) {
            control.$input.on("change.bbIwCombinedBloodGroupV2", function () {
                const selected = String(control.get_value() || "").trim();
                const parts = BLOOD_GROUP_PARTS[selected];

                if (!parts) {
                    return;
                }

                const donorModel = models[0];
                donorModel._syncingBloodGroup = true;
                donorModel.values = donorModel.values || {};
                donorModel.values.abo_group = parts.abo;
                donorModel.values.rh_factor = parts.rh;
                donorModel.values.blood_group = selected;
                donorModel.dirty = true;
                donorModel._syncingBloodGroup = false;
            });
        }

        // Full blood-group selection is handled by ABO control above.

        control.refresh();

        let initialValue = model.values[fieldname];

        if (i === 0 && fieldname === "abo_group") {
            const saved = model.values || {};
            const fullGroup = String(saved.blood_group || "").trim();
            const derivedGroup =
                String(saved.abo_group || "").trim() &&
                String(saved.rh_factor || "").trim()
                    ? String(saved.abo_group).trim() + " " +
                      String(saved.rh_factor).trim()
                    : "";

            if (BLOOD_GROUP_OPTIONS.includes(fullGroup)) {
                initialValue = fullGroup;
            } else if (BLOOD_GROUP_OPTIONS.includes(derivedGroup)) {
                initialValue = derivedGroup;
            } else {
                initialValue = "";
            }
        }

        if (initialValue !== undefined && initialValue !== null) {
            control.set_value(initialValue);
        }

        model.controls[fieldname] = control;

        if (control.$input) {
            control.$input.on(
                "change.iw input.iw awesomplete-selectcomplete.iw",
                () => {
                    model.values[fieldname] = getControlValue(control);
                    model.dirty = true;
                }
            );
        }

        return holder;
    }

    function setupDonorProfileAutocomplete() {
        const control = models[0]?.controls?.full_name;
        if (!control?.$input) return;

        control.$input.off(".bbDonorProfile");

        const fieldBox = control.$input.closest(".bb-iw-field")[0];
        if (!fieldBox) return;
        fieldBox.style.position = "relative";

        let list = fieldBox.querySelector("#iw-full-name-suggestions");
        if (!list) {
            list = document.createElement("div");
            list.id = "iw-full-name-suggestions";
            list.className = "bb-iw-name-suggestions";
            list.hidden = true;
            fieldBox.appendChild(list);
        }

        control.$input.on("input.bbDonorProfile", function() {
            if (settingDonorProfileName) return;

            const text = String(this.value || "").trim();
            pendingDonorProfileName = text;

            if (selectedDonorProfile &&
                text !== String(selectedDonorProfile.full_name || "").trim()) {
                selectedDonorProfile = null;
            }

            models[0].values.full_name = text;
            models[0].dirty = true;

            clearTimeout(donorProfileSearchTimer);
            if (!text) {
                list.hidden = true;
                return;
            }

            donorProfileSearchTimer = setTimeout(
                () => searchDonorProfiles(text, list),
                250
            );
        });

        control.$input.on("focus.bbDonorProfile", function() {
            const text = String(this.value || "").trim();
            if (text) searchDonorProfiles(text, list);
        });

        control.$input.on("blur.bbDonorProfile", function() {
            setTimeout(() => { list.hidden = true; }, 180);
        });
    }

    async function searchDonorProfiles(text, list) {
        const query = String(text || "").trim();
        if (!query) {
            list.hidden = true;
            return;
        }

        const serial = ++donorProfileSearchSerial;
        try {
            const response = await frappe.call({
                method: "blood_bank.blood_bank.page.blood_bank_initial_work.blood_bank_initial_work.get_initial_work_donors",
                args: { txt: query }
            });

            if (serial !== donorProfileSearchSerial) return;

            const donors = response.message || [];
            list.replaceChildren();

            donors.forEach(donor => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "bb-iw-name-suggestion";
                button.innerHTML =
                    `<span>${esc(donor.full_name || donor.name)}</span>` +
                    `<small>${esc(donor.name)}</small>`;

                button.addEventListener("mousedown", event => {
                    event.preventDefault();
                    loadDonorProfile(donor);
                });

                list.appendChild(button);
            });

            if (!donors.length) {
                const empty = document.createElement("div");
                empty.className = "bb-iw-no-results";
                empty.textContent = "لا يوجد متبرع مطابق. اضغط «إضافة جديد» لإنشاء سجل جديد بهذا الاسم.";
                list.appendChild(empty);
            }

            list.hidden = false;
        } catch (error) {
            console.error("Full Name suggestions failed:", error);
            notify("تعذر تحميل قائمة المتبرعين. راجع صلاحيات القراءة.", "error");
        }
    }

    async function loadDonorProfile(donor) {
        if (!donor?.name) return;

        const list = root.querySelector("#iw-full-name-suggestions");
        try {
            const response = await frappe.call({
                method: "blood_bank.blood_bank.page.blood_bank_initial_work.blood_bank_initial_work.get_initial_work_document",
                args: { doctype: "Blood Donor", name: donor.name }
            });

            const doc = response.message;
            if (!doc?.name) {
                notify("تعذر قراءة سجل المتبرع المحدد.", "error");
                return;
            }

            const model = models[0];
            model.name = doc.name;
            model.values = { ...model.values, ...doc };
            model.dirty = false;

            selectedDonorProfile = {
                name: doc.name,
                full_name: doc.full_name || donor.full_name || doc.name
            };
            pendingDonorProfileName = "";

            settingDonorProfileName = true;
            try {
                Object.entries(model.controls).forEach(([fieldname, fieldControl]) => {
                    if (Object.prototype.hasOwnProperty.call(doc, fieldname)) {
                        fieldControl.set_value(doc[fieldname] ?? "");
                    }
                });
            } finally {
                settingDonorProfileName = false;
            }

            updateRecordId(0);
            if (list) list.hidden = true;

            // Also associate this donor with the donation card and its history.
            selectedDonor = selectedDonorProfile;
            models[1].values.donor = doc.name;
            models[1].values.donor_name = selectedDonorProfile.full_name;

            if (typeof donorPicker !== "undefined" && donorPicker) {
                donorPicker.set_value(selectedDonorProfile.full_name);
                if (donorPicker.$input) {
                    donorPicker.$input.val(selectedDonorProfile.full_name);
                }
            }

            if (typeof loadDonorHistory === "function") {
                loadDonorHistory(selectedDonorProfile);
            }

            notify(
                `تم تحميل سجل المتبرع «${selectedDonorProfile.full_name}». الحفظ سيحدّث هذا السجل.`,
                "success"
            );
        } catch (error) {
            console.error("Loading donor profile failed:", error);
            notify("تعذر تحميل سجل المتبرع المحدد.", "error");
        }
    }


    function renderTransferredReferences(i, holder) {
        const configurations = {
            2: {
                title: "بيانات مرجعية من التبرع",
                hide: [
                    "blood_donation", "donor", "donor_name",
                    "bag_number", "volume_collected",
                    "collection_unit", "processing_date"
                ],
                items: [
                    { field: "blood_donation", label: "رقم التبرع" },
                    { field: "donor_name", fallback: "donor", label: "المتبرع" },
                    { field: "bag_number", label: "رقم كيس الدم" },
                    { field: "volume_collected", label: "الحجم المجمع" },
                    { field: "collection_unit", label: "وحدة القياس" },
                    { field: "processing_date", label: "تاريخ المعالجة" }
                ]
            },
            3: {
                title: "بيانات مرجعية من المعالجة والتبرع",
                hide: [
                    "blood_processing", "blood_donation", "donor",
                    "donor_name", "donation_date", "bag_number",
                    "volume", "volume_unit", "blood_group"
                ],
                items: [
                    { field: "blood_processing", label: "رقم المعالجة" },
                    { field: "blood_donation", label: "رقم التبرع" },
                    { field: "donor_name", fallback: "donor", label: "المتبرع" },
                    { field: "donation_date", label: "تاريخ التبرع" },
                    { field: "bag_number", label: "رقم كيس الدم" },
                    { field: "volume", label: "الحجم" },
                    { field: "volume_unit", label: "وحدة القياس" },
                    { field: "blood_group", label: "فصيلة الدم" }
                ]
            }
        };

        const config = configurations[i];
        if (!config) return;

        const model = models[i];
        const card = holder.closest(".bb-iw-card");
        if (!card) return;

        let summary = Array.from(card.children).find(element =>
            element.dataset &&
            element.dataset.bbTransferSummary === String(i)
        );

        if (!summary) {
            summary = document.createElement("section");
            summary.className = "bb-iw-transfer-summary";
            summary.dataset.bbTransferSummary = String(i);
            holder.parentNode.insertBefore(summary, holder);
        }

        function readValue(fieldname) {
            let value = model.values ? model.values[fieldname] : undefined;
            const control = model.controls ? model.controls[fieldname] : null;

            if (control) {
                try {
                    const liveValue = getControlValue(control);
                    if (liveValue !== undefined && liveValue !== null
                        && String(liveValue).trim() !== "") {
                        value = liveValue;
                    }
                } catch (_) {}
            }
            return value;
        }

        function hasValue(value) {
            return value !== undefined && value !== null
                && String(value).trim() !== "";
        }

        config.hide.forEach(fieldname => {
            const value = readValue(fieldname);
            const fieldNode = holder.querySelector(
                `[data-bb-fieldname="${fieldname}"]`
            );
            if (fieldNode) fieldNode.hidden = hasValue(value);
        });

        const items = [];
        config.items.forEach(item => {
            let value = readValue(item.field);
            if (!hasValue(value) && item.fallback) {
                value = readValue(item.fallback);
            }
            if (hasValue(value)) {
                items.push({ label: item.label, value: String(value) });
            }
        });

        if (!items.length) {
            summary.hidden = true;
            summary.replaceChildren();
            return;
        }

        summary.hidden = false;
        summary.innerHTML = `
            <div class="bb-iw-transfer-summary-title">${esc(config.title)}</div>
            <div class="bb-iw-transfer-summary-grid">
                ${items.map(item => `
                    <div class="bb-iw-transfer-summary-item">
                        <span>${esc(item.label)}</span>
                        <strong dir="auto">${esc(item.value)}</strong>
                    </div>
                `).join("")}
            </div>`;
    }

    function renderFields(i) {
        const holder = root.querySelector(`#iw-fields-${i}`);
        holder.replaceChildren();

        models[i].controls = {};
        fieldsFor(i).forEach(field => {
            let displayField = field;

            if (i === 0 && field.fieldname === "blood_group_verified") {
                displayField = {
                    ...field,
                    read_only: 0,
                    read_only_depends_on: null
                };
            }

            const fieldNode = renderOneField(i, displayField);

            if (fieldNode && fieldNode.nodeType === 1) {
                fieldNode.dataset.bbFieldname = displayField.fieldname;

                if (i === 0 && displayField.fieldname === "blood_group_verified") {
                    fieldNode.classList.add("bb-iw-blood-group-verified", "wide");
                }
            }

            holder.appendChild(fieldNode);
        });

        renderTransferredReferences(i, holder);
        updateRecordId(i);
        if (i === 0) setupDonorProfileAutocomplete();
    }

    function renderAllFields() {
        for (let i = 0; i < doctypes.length; i++) {
            renderFields(i);
        }
    }

    function setupDonorPicker() {
        const host = root.querySelector(".bb-iw-name-picker");
        const originalLabel = host.querySelector('label[for="iw-donor-name"]');
        const originalInput = host.querySelector("#iw-donor-name");
        const options = root.querySelector("#iw-donor-options");

        if (originalLabel) originalLabel.remove();
        if (originalInput) originalInput.remove();

        donorPicker = frappe.ui.form.make_control({
            parent: $(host),
            df: {
                fieldtype: "Data",
                fieldname: "iw_donor_full_name",
                label: __("الاسم الكامل | Full Name"),
                placeholder: __("ابحث عن متبرع أو اكتب اسمًا جديدًا")
            },
            render_input: true
        });

        donorPicker.refresh();

        if (donorPicker.$input) {
            donorPicker.$input.attr({
                id: "iw-donor-name",
                autocomplete: "off"
            });
        }

        const controlNode = donorPicker.wrapper || donorPicker.$wrapper?.[0];
        if (controlNode && options) {
            host.insertBefore(controlNode, options);
        }

        const historyPanel = document.createElement("div");
        historyPanel.id = "iw-donation-history";
        historyPanel.className = "bb-iw-history";
        historyPanel.innerHTML =
            '<strong>التبرعات السابقة</strong>' +
            '<div class="bb-iw-history-body">اختر متبرعًا لعرض سجله.</div>';
        options.insertAdjacentElement("afterend", historyPanel);

        if (donorPicker.$input) {
            donorPicker.$input.on("input.iw", function() {
                // حفظ النص الخام فور الكتابة، قبل إخفاء الاقتراحات أو فقدان التركيز.
                pendingDonorName = String(this.value || "").trim();
                selectedDonor = null;
                models[1].values.donor = null;
                models[1].values.donor_name = null;

                clearTimeout(searchTimer);
                searchTimer = setTimeout(() => searchDonors(), 250);
            });

            donorPicker.$input.on("focus.iw", () => {
                if (donorPicker.get_value()) searchDonors();
            });

            donorPicker.$input.on("blur.iw", () => {
                setTimeout(() => {
                    options.hidden = true;
                }, 180);
            });
        }
    }

    function selectDonor(donor) {
        if (!donor?.name) return;

        const selected = {
            name: donor.name,
            full_name: donor.full_name || donor.name
        };

        donorPicker.set_value(selected.full_name);
        if (donorPicker.$input) donorPicker.$input.val(selected.full_name);

        selectedDonor = selected;
        pendingDonorName = "";
        models[1].values.donor = selected.name;
        models[1].values.donor_name = selected.full_name;

        root.querySelector("#iw-donor-options").hidden = true;
        notify("تم اختيار المتبرع: " + selected.full_name, "success");
        loadDonorHistory(selected);
    }

    async function searchDonors() {
        const list = root.querySelector("#iw-donor-options");
        const text = String(
            pendingDonorName || donorPicker?.$input?.val() ||
            donorPicker?.get_value() || ""
        ).trim();

        const serial = ++donorSearchSerial;
        if (!text) {
            list.hidden = true;
            return;
        }

        try {
            const r = await frappe.call({
                method: "blood_bank.blood_bank.page.blood_bank_initial_work.blood_bank_initial_work.get_initial_work_donors",
                args: { txt: text }
            });
            if (serial !== donorSearchSerial) return;

            const donors = (r.message || []).map(d => ({
                name: d.name, full_name: d.full_name || d.name
            }));

            list.replaceChildren();
            donors.forEach(d => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "bb-iw-option";
                button.innerHTML = `<span>${esc(d.full_name)}</span><small>${esc(d.name)}</small>`;
                button.addEventListener("mousedown", e => {
                    e.preventDefault();
                    selectDonor(d);
                });
                list.appendChild(button);
            });

            const norm = v => String(v || "").trim().toLocaleLowerCase();
            const exact = donors.filter(d =>
                norm(d.full_name) === norm(text) || norm(d.name) === norm(text)
            );

            if (exact.length === 1) {
                selectDonor(exact[0]);
                return;
            }

            if (!donors.length) {
                list.innerHTML =
                    '<div class="bb-iw-no-results">لا يوجد متبرع مطابق. اضغط «إضافة جديد» لنقل الاسم إلى بطاقة المتبرع.</div>';
            }
            list.hidden = false;
        } catch (e) {
            console.error("Donor search failed:", e);
            notify("تعذر البحث عن المتبرعين.", "error");
        }
    }

    async function loadDonorHistory(donor) {
        const panel = root.querySelector("#iw-donation-history");
        if (!panel || !donor?.name) return;

        const serial = ++donorHistorySerial;
        panel.innerHTML =
            '<strong>التبرعات السابقة</strong>' +
            '<div class="bb-iw-history-body">جارٍ تحميل السجل…</div>';

        try {
            const r = await frappe.call({
                method: "blood_bank.blood_bank.page.blood_bank_initial_work.blood_bank_initial_work.get_initial_work_donation_history",
                args: { donor: donor.name }
            });
            if (serial !== donorHistorySerial ||
                selectedDonor?.name !== donor.name) return;

            const rows = r.message || [];
            if (!rows.length) {
                panel.innerHTML =
                    '<strong>التبرعات السابقة</strong>' +
                    '<div class="bb-iw-history-body">لا توجد تبرعات سابقة لهذا المتبرع.</div>';
                return;
            }

            // Only reuse the latest donation's common fields when empty.
            // Date, bag number and collected volume belong to the new donation.
            const latest = rows[0];
            const filled = [];
            ["donation_type", "collection_unit", "collection_staff"].forEach(f => {
                const control = models[1].controls[f];
                const current = control ? getControlValue(control) : models[1].values[f];
                if (current !== undefined && current !== null && current !== "") return;
                if (latest[f] === undefined || latest[f] === null || latest[f] === "") return;
                setFieldValue(1, f, latest[f]);
                filled.push(f);
            });
            if (filled.length) models[1].dirty = true;

            /* BB_DONOR_HISTORY_RESULT_COLUMNS_V1 */
              if (!document.getElementById("bb-iw-history-result-style")) {
                  const style = document.createElement("style");
                  style.id = "bb-iw-history-result-style";
                  style.textContent = `
                    .bb-iw-history-acceptance {
                      display:inline-block; padding:3px 8px; border-radius:999px;
                      font-weight:700; white-space:nowrap;
                    }
                    .bb-iw-history-acceptance.accepted {
                      background:#dcfce7; color:#166534;
                    }
                    .bb-iw-history-acceptance.rejected {
                      background:#fee2e2; color:#991b1b;
                    }
                    .bb-iw-history-acceptance.mixed {
                      background:#fef3c7; color:#92400e;
                    }
                    .bb-iw-history-acceptance.pending,
                    .bb-iw-history-acceptance.cancelled {
                      background:#e5e7eb; color:#374151;
                    }
                  `;
                  document.head.appendChild(style);
              }

              const donationStatusLabels = {
                  Draft: "مسودة",
                  Scheduled: "مجدول",
                  "Checked In": "تم تسجيل الحضور",
                  Bleeding: "سحب الدم",
                  Collected: "تم جمع الدم",
                  Quarantine: "في الحجر",
                  Cancelled: "ملغي",
                  Aborted: "متوقف"
              };
              const unitStatusLabels = {
                  Created: "منشأة",
                  Quarantine: "في الحجر",
                  Accepted: "مقبولة",
                  Rejected: "مرفوضة",
                  Processing: "قيد المعالجة",
                  Available: "متاحة",
                  Reserved: "محجوزة",
                  Issued: "مصروفة",
                  Returned: "مرتجعة",
                  Expired: "منتهية الصلاحية",
                  Discarded: "مستبعدة",
                  Transfused: "تم نقلها"
              };
              const screeningStatusLabels = {
                  Draft: "مسودة",
                  Screening: "قيد الفحص",
                  "Results Review": "مراجعة النتائج",
                  Accepted: "مقبول",
                  Rejected: "مرفوض"
              };
              const overallResultLabels = {
                  Pending: "لم تُحسم",
                  Passed: "ناجح",
                  Failed: "فاشل"
              };
              const decisionClasses = {
                  Accepted: "accepted",
                  Rejected: "rejected",
                  Mixed: "mixed",
                  Cancelled: "cancelled",
                  Pending: "pending"
              };
              const historyLabel = (value, dictionary) =>
                  dictionary[value] || value || "—";
              const historyLabels = (values, dictionary, fallback) => {
                  const result = (Array.isArray(values) ? values : [])
                      .map(value => historyLabel(value, dictionary))
                      .filter(Boolean);
                  return result.length ? result.join("، ") : fallback;
              };

              const rowsHtml = rows.map(d => {
                  const decision = d.acceptance_status || "Pending";
                  const decisionClass = decisionClasses[decision] || "pending";
                  const decisionLabel = d.acceptance_label || "لم تُحسم النتيجة";

                  return `
                <tr>
                    <td>${esc(d.name)}</td>
                    <td>${esc(d.donation_date || "—")}</td>
                    <td>${esc(d.donation_type || "—")}</td>
                    <td>${esc(historyLabel(d.donation_status, donationStatusLabels))}</td>
                    <td>
                      <span
                        class="bb-iw-history-acceptance ${decisionClass}"
                        title="${esc(d.acceptance_detail || "")}">
                        ${esc(decisionLabel)}
                      </span>
                    </td>
                    <td>${esc(historyLabels(d.screening_statuses, screeningStatusLabels, "لا يوجد فحص مسجل"))}</td>
                    <td>${esc(historyLabels(d.overall_results, overallResultLabels, "لا توجد نتيجة مسجلة"))}</td>
                    <td>${esc(historyLabels(d.unit_statuses, unitStatusLabels, "لا توجد وحدة مرتبطة"))}</td>
                    <td>${esc(d.bag_number || "—")}</td>
                    <td>${esc(d.volume_collected ?? "—")}</td>
                    <td>
                      <button
                        type="button"
                        class="btn btn-default btn-xs bb-iw-select-donation"
                        data-donation-name="${esc(d.name)}">
                        تحديد وتعديل
                      </button>
                    </td>
                </tr>`;
              }).join("");

            panel.innerHTML = `
                <strong>التبرعات السابقة (${rows.length})</strong>
                <div class="bb-iw-history-table-wrap">
                  <table class="bb-iw-history-table">
                    <thead><tr>
                    <th>رقم التبرع</th><th>التاريخ</th><th>النوع</th>
                    <th>حالة التبرع</th><th>تقييم القبول</th>
                    <th>حالة الفحص</th><th>نتيجة الفحص</th><th>حالة وحدة الدم</th>
                    <th>رقم الكيس</th><th>الحجم</th><th>إجراء</th>
                    </tr></thead>
                    <tbody>${rowsHtml}</tbody>
                  </table>
                </div>
                <div class="bb-iw-history-body">${
                    filled.length
                    ? "عُبئت الحقول الفارغة من أحدث تبرع: " + filled.map(esc).join("، ")
                    : "التاريخ ورقم الكيس والحجم لا تُنسخ من تبرع سابق."
                }</div>`;

            /* BB_DONATION_HISTORY_SELECT_V1 */
            panel.querySelectorAll(".bb-iw-select-donation").forEach(
                selectButton => {
                    selectButton.addEventListener("click", async () => {
                        const donationName =
                            selectButton.getAttribute("data-donation-name");
                        const currentDonorName = donor.name;
                        const donationModel = models[1];

                        if (!donationName || !currentDonorName) {
                            notify(
                                "تعذر تحديد التبرع أو المتبرع المرتبط به.",
                                "error"
                            );
                            return;
                        }

                        if (
                            !selectedDonor ||
                            selectedDonor.name !== currentDonorName
                        ) {
                            notify(
                                "تغير المتبرع المحدد. اختر المتبرع الصحيح ثم أعد المحاولة.",
                                "warning"
                            );
                            return;
                        }

                        if (selectButton.disabled) return;

                        const loadSelectedDonation = async () => {
                            selectButton.disabled = true;
                            const oldLabel = selectButton.textContent;
                            selectButton.textContent = "جارٍ التحميل...";

                            try {
                                const response = await frappe.call({
                                    method:
                                        "blood_bank.blood_bank.page." +
                                        "blood_bank_initial_work." +
                                        "blood_bank_initial_work." +
                                        "get_initial_work_document",
                                    args: {
                                        doctype: "Blood Donation",
                                        name: donationName
                                    }
                                });

                                const doc = response.message;

                                if (!doc || doc.name !== donationName) {
                                    throw new Error(
                                        "تعذر تحميل سجل التبرع المحدد."
                                    );
                                }

                                // Do not let a history row load another donor's donation.
                                if (doc.donor !== currentDonorName) {
                                    throw new Error(
                                        "التبرع المحدد لا يرتبط بالمتبرع الحالي."
                                    );
                                }

                                donationModel.name = doc.name;
                                donationModel.values = {
                                    ...donationModel.values,
                                    ...doc
                                };
                                donationModel.dirty = false;

                                // Keep the current donor context and its link.
                                selectedDonor = {
                                    name: currentDonorName,
                                    full_name:
                                        donor.full_name || currentDonorName
                                };
                                selectedDonorProfile = {
                                    ...selectedDonor
                                };
                                donationModel.values.donor = doc.donor;

                                if (!donationModel.values.donor_name) {
                                    donationModel.values.donor_name =
                                        selectedDonor.full_name;
                                }

                                updateRecordId(1);
                                renderFields(1);
                                activateWindow(1);

                                notify(
                                    `تم تحميل التبرع ${doc.name} في نافذة التبرع. ` +
                                    "يمكنك مراجعة حقوله وتعديلها ثم حفظها.",
                                    "success"
                                );
                            } catch (error) {
                                console.error(
                                    "Unable to load selected donation:",
                                    error
                                );
                                notify(
                                    `تعذر تحميل التبرع: ${readableError(error)}`,
                                    "error"
                                );
                            } finally {
                                selectButton.disabled = false;
                                selectButton.textContent = oldLabel;
                            }
                        };

                        // Protect existing edits from accidental replacement.
                        if (donationModel.dirty) {
                            frappe.confirm(
                                "توجد تغييرات غير محفوظة في نافذة التبرع. " +
                                "هل تريد تجاهلها وتحميل التبرع " +
                                donationName + "؟",
                                () => {
                                    loadSelectedDonation();
                                }
                            );
                            return;
                        }

                        loadSelectedDonation();
                    });
                }
            );
        } catch (e) {
            console.error("Donation history failed:", e);
            panel.innerHTML =
                '<strong>التبرعات السابقة</strong>' +
                '<div class="bb-iw-history-body">تعذر تحميل السجل؛ تحقق من الصلاحيات.</div>';
        }
    }

    function getDocumentPayload(i) {
        const doctype = doctypes[i];
        const model = models[i];
        const fieldnames = new Set(getFields(doctype).map(f => f.fieldname));
        const payload = { doctype };

        // لا نرسل خصائص النظام مثل owner وcreation؛ نرسل حقول المستند فقط.
        Object.entries(model.values).forEach(([key, value]) => {
            if (fieldnames.has(key)) payload[key] = value;
        });

        Object.entries(model.controls).forEach(([fieldname, control]) => {
            payload[fieldname] = getControlValue(control);
        });

        if (model.name) payload.name = model.name;
        return payload;
    }

    function validateVisibleRequired(i, payload) {
        const missing = [];

        Object.entries(models[i].controls).forEach(([fieldname, control]) => {
            if (!isTrue(control.df.reqd)) return;

            const value = payload[fieldname];
            if (control.df.fieldtype === "Check") return;

            if (value === null || value === undefined || String(value).trim() === "") {
                missing.push(control.df.label || fieldname);
            }
        });

        return missing;
    }

    function readableError(error) {
        if (error?._server_messages) {
            try {
                const messages = JSON.parse(error._server_messages);
                const text = messages.map(item => {
                    try {
                        const parsed = JSON.parse(item);
                        return parsed.message || parsed.title || item;
                    } catch (_) {
                        return item;
                    }
                }).filter(Boolean).join(" — ");

                if (text) return text;
            } catch (_) {}
        }

        return error?.message || error?.exc_type || "حدث خطأ أثناء الحفظ. راجع سجل Frappe.";
    }

    function transferValues(target, values) {
        const model = models[target];

        if (!model) {
            notify("تعذر العثور على نموذج الوجهة.", "error");
            return false;
        }

        if (model.name) {
            notify(
                `لم تُنقل البيانات إلى ${doctypes[target]} لأن الوجهة سجل محفوظ بالفعل.`,
                "warning"
            );
            return false;
        }

        const targetFields = new Set(
            getFields(doctypes[target]).map(field => field.fieldname)
        );

        const toApply = [];
        const referenceConflicts = [];

        const hasValue = value =>
            value !== undefined &&
            value !== null &&
            String(value).trim() !== "";

        const sameValue = (left, right) =>
            String(left ?? "").trim() === String(right ?? "").trim();

        Object.entries(values).forEach(([fieldname, value]) => {
            if (!targetFields.has(fieldname) || !hasValue(value)) return;

            const control = model.controls?.[fieldname];
            let current = model.values?.[fieldname];

            if (control) {
                try {
                    const liveValue = getControlValue(control);
                    if (liveValue !== undefined && liveValue !== null) {
                        current = liveValue;
                    }
                } catch (_) {}
            }

            if (hasValue(current)) {
                if (!sameValue(current, value)) {
                    if (["blood_donation", "blood_processing"].includes(fieldname)) {
                        referenceConflicts.push(fieldname);
                    }
                }
                return;
            }

            toApply.push([fieldname, value]);
        });

        if (referenceConflicts.length) {
            notify(
                "لم يُستبدل مرجع التبرع أو المعالجة الموجود في الوجهة؛ " +
                "تحقق من ارتباط السجلات قبل المتابعة.",
                "warning"
            );
            return false;
        }

        const wasDirty = Boolean(model.dirty);

        toApply.forEach(([fieldname, value]) => {
            setFieldValue(target, fieldname, value);
            model.values[fieldname] = value;
        });

        // أبقِ تعديلات الموظف غير المحفوظة كما هي.
        model.dirty = wasDirty || toApply.length > 0;
        return true;
    }

    /* BB_AUTO_ADVANCE_TO_PROCESSING_V1 */
    function transferAfterDonation() {
        const donation = models[1]?.values || {};
        const status = donation.donation_status;

        if (status !== "Quarantine") {
            notify(
                `تم حفظ التبرع. حالته الحالية: ${status || "غير محددة"}. ` +
                "لن تُنقل البيانات إلى المعالجة حتى تصل إلى حالة Quarantine عبر سير العمل.",
                "success"
            );
            return false;
        }

        // انقل البيانات أولًا، ولا تفتح نافذة المعالجة إذا تعذر النقل.
        const moved = transferValues(2, {
            blood_donation: models[1].name,
            donor: donation.donor,
            donor_name: donation.donor_name,
            bag_number: donation.bag_number,
            volume_collected: donation.volume_collected,
            collection_unit: donation.collection_unit,
            processing_date: donation.donation_date
        });

        if (!moved) {
            notify(
                "وصل التبرع إلى الحجر، لكن نافذة المعالجة تحتوي على سجل محفوظ " +
                "أو تعديلات غير محفوظة. لم تُستبدل بياناتها ولم يتم الانتقال تلقائيًا.",
                "warning"
            );
            return false;
        }

        // اعرض الحقول المنقولة ثم فعّل نافذة المعالجة تلقائيًا.
        renderFields(2);
        activateWindow(2);

        notify(
            "تم نقل بيانات التبرع إلى نافذة المعالجة والانتقال إليها تلقائيًا.",
            "success"
        );
        return true;
    }

    /* BB_AUTO_ADVANCE_PROCESSING_TO_UNIT_V1 */
    /* BB_UNIT_AUTO_ADVANCE_AND_LINK_V2 */
    function transferAfterProcessing() {
        const processing = models[2]?.values || {};
        const status = processing.processing_status;

        if (status !== "Component Separation") {
            notify(
                `تم تحديث المعالجة. حالتها الحالية: ${status || "غير محددة"}. ` +
                "لن يتم الانتقال حتى تصل الحالة إلى Component Separation عبر سير العمل.",
                "success"
            );
            return false;
        }

        let donationReference = String(processing.blood_donation || "").trim();

        // إذا كان المرجع ناقصًا، استعده من سجل التبرع الحالي فقط
        // عندما يتطابق رقم الكيس أو هوية المتبرع.
        if (!donationReference) {
            const donationModel = models[1];
            const donation = donationModel?.values || {};

            const sameValue = (left, right) =>
                Boolean(String(left ?? "").trim()) &&
                String(left).trim() === String(right ?? "").trim();

            const sameBag =
                sameValue(processing.bag_number, donation.bag_number);

            const sameDonor =
                sameValue(processing.donor, donation.donor) ||
                sameValue(processing.donor_name, donation.donor_name);

            if (donationModel?.name && (sameBag || sameDonor)) {
                donationReference = donationModel.name;
            }
        }

        if (!donationReference) {
            notify(
                "تعذر تحديد رقم التبرع المرتبط بالمعالجة. " +
                "لم يتم الانتقال إلى وحدة الدم حتى لا يُربط سجل خاطئ.",
                "error"
            );
            return false;
        }

        const moved = transferValues(3, {
            blood_processing: models[2].name,
            blood_donation: donationReference,
            donor: processing.donor,
            donor_name: processing.donor_name,
            bag_number: processing.bag_number,
            volume: processing.volume_collected,
            volume_unit: processing.collection_unit,
            blood_group: processing.blood_group
        });

        if (!moved) {
            notify(
                "اكتملت المعالجة، لكن تعذر تحديث مراجع وحدة الدم بأمان. " +
                "راجِع بيانات الوجهة قبل المتابعة.",
                "warning"
            );
            return false;
        }

        renderFields(3);
        activateWindow(3);

        notify(
            "تم نقل رقم التبرع ورقم المعالجة والبيانات المتاحة إلى وحدة الدم.",
            "success"
        );
        return true;
    }

    async function saveCard(i) {
        if (!ready) {
            notify("لم تكتمل تهيئة الحقول بعد. حدّث الصفحة وانتظر ظهور رسالة الجاهزية.", "warning");
            return;
        }

        const doctype = doctypes[i];
        const model = models[i];

        if (i === 1 && !model.name) {
            const donorName = selectedDonor?.name || model.values?.donor;
            if (!donorName) {
                notify("اختر متبرعًا محفوظًا أولًا وأكمل إجراءات أهليته.", "warning");
                return;
            }

            let donorDoc = null;
            try {
                const donorResponse = await frappe.call({
                    method: "frappe.client.get",
                    args: { doctype: doctypes[0], name: donorName }
                });
                donorDoc = donorResponse.message;
            } catch (error) {
                console.error("Unable to verify donor before donation:", error);
                notify("تعذر التحقق من حالة المتبرع. لم يتم إنشاء سجل التبرع.", "error");
                return;
            }

            if (!donorDoc || donorDoc.donor_status !== "Ready for Donation") {
                notify(
                    "لا يمكن إنشاء التبرع قبل اعتماد جاهزية المتبرع عبر سير العمل.",
                    "warning"
                );
                return;
            }

            model.values.donor = donorDoc.name;
            model.values.donor_name = donorDoc.full_name || "";
            selectedDonor = {
                name: donorDoc.name,
                full_name: donorDoc.full_name || ""
            };
        }

        const payload = getDocumentPayload(i);

        // BB_INITIAL_WORK_ABO_FULL_GROUP_FIELD_V2
        // Translate the visible full group into the canonical stored ABO/Rh.
        if (i === 0) {
            const groupControl = model.controls.abo_group;
            const selectedGroup = String(
                (groupControl && groupControl.get_value()) ||
                model.values.blood_group ||
                ""
            ).trim();

            const groupParts = BLOOD_GROUP_PARTS[selectedGroup];

            if (!groupParts) {
                notify(
                    "اختر فصيلة دم كاملة وصحيحة من قائمة ABO قبل الحفظ.",
                    "warning"
                );
                if (groupControl && groupControl.$input) {
                    groupControl.$input.focus();
                }
                return;
            }

            payload.abo_group = groupParts.abo;
            payload.rh_factor = groupParts.rh;
            payload.blood_group = selectedGroup;

            model.values.abo_group = groupParts.abo;
            model.values.rh_factor = groupParts.rh;
            model.values.blood_group = selectedGroup;
        }

        /* BB_PRESERVE_BLOOD_PROCESSING_LINK_V1 */
        if (i === 3) {
            const source = models[2];
            const sourceDonation = source?.values?.blood_donation;

            if (
                source?.name &&
                source.values?.processing_status === "Component Separation" &&
                sourceDonation &&
                payload.blood_donation === sourceDonation
            ) {
                payload.blood_processing = source.name;
            }
        }

        if (i === 1 && selectedDonor?.name) {
            payload.donor = selectedDonor.name;
            payload.donor_name = selectedDonor.full_name || "";
        }

        Object.entries(defaults[i]).forEach(([fieldname, value]) => {
            if (payload[fieldname] === undefined || payload[fieldname] === null || payload[fieldname] === "") {
                payload[fieldname] = value;
            }
        });

        const missing = validateVisibleRequired(i, payload);
        if (missing.length) {
            notify("أكمل الحقول المطلوبة: " + missing.join("، "), "warning");
            return;
        }

        if (model.name && !model.values?.modified) {
            notify(
                "تعذر التحقق من النسخة الأصلية لهذا السجل. " +
                "حدّث بياناته قبل الحفظ.",
                "warning"
            );
            return;
        }

        const button = root.querySelector("#iw-save-active");
        const oldLabel = button.textContent;
        button.disabled = true;
        button.textContent = "جارٍ الحفظ…";

        try {
            // حفظ مستقل لكل مستند مع فحص النسخة الأصلية.
            const response = await frappe.call({
                method: "blood_bank.blood_bank.page.blood_bank_initial_work.blood_bank_initial_work.save_initial_work_document",
                args: {
                    doctype,
                    values: payload,
                    name: model.name || null,
                    expected_modified: model.name
                        ? model.values.modified
                        : null
                }
            });

            let result = response.message;
            if (typeof result === "string") {
                try { result = JSON.parse(result); } catch (_) {}
            }

            const saved = result?.doc || result;

            if (!saved || !saved.name) {
                throw new Error("لم يرجع الخادم رقم السجل بعد الحفظ.");
            }

            model.name = saved.name;
            model.values = { ...model.values, ...saved };
            model.dirty = false;
            updateRecordId(i);

            if (i === 0) {
                selectedDonor = {
                    name: saved.name,
                    full_name: saved.full_name || model.values.full_name || ""
                };
                selectedDonorProfile = {
                    name: saved.name,
                    full_name: saved.full_name || model.values.full_name || ""
                };
                pendingDonorProfileName = "";

                donorPicker.set_value(selectedDonor.full_name);
                models[1].values.donor = selectedDonor.name;
                models[1].values.donor_name = selectedDonor.full_name;
            }

            if (i === 1) transferAfterDonation();
            else if (i === 2) transferAfterProcessing();
            else if (i === 0) {
                notify(`تم حفظ المتبرع بنجاح. رقم السجل: ${saved.name}`, "success");
            } else {
                notify(`تم حفظ وحدة الدم بنجاح. رقم السجل: ${saved.name}`, "success");
            }
            // BB_IW_REFRESH_ACTIONS_AFTER_SAVE_V4
            // إعادة تحميل إجراءات السجل الذي تم حفظه بنجاح.
            await openCardActions(i);
        } catch (error) {
            console.error(`Failed saving ${doctype}:`, error);
            notify(`تعذر حفظ ${doctype}: ${readableError(error)}`, "error");
        } finally {
            button.disabled = false;
            button.textContent = oldLabel;
        }
    }

    function transferEligibleRecords() {
        // الانتقال من التبرع إلى المعالجة بعد الحجر فقط.
        if (
            models[1]?.name &&
            models[1].values.donation_status === "Quarantine"
        ) {
            const donation = models[1].values;
            const moved = transferValues(2, {
                blood_donation: models[1].name,
                donor: donation.donor,
                donor_name: donation.donor_name,
                bag_number: donation.bag_number,
                volume_collected: donation.volume_collected,
                collection_unit: donation.collection_unit,
                processing_date: donation.donation_date
            });

            if (moved) {
                renderFields(2);
                activateWindow(2);
            }
        }

        // الانتقال من المعالجة إلى وحدة الدم بعد فصل المكونات.
        if (
            models[2]?.name &&
            models[2].values.processing_status === "Component Separation"
        ) {
            const processing = models[2].values;
            const moved = transferValues(3, {
                blood_processing: models[2].name,
                blood_donation: processing.blood_donation,
                donor: processing.donor,
                donor_name: processing.donor_name,
                bag_number: processing.bag_number,
                volume: processing.volume_collected,
                volume_unit: processing.collection_unit,
                blood_group: processing.blood_group
            });

            if (moved) {
                renderFields(3);
                activateWindow(3);
            }
        }
    }

    async function refreshRecords() {
        if (!ready) {
            notify("لم تكتمل تهيئة الحقول بعد.", "warning");
            return;
        }

        let refreshed = 0;
        let skipped = 0;

        for (let i = 0; i < doctypes.length; i++) {
            const model = models[i];

            if (!model.name || model.dirty) {
                skipped++;
                continue;
            }

            try {
                const response = await frappe.call({
                    method: "blood_bank.blood_bank.page.blood_bank_initial_work.blood_bank_initial_work.get_initial_work_document",
                    args: { doctype: doctypes[i], name: model.name }
                });

                model.values = { ...model.values, ...(response.message || {}) };
                renderFields(i);
                refreshed++;
            } catch (error) {
                console.error("Refresh failed:", doctypes[i], error);
                skipped++;
            }
        }

        transferEligibleRecords();
        notify(`اكتمل التحديث: ${refreshed} سجل، وتم تجاوز ${skipped} نموذج جديد أو معدل.`, skipped ? "warning" : "success");
    }


    // BB_INITIAL_WORK_REPORT_LOADER_V1
    async function loadInitialWorkReportSelection() {
        const key = "bb_initial_work_report_selection";
        let raw;

        try {
            raw = window.sessionStorage.getItem(key);
        } catch (error) {
            return;
        }

        if (!raw || !ready) return;

        let selection;
        try {
            selection = JSON.parse(raw);
        } catch (error) {
            window.sessionStorage.removeItem(key);
            notify("بيانات السجل المختار من التقرير غير صالحة.", "error");
            return;
        }

        const index = doctypes.indexOf(String(selection.doctype || ""));
        if (
            index < 0 ||
            !selection.name ||
            typeof selection.name !== "string"
        ) {
            window.sessionStorage.removeItem(key);
            notify("نوع السجل المختار غير مدعوم في نافذة العمل الأولية.", "warning");
            return;
        }

        if (models.some(model => model.dirty)) {
            window.sessionStorage.removeItem(key);
            notify(
                "لم يتم فتح سجل التقرير لأن هناك تعديلات غير محفوظة. احفظها أولًا ثم أعد فتح السجل.",
                "warning"
            );
            return;
        }

        try {
            const response = await frappe.call({
                method: "blood_bank.blood_bank.page.blood_bank_initial_work.blood_bank_initial_work.get_initial_work_document",
                args: {
                    doctype: selection.doctype,
                    name: selection.name
                }
            });

            const doc = response.message;
            if (!doc || doc.name !== selection.name) {
                window.sessionStorage.removeItem(key);
                notify("تعذر العثور على السجل المختار أو قراءته.", "error");
                return;
            }

            initializeModels();
            selectedDonor = null;
            selectedDonorProfile = null;
            pendingDonorProfileName = "";
            pendingDonorName = "";

            if (donorPicker) {
                donorPicker.set_value("");
                if (donorPicker.$input) {
                    donorPicker.$input.val("");
                }
            }

            const model = models[index];
            model.name = doc.name;
            model.values = { ...model.values, ...doc };
            model.dirty = false;

            if (index === 0) {
                selectedDonorProfile = {
                    name: doc.name,
                    full_name: doc.full_name || doc.name
                };
                selectedDonor = selectedDonorProfile;
                models[1].values.donor = doc.name;
                models[1].values.donor_name = selectedDonorProfile.full_name;
            } else if (index === 1 && doc.donor) {
                selectedDonor = {
                    name: doc.donor,
                    full_name: doc.donor_name || doc.donor
                };
            }

            renderAllFields();

            if (donorPicker) {
                const pickedName = index === 0
                    ? (doc.full_name || "")
                    : (index === 1 ? (doc.donor_name || "") : "");

                donorPicker.set_value(pickedName);
                if (donorPicker.$input) {
                    donorPicker.$input.val(pickedName);
                }
            }

            if (index === 0 && selectedDonorProfile) {
                loadDonorHistory(selectedDonorProfile);
            }

            activateWindow(index);
            transferEligibleRecords();
            window.sessionStorage.removeItem(key);

            notify(
                `تم تحميل ${windowTitles[index]} — ${doc.name} داخل نافذة العمل الأولية.`,
                "success"
            );
        } catch (error) {
            console.error("Initial work report record load failed:", error);
            window.sessionStorage.removeItem(key);
            notify(
                "تعذر تحميل السجل داخل الواجهة. تحقق من الصلاحيات وسجل الأخطاء.",
                "error"
            );
        }
    }

    root.__bbLoadReportSelection = loadInitialWorkReportSelection;


    /* BB_INITIAL_WORK_ALERT_RESTORE_V1 */
    const bbInitialPage = frappe.pages["blood-bank-initial-work"];
    if (bbInitialPage && !bbInitialPage.__bbAlertShowHook) {
        const bbPreviousInitialShow = bbInitialPage.on_page_show;
        bbInitialPage.on_page_show = function () {
            if (typeof bbPreviousInitialShow === "function") {
                bbPreviousInitialShow.apply(this, arguments);
            }
            loadInitialWorkReportSelection();
        };
        bbInitialPage.__bbAlertShowHook = true;
    }


    /* BB_IW_ACTIONS_DROPDOWN_V1 */
    async function openCardActions(i) {
        if (!Number.isInteger(i) || i < 0 || i > 3) {
            return;
        }

        const button = root.querySelector("#iw-actions-active");
        const menu = root.querySelector("#iw-actions-menu");

        if (!menu) {
            notify("تعذر العثور على منطقة إجراءات سير العمل.", "error");
            return;
        }

        menu.dataset.window = String(i);
        menu.hidden = false;

        if (button) {
            button.setAttribute("aria-expanded", "false");
        }

        const $menu = $(menu);
        $menu.off(".bbIwWorkflowDropdown");

        const model = models[i];

        const statusFields = [
            "donor_status",
            "donation_status",
            "processing_status",
            "unit_status"
        ];

        const actionLabels = [
            {
                "Start Assessment": "بدء تقييم المتبرع",
                "Mark Eligible": "اعتماد أهلية المتبرع",
                "Defer": "تأجيل المتبرع",
                "Reject": "رفض المتبرع",
                "Mark Ready for Donation": "اعتماد جاهزية التبرع"
            },
            {
                "Schedule Donation": "جدولة التبرع",
                "Check In": "تسجيل حضور المتبرع",
                "Start Bleeding": "بدء سحب الدم",
                "Complete Collection": "إكمال جمع الدم",
                "Send to Quarantine": "إرسال التبرع إلى الحجر",
                "Cancel Donation": "إلغاء التبرع",
                "Abort Collection": "إيقاف عملية جمع الدم"
            },
            {
                "Start Processing": "بدء المعالجة",
                "Start Component Separation": "بدء فصل مكونات الدم"
            },
            {
                "Send to Quarantine": "إرسال وحدة الدم إلى الحجر"
            }
        ];

        const translateAction = action =>
            (actionLabels[i] || {})[action] || action;

        const knownActionNames = Object.keys(actionLabels[i] || {});

        function renderReadOnlyActions(message) {
            const buttonsHtml = knownActionNames.map(action => `
                <button
                  type="button"
                  class="btn btn-default btn-sm bb-iw-workflow-action"
                  disabled
                  aria-disabled="true"
                  title="${esc(message)}">
                  ${esc(translateAction(action))}
                </button>
            `).join("");

            menu.hidden = false;
            menu.innerHTML = `
                <div class="bb-iw-action-toolbar-buttons">
                  ${buttonsHtml}
                </div>
                <div class="bb-iw-actions-menu-message">${esc(message)}</div>
            `;
        }

        if (i === 1 && !model?.name) {
            const donorName = model?.values?.donor || selectedDonor?.name;

            if (!donorName) {
                menu.innerHTML = `
                    <div class="bb-iw-actions-menu-message">
                        احفظ المتبرع أولًا وأكمل إجراءات أهليته واعتماد جاهزيته.
                    </div>`;
                return;
            }

            let donorDoc = null;
            try {
                const donorResponse = await frappe.call({
                    method: "frappe.client.get",
                    args: { doctype: doctypes[0], name: donorName }
                });
                donorDoc = donorResponse.message;
            } catch (error) {
                console.error("Unable to verify donor readiness:", error);
                menu.innerHTML = `
                    <div class="bb-iw-actions-menu-message">
                        تعذر التحقق من حالة المتبرع المحفوظة. حدّث البيانات وحاول مجددًا.
                    </div>`;
                return;
            }

            if (!donorDoc || donorDoc.donor_status !== "Ready for Donation") {
                menu.innerHTML = `
                    <div class="bb-iw-actions-menu-message">
                        إجراءات التبرع غير متاحة قبل اعتماد جاهزية المتبرع.
                        الحالة الحالية:
                        <strong>${esc(donorDoc?.donor_status || "غير محددة")}</strong>
                    </div>`;
                return;
            }
        }

        if (!model || !model.name) {
            renderReadOnlyActions(
                "احفظ السجل أولًا؛ لا يمكن تنفيذ الإجراءات على سجل جديد."
            );
            return;
        }

        if (model.dirty) {
            renderReadOnlyActions(
                "توجد تعديلات غير محفوظة. احفظ السجل قبل تنفيذ أي إجراء."
            );
            return;
        }

        renderReadOnlyActions("جارٍ تحميل الإجراءات المتاحة لهذا السجل...");

        let savedDoc = null;
        let transitions = [];
        let pendingTransition = null;
        let applying = false;
        let summaryHtml = "";

        try {
            // قراءة السجل المحفوظ قبل تحميل الإجراءات.
            const documentResponse = await frappe.call({
                method: "frappe.client.get",
                args: {
                    doctype: doctypes[i],
                    name: model.name
                }
            });

            savedDoc = documentResponse.message;

            if (!savedDoc || !savedDoc.name) {
                throw new Error("تعذر تحميل السجل المحفوظ.");
            }

            const transitionResponse = await frappe.call({
                method: "frappe.model.workflow.get_transitions",
                args: {
                    doc: savedDoc
                }
            });

            transitions = Array.isArray(transitionResponse.message)
                ? transitionResponse.message
                : [];

            // مزامنة البيانات المحلية مع السجل المحفوظ.
            model.name = savedDoc.name;
            model.values = { ...model.values, ...savedDoc };
            model.dirty = false;
            updateRecordId(i);

            const currentStatus =
                savedDoc[statusFields[i]] || "غير محددة";

            summaryHtml = `
                <div class="bb-iw-actions-menu-summary">
                    <div>
                        <span>نوع السجل</span>
                        <strong>${esc(doctypes[i])}</strong>
                    </div>
                    <div>
                        <span>رقم السجل</span>
                        <strong>${esc(savedDoc.name)}</strong>
                    </div>
                    <div>
                        <span>الحالة الحالية</span>
                        <strong>${esc(currentStatus)}</strong>
                    </div>
                </div>`;

            function renderActions() {
                const transitionIndexByAction = new Map();

                transitions.forEach((transition, index) => {
                    const action = String(transition.action || "");
                    if (action && !transitionIndexByAction.has(action)) {
                        transitionIndexByAction.set(action, index);
                    }
                });

                const actionNames = [...new Set([
                    ...knownActionNames,
                    ...transitions
                        .map(transition => String(transition.action || ""))
                        .filter(Boolean)
                ])];

                const buttonsHtml = actionNames.map(action => {
                    const enabled = transitionIndexByAction.has(action);
                    const index = enabled
                        ? transitionIndexByAction.get(action)
                        : "";

                    return `
                        <button
                          type="button"
                          class="btn ${enabled ? "btn-primary" : "btn-default"} btn-sm bb-iw-workflow-action"
                          data-action-index="${index}"
                          ${enabled ? "" : 'disabled aria-disabled="true"'}
                          title="${esc(enabled
                              ? "إجراء متاح حسب حالة السجل والصلاحيات"
                              : "إجراء غير متاح حاليًا أو غير مسموح للمستخدم")}">
                          ${esc(translateAction(action))}
                        </button>`;
                }).join("");

                const unavailableHtml = transitions.length
                    ? ""
                    : `<div class="bb-iw-actions-menu-message">
                         لا توجد إجراءات انتقال متاحة للحالة الحالية أو للمستخدم.
                       </div>`;

                menu.hidden = false;
                menu.innerHTML = summaryHtml + `
                    <div class="bb-iw-action-toolbar-buttons">
                      ${buttonsHtml}
                    </div>
                    ${unavailableHtml}
                    <div id="iw-actions-confirmation"></div>`;
            }

            function renderConfirmation(transition) {
                const host = menu.querySelector("#iw-actions-confirmation");
                if (!host) return;

                host.innerHTML = `
                    <div class="bb-iw-actions-menu-confirm">
                      <strong>تأكيد تنفيذ الإجراء</strong>
                      <p>
                        هل تريد تنفيذ
                        «${esc(translateAction(transition.action))}»
                        على السجل
                        <b>${esc(savedDoc.name)}</b>؟
                      </p>
                      <div class="bb-iw-actions-menu-confirm-buttons">
                        <button
                          type="button"
                          class="btn btn-primary btn-sm bb-iw-workflow-confirm">
                          تأكيد التنفيذ
                        </button>
                        <button
                          type="button"
                          class="btn btn-default btn-sm bb-iw-workflow-cancel">
                          رجوع
                        </button>
                      </div>
                    </div>`;
            }

            renderActions();

            $menu.on(
                "click.bbIwWorkflowDropdown",
                ".bb-iw-workflow-action",
                function () {
                    const index = Number(
                        this.getAttribute("data-action-index")
                    );
                    const transition = transitions[index];

                    if (!transition || !transition.action || applying) {
                        return;
                    }

                    pendingTransition = transition;
                    renderConfirmation(transition);
                }
            );

            $menu.on(
                "click.bbIwWorkflowDropdown",
                ".bb-iw-workflow-cancel",
                function () {
                    if (applying) return;
                    pendingTransition = null;
                    renderActions();
                }
            );

            $menu.on(
                "click.bbIwWorkflowDropdown",
                ".bb-iw-workflow-confirm",
                async function () {
                    if (applying || !pendingTransition) {
                        return;
                    }

                    applying = true;

                    const transition = pendingTransition;
                    const action = transition.action;
                    const arabic = translateAction(action);
                    const confirmButton = this;

                    confirmButton.disabled = true;
                    confirmButton.textContent = "جارٍ التنفيذ...";

                    let applied = false;

                    try {
                        // تنفيذ انتقال Frappe الحقيقي مع فحص الصلاحيات والحالة.
                        await frappe.call({
                            method: "frappe.model.workflow.apply_workflow",
                            args: {
                                doc: savedDoc,
                                action: action
                            }
                        });

                        applied = true;

                        const refreshedResponse = await frappe.call({
                            method: "frappe.client.get",
                            args: {
                                doctype: doctypes[i],
                                name: savedDoc.name
                            }
                        });

                        const saved = refreshedResponse.message;

                        if (!saved || !saved.name) {
                            throw new Error(
                                "تم إرسال الإجراء، لكن تعذرت إعادة تحميل السجل."
                            );
                        }

                        model.name = saved.name;
                        model.values = { ...model.values, ...saved };
                        model.dirty = false;
                        savedDoc = saved;
                        updateRecordId(i);

                        // الحفاظ على الربط بين المتبرع والتبرع.
                        if (i === 0) {
                            selectedDonor = {
                                name: saved.name,
                                full_name:
                                    saved.full_name ||
                                    model.values.full_name ||
                                    ""
                            };

                            selectedDonorProfile = {
                                name: selectedDonor.name,
                                full_name: selectedDonor.full_name
                            };

                            pendingDonorProfileName = "";

                            models[1].values.donor = saved.name;
                            models[1].values.donor_name =
                                selectedDonor.full_name;

                            if (donorPicker) {
                                donorPicker.set_value(
                                    selectedDonor.full_name
                                );
                            }
                        }

                        /* BB_AUTO_ADVANCE_DONOR_TO_DONATION_V1 */
                        if (
                            i === 0 &&
                            action === "Mark Ready for Donation" &&
                            saved.donor_status === "Ready for Donation"
                        ) {
                            const target = models[1];
                            const targetDonor = target?.values?.donor;

                            const safeToAdvance =
                                target &&
                                !target.name &&
                                (!target.dirty || targetDonor === saved.name);

                            if (safeToAdvance) {
                                target.values.donor = saved.name;
                                target.values.donor_name =
                                    saved.full_name ||
                                    selectedDonor?.full_name ||
                                    "";

                                renderFields(1);
                                activateWindow(1);

                                notify(
                                    "تم اعتماد جاهزية المتبرع والانتقال تلقائيًا إلى نافذة التبرع.",
                                    "success"
                                );
                            } else {
                                notify(
                                    "لم يتم الانتقال تلقائيًا لحماية بيانات نافذة التبرع الحالية. راجع السجل والتعديلات أولًا.",
                                    "warning"
                                );
                            }
                        }

                        // إبقاء آليات نقل البيانات الحالية كما هي.
                        if (i === 1) {
                            transferAfterDonation();
                        } else if (i === 2) {
                            transferAfterProcessing();
                        }

                        pendingTransition = null;
                        menu.hidden = false;
                        if (button) {
                            button.setAttribute("aria-expanded", "false");
                        }

                        notify(
                            `تم تنفيذ «${arabic} | ${action}» بنجاح. ` +
                            `الحالة الحالية: ${saved[statusFields[i]] || "—"}`,
                            "success"
                        );

                        await openCardActions(activeWindow);
                    } catch (error) {
                        console.error(
                            `Workflow action failed for ${doctypes[i]}:`,
                            error
                        );

                        if (applied) {
                            menu.hidden = true;
                            button.setAttribute("aria-expanded", "false");
                            notify(
                                "تم تنفيذ الإجراء، لكن تعذّر تحديث بيانات الصفحة. استخدم «تحديث البيانات» قبل متابعة العمل.",
                                "warning"
                            );
                        } else {
                            pendingTransition = null;
                            renderActions();
                            notify(
                                `تعذر تنفيذ الإجراء: ${readableError(error)}`,
                                "error"
                            );
                        }
                    } finally {
                        applying = false;
                    }
                }
            );
        } catch (error) {
            console.error(
                `Unable to load workflow transitions for ${doctypes[i]}:`,
                error
            );

            renderReadOnlyActions(
                "تعذر تحميل إجراءات سير العمل: " + readableError(error)
            );
        }
    }

    function activateWindow(index) {
        const parsed = Number(index);
        if (!Number.isInteger(parsed) || parsed < 0 || parsed > 3) {
            return;
        }

        activeWindow = parsed;
        const activeGroup = Math.floor(activeWindow / 2);
        const groupTab = activeGroup * 2;

        root.querySelectorAll("[data-tab]").forEach(button => {
            button.classList.toggle(
                "is-active",
                Number(button.dataset.tab) === groupTab
            );
        });

        root.querySelectorAll("[data-screen]").forEach(screen => {
            screen.hidden =
                Number(screen.dataset.screen) !== activeGroup;
        });

        root.querySelectorAll(".bb-iw-card[data-window]").forEach(card => {
            card.hidden =
                Math.floor(Number(card.dataset.window) / 2) !== activeGroup;
        });

        const title = root.querySelector("#iw-active-window-title");
        if (title) title.textContent = windowTitles[activeWindow];

        const saveButton = root.querySelector("#iw-save-active");
        if (saveButton) {
            saveButton.textContent =
                `💾 حفظ | Save — ${windowTitles[activeWindow]}`;
        }

        if (ready && Array.isArray(models) && models.length === 4) {
            void openCardActions(activeWindow);
        }
    }

    function resetNew() {
        if (!ready) {
            notify("انتظر حتى تكتمل تهيئة الصفحة.", "warning");
            return;
        }

        // نقرأ النص المحفوظ قبل إفراغ حقل البحث.
        const profileTypedName = selectedDonorProfile
            ? ""
            : String(
                pendingDonorProfileName ||
                models[0]?.controls?.full_name?.$input?.val() ||
                models[0]?.controls?.full_name?.get_value() ||
                ""
            ).trim();

        const donationTypedName = selectedDonor
            ? ""
            : String(
                pendingDonorName ||
                donorPicker?.$input?.val() ||
                donorPicker?.get_value() ||
                ""
            ).trim();

        const typedName = profileTypedName || donationTypedName;

        const hasWork = models.some(model => model.name || model.dirty);

        if (hasWork && !window.confirm(
            "سيتم إفراغ البطاقات الحالية وفتح سجلات جديدة. السجلات المحفوظة ستبقى محفوظة. متابعة؟"
        )) {
            return;
        }

        initializeModels();
        selectedDonor = null;
        selectedDonorProfile = null;
        pendingDonorProfileName = "";
        pendingDonorName = "";

        const options = root.querySelector("#iw-donor-options");
        if (options) {
            options.hidden = true;
            options.replaceChildren();
        }

        renderAllFields();

        donorPicker.set_value("");
        if (donorPicker.$input) {
            donorPicker.$input.val("");
        }

        if (typedName) {
            // نقل الاسم إلى حقل المتبرع الحقيقي، دون حفظه تلقائيًا.
            setFieldValue(0, "full_name", typedName);
            models[0].dirty = true;

            root.querySelector('[data-tab="0"]').click();

            notify(
                `تم نقل الاسم «${typedName}» إلى حقل الاسم الكامل في بطاقة المتبرع. اضغط «حفظ المتبرع» لاعتماده.`,
                "success"
            );
        } else {
            notify("تم تجهيز بطاقات جديدة.", "success");
        }
    }

    async function showUnits() {
        const dialog = new frappe.ui.Dialog({
            title: __("قائمة وحدات الدم"),
            size: "large",
            fields: [{ fieldtype: "HTML", fieldname: "units" }],
            primary_action_label: __("إغلاق"),
            primary_action() { this.hide(); }
        });

        dialog.show();

        try {
            const response = await frappe.call({
                method: "blood_bank.blood_bank.page.blood_bank_initial_work.blood_bank_initial_work.get_initial_work_recent_units"
            });

            const rows = (response.message || []).map(unit =>
                `<tr>
                    <td>${esc(unit.name)}</td>
                    <td>${esc(unit.blood_donation || "")}</td>
                    <td>${esc(unit.donor_name || "")}</td>
                    <td>${esc(unit.unit_status || "")}</td>
                </tr>`
            ).join("");

            dialog.fields_dict.units.$wrapper.html(`
                <table class="table table-bordered">
                    <thead><tr><th>رقم الوحدة</th><th>رقم التبرع</th><th>المتبرع</th><th>الحالة</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            `);
        } catch (error) {
            console.error(error);
            dialog.fields_dict.units.$wrapper.text("تعذر تحميل قائمة وحدات الدم.");
        }
    }

    root.addEventListener("click", event => {
        const tab = event.target.closest("[data-tab]");
        if (tab) {
            activateWindow(Number(tab.dataset.tab));
            return;
        }

        if (event.target.closest("#iw-actions-active")) {
            openCardActions(activeWindow);
            return;
        }

        if (event.target.closest("#iw-save-active")) {
            saveCard(activeWindow);
        }
    });

    root.addEventListener("focusin", event => {
        const card = event.target.closest(".bb-iw-card[data-window]");
        if (!card) return;

        const cardIndex = Number(card.dataset.window);
        if (Math.floor(cardIndex / 2) === Math.floor(activeWindow / 2)
            && cardIndex !== activeWindow) {
            activateWindow(cardIndex);
        }
    });

    activateWindow(0);

    root.querySelector("#iw-new").addEventListener("click", resetNew);
    root.querySelector("#iw-refresh").addEventListener("click", refreshRecords);
    root.querySelector("#iw-units").addEventListener("click", showUnits);

    // BB_GLOBAL_NAV_HANDLER
    root.addEventListener("click", function(event) {
        const clicked = event.target && event.target.closest
            ? event.target : null;
        const button = clicked && clicked.closest
            ? clicked.closest(".bb-bb-nav-button[data-bb-target]") : null;
        if (!button || !root.contains(button)) return;

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


    try {
        setupDonorPicker();

        const response = await frappe.call({
            method: "blood_bank.blood_bank.page.blood_bank_initial_work.blood_bank_initial_work.get_initial_work_metadata"
        });

        metadata = response.message || {};
        initializeModels();

        // تحميل تعريفات DocTypes وروابطها حتى تعمل عناصر Frappe الأصلية.
        const linkTargets = [];
        doctypes.forEach(doctype => {
            getFields(doctype).forEach(field => {
                if (field.fieldtype === "Link" && field.options) linkTargets.push(field.options);
            });
        });

        const doctypesToLoad = [...new Set([...doctypes, ...linkTargets])];
        await Promise.all(doctypesToLoad.map(doctype => new Promise(resolve => {
            frappe.model.with_doctype(doctype, resolve);
        })));

        renderAllFields();
        ready = true;
        await loadInitialWorkReportSelection();
          await openCardActions(activeWindow);
        notify("جاهز للاستخدام. الحقول الآن من عناصر Frappe الأصلية، ولكل بطاقة زر حفظ مستقل.", "success");
    } catch (error) {
        console.error("Blood Bank page initialization failed:", error);
        notify(`تعذر تجهيز الواجهة: ${readableError(error)}`, "error");
    }
};



// BB_INITIAL_WORK_REPORT_PAGE_SHOW_V1
frappe.pages["blood-bank-initial-work"].on_page_show = function(wrapper) {
    const host = wrapper && wrapper[0] ? wrapper[0] : wrapper;
    const root = host && host.querySelector
        ? host.querySelector(".bb-iw-root")
        : null;

    if (root && typeof root.__bbLoadReportSelection === "function") {
        root.__bbLoadReportSelection().catch(error => {
            console.error("Initial work report selection:", error);
        });
    }
};
