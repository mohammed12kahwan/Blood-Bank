import frappe
from frappe.utils import today
from frappe.model.workflow import apply_workflow, get_transitions


STAGES = {
    "Blood Component": {
        "status_field": "component_status",
        "fields": [
            "component_type", "component_number", "volume",
            "volume_unit", "preparation_date", "prepared_at",
            "prepared_by", "separation_method", "remarks",
        ],
    },
    "Blood Screening": {
        "status_field": "screening_status",
        "fields": [
            "screening_date", "screened_at",
            "screened_by", "overall_result", "result_summary",
            "reviewer", "review_date", "rejection_reason", "remarks",
        ],
    },
    "Blood Component Quality Check": {
        "status_field": "qc_status",
        "fields": [
            "inspection_date", "inspected_by",
            "visual_condition", "label_condition", "container_condition",
            "overall_result", "failure_reason", "remarks", "discard_reason",
        ],
    },
    "Blood Storage": {
        "status_field": "storage_status",
        "fields": [
            "storage_location",
            "storage_date", "stored_at", "stored_by", "temperature",
            "temperature_unit", "storage_reference", "available_date",
            "available_at", "available_by", "remarks", "discard_reason",
        ],
    },
}


def _data(value):
    if isinstance(value, str):
        return frappe.parse_json(value) or {}
    return value or {}


def _context(donation_name):
    if not donation_name:
        frappe.throw("رقم التبرع مطلوب.")

    from .blood_bank_component_work import get_donation_context

    return get_donation_context(donation_name)


def _permission(doctype, level, doc=None):
    if not frappe.has_permission(doctype, level, doc=doc):
        frappe.throw(
            f"ليست لديك صلاحية {level} على {doctype}.",
            frappe.PermissionError,
        )


def _names(rows):
    return {row.get("name") for row in (rows or [])}


def _component(context, name):
    if not name or name not in _names(context["component_records"]):
        frappe.throw(
            "يجب تحديد مكوّن مرتبط برقم التبرع المختار."
        )

    doc = frappe.get_doc("Blood Component", name)

    if (
        doc.blood_processing not in _names(context["processing_records"])
        and doc.blood_unit not in _names(context["unit_records"])
    ):
        frappe.throw("المكوّن لا يتبع التبرع المحدد.")

    return doc


def _passed_screening(context, unit_name):
    found = [
        row for row in context["screening_records"]
        if row.get("blood_unit") == unit_name
        and row.get("screening_status") == "Accepted"
        and row.get("overall_result") == "Passed"
    ]

    if not found:
        frappe.throw(
            "يتطلب الإجراء فحص دم مقبولًا بنتيجة Passed "
            "لوحدة الدم المرتبطة بالتبرع."
        )


def _validate_prerequisites(doctype, context, values):
    values = _data(values)

    if doctype == "Blood Component":
        source = context.get("source_link_check") or {}
        if not source.get("ready_for_component"):
            frappe.throw(
                "مصدر المكوّن غير جاهز: "
                + (source.get("reason") or "تحقق من ربط التبرع.")
            )

    elif doctype == "Blood Screening":
        if not context["component_records"]:
            frappe.throw(
                "أنشئ المكوّن أولًا قبل بدء فحص الدم."
            )

        unit_name = values.get("blood_unit")
        if not unit_name:
            unit_name = (
                context.get("source_link_check", {})
                .get("unit", {})
                .get("name")
            )

        if unit_name not in _names(context["unit_records"]):
            frappe.throw(
                "حدد وحدة دم مرتبطة برقم التبرع."
            )

    elif doctype == "Blood Component Quality Check":
        component_name = values.get("blood_component")
        if not component_name and len(context["component_records"]) == 1:
            component_name = context["component_records"][0]["name"]

        component = _component(context, component_name)

        if component.component_status != "Quality Check":
            frappe.throw(
                "يجب إرسال المكوّن إلى حالة Quality Check "
                "بعد قبول فحص الدم."
            )

        _passed_screening(context, component.blood_unit)

    elif doctype == "Blood Storage":
        component_name = values.get("blood_component")
        if not component_name and len(context["component_records"]) == 1:
            component_name = context["component_records"][0]["name"]

        component = _component(context, component_name)

        passed_qc = [
            row for row in context["quality_records"]
            if row.get("blood_component") == component.name
            and row.get("qc_status") == "Passed"
            and row.get("overall_result") == "Passed"
        ]

        requested_qc = values.get("quality_check")
        if requested_qc:
            passed_qc = [
                row for row in passed_qc
                if row["name"] == requested_qc
            ]

        if len(passed_qc) != 1:
            frappe.throw(
                "التخزين يتطلب فحص جودة ناجحًا واحدًا للمكوّن المحدد."
            )

        _passed_screening(context, component.blood_unit)


