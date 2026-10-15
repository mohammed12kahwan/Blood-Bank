from collections import Counter

import frappe
from frappe import _


def get_columns():
    return [
        {
            "label": _("رقم الطلب | Request ID"),
            "fieldname": "name",
            "fieldtype": "Data",
            "width": 165,
        },
        {
            "label": _("تاريخ الطلب | Request Date"),
            "fieldname": "request_date",
            "fieldtype": "Date",
            "width": 115,
        },
        {
            "label": _("المريض | Patient"),
            "fieldname": "patient",
            "fieldtype": "Link",
            "options": "Patient",
            "width": 115,
        },
        {
            "label": _("اسم المريض | Patient Name"),
            "fieldname": "patient_name",
            "fieldtype": "Data",
            "width": 175,
        },
        {
            "label": _("حالة الطلب | Request Status"),
            "fieldname": "request_status",
            "fieldtype": "Data",
            "width": 125,
        },
        {
            "label": _("نوع الطلب | Request Type"),
            "fieldname": "request_type",
            "fieldtype": "Data",
            "width": 110,
        },
        {
            "label": _("الفصيلة المطلوبة | Blood Group"),
            "fieldname": "blood_group",
            "fieldtype": "Data",
            "width": 110,
        },
        {
            "label": _("المكوّن المطلوب | Component"),
            "fieldname": "component_type",
            "fieldtype": "Data",
            "width": 155,
        },
        {
            "label": _("الكمية | Quantity"),
            "fieldname": "requested_quantity",
            "fieldtype": "Float",
            "width": 90,
        },
        {
            "label": _("وحدة الكمية | Unit"),
            "fieldname": "quantity_unit",
            "fieldtype": "Data",
            "width": 85,
        },
        {
            "label": _("القسم الطالب | Department"),
            "fieldname": "requesting_department",
            "fieldtype": "Data",
            "width": 150,
        },
        {
            "label": _("مطلوب قبل | Required By"),
            "fieldname": "required_by",
            "fieldtype": "Datetime",
            "width": 145,
        },
        {
            "label": _("حالة المطابقة | Crossmatch"),
            "fieldname": "crossmatch_statuses",
            "fieldtype": "Data",
            "width": 170,
        },
        {
            "label": _("حالة الحجز | Reservation"),
            "fieldname": "reservation_statuses",
            "fieldtype": "Data",
            "width": 155,
        },
        {
            "label": _("حالة الصرف | Issue"),
            "fieldname": "issue_statuses",
            "fieldtype": "Data",
            "width": 150,
        },
        {
            "label": _("حالة التسليم | Handover"),
            "fieldname": "handover_statuses",
            "fieldtype": "Data",
            "width": 150,
        },
        {
            "label": _("حالة نقل الدم | Transfusion"),
            "fieldname": "transfusion_statuses",
            "fieldtype": "Data",
            "width": 175,
        },
        {
            "label": _("مصير الوحدة | Unit Disposition"),
            "fieldname": "disposition_statuses",
            "fieldtype": "Data",
            "width": 165,
        },
    ]


def _list(doctype, filters=None, fields=None, limit=1000):
    """Permission-aware read-only query."""
    if not frappe.db.exists("DocType", doctype):
        return []

    return frappe.get_list(
        doctype,
        filters=filters or {},
        fields=fields or ["name"],
        order_by="modified desc",
        limit_page_length=limit,
    )


def _related_records(doctype, request_name, fields, links=None):
    """
    Resolve records by direct Blood Request links and documented
    intermediate links. Merge duplicates by document name.
    """
    found = {}
    meta = frappe.get_meta(doctype)

    if meta.get_field("blood_request"):
        for row in _list(
            doctype,
            {"blood_request": request_name},
            fields,
        ):
            found[row.name] = row

    for fieldname, linked_names in (links or []):
        if not linked_names or not meta.get_field(fieldname):
            continue

        for row in _list(
            doctype,
            {fieldname: ["in", list(linked_names)]},
            fields,
        ):
            found[row.name] = row

    return list(found.values())


def _status_summary(rows, fieldname):
    counts = Counter(
        str(row.get(fieldname)).strip()
        for row in rows
        if row.get(fieldname)
    )

    if not counts:
        return "—"

    return ", ".join(
        "{} × {}".format(status, counts[status])
        for status in sorted(counts)
    )


