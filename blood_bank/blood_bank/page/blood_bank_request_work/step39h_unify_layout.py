import os
import re
from pathlib import Path

cw = Path(os.environ["CW"])
rw = Path(os.environ["RW"])

component_css = (cw / "blood_bank_component_work.css").read_text(
    encoding="utf-8"
)
js_path = rw / "blood_bank_request_work.js"
js = js_path.read_text(encoding="utf-8")


def replace_function(source, start_marker, end_marker, replacement):
    start = source.find(start_marker)
    if start < 0:
        raise RuntimeError("Start marker not found: " + start_marker)

    end = source.find(end_marker, start + len(start_marker))
    if end < 0:
        raise RuntimeError("End marker not found: " + end_marker)

    return source[:start] + replacement + source[end:]


# ------------------------------------------------------------
# 1. Request page HTML:
#    same compact header, toolbar, summary panels, tabs and
#    Frappe form visual language as the Component Work page.
#    Request-specific IDs are preserved for its own JavaScript.
# ------------------------------------------------------------
html = r'''<div id="bb-rw-root" class="bb-rw-root form-layout" dir="rtl">

  <header class="bb-rw-header">
    <div class="bb-rw-brand-mark" aria-hidden="true">🩸</div>
    <div class="bb-rw-brand-copy">
      <h2>نظام بنك الدم</h2>
      <p>متابعة الطلبات والحجز والمطابقة والصرف والتسليم ونقل الدم ومصير الوحدة</p>
    </div>
  </header>

  <nav class="bb-rw-toolbar" aria-label="أدوات العمل">
    <div class="bb-rw-toolbar-actions">
      <button type="button" id="bb-rw-save"
              class="btn btn-primary bb-rw-btn bb-rw-btn-save">
        💾 حفظ
      </button>
      <div id="bb-rw-workflow-actions" class="bb-rw-workflow-actions">
        احفظ السجل أو اختر سجلًا موجودًا لعرض إجراءات سير العمل.
      </div>
    </div>

    <div class="bb-rw-toolbar-main">
      <button type="button" id="bb-rw-new"
              class="btn btn-default bb-rw-btn">＋ سجل جديد</button>
      <button type="button" id="bb-rw-refresh"
              class="btn btn-default bb-rw-btn">↻ تحديث البيانات</button>
      <button type="button" id="bb-rw-prev"
              class="btn btn-default bb-rw-btn">◀ السابق</button>
      <button type="button" id="bb-rw-next"
              class="btn btn-default bb-rw-btn">التالي ▶</button>
    </div>

    <div class="bb-rw-toolbar-navigation">
      <button type="button" id="bb-rw-request-list"
              class="btn btn-default bb-rw-btn">📋 قائمة طلبات الدم</button>
      <button type="button" id="bb-rw-bank"
              class="btn btn-default bb-rw-btn">🩸 بنك الدم</button>
      <button type="button" id="bb-rw-home"
              class="btn btn-default bb-rw-btn">⌂ الصفحة الرئيسية</button>
    </div>
  </nav>

  <section class="form-section bb-rw-panel bb-rw-source-panel">
    <div class="section-head bb-rw-panel-head">
      <span>الطلب المحدد</span>
      <span class="bb-rw-english-label">SELECTED BLOOD REQUEST</span>
    </div>

    <div class="bb-rw-summary-grid">
      <div class="bb-rw-summary-item">
        <label>رقم الطلب</label>
        <div id="bb-rw-request-id"
             class="form-control bb-rw-summary-value">—</div>
      </div>

      <div class="bb-rw-summary-item">
        <label>المريض</label>
        <div id="bb-rw-patient"
             class="form-control bb-rw-summary-value">—</div>
      </div>

      <div class="bb-rw-summary-item">
        <label>حالة الطلب</label>
        <div id="bb-rw-request-status"
             class="form-control bb-rw-summary-value">—</div>
      </div>

      <div class="bb-rw-summary-item">
        <label>تاريخ الطلب</label>
        <div id="bb-rw-request-date"
             class="form-control bb-rw-summary-value">—</div>
      </div>

      <div class="bb-rw-summary-item">
        <label>فصيلة الدم المطلوبة</label>
        <div id="bb-rw-request-blood-group"
             class="form-control bb-rw-summary-value">—</div>
      </div>

      <div class="bb-rw-summary-item">
        <label>المكوّن والكمية</label>
        <div id="bb-rw-request-component"
             class="form-control bb-rw-summary-value">—</div>
      </div>
    </div>

    <div class="row bb-rw-request-picker-row">
      <div class="col-md-8">
        <div id="bb-rw-request-picker"></div>
      </div>
      <div class="col-md-4">
        <div class="form-group">
          <label class="control-label">&nbsp;</label>
          <button type="button" id="bb-rw-open-request"
                  class="btn btn-default bb-rw-btn">
            فتح الطلب المحدد
          </button>
        </div>
      </div>
    </div>

    <div id="bb-rw-source-message"
         class="alert alert-info bb-rw-message">
      افتح تقرير طلبات الدم واختر خلية من صف الطلب لبدء المتابعة.
    </div>
  </section>

  <section class="bb-rw-workspace">
    <div class="bb-rw-workspace-heading">
      <div>
        <h3>مراحل العمل</h3>
        <p>اختر المرحلة والسجل المطلوب، وتابع الإجراءات حسب حالة المستند.</p>
      </div>
      <span class="bb-rw-workspace-code">REQUEST WORKFLOW · 01–07</span>
    </div>

    <ul id="bb-rw-stage-tabs"
        class="nav nav-tabs bb-rw-tabs"
        role="tablist"></ul>

    <section class="form-section bb-rw-panel bb-rw-stage-panel">
      <div class="bb-rw-stage-bar">
        <div class="bb-rw-stage-heading">
          <div class="bb-rw-stage-kicker">المرحلة النشطة</div>
          <div id="bb-rw-stage-title" class="bb-rw-stage-title">
            بيانات المرحلة
          </div>
          <p class="text-muted bb-rw-stage-description">
            بيانات السجل المرتبط بطلب الدم المحدد.
          </p>
        </div>

        <div class="bb-rw-stage-status-box">
          <label>السجل والحالة الحالية</label>
          <div id="bb-rw-stage-status"
               class="form-control bb-rw-summary-value">—</div>
        </div>
      </div>

      <div class="bb-rw-fields-area">
        <div id="bb-rw-stage-message"
             class="alert alert-info bb-rw-message"></div>

        <div class="row bb-rw-content-row">
          <div class="col-md-9 bb-rw-editor-column">
            <div class="form-section bb-rw-panel bb-rw-editor-panel">
              <div class="section-head bb-rw-subsection-head">
                بيانات السجل
              </div>
              <div id="bb-rw-unsaved-message"></div>
              <div id="bb-rw-stage-fields"></div>
              <div id="bb-rw-save-message"
                   class="text-muted small"></div>
            </div>
          </div>

          <div class="col-md-3 bb-rw-record-column">
            <div class="form-section bb-rw-panel bb-rw-record-panel">
              <div class="section-head bb-rw-subsection-head">
                السجلات المرتبطة
              </div>
              <div id="bb-rw-records" class="bb-rw-record-list"></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </section>
</div>
'''

