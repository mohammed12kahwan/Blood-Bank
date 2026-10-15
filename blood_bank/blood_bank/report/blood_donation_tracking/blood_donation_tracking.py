import frappe
from frappe.utils import getdate


def execute(filters=None):
    filters = frappe._dict(filters or {})

    conditions = []

    if filters.get("donation_id"):
        conditions.append([
            "name", "like", f"%{filters.donation_id.strip()}%"
        ])

    if filters.get("donor"):
        conditions.append(["donor", "=", filters.donor])

    if filters.get("donor_name"):
        conditions.append([
            "donor_name", "like", f"%{filters.donor_name.strip()}%"
        ])

    if filters.get("bag_number"):
        conditions.append([
            "bag_number", "like", f"%{filters.bag_number.strip()}%"
        ])

    if filters.get("donation_status"):
        conditions.append([
            "donation_status", "=", filters.donation_status
        ])

    if filters.get("donation_type"):
        conditions.append([
            "donation_type", "=", filters.donation_type
        ])

    if filters.get("from_date"):
        conditions.append([
            "donation_date", ">=", getdate(filters.from_date)
        ])

    if filters.get("to_date"):
        conditions.append([
            "donation_date", "<=", getdate(filters.to_date)
        ])

    rows = frappe.get_list(
        "Blood Donation",
        filters=conditions,
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
        limit_page_length=0,
    )

    # Apply broad search over the complete permission-filtered result set.
    query = (filters.get("query") or "").strip().casefold()

    if query:
        rows = [
            row for row in rows
            if any(
                query in str(row.get(field) or "").casefold()
                for field in (
                    "name",
                    "donor",
                    "donor_name",
                    "bag_number",
                    "donation_type",
                    "donation_status",
                )
            )
        ]

    donation_ids = [row.name for row in rows]

    processing_counts = {}
    unit_counts = {}

    if donation_ids:
        processing = frappe.get_list(
            "Blood Processing",
            filters={"blood_donation": ["in", donation_ids]},
            fields=["blood_donation"],
            limit_page_length=0,
        )

        units = frappe.get_list(
            "Blood Unit",
            filters={"blood_donation": ["in", donation_ids]},
            fields=["blood_donation"],
            limit_page_length=0,
        )

        for record in processing:
            key = record.get("blood_donation")
            processing_counts[key] = processing_counts.get(key, 0) + 1

        for record in units:
            key = record.get("blood_donation")
            unit_counts[key] = unit_counts.get(key, 0) + 1

    columns = [
        {
            "label": "رقم التبرع | Donation ID",
            "fieldname": "name",
            "fieldtype": "Data",
            "width": 190,
        },
        {
            "label": "رقم المتبرع",
            "fieldname": "donor",
            "fieldtype": "Link",
            "options": "Blood Donor",
            "width": 150,
        },
        {
            "label": "اسم المتبرع",
            "fieldname": "donor_name",
            "fieldtype": "Data",
            "width": 200,
        },
        {
            "label": "تاريخ التبرع",
            "fieldname": "donation_date",
            "fieldtype": "Date",
            "width": 120,
        },
        {
            "label": "وقت التبرع",
            "fieldname": "donation_time",
            "fieldtype": "Time",
            "width": 110,
        },
        {
            "label": "نوع التبرع",
            "fieldname": "donation_type",
            "fieldtype": "Data",
            "width": 130,
        },
        {
            "label": "حالة التبرع",
            "fieldname": "donation_status",
            "fieldtype": "Data",
            "width": 130,
        },
        {
            "label": "رقم الكيس",
            "fieldname": "bag_number",
            "fieldtype": "Data",
            "width": 140,
        },
        {
            "label": "الحجم المسحوب",
            "fieldname": "volume_collected",
            "fieldtype": "Float",
            "width": 120,
        },
        {
            "label": "الوحدة",
            "fieldname": "collection_unit",
            "fieldtype": "Data",
            "width": 75,
        },
        {
            "label": "سجلات المعالجة",
            "fieldname": "processing_count",
            "fieldtype": "Int",
            "width": 120,
        },
        {
            "label": "وحدات الدم",
            "fieldname": "unit_count",
            "fieldtype": "Int",
            "width": 100,
        },
    ]

    data = []

    for row in rows:
        data.append({
            "name": row.name,
            "donor": row.get("donor"),
            "donor_name": row.get("donor_name"),
            "donation_date": row.get("donation_date"),
            "donation_time": row.get("donation_time"),
            "donation_type": row.get("donation_type"),
            "donation_status": row.get("donation_status"),
            "bag_number": row.get("bag_number"),
            "volume_collected": row.get("volume_collected"),
            "collection_unit": row.get("collection_unit"),
            "processing_count": processing_counts.get(row.name, 0),
            "unit_count": unit_counts.get(row.name, 0),
        })

    return columns, data
