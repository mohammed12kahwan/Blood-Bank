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
            "eligibility_status", "abo_group", "rh_factor",
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
        const df = {
            ...field,
            fieldname,
            fieldtype: field.fieldtype,
            label: field.label || fieldname,
            reqd: isTrue(field.reqd) ? 1 : 0,
            read_only: isTrue(field.read_only) ? 1 : 0,
            hidden: 0
        };

        const control = frappe.ui.form.make_control({
            parent: $(holder),
            df,
            render_input: true
        });

        control.refresh();

        const initialValue = model.values[fieldname];
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


    function renderFields(i) {
        const holder = root.querySelector(`#iw-fields-${i}`);
        holder.replaceChildren();

        models[i].controls = {};
        fieldsFor(i).forEach(field => {
            holder.appendChild(renderOneField(i, field));
        });

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

            const rowsHtml = rows.map(d => `
                <tr>
                    <td>${esc(d.name)}</td>
                    <td>${esc(d.donation_date || "—")}</td>
                    <td>${esc(d.donation_type || "—")}</td>
                    <td>${esc(d.donation_status || "—")}</td>
                    <td>${esc(d.bag_number || "—")}</td>
                    <td>${esc(d.volume_collected ?? "—")}</td>
                </tr>`).join("");

            panel.innerHTML = `
                <strong>التبرعات السابقة (${rows.length})</strong>
                <div class="bb-iw-history-table-wrap">
                  <table class="bb-iw-history-table">
                    <thead><tr><th>رقم التبرع</th><th>التاريخ</th><th>النوع</th>
                    <th>الحالة</th><th>رقم الكيس</th><th>الحجم</th></tr></thead>
                    <tbody>${rowsHtml}</tbody>
                  </table>
                </div>
                <div class="bb-iw-history-body">${
                    filled.length
                    ? "عُبئت الحقول الفارغة من أحدث تبرع: " + filled.map(esc).join("، ")
                    : "التاريخ ورقم الكيس والحجم لا تُنسخ من تبرع سابق."
                }</div>`;
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

        if (model.name || model.dirty) {
            notify(
                `لم تُستبدل بيانات بطاقة ${doctypes[target]} لأن بها سجلًا محفوظًا أو تعديلات غير محفوظة.`,
                "warning"
            );
            return false;
        }

        const targetFields = new Set(getFields(doctypes[target]).map(f => f.fieldname));

        Object.entries(values).forEach(([fieldname, value]) => {
            if (!targetFields.has(fieldname)) return;
            if (value === undefined || value === null || value === "") return;
            setFieldValue(target, fieldname, value);
        });

        model.dirty = false;
        return true;
    }

    function transferAfterDonation() {
        const donation = models[1].values;
        const status = donation.donation_status;

        if (status !== "Quarantine") {
            notify(
                `تم حفظ التبرع. حالته الحالية: ${status || "غير محددة"}. لن تُنقل البيانات إلى المعالجة حتى تصل إلى حالة Quarantine عبر سير العمل.`,
                "success"
            );
            return;
        }

        transferValues(2, {
            blood_donation: models[1].name,
            donor: donation.donor,
            donor_name: donation.donor_name,
            bag_number: donation.bag_number,
            volume_collected: donation.volume_collected,
            collection_unit: donation.collection_unit,
            processing_date: donation.donation_date
        });

        notify("تم حفظ التبرع ونقل البيانات المتاحة إلى بطاقة المعالجة.", "success");
    }

    function transferAfterProcessing() {
        const processing = models[2].values;
        const status = processing.processing_status;

        if (status !== "Component Separation") {
            notify(
                `تم حفظ المعالجة. حالتها الحالية: ${status || "غير محددة"}. لن تُنقل البيانات إلى وحدة الدم حتى تكتمل مرحلة فصل المكونات.`,
                "success"
            );
            return;
        }

        transferValues(3, {
            blood_donation: processing.blood_donation,
            donor: processing.donor,
            donor_name: processing.donor_name,
            bag_number: processing.bag_number,
            volume: processing.volume_collected,
            volume_unit: processing.collection_unit,
            blood_group: processing.blood_group
        });

        notify("تم حفظ المعالجة ونقل البيانات المتاحة إلى بطاقة وحدة الدم.", "success");
    }

    async function saveCard(i) {
        if (!ready) {
            notify("لم تكتمل تهيئة الحقول بعد. حدّث الصفحة وانتظر ظهور رسالة الجاهزية.", "warning");
            return;
        }

        const doctype = doctypes[i];
        const model = models[i];

        if (i === 1) {
            if (!selectedDonor?.name && !model.values.donor) {
                notify(
                    "اختر متبرعًا من قائمة الاسم الكامل أولًا. لإنشاء متبرع جديد، اكتب اسمه واضغط «إضافة جديد»، ثم احفظ بطاقة المتبرع.",
                    "warning"
                );
                return;
            }
        }

        const payload = getDocumentPayload(i);

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
        } catch (error) {
            console.error(`Failed saving ${doctype}:`, error);
            notify(`تعذر حفظ ${doctype}: ${readableError(error)}`, "error");
        } finally {
            button.disabled = false;
            button.textContent = oldLabel;
        }
    }

    function transferEligibleRecords() {
        // لا نغيّر حالات المستندات؛ النقل يتم فقط بعد بلوغ الحالة المطلوبة.
        if (models[1]?.name && models[1].values.donation_status === "Quarantine") {
            transferValues(2, {
                blood_donation: models[1].name,
                donor: models[1].values.donor,
                donor_name: models[1].values.donor_name,
                bag_number: models[1].values.bag_number,
                volume_collected: models[1].values.volume_collected,
                collection_unit: models[1].values.collection_unit,
                processing_date: models[1].values.donation_date
            });
        }

        if (models[2]?.name && models[2].values.processing_status === "Component Separation") {
            transferValues(3, {
                blood_donation: models[2].values.blood_donation,
                donor: models[2].values.donor,
                donor_name: models[2].values.donor_name,
                bag_number: models[2].values.bag_number,
                volume: models[2].values.volume_collected,
                volume_unit: models[2].values.collection_unit,
                blood_group: models[2].values.blood_group
            });
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

    async function openCardActions(i) {
        const model = models[i];

        if (!model || !model.name) {
            frappe.msgprint(
                __("احفظ السجل أولًا قبل تنفيذ إجراءات سير العمل.")
            );
            return;
        }

        if (model.dirty) {
            frappe.msgprint(
                __("لديك تغييرات غير محفوظة. احفظ السجل أولًا قبل تنفيذ إجراء سير العمل.")
            );
            return;
        }

        if (!Number.isInteger(i) || i < 0 || i > 3) {
            return;
        }

        const doctype = doctypes[i];
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

        const dialog = new frappe.ui.Dialog({
            title: `${windowTitles[i]} — الإجراءات | Actions`,
            fields: [
                {
                    fieldtype: "HTML",
                    fieldname: "workflow_actions"
                }
            ],
            primary_action_label: __("فتح النموذج القياسي | Open Standard Form"),
            primary_action() {
                dialog.hide();
                frappe.set_route("Form", doctype, model.name);
            }
        });

        dialog.show();

        const $content = dialog.fields_dict.workflow_actions.$wrapper;
        $content.html(
            '<div class="text-muted">جارٍ تحميل الإجراءات... | Loading workflow actions...</div>'
        );

        try {
            // اقرأ السجل المحفوظ أولًا حتى تُحسب الانتقالات من حالته الحقيقية.
            const documentResponse = await frappe.call({
                method: "frappe.client.get",
                args: {
                    doctype: doctype,
                    name: model.name
                }
            });

            const doc = documentResponse.message;

            if (!doc || !doc.name) {
                throw new Error("تعذر تحميل السجل المحفوظ.");
            }

            const transitionResponse = await frappe.call({
                method: "frappe.model.workflow.get_transitions",
                args: {
                    doc: doc
                }
            });

            const transitions = Array.isArray(transitionResponse.message)
                ? transitionResponse.message
                : [];

            // حدّث النسخة المحلية من البيانات المحفوظة فقط.
            model.name = doc.name;
            model.values = { ...model.values, ...doc };
            model.dirty = false;
            updateRecordId(i);

            const currentStatus =
                doc[statusFields[i]] || "غير محددة | Not specified";

            const summary = `
                <div class="mb-3 p-3 border rounded">
                    <div>
                        <strong>نوع السجل | Document:</strong>
                        ${esc(doctype)}
                    </div>
                    <div>
                        <strong>رقم السجل | Record ID:</strong>
                        ${esc(doc.name)}
                    </div>
                    <div>
                        <strong>الحالة الحالية | Current status:</strong>
                        ${esc(currentStatus)}
                    </div>
                </div>
            `;

            const actionsHtml = transitions.length
                ? `
                    <div class="bb-iw-workflow-actions">
                        ${transitions.map((transition, index) => {
                            const action = String(transition.action || "");
                            const arabic = translateAction(action);
                            const nextState = String(
                                transition.next_state || ""
                            );

                            return `
                                <div class="bb-iw-workflow-action-row border rounded p-3 mb-2">
                                    <div class="mb-2">
                                        <strong>${esc(arabic)}</strong>
                                        <div class="text-muted">${esc(action)}</div>
                                        ${
                                            nextState
                                                ? `<small>الحالة التالية | Next state: ${esc(nextState)}</small>`
                                                : ""
                                        }
                                    </div>
                                    <button
                                        type="button"
                                        class="btn btn-primary btn-sm bb-iw-workflow-action"
                                        data-action-index="${index}">
                                        تنفيذ الإجراء | Apply Action
                                    </button>
                                </div>
                            `;
                        }).join("")}
                    </div>
                `
                : `
                    <div class="alert alert-info">
                        لا توجد إجراءات انتقال متاحة لهذه الحالة أو للمستخدم الحالي.
                        <br>
                        No workflow actions are available for this state or user.
                    </div>
                `;

            $content.html(summary + actionsHtml);

            $content.off(
                "click.bbIwWorkflow",
                ".bb-iw-workflow-action"
            );

            $content.on(
                "click.bbIwWorkflow",
                ".bb-iw-workflow-action",
                function () {
                    const index = Number(
                        this.getAttribute("data-action-index")
                    );

                    const transition = transitions[index];

                    if (!transition || !transition.action) {
                        return;
                    }

                    const $button = $(this);
                    if ($button.prop("disabled")) {
                        return;
                    }

                    const arabic = translateAction(transition.action);

                    frappe.confirm(
                        `هل تريد تنفيذ «${arabic} | ${transition.action}» على السجل ${model.name}؟`,
                        async () => {
                            if ($button.prop("disabled")) {
                                return;
                            }

                            $button
                                .prop("disabled", true)
                                .text("جارٍ التنفيذ... | Applying...");

                            let applied = false;

                            try {
                                // يستخدم Frappe انتقال سير العمل الحقيقي
                                // ويعيد التحقق من الصلاحيات والحالة على الخادم.
                                await frappe.call({
                                    method: "frappe.model.workflow.apply_workflow",
                                    args: {
                                        doc: doc,
                                        action: transition.action
                                    }
                                });

                                applied = true;

                                const refreshedResponse = await frappe.call({
                                    method: "frappe.client.get",
                                    args: {
                                        doctype: doctype,
                                        name: model.name
                                    }
                                });

                                const saved = refreshedResponse.message;

                                if (!saved || !saved.name) {
                                    throw new Error(
                                        "تم تنفيذ الطلب، لكن تعذّر إعادة تحميل السجل."
                                    );
                                }

                                model.name = saved.name;
                                model.values = {
                                    ...model.values,
                                    ...saved
                                };
                                model.dirty = false;
                                updateRecordId(i);

                                // حافظ على الربط بين المتبرع والتبرع.
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

                                // النقل مشروط بحالات سير العمل كما في منطق الحفظ.
                                if (i === 1) {
                                    transferAfterDonation();
                                } else if (i === 2) {
                                    transferAfterProcessing();
                                }

                                dialog.hide();

                                notify(
                                    `تم تنفيذ الإجراء «${arabic} | ${transition.action}» بنجاح. ` +
                                    `الحالة الحالية: ${saved[statusFields[i]] || "—"}`,
                                    "success"
                                );
                            } catch (error) {
                                console.error(
                                    `Workflow action failed for ${doctype}:`,
                                    error
                                );

                                if (applied) {
                                    dialog.hide();
                                    notify(
                                        "أُرسل إجراء سير العمل بنجاح، لكن تعذّر تحديث بيانات الصفحة. استخدم «تحديث البيانات» قبل متابعة العمل.",
                                        "warning"
                                    );
                                } else {
                                    $button
                                        .prop("disabled", false)
                                        .text("تنفيذ الإجراء | Apply Action");

                                    notify(
                                        `تعذر تنفيذ الإجراء: ${readableError(error)}`,
                                        "error"
                                    );
                                }
                            }
                        }
                    );
                }
            );
        } catch (error) {
            console.error(
                `Unable to load workflow transitions for ${doctype}:`,
                error
            );

            $content.html(`
                <div class="alert alert-danger">
                    تعذر تحميل إجراءات سير العمل.
                    <br>
                    ${esc(readableError(error))}
                </div>
            `);
        }
    }

    function activateWindow(index) {
        const parsed = Number(index);
        if (!Number.isInteger(parsed) || parsed < 0 || parsed > 3) {
            return;
        }

        activeWindow = parsed;

        root.querySelectorAll("[data-tab]").forEach(button => {
            button.classList.toggle(
                "is-active",
                Number(button.dataset.tab) === activeWindow
            );
        });

        root.querySelectorAll("[data-screen]").forEach(screen => {
            screen.hidden =
                Number(screen.dataset.screen) !== Math.floor(activeWindow / 2);
        });

        root.querySelectorAll(".bb-iw-card[data-window]").forEach(card => {
            card.hidden = Number(card.dataset.window) !== activeWindow;
        });

        const title = root.querySelector("#iw-active-window-title");
        if (title) {
            title.textContent = windowTitles[activeWindow];
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