# ------------------------------------------------------------
# 2. Update request summary values in the current JS.
# ------------------------------------------------------------
summary_fn = r'''    function updateRequestSummary() {
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

'''

js = replace_function(
    js,
    "    function updateRequestSummary() {",
    "    function renderTabs() {",
    summary_fn,
)

# ------------------------------------------------------------
# 3. Update tabs to match Component Work: numbered RTL tabs,
#    Arabic stage name, English DocType, and count badge.
# ------------------------------------------------------------
tabs_fn = r'''    function renderTabs() {
        const $tabs = page.main.find("#bb-rw-stage-tabs");
        $tabs.empty();

        const arabicNumbers = ["١", "٢", "٣", "٤", "٥", "٦", "٧"];

        state.schema.forEach(function (item, index) {
            const records = stageRecords(item.doctype);
            const $li = $("<li>").toggleClass(
                "active",
                index === state.index
            );

            const $link = $("<a>", {
                href: "#",
                "data-stage-index": index
            });

            $("<span>", {
                class: "bb-rw-tab-number",
                text: arabicNumbers[index] || String(index + 1)
            }).appendTo($link);

            $("<span>", {
                class: "bb-rw-tab-label",
                text: item.label
            }).appendTo($link);

            $("<small>", {
                text: item.doctype
            }).appendTo($link);

            $("<span>", {
                class: "badge",
                text: records.length
            }).appendTo($link);

            $li.append($link).appendTo($tabs);
        });
    }

'''

