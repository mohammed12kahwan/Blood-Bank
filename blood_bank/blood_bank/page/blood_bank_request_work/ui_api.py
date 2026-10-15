import re
import frappe
from frappe import _
from frappe.utils import today


STAGES = [
    {
        "doctype": "Blood Request",
        "label": "الطلب",
        "status_field": "request_status",
    },
    {
        "doctype": "Blood Reservation",
        "label": "الحجز",
        "status_field": "reservation_status",
    },
    {
        "doctype": "Blood Crossmatch",
        "label": "المطابقة",
        "status_field": "crossmatch_status",
    },
    {
        "doctype": "Blood Issue",
        "label": "الصرف",
        "status_field": "issue_status",
    },
    {
        "doctype": "Blood Handover",
        "label": "التسليم",
        "status_field": "handover_status",
    },
    {
        "doctype": "Blood Transfusion",
        "label": "نقل الدم",
        "status_field": "transfusion_status",
    },
    {
        "doctype": "Blood Unit Disposition",
        "label": "مصير الوحدة",
        "status_field": "disposition_status",
    },
]

STAGE_NAMES = {item["doctype"] for item in STAGES}

NO_COLUMN_TYPES = {
    "Section Break",
    "Column Break",
    "Tab Break",
    "Table",
    "Table MultiSelect",
    "HTML",
    "Button",
    "Heading",
    "Fold",
}

# These links must be derived from, or remain inside, the selected request.
PROTECTED_FIELDS = {
    "Blood Request": {"name", "naming_series", "request_status"},
    "Blood Reservation": {
        "name", "naming_series", "reservation_status", "blood_request"
    },
    "Blood Crossmatch": {
        "name", "naming_series", "crossmatch_status", "blood_request"
    },
    "Blood Issue": {
        "name", "naming_series", "issue_status", "blood_request"
    },
    "Blood Handover": {
        "name", "naming_series", "handover_status", "blood_request"
    },
    "Blood Transfusion": {
        "name", "naming_series", "transfusion_status", "blood_request"
    },
    "Blood Unit Disposition": {
        "name", "naming_series", "disposition_status"
    },
}

RELATION_RULES = {
    "Blood Reservation": ("blood_crossmatch", "Blood Crossmatch"),
    "Blood Issue": ("blood_reservation", "Blood Reservation"),
    "Blood Handover": ("blood_issue", "Blood Issue"),
    "Blood Transfusion": ("blood_handover", "Blood Handover"),
    "Blood Unit Disposition": ("blood_unit", "Blood Unit"),
}


def _stage(doctype):
    stage = next(
        (item for item in STAGES if item["doctype"] == doctype),
        None,
    )
    if not stage:
        frappe.throw(_("نوع المستند غير مسموح به في صفحة متابعة الطلبات."))
    return stage


def _field_names(doctype, include_hidden=True):
    meta = frappe.get_meta(doctype)
    names = ["name"]

    for field in meta.fields:
        if not field.fieldname or field.fieldtype in NO_COLUMN_TYPES:
            continue
        if not include_hidden and field.hidden:
            continue
        if field.fieldname not in names:
            names.append(field.fieldname)

    return names


def _list_rows(doctype, filters=None, limit=500):
    if not frappe.db.exists("DocType", doctype):
        return []

    return frappe.get_list(
        doctype,
        filters=filters or {},
        fields=_field_names(doctype),
        order_by="modified desc",
        limit_page_length=limit,
    )


def _related_rows(doctype, request_name, via=None):
    """Find unique records linked to this request directly or via predecessor docs."""
    meta = frappe.get_meta(doctype)
    filters_to_try = []

    if meta.get_field("blood_request"):
        filters_to_try.append({"blood_request": request_name})

    for fieldname, names in (via or []):
        if names and meta.get_field(fieldname):
            filters_to_try.append({fieldname: ["in", list(names)]})

    merged = {}
    for filters in filters_to_try:
        for row in _list_rows(doctype, filters):
            merged[row.name] = row

    return list(merged.values())


def _names(rows):
    return [row.name for row in rows if row.get("name")]


def _add_value(target, value):
    if value:
        target.add(value)


