import frappe
from frappe.utils import getdate


WORK_WINDOWS = [
    {
        "doctype": "Blood Donor",
        "label": "المتبرع",
        "status_field": "eligibility_status",
        "secondary_status_field": "donor_status",
        "date_field": "creation",
        "fields": [
            "full_name", "donor_status", "eligibility_status",
            "date_of_birth", "mobile_no", "abo_group", "rh_factor",
            "blood_group", "last_donation_date",
        ],
    },
    {
        "doctype": "Blood Donation",
        "label": "التبرع",
        "status_field": "donation_status",
        "date_field": "donation_date",
        "fields": [
            "donor", "donor_name", "donation_date", "donation_time",
            "donation_type", "donation_status", "bag_number",
            "volume_collected", "collection_unit", "quarantine_date",
        ],
    },
    {
        "doctype": "Blood Processing",
        "label": "معالجة الدم",
        "status_field": "processing_status",
        "date_field": "processing_date",
        "fields": [
            "blood_donation", "blood_unit", "donor", "donor_name",
            "blood_group", "bag_number", "processing_date",
            "processing_status", "processing_type", "volume_collected",
            "collection_unit",
        ],
    },
    {
        "doctype": "Blood Unit",
        "label": "وحدة الدم",
        "status_field": "unit_status",
        "date_field": "donation_date",
        "fields": [
            "blood_donation", "blood_processing", "donor", "donor_name",
            "donation_date", "unit_status", "unit_type", "bag_number",
            "volume", "volume_unit", "blood_group", "abo_group",
            "rh_factor", "expiry_date",
        ],
    },
]


def execute(filters=None):
    filters = frappe._dict(filters or {})

    columns = [
        {
            "label": "نافذة العمل",
            "fieldname": "window_label",
            "fieldtype": "Data",
            "width": 120,
        },
        {
            "label": "نوع السجل",
            "fieldname": "source_doctype",
            "fieldtype": "Data",
            "width": 150,
        },
        {
            "label": "رقم السجل",
            "fieldname": "record_id",
            "fieldtype": "Data",
            "width": 185,
        },
        {
            "label": "الحالة",
            "fieldname": "status",
            "fieldtype": "Data",
            "width": 145,
        },
        {
            "label": "حالة إضافية",
            "fieldname": "status_detail",
            "fieldtype": "Data",
            "width": 140,
        },
        {
            "label": "تاريخ السجل",
            "fieldname": "record_date",
            "fieldtype": "Date",
            "width": 115,
        },
        {
            "label": "رقم المتبرع",
            "fieldname": "donor",
            "fieldtype": "Data",
            "width": 145,
        },
        {
            "label": "اسم المتبرع",
            "fieldname": "donor_name",
            "fieldtype": "Data",
            "width": 190,
        },
        {
            "label": "نوع التبرع أو الوحدة",
            "fieldname": "work_type",
            "fieldtype": "Data",
            "width": 150,
        },
        {
            "label": "رقم الكيس",
            "fieldname": "bag_number",
            "fieldtype": "Data",
            "width": 135,
        },
        {
            "label": "فصيلة الدم",
            "fieldname": "blood_group",
            "fieldtype": "Data",
            "width": 100,
        },
        {
            "label": "انتهاء الصلاحية",
            "fieldname": "expiry_date",
            "fieldtype": "Date",
            "width": 120,
        },
    ]

    data = []
    query = (filters.get("query") or "").strip().casefold()
    selected_window = filters.get("work_window")
    selected_status = filters.get("status")
    from_date = getdate(filters.from_date) if filters.get("from_date") else None
    to_date = getdate(filters.to_date) if filters.get("to_date") else None

    for spec in WORK_WINDOWS:
        doctype = spec["doctype"]

        if selected_window and selected_window != doctype:
            continue

        if not frappe.db.exists("DocType", doctype):
            continue

        meta = frappe.get_meta(doctype)
        available_fields = {field.fieldname for field in meta.fields}

        requested_fields = ["name", "creation", "modified"]
        requested_fields.extend(
            field for field in spec["fields"]
            if field in available_fields
        )

        requested_fields = list(dict.fromkeys(requested_fields))

        # get_list يحترم صلاحيات المستخدم على السجلات.
        records = frappe.get_list(
            doctype,
            fields=requested_fields,
            order_by="modified desc",
            limit_page_length=0,
        )

        for record in records:
            status = record.get(spec["status_field"])
            secondary_field = spec.get("secondary_status_field")
            status_detail = record.get(secondary_field) if secondary_field else None

            # للمتبرع نعرض حالة الأهلية والحالة العامة منفصلتين.
            if selected_status and selected_status not in (
                status, status_detail
            ):
                continue

            event_date = (
                record.get(spec["date_field"])
                or record.get("creation")
            )

            try:
                event_day = getdate(event_date) if event_date else None
            except (TypeError, ValueError):
                event_day = None

            if from_date and (not event_day or event_day < from_date):
                continue

            if to_date and (not event_day or event_day > to_date):
                continue

            donor = record.get("donor")
            donor_name = record.get("donor_name") or record.get("full_name")

            if doctype == "Blood Donor":
                donor = record.get("name")
                donor_name = record.get("full_name")
                if status and status_detail and status == status_detail:
                    status_detail = None

            work_type = (
                record.get("donation_type")
                or record.get("processing_type")
                or record.get("unit_type")
            )

            blood_group = record.get("blood_group")
            if not blood_group:
                abo = record.get("abo_group")
                rh = record.get("rh_factor")
                blood_group = " ".join(
                    str(value) for value in (abo, rh) if value
                )

            row = {
                "window_label": spec["label"],
                "source_doctype": doctype,
                "record_id": record.get("name"),
                "status": status,
                "status_detail": status_detail,
                "record_date": event_day,
                "donor": donor,
                "donor_name": donor_name,
                "work_type": work_type,
                "bag_number": record.get("bag_number"),
                "blood_group": blood_group,
                "expiry_date": record.get("expiry_date"),
                "modified": record.get("modified"),
            }

            if query:
                searchable = " ".join(
                    str(row.get(key) or "")
                    for key in (
                        "window_label", "source_doctype", "record_id",
                        "status", "status_detail", "donor", "donor_name",
                        "work_type", "bag_number", "blood_group",
                    )
                ).casefold()

                if query not in searchable:
                    continue

            data.append(row)

    data.sort(
        key=lambda row: (
            str(row.get("record_date") or ""),
            str(row.get("modified") or ""),
        ),
        reverse=True,
    )

    return columns, data
