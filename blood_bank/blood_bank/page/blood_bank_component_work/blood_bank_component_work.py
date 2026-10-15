import frappe
from frappe.utils import getdate


DONATION_DOCTYPE = "Blood Donation"


def _as_dict(value):
    if isinstance(value, str):
        return frappe.parse_json(value) or {}
    return value or {}


def _assert_read_permission(doctype, name=None):
    """Use the Frappe v15 doc argument when checking a specific record."""
    if name:
        if not frappe.db.exists(doctype, name):
            frappe.throw(f"السجل غير موجود: {doctype} / {name}")

        doc = frappe.get_doc(doctype, name)
        allowed = frappe.has_permission(doctype, "read", doc=doc)
    else:
        allowed = frappe.has_permission(doctype, "read")

    if not allowed:
        frappe.throw(
            f"لا تملك صلاحية قراءة {doctype}"
            + (f" ({name})" if name else ""),
            frappe.PermissionError,
        )


def _fieldnames(doctype):
    return {
        field.fieldname
        for field in frappe.get_meta(doctype).fields
    }


def _records_by_link(doctype, fieldname, parent_names, fields, limit=500):
    if not parent_names or fieldname not in _fieldnames(doctype):
        return []

    valid = _fieldnames(doctype)
    selected = [
        field for field in fields
        if field in valid
    ]

    return frappe.get_list(
        doctype,
        filters={
            fieldname: ["in", list(parent_names)]
        },
        fields=list(dict.fromkeys(["name"] + selected)),
        order_by="modified desc",
        limit_page_length=limit,
    )


def _records_by_any_link(doctype, link_filters, fields, limit=500):
    valid = _fieldnames(doctype)
    filters = [
        item for item in link_filters
        if item[0] in valid and item[1]
    ]

    if not filters:
        return []

    or_filters = [
        {fieldname: ["in", list(names)]}
        for fieldname, names in filters
    ]

    selected = [
        field for field in fields
        if field in valid
    ]

    return frappe.get_list(
        doctype,
        or_filters=or_filters,
        fields=list(dict.fromkeys(["name"] + selected)),
        order_by="modified desc",
        limit_page_length=limit,
    )


@frappe.whitelist()
def search_donations(filters=None, limit=250):
    """Read-only search endpoint for the separate component-work page."""
    _assert_read_permission(DONATION_DOCTYPE)

    filters = _as_dict(filters)

    try:
        limit = max(1, min(int(limit or 250), 500))
    except (TypeError, ValueError):
        limit = 250

    query_filters = []
    or_filters = []

    donation_id = (filters.get("donation_id") or "").strip()
    donor = (filters.get("donor") or "").strip()
    bag_number = (filters.get("bag_number") or "").strip()
    status = (filters.get("donation_status") or "").strip()
    donation_type = (filters.get("donation_type") or "").strip()
    general_query = (filters.get("query") or "").strip()
    date_from = filters.get("date_from")
    date_to = filters.get("date_to")

    if donation_id:
        query_filters.append([
            DONATION_DOCTYPE, "name", "like", f"%{donation_id}%"
        ])

    if bag_number:
        query_filters.append([
            DONATION_DOCTYPE, "bag_number", "like", f"%{bag_number}%"
        ])

    if status:
        query_filters.append([
            DONATION_DOCTYPE, "donation_status", "=", status
        ])

    if donation_type:
        query_filters.append([
            DONATION_DOCTYPE, "donation_type", "=", donation_type
        ])

    if date_from:
        query_filters.append([
            DONATION_DOCTYPE, "donation_date", ">=", getdate(date_from)
        ])

    if date_to:
        query_filters.append([
            DONATION_DOCTYPE, "donation_date", "<=", getdate(date_to)
        ])

    if donor:
        or_filters.extend([
            {"donor": ["like", f"%{donor}%"]},
            {"donor_name": ["like", f"%{donor}%"]},
        ])

    if general_query:
        or_filters.extend([
            {"name": ["like", f"%{general_query}%"]},
            {"donor": ["like", f"%{general_query}%"]},
            {"donor_name": ["like", f"%{general_query}%"]},
            {"bag_number": ["like", f"%{general_query}%"]},
        ])

    rows = frappe.get_list(
        DONATION_DOCTYPE,
        filters=query_filters,
        or_filters=or_filters or None,
        fields=[
            "name",
            "donor",
            "donor_name",
            "donation_date",
            "donation_time",
            "donation_type",
            "donation_status",
            "bag_number",
            "volume_collected",
            "collection_unit",
        ],
        order_by="donation_date desc, creation desc",
        limit_page_length=limit,
    )

    names = [row.name for row in rows]

    processing_rows = _records_by_link(
        "Blood Processing",
        "blood_donation",
        names,
        [
            "blood_donation",
            "processing_status",
            "blood_unit",
            "blood_screening",
            "donor",
            "donor_name",
            "blood_group",
            "bag_number",
        ],
    )

    unit_rows = _records_by_link(
        "Blood Unit",
        "blood_donation",
        names,
        [
            "blood_donation",
            "unit_status",
            "blood_processing",
            "donor",
            "donor_name",
            "blood_group",
            "bag_number",
        ],
    )

    processing_by_donation = {}
    for record in processing_rows:
        processing_by_donation.setdefault(
            record.blood_donation, []
        ).append(record)

    units_by_donation = {}
    for record in unit_rows:
        units_by_donation.setdefault(
            record.blood_donation, []
        ).append(record)

    results = []
    for row in rows:
        item = dict(row)
        item["processing_records"] = [
            dict(record)
            for record in processing_by_donation.get(row.name, [])
        ]
        item["unit_records"] = [
            dict(record)
            for record in units_by_donation.get(row.name, [])
        ]
        item["processing_count"] = len(item["processing_records"])
        item["unit_count"] = len(item["unit_records"])
        results.append(item)

    return {
        "rows": results,
        "count": len(results),
        "limit": limit,
        "read_only": True,
    }