def _context(request_name):
    if not request_name:
        frappe.throw(_("اختر رقم طلب الدم أولاً."))

    request_doc = frappe.get_doc("Blood Request", request_name)
    request_doc.check_permission("read")

    request_data = request_doc.as_dict()

    # 1. Crossmatches are linked directly to the request.
    crossmatches = _related_rows("Blood Crossmatch", request_name)
    crossmatch_names = _names(crossmatches)

    # 2. Reservations link directly to the request when populated, and
    #    always have a required Blood Crossmatch link.
    reservations = _related_rows(
        "Blood Reservation",
        request_name,
        [("blood_crossmatch", crossmatch_names)],
    )
    reservation_names = _names(reservations)

    # 3. Issues connect through their reservation.
    issues = _related_rows(
        "Blood Issue",
        request_name,
        [("blood_reservation", reservation_names)],
    )
    issue_names = _names(issues)

    # 4. Handovers connect through the issue/reservation.
    handovers = _related_rows(
        "Blood Handover",
        request_name,
        [
            ("blood_issue", issue_names),
            ("blood_reservation", reservation_names),
        ],
    )
    handover_names = _names(handovers)

    # 5. Transfusions connect through the handover/issue/reservation.
    transfusions = _related_rows(
        "Blood Transfusion",
        request_name,
        [
            ("blood_handover", handover_names),
            ("blood_issue", issue_names),
            ("blood_reservation", reservation_names),
        ],
    )

    storage_names = set()
    component_names = set()
    unit_names = set()

    for row in crossmatches:
        _add_value(storage_names, row.get("candidate_storage"))
        _add_value(component_names, row.get("candidate_component"))
        _add_value(unit_names, row.get("candidate_blood_unit"))

    for rows in (reservations, issues, handovers, transfusions):
        for row in rows:
            _add_value(storage_names, row.get("blood_storage"))
            _add_value(component_names, row.get("blood_component"))
            _add_value(unit_names, row.get("blood_unit"))

    storages = []
    if storage_names and frappe.db.exists("DocType", "Blood Storage"):
        storages = _list_rows(
            "Blood Storage",
            {"name": ["in", sorted(storage_names)]},
        )
        for row in storages:
            _add_value(unit_names, row.get("blood_unit"))
            _add_value(component_names, row.get("blood_component"))

    components = []
    if component_names and frappe.db.exists("DocType", "Blood Component"):
        components = _list_rows(
            "Blood Component",
            {"name": ["in", sorted(component_names)]},
        )
        for row in components:
            _add_value(unit_names, row.get("blood_unit"))

    units = []
    if unit_names and frappe.db.exists("DocType", "Blood Unit"):
        units = _list_rows(
            "Blood Unit",
            {"name": ["in", sorted(unit_names)]},
        )
        for row in units:
            _add_value(storage_names, row.get("blood_storage"))

    dispositions = _related_rows(
        "Blood Unit Disposition",
        request_name,
        [("blood_unit", sorted(unit_names))],
    )

    return {
        "request": request_data,
        "records": {
            "Blood Request": [request_data],
            "Blood Reservation": reservations,
            "Blood Crossmatch": crossmatches,
            "Blood Issue": issues,
            "Blood Handover": handovers,
            "Blood Transfusion": transfusions,
            "Blood Unit Disposition": dispositions,
        },
        "units": units,
        "unit_names": sorted(unit_names),
        "storage_names": sorted(storage_names),
        "crossmatch_names": crossmatch_names,
        "reservation_names": reservation_names,
        "issue_names": issue_names,
        "handover_names": handover_names,
    }


def _serialize_doc(doctype, name):
    doc = frappe.get_doc(doctype, name)
    return doc.as_dict()


def _assert_record_in_context(doctype, name, context):
    if doctype == "Blood Request":
        if name != context["request"].get("name"):
            frappe.throw(_("لا يمكن تغيير الطلب المحدد من داخل هذه الصفحة."))
        return

    rows = context["records"].get(doctype, [])
    if not any(row.get("name") == name for row in rows):
        frappe.throw(
            _("السجل {0} ليس مرتبطاً بطلب الدم المحدد.").format(name)
        )


