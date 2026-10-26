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
        "doctype": "Blood Crossmatch",
        "label": "المطابقة",
        "status_field": "crossmatch_status",
    },
    {
        "doctype": "Blood Reservation",
        "label": "الحجز",
        "status_field": "reservation_status",
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


def _copy_stage_values(defaults, target_meta, source, mapping):
    """Copy populated values only to fields existing on the destination DocType."""
    if not source:
        return
    for target_field, source_field in mapping.items():
        if target_meta.get_field(target_field):
            value = source.get(source_field)
            if value not in (None, ""):
                defaults[target_field] = value


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
            # BB_HIDE_NAMING_SERIES_ALL_STAGES_V3
            if field.fieldname == "naming_series":
                continue

            # BB_REQUEST_WORK_HIDE_DEFINITION_SECTION_V1
            # إخفاء عنوان قسم التعريف في جميع نوافذ المراحل.
            if field.fieldtype == "Section Break":
                section_label = str(field.label or "").strip().casefold()
                if section_label.startswith((
                    "التعريف", "تعريف", "قسم التعريف",
                    "definition", "identification"
                )):
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
def get_stage_defaults(doctype, request_name, source_name=None):
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

        # BB_FIFO_AVAILABLE_STOCK_DEFAULT_V1
        # Select the oldest eligible stock without reserving or issuing it.
        from blood_bank.blood_bank.inventory import (
            get_eligible_available_storages,
        )

        fifo_rows = get_eligible_available_storages(
            request.get("blood_group"),
            request.get("component_type"),
        )

        if fifo_rows:
            candidate = fifo_rows[0]
            candidate_values = {
                "candidate_storage": candidate.get("name"),
                "candidate_component": candidate.get("blood_component"),
                "candidate_blood_unit": candidate.get("blood_unit"),
                "candidate_blood_group": candidate.get("blood_group"),
                "candidate_component_type": candidate.get("component_type"),
                "candidate_component_number": candidate.get("component_number"),
                "candidate_bag_number": candidate.get("bag_number"),
            }

            for fieldname, value in candidate_values.items():
                if meta.get_field(fieldname) and value not in (None, ""):
                    defaults[fieldname] = value

    elif doctype == "Blood Reservation":
        defaults["reservation_date"] = today()
        defaults["reservation_status"] = "Draft"
        requested_type = (request.get("component_type") or "").strip()
        requested_group = (request.get("blood_group") or "").strip()

        compatible = [
            row for row in context["records"]["Blood Crossmatch"]
            if row.get("crossmatch_status") == "Compatible"
            and row.get("compatibility_result") == "Compatible"
            and (row.get("required_component_type") or "").strip()
                == requested_type
            and (row.get("candidate_component_type") or "").strip()
                == requested_type
            and (row.get("required_blood_group") or "").strip()
                == requested_group
            and (row.get("candidate_blood_group") or "").strip()
                == requested_group
            and bool(row.get("candidate_storage"))
            and frappe.db.get_value(
                "Blood Storage",
                row.get("candidate_storage"),
                "storage_status",
            ) == "Available"
        ]

        if source_name:
            compatible = [
                row for row in compatible
                if row.get("name") == source_name
            ]
            if not compatible:
                frappe.throw(_(
                    "المطابقة المحددة لا تطابق فصيلة الطلب ونوع المكوّن، "
                    "أو أن التخزين المرشح لم يعد متاحًا."
                ))
        if compatible:
            match = compatible[0]
            defaults["blood_crossmatch"] = match.get("name")
            _copy_stage_values(defaults, meta, match, {
                "blood_storage": "candidate_storage",
                "blood_component": "candidate_component",
                "blood_unit": "candidate_blood_unit",
                "blood_group": "candidate_blood_group",
                "component_type": "candidate_component_type",
                "bag_number": "candidate_bag_number",
                "patient": "patient",
                "patient_name": "patient_name",
                "blood_request": "blood_request",
            })

    elif doctype == "Blood Issue":
        defaults["issue_date"] = today()
        defaults["issue_status"] = "Draft"
        ready = [
            row for row in context["records"]["Blood Reservation"]
            if row.get("reservation_status") == "Ready for Issue"
        ]
        if source_name:
            candidates = [
                row for row in ready
                if row.get("name") == source_name
            ]
            if not candidates:
                frappe.throw(_("الحجز المحدد لم يصل إلى حالة Ready for Issue."))
        else:
            candidates = ready or context["records"]["Blood Reservation"]

        if candidates:
            parent = candidates[0]
            defaults["blood_reservation"] = parent.get("name")
            _copy_stage_values(defaults, meta, parent, {
                "blood_storage": "blood_storage",
                "blood_component": "blood_component",
                "blood_unit": "blood_unit",
                "blood_group": "blood_group",
                "component_type": "component_type",
                "bag_number": "bag_number",
                "patient": "patient",
                "patient_name": "patient_name",
                "blood_request": "blood_request",
            })

    elif doctype == "Blood Handover":
        defaults["handover_date"] = today()
        defaults["handover_status"] = "Draft"
        issued = [
            row for row in context["records"]["Blood Issue"]
            if row.get("issue_status") == "Issued"
        ]
        candidates = issued or context["records"]["Blood Issue"]
        if candidates:
            parent = candidates[0]
            defaults["blood_issue"] = parent.get("name")
            _copy_stage_values(defaults, meta, parent, {
                "blood_reservation": "blood_reservation",
                "blood_storage": "blood_storage",
                "blood_component": "blood_component",
                "blood_unit": "blood_unit",
                "blood_group": "blood_group",
                "component_type": "component_type",
                "bag_number": "bag_number",
                "patient": "patient",
                "patient_name": "patient_name",
                "blood_request": "blood_request",
            })

    elif doctype == "Blood Transfusion":
        defaults["transfusion_date"] = today()
        defaults["transfusion_status"] = "Draft"
        handed_over = [
            row for row in context["records"]["Blood Handover"]
            if row.get("handover_status") == "Handed Over"
        ]
        candidates = handed_over or context["records"]["Blood Handover"]
        if candidates:
            parent = candidates[0]
            defaults["blood_handover"] = parent.get("name")
            _copy_stage_values(defaults, meta, parent, {
                "blood_issue": "blood_issue",
                "blood_reservation": "blood_reservation",
                "blood_storage": "blood_storage",
                "blood_component": "blood_component",
                "blood_unit": "blood_unit",
                "blood_group": "blood_group",
                "component_type": "component_type",
                "bag_number": "bag_number",
                "patient": "patient",
                "patient_name": "patient_name",
                "blood_request": "blood_request",
            })

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

    # BB_ISSUE_BACKFILL_FROM_RESERVATION_V3
    # إكمال بيانات الصرف من الحجز ثم المطابقة المرتبطة به.
    if doctype == "Blood Issue":
        reservation_name = doc.get("blood_reservation")
        if not reservation_name:
            frappe.throw(_("اختر الحجز قبل حفظ مستند الصرف."))

        if reservation_name not in set(context.get("reservation_names") or []):
            frappe.throw(_("الحجز المحدد غير مرتبط بطلب الدم الحالي."))

        reservation = frappe.get_doc("Blood Reservation", reservation_name)
        reservation.check_permission("read")

        if is_new and reservation.get("reservation_status") != "Ready for Issue":
            frappe.throw(_("يجب إكمال الحجز حتى Ready for Issue قبل الصرف."))

        match = None
        match_name = reservation.get("blood_crossmatch")
        if match_name and frappe.db.exists("Blood Crossmatch", match_name):
            match = frappe.get_doc("Blood Crossmatch", match_name)

        sources = {
            "blood_storage": ("blood_storage", "candidate_storage"),
            "blood_component": ("blood_component", "candidate_component"),
            "blood_unit": ("blood_unit", "candidate_blood_unit"),
            "blood_group": ("blood_group", "candidate_blood_group"),
            "component_type": ("component_type", "candidate_component_type"),
            "bag_number": ("bag_number", "candidate_bag_number"),
            "patient": ("patient", "patient"),
            "patient_name": ("patient_name", "patient_name"),
        }

        for target, (reservation_field, match_field) in sources.items():
            if not meta.get_field(target) or doc.get(target):
                continue
            value = reservation.get(reservation_field)
            if not value and match:
                value = match.get(match_field)
            if not value and target in ("patient", "patient_name"):
                value = context["request"].get(target)
            if value:
                doc.set(target, value)

        if meta.get_field("blood_storage") and not doc.get("blood_storage"):
            frappe.throw(_(
                "لا يمكن حفظ الصرف: حقل مخزن الدم فارغ في الحجز والمطابقة المرتبطين به. "
                "افتح المطابقة وتحقق من مخزن الدم المرشح قبل متابعة الصرف."
            ))

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
def apply_stage_action(doctype, request_name, name, action, values=None):
    """Save supplied editable fields first, then apply the real Frappe Workflow action."""
    stage = _stage(doctype)
    context = _context(request_name)

    if isinstance(values, str):
        values = frappe.parse_json(values)
    values = values or {}

    doc = frappe.get_doc(doctype, name)
    doc.check_permission("write")
    _assert_record_in_context(doctype, name, context)

    from frappe.model.workflow import apply_workflow, get_transitions

    transitions = get_transitions(doc) or []
    selected_transition = next(
        (item for item in transitions if item.get("action") == action),
        None,
    )
    if not selected_transition:
        frappe.throw(
            _("إجراء Workflow غير متاح لهذا السجل أو للمستخدم الحالي: {0}").format(
                action
            )
        )

    next_state = str(selected_transition.get("next_state") or "").strip().lower()

    # تحقق من السبب قبل محاولة تغيير حالة Blood Issue إلى Returned.
    if doctype == "Blood Issue" and next_state == "returned":
        reason = values.get("return_reason") or doc.get("return_reason")
        if not str(reason or "").strip():
            frappe.throw(_("Return Reason is required when an issue is marked Returned."))

    meta = frappe.get_meta(doctype)
    status_field = stage["status_field"]
    protected = PROTECTED_FIELDS.get(doctype, {"name", "naming_series"})
    editable = {
        field.fieldname
        for field in meta.fields
        if field.fieldname
        and field.fieldtype not in NO_COLUMN_TYPES
        and not field.read_only
        and field.fieldname not in protected
        and field.fieldname != status_field
    }

    changed = False
    for fieldname, value in values.items():
        if fieldname not in editable:
            continue
        if doc.get(fieldname) != value:
            doc.set(fieldname, value)
            changed = True

    # يحفظ هذا السبب وأي قيم معدّلة قبل تنفيذ الانتقال.
    if changed:
        doc.save()

    allowed_after_save = {
        item.get("action")
        for item in (get_transitions(doc) or [])
        if item.get("action")
    }
    if action not in allowed_after_save:
        frappe.throw(
            _("لم يعد إجراء Workflow متاحًا بعد حفظ الحقول: {0}").format(action)
        )

    updated = apply_workflow(doc, action)
    status_field = stage["status_field"]

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

# BB_REQUEST_CREATE_FROM_WORK_WINDOW_V1
@frappe.whitelist()
def get_new_blood_request_defaults():
    """Return safe initial values for the request-work window."""
    _stage("Blood Request")
    if not frappe.has_permission("Blood Request", "create"):
        frappe.throw(_("ليست لديك صلاحية إنشاء طلب دم."))

    meta = frappe.get_meta("Blood Request")
    defaults = {}

    for field in meta.fields:
        if not field.fieldname or field.fieldtype in NO_COLUMN_TYPES:
            continue
        if field.read_only:
            continue

        if field.fieldname == "naming_series":
            options = [
                x.strip() for x in (field.options or "").splitlines()
                if x.strip()
            ]
            if options:
                defaults[field.fieldname] = options[0]
            continue

        if field.fieldtype == "Date":
            token = str(field.default or "").strip().lower()
            if token == "today" or field.reqd or field.fieldname in (
                "request_date", "transaction_date"
            ):
                defaults[field.fieldname] = today()
            elif field.default:
                defaults[field.fieldname] = field.default
            continue

        if field.fieldtype == "Datetime":
            token = str(field.default or "").strip().lower()
            if token in ("now", "today", "now_datetime"):
                defaults[field.fieldname] = (
                    frappe.utils.now_datetime().strftime("%Y-%m-%d %H:%M:%S")
                )
            elif field.default:
                defaults[field.fieldname] = field.default
            continue

        if field.fieldtype == "Time":
            token = str(field.default or "").strip().lower()
            if token in ("now", "today", "now_datetime"):
                defaults[field.fieldname] = (
                    frappe.utils.now_datetime().strftime("%H:%M:%S")
                )
            elif field.default:
                defaults[field.fieldname] = field.default
            continue

        if field.default:
            defaults[field.fieldname] = field.default

        if (
            field.fieldtype == "Link"
            and field.options == "User"
            and field.fieldname in (
                "requested_by", "requester", "requesting_user"
            )
        ):
            defaults[field.fieldname] = frappe.session.user

    status_field = next(
        x["status_field"] for x in STAGES
        if x["doctype"] == "Blood Request"
    )
    status_meta = meta.get_field(status_field)
    if status_meta and status_meta.options:
        options = [
            x.strip() for x in status_meta.options.splitlines()
            if x.strip()
        ]
        if options and not defaults.get(status_field):
            defaults[status_field] = (
                "Draft" if "Draft" in options else options[0]
            )

    return defaults


@frappe.whitelist()
def create_blood_request_in_window(values):
    """Create a Blood Request from the request-work window only."""
    _stage("Blood Request")

    if isinstance(values, str):
        values = frappe.parse_json(values)
    if not isinstance(values, dict):
        frappe.throw(_("بيانات طلب الدم غير صالحة."))

    if not frappe.has_permission("Blood Request", "create"):
        frappe.throw(_("ليست لديك صلاحية إنشاء طلب دم."))

    meta = frappe.get_meta("Blood Request")
    status_field = next(
        x["status_field"] for x in STAGES
        if x["doctype"] == "Blood Request"
    )
    protected = PROTECTED_FIELDS.get(
        "Blood Request", {"name", "naming_series", status_field}
    )
    editable = {
        field.fieldname
        for field in meta.fields
        if field.fieldname
        and field.fieldtype not in NO_COLUMN_TYPES
        and not field.read_only
        and field.fieldname not in protected
        and field.fieldname != status_field
    }

    doc = frappe.new_doc("Blood Request")

    for fieldname, value in values.items():
        if fieldname in editable and value not in (None, ""):
            doc.set(fieldname, value)

    # الترقيم والحالة وتاريخ الطلب تظل تحت تحكم الخادم.
    series_field = meta.get_field("naming_series")
    if series_field and not doc.get("naming_series"):
        options = [
            x.strip() for x in (series_field.options or "").splitlines()
            if x.strip()
        ]
        if options:
            doc.set("naming_series", options[0])

    for field in meta.fields:
        if (
            field.fieldtype == "Date"
            and field.reqd
            and not doc.get(field.fieldname)
        ):
            doc.set(field.fieldname, today())

    if status_meta := meta.get_field(status_field):
        if not doc.get(status_field) and status_meta.options:
            options = [
                x.strip() for x in status_meta.options.splitlines()
                if x.strip()
            ]
            if options:
                doc.set(
                    status_field,
                    "Draft" if "Draft" in options else options[0]
                )

    # لا نستخدم ignore_permissions: قواعد الإنشاء الأصلية تبقى فعالة.
    doc.insert()

    return {
        "name": doc.name,
        "doc": {
            "name": doc.name,
            status_field: doc.get(status_field),
        },
    }

# BB_WORKFLOW_ACTION_CATALOG_ACTUAL_V3
@frappe.whitelist()
def get_workflow_action_catalog(doctype):
    """أسماء إجراءات Workflow المعرفة لنوع مستند مسموح به."""
    allowed_doctypes = {
        "Blood Screening",
        "Blood Component",
        "Blood Component Quality Check",
        "Blood Storage",
        "Blood Request",
        "Blood Reservation",
        "Blood Crossmatch",
        "Blood Issue",
        "Blood Handover",
        "Blood Transfusion",
        "Blood Unit Disposition",
    }

    if doctype not in allowed_doctypes:
        frappe.throw("نوع المستند غير مسموح لكتالوج إجراءات بنك الدم.")

    if not frappe.has_permission(doctype, "read"):
        frappe.throw("ليست لديك صلاحية قراءة هذا النوع من السجلات.")

    workflows = frappe.get_all(
        "Workflow",
        filters={"document_type": doctype, "is_active": 1},
        fields=["name"],
    )

    names = []
    seen = set()

    for row in workflows:
        workflow_doc = frappe.get_doc("Workflow", row.name)

        for transition in workflow_doc.transitions:
            action_name = str(transition.action or "").strip()
            if action_name and action_name not in seen:
                seen.add(action_name)
                names.append(action_name)

    return {"actions": names}