@frappe.whitelist()
def get_donation_context(donation_name):
    """Return the selected donation and linked stages without changing records."""
    donation_name = (donation_name or "").strip()

    if not donation_name:
        frappe.throw("رقم التبرع مطلوب.")

    _assert_read_permission(DONATION_DOCTYPE, donation_name)

    donation = frappe.get_doc(DONATION_DOCTYPE, donation_name)

    processing_rows = frappe.get_list(
        "Blood Processing",
        filters={"blood_donation": donation_name},
        fields=[
            "name",
            "blood_donation",
            "processing_status",
            "blood_unit",
            "blood_screening",
            "donor",
            "donor_name",
            "blood_group",
            "bag_number",
        ],
        order_by="modified desc",
        limit_page_length=100,
    )

    unit_rows = frappe.get_list(
        "Blood Unit",
        filters={"blood_donation": donation_name},
        fields=[
            "name",
            "blood_donation",
            "unit_status",
            "blood_processing",
            "donor",
            "donor_name",
            "blood_group",
            "bag_number",
        ],
        order_by="modified desc",
        limit_page_length=100,
    )

    processing_names = [row.name for row in processing_rows]
    unit_names = [row.name for row in unit_rows]

    component_rows = _records_by_any_link(
        "Blood Component",
        [
            ("blood_processing", processing_names),
            ("blood_unit", unit_names),
        ],
        [
            "blood_processing",
            "blood_screening",
            "blood_unit",
            "component_status",
            "component_type",
            "component_number",
            "bag_number",
            "donor_name",
        ],
    )

    screening_rows = _records_by_link(
        "Blood Screening",
        "blood_unit",
        unit_names,
        [
            "blood_unit",
            "screening_status",
            "overall_result",
            "screening_date",
            "donor_name",
            "blood_group",
            "bag_number",
        ],
    )

    component_names = [row.name for row in component_rows]

    quality_rows = _records_by_link(
        "Blood Component Quality Check",
        "blood_component",
        component_names,
        [
            "blood_component",
            "qc_status",
            "overall_result",
            "inspection_date",
            "discard_reason",
        ],
    )

    quality_names = [row.name for row in quality_rows]

    storage_rows = _records_by_any_link(
        "Blood Storage",
        [
            ("blood_component", component_names),
            ("quality_check", quality_names),
        ],
        [
            "blood_component",
            "quality_check",
            "storage_status",
            "storage_location",
            "storage_date",
            "discard_reason",
        ],
    )

    eligible_processing = [
        row for row in processing_rows
        if row.processing_status == "Component Separation"
    ]

    quarantined_units = [
        row for row in unit_rows
        if row.unit_status == "Quarantine"
    ]

    linkage = {
        "unique_source_records": False,
        "ready_for_component": False,
        "reason": "",
        "processing": None,
        "unit": None,
        "missing_reciprocal_link": False,
        "mismatches": [],
    }

    if len(eligible_processing) != 1:
        linkage["reason"] = (
            "يجب تحديد سجل معالجة واحد بحالة Component Separation. "
            f"العدد الحالي: {len(eligible_processing)}."
        )

    elif len(quarantined_units) != 1:
        linkage["reason"] = (
            "يجب تحديد وحدة دم واحدة بحالة Quarantine. "
            f"العدد الحالي: {len(quarantined_units)}."
        )

    else:
        processing = eligible_processing[0]
        unit = quarantined_units[0]
        mismatches = []

        if processing.blood_donation != donation_name:
            mismatches.append("رقم التبرع في المعالجة غير مطابق.")

        if unit.blood_donation != donation_name:
            mismatches.append("رقم التبرع في وحدة الدم غير مطابق.")

        if processing.blood_unit and processing.blood_unit != unit.name:
            mismatches.append("المعالجة مرتبطة بوحدة دم أخرى.")

        if unit.blood_processing and unit.blood_processing != processing.name:
            mismatches.append("وحدة الدم مرتبطة بسجل معالجة آخر.")

        if (
            processing.donor and donation.donor
            and processing.donor != donation.donor
        ):
            mismatches.append("المتبرع في المعالجة غير مطابق.")

        if (
            unit.donor and donation.donor
            and unit.donor != donation.donor
        ):
            mismatches.append("المتبرع في وحدة الدم غير مطابق.")

        if (
            processing.bag_number and donation.bag_number
            and processing.bag_number != donation.bag_number
        ):
            mismatches.append("رقم الكيس في المعالجة غير مطابق.")

        if (
            unit.bag_number and donation.bag_number
            and unit.bag_number != donation.bag_number
        ):
            mismatches.append("رقم الكيس في وحدة الدم غير مطابق.")

        if (
            processing.blood_group and unit.blood_group
            and processing.blood_group != unit.blood_group
        ):
            mismatches.append("فصيلة الدم بين المعالجة والوحدة غير متطابقة.")

        missing_link = (
            not processing.blood_unit or not unit.blood_processing
        )

        linkage.update({
            "unique_source_records": True,
            "processing": dict(processing),
            "unit": dict(unit),
            "missing_reciprocal_link": bool(missing_link),
            "mismatches": mismatches,
        })

        linkage["ready_for_component"] = (
            not mismatches and not missing_link
        )

        if mismatches:
            linkage["reason"] = " ".join(mismatches)
        elif missing_link:
            linkage["reason"] = (
                "تم تحديد المعالجة والوحدة برقم التبرع، لكن رابط "
                "blood_unit داخل المعالجة أو blood_processing داخل "
                "الوحدة ناقص. لا يمكن إنشاء المكوّن بأمان قبل استكماله."
            )
        else:
            linkage["reason"] = (
                "المعالجة ووحدة الدم مرتبطتان بصورة صحيحة."
            )

    return {
        "donation": {
            "name": donation.name,
            "donor": donation.donor,
            "donor_name": donation.donor_name,
            "donation_date": donation.donation_date,
            "donation_type": donation.donation_type,
            "donation_status": donation.donation_status,
            "bag_number": donation.bag_number,
            "volume_collected": donation.volume_collected,
            "collection_unit": donation.collection_unit,
        },
        "processing_records": [dict(row) for row in processing_rows],
        "unit_records": [dict(row) for row in unit_rows],
        "component_records": [dict(row) for row in component_rows],
        "screening_records": [dict(row) for row in screening_rows],
        "quality_records": [dict(row) for row in quality_rows],
        "storage_records": [dict(row) for row in storage_rows],
        "source_link_check": linkage,
        "read_only": True,
    }