def _validate_stage_link(doctype, doc, context):
    rule = RELATION_RULES.get(doctype)
    if not rule:
        return

    fieldname, target_doctype = rule
    selected = doc.get(fieldname)

    if not selected:
        # Required-field/controller validation will produce the final
        # message when a user attempts to save an incomplete document.
        return

    if target_doctype == "Blood Crossmatch":
        allowed = set(_names(context["records"]["Blood Crossmatch"]))
    elif target_doctype == "Blood Reservation":
        allowed = set(_names(context["records"]["Blood Reservation"]))
    elif target_doctype == "Blood Issue":
        allowed = set(_names(context["records"]["Blood Issue"]))
    elif target_doctype == "Blood Handover":
        allowed = set(_names(context["records"]["Blood Handover"]))
    elif target_doctype == "Blood Unit":
        allowed = set(context["unit_names"])
    else:
        allowed = set()

    if selected not in allowed:
        frappe.throw(
            _("{0} يجب أن يكون مرتبطاً بطلب الدم المحدد.").format(
                frappe.get_meta(doctype).get_label(fieldname) or fieldname
            )
        )


@frappe.whitelist()
def get_page_schema():
    """Return DocField metadata for Frappe-native client controls."""
    result = []

    for stage in STAGES:
        doctype = stage["doctype"]
        meta = frappe.get_meta(doctype)
        fields = []

        for field in meta.fields:
            if not field.fieldname or field.hidden:
                continue
            if field.fieldtype in NO_COLUMN_TYPES:
                fields.append({
                    "fieldname": field.fieldname,
                    "label": field.label or "",
                    "fieldtype": field.fieldtype,
                    "options": field.options or "",
                    "hidden": 0,
                })
                continue

            fields.append({
                "fieldname": field.fieldname,
                "label": field.label or field.fieldname,
                "fieldtype": field.fieldtype,
                "options": field.options or "",
                "reqd": int(bool(field.reqd)),
                "read_only": int(bool(field.read_only)),
                "default": field.default or "",
                "description": field.description or "",
                "depends_on": field.depends_on or "",
                "mandatory_depends_on": field.mandatory_depends_on or "",
                "read_only_depends_on": field.read_only_depends_on or "",
                "hidden": 0,
            })

        result.append({
            **stage,
            "fields": fields,
            "module": meta.module,
        })

    return result


@frappe.whitelist()
def load_request_context(request_name):
    """Load one request and all workflow records linked to it; read-only."""
    context = _context(request_name)
    return {
        "request": context["request"],
        "records": context["records"],
        "units": context["units"],
        "unit_names": context["unit_names"],
    }