js = replace_function(
    js,
    "    function renderTabs() {",
    "    function renderRecordList(item) {",
    tabs_fn,
)

# Make generated field panels match the reference page panels.
js = js.replace(
    'class="form-section bb-rw-field-section"',
    'class="form-section bb-rw-panel bb-rw-field-section"',
    1,
)
js = js.replace(
    'class="section-head"></div>',
    'class="section-head bb-rw-subsection-head"></div>',
    1,
)

# ------------------------------------------------------------
# 4. Put the page controls inside the HTML toolbar instead of
#    duplicating actions in the default Frappe page toolbar.
#    Keep every existing backend call and workflow method.
# ------------------------------------------------------------
bind_fn = r'''    function bindEvents() {
        page.main.on(
            "click",
            "#bb-rw-stage-tabs a[data-stage-index]",
            function (event) {
                event.preventDefault();
                changeStage(parseInt($(this).attr("data-stage-index"), 10));
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

        page.main.on("click", "#bb-rw-request-list", function () {
            frappe.set_route("List", "Blood Request");
        });

        page.main.on("click", "#bb-rw-bank", function () {
            frappe.set_route("blood-bank-ui-test");
        });

        page.main.on("click", "#bb-rw-home", function () {
            frappe.set_route("home");
        });
    }

'''

js = replace_function(
    js,
    "    function bindEvents() {",
    "    async function boot() {",
    bind_fn,
)

# Remove native Frappe primary/inner buttons so the page uses the
# same single custom toolbar layout as Component Work.
boot_start = js.find("    async function boot() {")
if boot_start < 0:
    raise RuntimeError("boot() function not found.")

toolbar_start = js.find("        page.set_primary_action(", boot_start)
schema_try = js.find(
    '        try {\n            setBusy(true);\n            state.schema = await call("get_page_schema", {});',
    toolbar_start if toolbar_start >= 0 else boot_start,
)

if toolbar_start >= 0 and schema_try >= 0:
    js = js[:toolbar_start] + js[schema_try:]
elif toolbar_start >= 0:
    raise RuntimeError(
        "Could not safely locate the end of native toolbar setup."
    )

# Verify all HTML selectors expected by the current JS are still present.
required_ids = [
    "bb-rw-request-id",
    "bb-rw-patient",
    "bb-rw-request-status",
    "bb-rw-request-date",
    "bb-rw-request-blood-group",
    "bb-rw-request-component",
    "bb-rw-request-picker",
    "bb-rw-open-request",
    "bb-rw-stage-tabs",
    "bb-rw-stage-message",
    "bb-rw-records",
    "bb-rw-stage-title",
    "bb-rw-stage-status",
    "bb-rw-unsaved-message",
    "bb-rw-stage-fields",
    "bb-rw-workflow-actions",
    "bb-rw-save-message",
    "bb-rw-save",
    "bb-rw-new",
    "bb-rw-refresh",
    "bb-rw-prev",
    "bb-rw-next",
    "bb-rw-request-list",
    "bb-rw-bank",
    "bb-rw-home",
]

for element_id in required_ids:
    if f'id="{element_id}"' not in html:
        raise RuntimeError("Required HTML ID missing: " + element_id)