def run_read_only_diagnostic():
    """Terminal diagnostic only. Does not create or change business records."""
    print("\nSTEP 38-A - COMPONENT PAGE REPORT TEST")
    print("=" * 72)

    report = search_donations(
        filters={"donation_id": "DONN-2026-00022"},
        limit=20,
    )

    print("REPORT COUNT:", report["count"])

    for row in report["rows"]:
        print(
            row["name"],
            "| Donor:", row.get("donor_name"),
            "| Status:", row.get("donation_status"),
            "| Processing Count:", row.get("processing_count"),
            "| Unit Count:", row.get("unit_count"),
        )

    if frappe.db.exists(DONATION_DOCTYPE, "DONN-2026-00022"):
        context = get_donation_context("DONN-2026-00022")

        print("\nSELECTED DONATION:", context["donation"]["name"])
        print(
            "PROCESSING:",
            [
                (
                    row["name"],
                    row.get("processing_status"),
                    row.get("blood_unit"),
                )
                for row in context["processing_records"]
            ],
        )
        print(
            "UNITS:",
            [
                (
                    row["name"],
                    row.get("unit_status"),
                    row.get("blood_processing"),
                )
                for row in context["unit_records"]
            ],
        )
        print("SOURCE LINK CHECK:", context["source_link_check"])
        print("COMPONENTS:", [row["name"] for row in context["component_records"]])
        print("SCREENINGS:", [row["name"] for row in context["screening_records"]])
        print("QUALITY CHECKS:", [row["name"] for row in context["quality_records"]])
        print("STORAGE:", [row["name"] for row in context["storage_records"]])

    print("\nREAD-ONLY TEST COMPLETE. NO RECORDS MODIFIED.")