@frappe.whitelist()
def get_stage_defaults(doctype, request_name):
    """Prepare a new, unsaved document using the selected request's context."""
    _stage(doctype)
    context = _context(request_name)
    request = context["request"]
    defaults = {}

    if doctype == "Blood Request":
        return request

    meta = frappe.get_meta(doctype)

    if meta.get_field("blood_request"):
        defaults["blood_request"] = request_name

    if meta.get_field("patient") and request.get("patient"):
        defaults["patient"] = request.get("patient")

    if meta.get_field("patient_name") and request.get("patient_name"):
        defaults["patient_name"] = request.get("patient_name")

    if doctype == "Blood Crossmatch":
        defaults.update({
            "required_blood_group": request.get("blood_group"),
            "required_component_type": request.get("component_type"),
            "crossmatch_date": today(),
            "performed_by": frappe.session.user,
            "compatibility_result": "Pending",
        })

    elif doctype == "Blood Reservation":
        defaults["reservation_date"] = today()
        defaults["reservation_status"] = "Draft"
        compatible = [
            row for row in context["records"]["Blood Crossmatch"]
            if row.get("crossmatch_status") == "Compatible"
        ]
        if compatible:
            defaults["blood_crossmatch"] = compatible[0].get("name")

    elif doctype == "Blood Issue":
        defaults["issue_date"] = today()
        defaults["issue_status"] = "Draft"
        ready = [
            row for row in context["records"]["Blood Reservation"]
            if row.get("reservation_status") == "Ready for Issue"
        ]
        candidates = ready or context["records"]["Blood Reservation"]
        if candidates:
            defaults["blood_reservation"] = candidates[0].get("name")

    elif doctype == "Blood Handover":
        defaults["handover_date"] = today()
        defaults["handover_status"] = "Draft"
        issued = [
            row for row in context["records"]["Blood Issue"]
            if row.get("issue_status") == "Issued"
        ]
        candidates = issued or context["records"]["Blood Issue"]
        if candidates:
            defaults["blood_issue"] = candidates[0].get("name")

    elif doctype == "Blood Transfusion":
        defaults["transfusion_date"] = today()
        defaults["transfusion_status"] = "Draft"
        handed_over = [
            row for row in context["records"]["Blood Handover"]
            if row.get("handover_status") == "Handed Over"
        ]
        candidates = handed_over or context["records"]["Blood Handover"]
        if candidates:
            defaults["blood_handover"] = candidates[0].get("name")

    elif doctype == "Blood Unit Disposition":
        defaults["disposition_date"] = today()
        defaults["disposition_status"] = "Draft"
        if context["unit_names"]:
            defaults["blood_unit"] = context["unit_names"][0]

    # Apply default values declared in the actual DocType, without
    # overriding request context or selected upstream links.
    for field in meta.fields:
        if field.fieldname in defaults or field.fieldtype in NO_COLUMN_TYPES:
            continue
        if field.fieldname == "naming_series":
            opts = (field.options or "").splitlines()
            if opts and opts[0].strip():
                defaults["naming_series"] = opts[0].strip()
            continue
        if field.default:
            token = str(field.default).strip().lower()

            if token in ("today", "now", "now_datetime"):
                if field.fieldtype == "Date":
                    value = today()
                elif field.fieldtype == "Datetime":
                    value = frappe.utils.now_datetime().strftime(
                        "%Y-%m-%d %H:%M:%S"
                    )
                elif field.fieldtype == "Time":
                    value = frappe.utils.now_datetime().strftime("%H:%M:%S")
                else:
                    value = field.default
            else:
                value = field.default

            # A Date field must never receive a timestamp string.
            if field.fieldtype == "Date" and value:
                match = re.match(r"^(\d{4}-\d{2}-\d{2})", str(value).strip())
                if match:
                    value = match.group(1)

            defaults[field.fieldname] = value

    status_field = next(
        item["status_field"] for item in STAGES
        if item["doctype"] == doctype
    )
    if not defaults.get(status_field):
        status_meta = meta.get_field(status_field)
        if status_meta and status_meta.options:
            options = [
                value.strip()
                for value in status_meta.options.splitlines()
                if value.strip()
            ]
            if options:
                defaults[status_field] = options[0]

    return defaults


@frappe.whitelist()
def save_stage_document(doctype, request_name, values, name=None):
    """
    Save an existing linked document or create a new child document.
    Workflow state fields and protected request links are server-managed.
    """
    stage = _stage(doctype)

    if isinstance(values, str):
        values = frappe.parse_json(values)
    values = values or {}

    context = _context(request_name)
    meta = frappe.get_meta(doctype)
    status_field = stage["status_field"]
    protected = PROTECTED_FIELDS.get(doctype, {"name", "naming_series"})

    if doctype == "Blood Request":
        if not name:
            name = request_name
        if name != request_name:
            frappe.throw(_("لا يمكن إنشاء طلب جديد من نافذة متابعة طلب محدد."))
        doc = frappe.get_doc("Blood Request", request_name)
        doc.check_permission("write")
        _assert_record_in_context(doctype, doc.name, context)
        is_new = False
    elif name:
        doc = frappe.get_doc(doctype, name)
        doc.check_permission("write")
        _assert_record_in_context(doctype, doc.name, context)
        is_new = False
    else:
        if not frappe.has_permission(doctype, "create"):
            frappe.throw(
                _("ليست لديك صلاحية إنشاء مستند من النوع {0}.").format(doctype)
            )
        doc = frappe.new_doc(doctype)
        is_new = True

    editable = {
        field.fieldname
        for field in meta.fields
        if field.fieldname
        and field.fieldtype not in NO_COLUMN_TYPES
        and not field.read_only
        and field.fieldname not in protected
        and field.fieldname != status_field
    }

    for fieldname, value in values.items():
        if fieldname in editable:
            doc.set(fieldname, value)

    # Set/lock the selected request association on the server.
    if doctype != "Blood Request" and meta.get_field("blood_request"):
        doc.set("blood_request", request_name)

    # Server-controlled series for new documents.
    if is_new and meta.get_field("naming_series") and not doc.get("naming_series"):
        series_field = meta.get_field("naming_series")
        options = (series_field.options or "").splitlines()
        if options and options[0].strip():
            doc.set("naming_series", options[0].strip())

    # Do not let a client move a workflow state by ordinary Save.
    if not is_new:
        current = frappe.get_doc(doctype, doc.name)
        doc.set(status_field, current.get(status_field))
    elif meta.get_field(status_field) and not doc.get(status_field):
        field = meta.get_field(status_field)
        options = [
            value.strip()
            for value in (field.options or "").splitlines()
            if value.strip()
        ]
        if options:
            doc.set(status_field, options[0])

    # Default required date fields to today when the caller left them empty.
    if is_new:
        for field in meta.fields:
            if (
                field.fieldtype == "Date"
                and field.reqd
                and not doc.get(field.fieldname)
            ):
                doc.set(field.fieldname, today())

    _validate_stage_link(doctype, doc, context)

    if is_new:
        doc.insert()
    else:
        doc.save()

    return {
        "doctype": doctype,
        "name": doc.name,
        "status": doc.get(status_field),
        "doc": doc.as_dict(),
        "is_new": int(is_new),
    }