def _populate_sources(doc, context, values):
    values = _data(values)

    if doc.doctype == "Blood Component":
        source = context["source_link_check"]
        if not source.get("ready_for_component"):
            frappe.throw(source.get("reason") or "مصدر المكوّن غير جاهز.")

        doc.blood_processing = source["processing"]["name"]
        doc.blood_unit = source["unit"]["name"]

    elif doc.doctype == "Blood Screening":
        unit_name = values.get("blood_unit")
        if not unit_name:
            unit_name = context["source_link_check"]["unit"]["name"]

        if unit_name not in _names(context["unit_records"]):
            frappe.throw("وحدة الدم المحددة لا تتبع التبرع.")

        unit = frappe.get_doc("Blood Unit", unit_name)
        doc.blood_unit = unit.name

        for field in ("donor", "donor_name", "blood_group", "bag_number"):
            if doc.meta.has_field(field):
                doc.set(field, unit.get(field))

    elif doc.doctype == "Blood Component Quality Check":
        component_name = values.get("blood_component")
        if not component_name and len(context["component_records"]) == 1:
            component_name = context["component_records"][0]["name"]

        component = _component(context, component_name)
        doc.blood_component = component.name

        mapping = {
            "blood_processing": "blood_processing",
            "blood_screening": "blood_screening",
            "blood_unit": "blood_unit",
            "donor": "donor",
            "donor_name": "donor_name",
            "blood_group": "blood_group",
            "bag_number": "bag_number",
            "component_type": "component_type",
            "component_number": "component_number",
            "component_volume": "volume",
            "volume_unit": "volume_unit",
        }

        for target, source in mapping.items():
            if doc.meta.has_field(target):
                doc.set(target, component.get(source))

    elif doc.doctype == "Blood Storage":
        component_name = values.get("blood_component")
        if not component_name and len(context["component_records"]) == 1:
            component_name = context["component_records"][0]["name"]

        component = _component(context, component_name)

        passed_qc = [
            row for row in context["quality_records"]
            if row.get("blood_component") == component.name
            and row.get("qc_status") == "Passed"
            and row.get("overall_result") == "Passed"
        ]

        requested_qc = values.get("quality_check")
        if requested_qc:
            passed_qc = [
                row for row in passed_qc if row["name"] == requested_qc
            ]

        if len(passed_qc) != 1:
            frappe.throw("حدد فحص الجودة الناجح للمكوّن.")

        qc = frappe.get_doc(
            "Blood Component Quality Check",
            passed_qc[0]["name"],
        )

        doc.blood_component = component.name
        doc.quality_check = qc.name

        mapping = {
            "blood_processing": "blood_processing",
            "blood_screening": "blood_screening",
            "blood_unit": "blood_unit",
            "donor": "donor",
            "donor_name": "donor_name",
            "blood_group": "blood_group",
            "bag_number": "bag_number",
            "component_type": "component_type",
            "component_number": "component_number",
            "component_volume": "volume",
            "volume_unit": "volume_unit",
        }

        for target, source in mapping.items():
            if doc.meta.has_field(target):
                doc.set(target, component.get(source))


def _verify_existing_doc(doc, context):
    if doc.doctype == "Blood Component":
        ok = (
            doc.blood_processing in _names(context["processing_records"])
            and doc.blood_unit in _names(context["unit_records"])
        )
    elif doc.doctype == "Blood Screening":
        ok = doc.blood_unit in _names(context["unit_records"])
    elif doc.doctype == "Blood Component Quality Check":
        ok = doc.blood_component in _names(context["component_records"])
    elif doc.doctype == "Blood Storage":
        ok = (
            doc.blood_component in _names(context["component_records"])
            and doc.quality_check in _names(context["quality_records"])
        )
    else:
        ok = False

    if not ok:
        frappe.throw("المستند المحدد لا يرتبط برقم التبرع المختار.")


