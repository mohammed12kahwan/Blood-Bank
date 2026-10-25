import frappe


def _truthy(value):
    if isinstance(value, str):
        return value.strip().lower() in {
            "1", "true", "yes", "y", "verified"
        }
    return value is True or value == 1


def _fifo_part(value):
    # Missing dates are placed last so they cannot precede dated stock.
    return (0, str(value)) if value else (1, "")


def get_eligible_available_storages(blood_group, component_type):
    """
    Read-only stock selector for Blood Crossmatch.

    Includes only Available storage matching the requested group/type,
    linked to an Accepted and verified, unexpired Blood Unit.
    Returns the matching rows in FIFO order.
    """
    from frappe.utils import getdate, today

    group = str(blood_group or "").strip()
    comp_type = str(component_type or "").strip()

    if not group or not comp_type:
        return []

    storage_meta = frappe.get_meta("Blood Storage")
    required_storage_fields = (
        "storage_status", "blood_group", "component_type", "blood_unit"
    )

    for fieldname in required_storage_fields:
        if not storage_meta.get_field(fieldname):
            return []

    storage_fields = [
        "name",
        "creation",
        "storage_status",
        "blood_group",
        "component_type",
        "blood_unit",
        "blood_component",
        "quality_check",
        "storage_date",
        "stored_at",
        "available_at",
        "component_number",
        "bag_number",
    ]

    storage_fields = [
        fieldname for fieldname in storage_fields
        if fieldname in {"name", "creation"} or storage_meta.get_field(fieldname)
    ]

    rows = frappe.get_all(
        "Blood Storage",
        filters={
            "storage_status": "Available",
            "blood_group": group,
            "component_type": comp_type,
        },
        fields=storage_fields,
        limit_page_length=0,
    )

    rows.sort(key=lambda row: (
        _fifo_part(row.get("storage_date")),
        _fifo_part(row.get("stored_at")),
        _fifo_part(row.get("available_at")),
        _fifo_part(row.get("creation")),
        str(row.get("name") or ""),
    ))

    unit_meta = frappe.get_meta("Blood Unit")
    unit_fields = [
        fieldname for fieldname in (
            "unit_status",
            "blood_group",
            "blood_group_verified",
            "group_verification_status",
            "expiry_date",
        )
        if unit_meta.get_field(fieldname)
    ]

    if "unit_status" not in unit_fields or "expiry_date" not in unit_fields:
        return []

    has_group_verification = (
        "blood_group_verified" in unit_fields
        or "group_verification_status" in unit_fields
    )
    if not has_group_verification:
        return []

    today_date = getdate(today())
    eligible = []

    for row in rows:
        if row.get("storage_status") != "Available":
            continue

        if str(row.get("blood_group") or "").strip() != group:
            continue
        if str(row.get("component_type") or "").strip() != comp_type:
            continue

        unit_name = row.get("blood_unit")
        if not unit_name:
            continue

        unit = frappe.db.get_value(
            "Blood Unit",
            unit_name,
            unit_fields,
            as_dict=True,
        )
        if not unit:
            continue

        if str(unit.get("unit_status") or "").strip() != "Accepted":
            continue

        if "blood_group" in unit_fields:
            unit_group = str(unit.get("blood_group") or "").strip()
            if not unit_group or unit_group != group:
                continue

        if "group_verification_status" in unit_fields:
            verification = str(
                unit.get("group_verification_status") or ""
            ).strip().lower()
            if verification != "verified":
                continue

        if "blood_group_verified" in unit_fields:
            if not _truthy(unit.get("blood_group_verified")):
                continue

        expiry = unit.get("expiry_date")
        if not expiry:
            continue

        try:
            if getdate(expiry) <= today_date:
                continue
        except Exception:
            continue

        eligible.append(row)

    return eligible