@frappe.whitelist()
def get_stage_actions(doctype, request_name, name):
    """Return only workflow actions currently allowed by Frappe."""
    stage = _stage(doctype)
    context = _context(request_name)

    doc = frappe.get_doc(doctype, name)
    doc.check_permission("read")
    _assert_record_in_context(doctype, name, context)

    from frappe.model.workflow import get_transitions

    transitions = get_transitions(doc) or []
    actions = []

    for item in transitions:
        action = item.get("action")
        if action:
            actions.append({
                "action": action,
                "state": item.get("state"),
                "next_state": item.get("next_state"),
            })

    return {
        "doctype": doctype,
        "name": name,
        "status_field": stage["status_field"],
        "status": doc.get(stage["status_field"]),
        "actions": actions,
    }


@frappe.whitelist()
def apply_stage_action(doctype, request_name, name, action):
    """Apply a verified Frappe Workflow action to a request-linked document."""
    _stage(doctype)
    context = _context(request_name)

    doc = frappe.get_doc(doctype, name)
    doc.check_permission("write")
    _assert_record_in_context(doctype, name, context)

    from frappe.model.workflow import apply_workflow, get_transitions

    allowed = {
        item.get("action")
        for item in (get_transitions(doc) or [])
        if item.get("action")
    }

    if action not in allowed:
        frappe.throw(
            _("إجراء Workflow غير متاح لهذا السجل أو للمستخدم الحالي: {0}").format(
                action
            )
        )

    updated = apply_workflow(doc, action)
    status_field = next(
        item["status_field"] for item in STAGES
        if item["doctype"] == doctype
    )

    return {
        "doctype": doctype,
        "name": updated.name,
        "status": updated.get(status_field),
    }


@frappe.whitelist()
def run_step39c_diagnostic():
    """Read-only backend check using an existing request."""
    request_name = "REQ-2026-00001"

    print("=" * 82)
    print("STEP 39-C | REQUEST PAGE API DIAGNOSTIC")
    print("READ ONLY - NO BUSINESS RECORD CHANGES")
    print("=" * 82)

    schema = get_page_schema()
    print("Stage count:", len(schema))
    print("Stage order:", " -> ".join(item["doctype"] for item in schema))

    context = _context(request_name)
    print("Request:", context["request"].get("name"))
    print("Patient:", context["request"].get("patient_name"))
    print("Request Status:", context["request"].get("request_status"))

    for stage in STAGES:
        doctype = stage["doctype"]
        records = context["records"].get(doctype, [])
        print(
            "{} | linked records: {}".format(
                doctype, len(records)
            )
        )

    print("Related blood unit IDs:", context["unit_names"])
    print("=" * 82)
    print("STEP 39-C BACKEND CHECK PASS")
    print("No save, insert, update, submit, cancel or delete operation was performed.")
    print("=" * 82)