def _collect_progress(request_name):
    crossmatches = _related_records(
        "Blood Crossmatch",
        request_name,
        [
            "name",
            "crossmatch_status",
            "candidate_blood_unit",
            "candidate_storage",
        ],
    )
    crossmatch_names = [d.name for d in crossmatches]

    reservations = _related_records(
        "Blood Reservation",
        request_name,
        [
            "name",
            "reservation_status",
            "blood_crossmatch",
            "blood_unit",
            "blood_storage",
            "blood_component",
        ],
        [("blood_crossmatch", crossmatch_names)],
    )
    reservation_names = [d.name for d in reservations]

    issues = _related_records(
        "Blood Issue",
        request_name,
        [
            "name",
            "issue_status",
            "blood_reservation",
            "blood_unit",
            "blood_storage",
            "blood_component",
        ],
        [("blood_reservation", reservation_names)],
    )
    issue_names = [d.name for d in issues]

    handovers = _related_records(
        "Blood Handover",
        request_name,
        [
            "name",
            "handover_status",
            "blood_issue",
            "blood_reservation",
            "blood_unit",
        ],
        [
            ("blood_issue", issue_names),
            ("blood_reservation", reservation_names),
        ],
    )
    handover_names = [d.name for d in handovers]

    transfusions = _related_records(
        "Blood Transfusion",
        request_name,
        [
            "name",
            "transfusion_status",
            "blood_handover",
            "blood_issue",
            "blood_reservation",
            "blood_unit",
        ],
        [
            ("blood_handover", handover_names),
            ("blood_issue", issue_names),
            ("blood_reservation", reservation_names),
        ],
    )

    # Disposition links to Blood Unit, not directly to Blood Request.
    # Resolve unit IDs from each existing linked stage.
    unit_names = set()

    for collection in (
        crossmatches,
        reservations,
        issues,
        handovers,
        transfusions,
    ):
        for row in collection:
            value = row.get("candidate_blood_unit") or row.get("blood_unit")
            if value:
                unit_names.add(value)

    # A candidate can point to storage when candidate_blood_unit
    # was not populated. Resolve the stored unit through that record.
    storage_names = set()
    for row in crossmatches:
        if row.get("candidate_storage"):
            storage_names.add(row.candidate_storage)

    for collection in (reservations, issues):
        for row in collection:
            if row.get("blood_storage"):
                storage_names.add(row.blood_storage)

    if storage_names and frappe.db.exists("DocType", "Blood Storage"):
        for storage in _list(
            "Blood Storage",
            {"name": ["in", sorted(storage_names)]},
            ["name", "blood_unit"],
        ):
            if storage.get("blood_unit"):
                unit_names.add(storage.blood_unit)

    dispositions = []
    if unit_names:
        dispositions = _list(
            "Blood Unit Disposition",
            {"blood_unit": ["in", sorted(unit_names)]},
            ["name", "disposition_status", "blood_unit"],
        )

    return {
        "crossmatch_statuses": _status_summary(
            crossmatches, "crossmatch_status"
        ),
        "reservation_statuses": _status_summary(
            reservations, "reservation_status"
        ),
        "issue_statuses": _status_summary(
            issues, "issue_status"
        ),
        "handover_statuses": _status_summary(
            handovers, "handover_status"
        ),
        "transfusion_statuses": _status_summary(
            transfusions, "transfusion_status"
        ),
        "disposition_statuses": _status_summary(
            dispositions, "disposition_status"
        ),
    }


def execute(filters=None):
    filters = frappe._dict(filters or {})

    conditions = {}

    if filters.get("request_id"):
        conditions["name"] = [
            "like",
            "%{}%".format(filters.request_id.strip()),
        ]

    if filters.get("patient"):
        conditions["patient"] = filters.patient

    if filters.get("request_status"):
        conditions["request_status"] = filters.request_status

    if filters.get("request_type"):
        conditions["request_type"] = filters.request_type

    if filters.get("component_type"):
        conditions["component_type"] = filters.component_type

    if filters.get("from_date"):
        conditions["request_date"] = [
            ">=",
            filters.from_date,
        ]

    if filters.get("to_date"):
        current = conditions.get("request_date")
        if current and isinstance(current, list) and current[0] == ">=":
            conditions["request_date"] = [
                "between",
                [current[1], filters.to_date],
            ]
        else:
            conditions["request_date"] = [
                "<=",
                filters.to_date,
            ]

    search_or_filters = []
    if filters.get("query"):
        text = "%{}%".format(filters.query.strip())
        search_or_filters = [
            ["name", "like", text],
            ["patient_name", "like", text],
            ["requesting_department", "like", text],
        ]

    request_rows = frappe.get_list(
        "Blood Request",
        filters=conditions,
        or_filters=search_or_filters,
        fields=[
            "name",
            "request_date",
            "patient",
            "patient_name",
            "request_status",
            "request_type",
            "blood_group",
            "component_type",
            "requested_quantity",
            "quantity_unit",
            "requesting_department",
            "required_by",
        ],
        order_by="request_date desc, modified desc",
        limit_page_length=5000,
    )

    data = []
    for request in request_rows:
        row = dict(request)
        row.update(_collect_progress(request.name))
        data.append(row)

    return get_columns(), data