for marker in (
    "function normalizeFieldValue",
    "function saveCurrentStage",
    'call("get_page_schema"',
    'call("load_request_context"',
    'call("save_stage_document"',
    'call("get_stage_actions"',
    'call("apply_stage_action"',
):
    if marker not in js:
        raise RuntimeError(
            "Expected request workflow logic missing from JS: " + marker
        )

# Use the component-work CSS as the styling source, but scope it to
# the request page by renaming all bb-cw identifiers to bb-rw.
css = component_css.replace("bb-cw", "bb-rw")

css += r'''

/* Request workflow layout additions; keep the shared Component Work theme. */
#bb-rw-root .bb-rw-request-picker-row {
    margin-top: 12px;
}

#bb-rw-root .bb-rw-content-row {
    display: flex;
    flex-wrap: wrap;
    direction: rtl;
    align-items: flex-start;
}

#bb-rw-root .bb-rw-editor-column,
#bb-rw-root .bb-rw-record-column {
    float: none;
}

#bb-rw-root .bb-rw-editor-panel,
#bb-rw-root .bb-rw-record-panel {
    margin-bottom: 12px;
}

#bb-rw-root .bb-rw-field-section {
    margin-bottom: 15px;
    padding: 14px;
    box-shadow: none;
}

#bb-rw-root .bb-rw-field-section > .section-head,
#bb-rw-root .bb-rw-subsection-head {
    margin-bottom: 13px;
    padding-bottom: 9px;
    border-bottom: 1px solid var(--bb-rw-border);
    color: var(--heading-color, #303b46);
    font-size: 12px;
    font-weight: 750;
}

#bb-rw-root .bb-rw-record-list {
    max-height: 520px;
    overflow-y: auto;
}

#bb-rw-root .bb-rw-record-btn {
    display: block;
    width: 100%;
    margin: 0 0 7px;
    padding: 8px 10px;
    text-align: right;
    white-space: normal;
    overflow-wrap: anywhere;
    border-radius: 6px;
    font-size: 11px;
}

#bb-rw-root .bb-rw-record-btn.active {
    border-color: var(--bb-rw-red);
    background: #fff4f5;
    color: var(--bb-rw-red);
}

#bb-rw-root .bb-rw-record-btn .bb-rw-record-status {
    display: block;
    margin-top: 4px;
    color: var(--text-muted, #74808b);
    font-size: 10px;
}

#bb-rw-root .bb-rw-status {
    color: var(--text-muted, #74808b);
    font-size: 11px;
    font-weight: normal;
}

#bb-rw-root .bb-rw-empty {
    padding: 12px 8px;
    color: var(--text-muted, #74808b);
    font-size: 11px;
    line-height: 1.7;
}

#bb-rw-root .bb-rw-stage-message:empty,
#bb-rw-root .bb-rw-save-message:empty {
    display: none;
}

#bb-rw-root #bb-rw-open-request {
    min-height: 34px;
}

@media (max-width: 767px) {
    #bb-rw-root .bb-rw-content-row {
        display: block;
    }

    #bb-rw-root .bb-rw-editor-column,
    #bb-rw-root .bb-rw-record-column {
        width: 100%;
    }

    #bb-rw-root .bb-rw-record-list {
        max-height: 240px;
    }

    #bb-rw-root .bb-rw-tabs > li {
        min-width: 150px;
    }
}
'''

# Write files only after all checks and source rewrites succeeded.
(rw / "blood_bank_request_work.html").write_text(
    html, encoding="utf-8"
)
(rw / "blood_bank_request_work.css").write_text(
    css, encoding="utf-8"
)
js_path.write_text(js, encoding="utf-8")

print("=" * 76)
print("STEP 39-H | REQUEST PAGE LAYOUT UNIFIED")
print("HTML: compact header, shared toolbar and seven RTL tabs")
print("CSS: sourced from Component Work and scoped to Request Work")
print("Workflow actions: in the upper toolbar beside Save")
print("Request API, stage links and workflow guards: retained")
print("Report page: untouched and remains separate")
print("=" * 76)