def _result(doc):
    status_field = STAGES[doc.doctype]["status_field"]
    return {
        "doctype": doc.doctype,
        "name": doc.name,
        "doc": doc.as_dict(),
        "status_field": status_field,
        "status": doc.get(status_field),
    }


@frappe.whitelist()
def save_stage_document(doctype, donation_name, values, name=None):
    if doctype not in STAGES:
        frappe.throw("نوع المستند غير مسموح به في الصفحة الثانية.")

    values = _data(values)
    context = _context(donation_name)
    allowed_fields = STAGES[doctype]["fields"]

    if name:
        doc = frappe.get_doc(doctype, name)
        _permission(doctype, "write", doc)
        _verify_existing_doc(doc, context)

        for field in allowed_fields:
            if field in values:
                doc.set(field, values[field])

        doc.save()
    else:
        _permission(doctype, "create")
        _validate_prerequisites(doctype, context, values)

        doc = frappe.new_doc(doctype)

        for field in allowed_fields:
            if field in values:
                doc.set(field, values[field])

        _populate_sources(doc, context, values)

        if doctype == "Blood Component" and not doc.preparation_date:
            doc.preparation_date = today()
        elif doctype == "Blood Screening" and not doc.screening_date:
            doc.screening_date = today()
        elif (
            doctype == "Blood Component Quality Check"
            and not doc.inspection_date
        ):
            doc.inspection_date = today()
        elif doctype == "Blood Storage" and not doc.storage_date:
            doc.storage_date = today()

        doc.insert()

    return _result(doc)


@frappe.whitelist()
def get_stage_transitions(doctype, name, donation_name):
    if doctype not in STAGES:
        frappe.throw("نوع المستند غير مسموح به.")

    context = _context(donation_name)
    doc = frappe.get_doc(doctype, name)
    _permission(doctype, "read", doc)
    _verify_existing_doc(doc, context)

    return get_transitions(doc)


@frappe.whitelist()
def apply_stage_action(doctype, name, donation_name, action):
    if doctype not in STAGES:
        frappe.throw("نوع المستند غير مسموح به.")

    context = _context(donation_name)
    doc = frappe.get_doc(doctype, name)
    _permission(doctype, "write", doc)
    _verify_existing_doc(doc, context)

    if doctype == "Blood Component":
        if action == "Send to Quality Check":
            _passed_screening(context, doc.blood_unit)

    elif doctype == "Blood Screening":
        if not context["component_records"]:
            frappe.throw("يجب إنشاء المكوّن قبل فحص الدم.")

        if action == "Accept Screening":
            if doc.overall_result != "Passed":
                frappe.throw(
                    "لا يمكن قبول الفحص ما لم تكن النتيجة Passed."
                )

    elif doctype == "Blood Component Quality Check":
        component = _component(context, doc.blood_component)
        if component.component_status != "Quality Check":
            frappe.throw("المكوّن ليس في حالة Quality Check.")

        _passed_screening(context, component.blood_unit)

        if action == "Pass Quality Check":
            if doc.overall_result != "Passed":
                frappe.throw(
                    "يجب أن تكون النتيجة العامة Passed قبل اعتماد الجودة."
                )

    elif doctype == "Blood Storage":
        qc = frappe.get_doc(
            "Blood Component Quality Check",
            doc.quality_check,
        )
        component = _component(context, doc.blood_component)

        if qc.blood_component != component.name:
            frappe.throw("فحص الجودة لا يطابق مكوّن التخزين.")

        if action == "Make Available":
            if qc.qc_status != "Passed" or qc.overall_result != "Passed":
                frappe.throw(
                    "لا يمكن إتاحة التخزين دون فحص جودة ناجح."
                )

    updated = apply_workflow(doc, action)
    return _result(updated)


def run_read_only_diagnostic():
    print("\nSTEP 38-C - PAGE STAGE OPERATIONS DIAGNOSTIC")
    print("=" * 68)

    donation_name = "DONN-2026-00022"
    context = _context(donation_name)
    linkage = context["source_link_check"]

    print("Donation:", context["donation"]["name"])
    print("Source ready:", linkage["ready_for_component"])
    print("Source reason:", linkage["reason"])

    for doctype, config in STAGES.items():
        print(
            "Stage:", doctype,
            "| Status field:", config["status_field"],
        )

    if not linkage["ready_for_component"]:
        frappe.throw("Source linkage is not ready for the Component stage.")

    print("\nStage operations loaded successfully.")
    print("No business records were created or changed.")
