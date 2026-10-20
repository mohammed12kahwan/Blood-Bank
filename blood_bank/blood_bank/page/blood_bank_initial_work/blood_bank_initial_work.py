import frappe


@frappe.whitelist()
def get_dashboard_data():
    doctypes = {
        "donors": "Blood Donor",
        "donations": "Blood Donation",
        "processing": "Blood Processing",
        "units": "Blood Unit",
        "screening": "Blood Screening",
        "quality": "Blood Component Quality Check",
        "components": "Blood Component",
        "storage": "Blood Storage",
        "requests": "Blood Request",
        "reservations": "Blood Reservation",
        "crossmatches": "Blood Crossmatch",
        "issues": "Blood Issue",
        "handovers": "Blood Handover",
        "transfusions": "Blood Transfusion",
        "dispositions": "Blood Unit Disposition",
    }

    result = {}

    for key, doctype in doctypes.items():
        try:
            result[key] = frappe.db.count(doctype)
        except Exception:
            result[key] = 0

    result["system_time"] = frappe.utils.now_datetime().strftime("%Y-%m-%d %H:%M")
    return result

# INITIAL WORK API V1
import json
import frappe

INITIAL_WORK_DOCTYPES = (
    "Blood Donor",
    "Blood Donation",
    "Blood Processing",
    "Blood Unit",
)

STRUCTURAL_FIELD_TYPES = {
    "Column Break", "Tab Break", "HTML", "Button", "Fold", "Heading"
}


@frappe.whitelist()
def get_initial_work_metadata():
    """Return visible field definitions and defaults for the four initial forms."""
    result = {}

    for doctype in INITIAL_WORK_DOCTYPES:
        meta = frappe.get_meta(doctype)
        new_doc = frappe.new_doc(doctype)
        fields = []

        for field in meta.fields:
            if field.hidden:
                continue
            if field.fieldtype in STRUCTURAL_FIELD_TYPES:
                continue

            # These fields must not appear in the Blood Donation interface.
            if doctype == "Blood Donation" and field.fieldname in {
                "national_id", "email_id"
            }:
                continue

            fields.append({
                "fieldname": field.fieldname,
                "label": field.label or field.fieldname,
                "fieldtype": field.fieldtype,
                "options": field.options,
                "reqd": bool(field.reqd),
                "read_only": bool(field.read_only),
                "default": field.default,
                "description": field.description,
                "depends_on": field.depends_on,
                "mandatory_depends_on": field.mandatory_depends_on,
                "idx": field.idx,
            })

        defaults = {}
        for field in meta.fields:
            if field.fieldname:
                value = new_doc.get(field.fieldname)
                if value is not None:
                    defaults[field.fieldname] = value

        result[doctype] = {
            "fields": fields,
            "defaults": defaults,
            "title_field": meta.title_field,
        }

    return result


@frappe.whitelist()
def get_initial_work_donors(txt=None):
    """Return donor IDs and names for the name autocomplete."""
    filters = {}
    if txt:
        filters["full_name"] = ["like", f"%{txt}%"]

    return frappe.get_list(
        "Blood Donor",
        filters=filters,
        fields=["name", "full_name"],
        order_by="modified desc",
        limit_page_length=20,
    )


@frappe.whitelist()
def get_initial_work_document(doctype, name):
    """Load a saved record for refresh within the new interface."""
    if doctype not in INITIAL_WORK_DOCTYPES:
        frappe.throw("Doctype غير مسموح به في نافذة العمل الأولية.")

    doc = frappe.get_doc(doctype, name)
    doc.check_permission("read")
    return doc.as_dict()


@frappe.whitelist()
def get_initial_work_recent_units():
    """List blood units inside the current interface."""
    return frappe.get_list(
        "Blood Unit",
        fields=[
            "name", "blood_donation", "donor_name",
            "unit_status", "modified"
        ],
        order_by="modified desc",
        limit_page_length=50,
    )


@frappe.whitelist()
def save_initial_work_document(doctype, values, name=None, expected_modified=None):
    """Save one of the four initial doctypes independently."""
    if doctype not in INITIAL_WORK_DOCTYPES:
        frappe.throw("Doctype غير مسموح به في نافذة العمل الأولية.")

    if isinstance(values, str):
        values = json.loads(values)

    if not isinstance(values, dict):
        frappe.throw("بيانات النموذج غير صالحة.")

    meta = frappe.get_meta(doctype)
    valid_fields = {
        field.fieldname for field in meta.fields if field.fieldname
    }

    # Accept only fields belonging to this Doctype.
    clean_values = {
        key: value for key, value in values.items()
        if key in valid_fields
    }

    # BB_SERVER_RESOLVE_BLOOD_PROCESSING_LINK_V1
    if doctype == "Blood Unit" and meta.has_field("blood_processing"):
        donation = clean_values.get("blood_donation")
        processing_name = clean_values.get("blood_processing")

        if name:
            existing = frappe.db.get_value(
                "Blood Unit", name,
                ["blood_donation", "blood_processing"],
                as_dict=True,
            )
            if existing:
                donation = donation or existing.blood_donation
                processing_name = (
                    processing_name or existing.blood_processing
                )

        if not processing_name and donation:
            matches = frappe.get_all(
                "Blood Processing",
                filters={
                    "blood_donation": donation,
                    "processing_status": "Component Separation",
                },
                fields=["name"],
                limit_page_length=2,
            )

            if len(matches) == 1:
                processing_name = matches[0].name
            elif len(matches) > 1:
                frappe.throw(
                    "توجد عدة سجلات معالجة مطابقة للتبرع؛ "
                    "تعذر تحديد سجل المعالجة الصحيح."
                )
            else:
                frappe.throw(
                    "تعذر العثور على معالجة مكتملة لفصل المكونات "
                    "مرتبطة بهذا التبرع؛ لم يتم حفظ وحدة الدم."
                )

        if processing_name:
            source_donation = frappe.db.get_value(
                "Blood Processing", processing_name, "blood_donation"
            )
            if not source_donation or (
                donation and donation != source_donation
            ):
                frappe.throw(
                    "لم تُحفظ وحدة الدم: سجل المعالجة لا يطابق التبرع."
                )

            clean_values["blood_processing"] = processing_name

    if doctype == "Blood Donation":
        donor = clean_values.get("donor")
        if donor:
            donor_name = frappe.db.get_value(
                "Blood Donor", donor, "full_name"
            )
            if not donor_name:
                frappe.throw("تعذر العثور على المتبرع المحدد.")
            clean_values["donor_name"] = donor_name

    if name:
        doc = frappe.get_doc(doctype, name)
        doc.check_permission("write")

        # ارفض الحفظ إذا كانت النسخة المفتوحة قديمة.
        if not expected_modified:
            frappe.throw(
                "تعذر التحقق من أحدث نسخة للسجل. "
                "حدّث بيانات السجل ثم أعد محاولة الحفظ."
            )

        expected_time = frappe.utils.get_datetime(expected_modified)
        current_time = frappe.utils.get_datetime(doc.modified)

        if expected_time != current_time:
            frappe.throw(
                "لم يتم حفظ السجل لأن بياناته تغيرت بعد فتحه. "
                "حدّث السجل، وراجع التغييرات الأخيرة، "
                "ثم أعد إدخال تعديلاتك واحفظها."
            )

        doc.update(clean_values)
        doc.save()
    else:
        doc = frappe.new_doc(doctype)
        doc.update(clean_values)
        doc.insert()

    return {
        "doctype": doctype,
        "name": doc.name,
        "doc": doc.as_dict(),
    }


def check_initial_work_api():
    """Small diagnostic function for terminal verification."""
    result = get_initial_work_metadata()
    return {
        "doctypes": list(result.keys()),
        "field_counts": {
            doctype: len(data["fields"])
            for doctype, data in result.items()
        },
        "donation_identity_fields_hidden": not any(
            field["fieldname"] in {"national_id", "email_id"}
            for field in result["Blood Donation"]["fields"]
        ),
    }


@frappe.whitelist()
def get_initial_work_donation_history(donor):
    # BB_DONOR_HISTORY_DECISION_V1
    """Return donation history with its linked blood-unit and screening outcomes."""
    if not donor or not frappe.db.exists("Blood Donor", donor):
        return []

    donation_meta = frappe.get_meta("Blood Donation")
    donation_fields = {field.fieldname for field in donation_meta.fields}

    requested = [
        "donation_date", "donation_type", "donation_status",
        "bag_number", "volume_collected", "collection_unit",
        "collection_staff",
    ]
    fields = ["name"] + [
        field for field in requested if field in donation_fields
    ]

    donations = frappe.get_list(
        "Blood Donation",
        filters={"donor": donor},
        fields=fields,
        order_by="donation_date desc, creation desc",
        page_length=10,
    )

    if not donations:
        return []

    donation_names = [row.name for row in donations]

    unit_meta = frappe.get_meta("Blood Unit")
    unit_fieldnames = {field.fieldname for field in unit_meta.fields}
    units = []

    if "blood_donation" in unit_fieldnames:
        unit_fields = ["name", "blood_donation"]
        if "unit_status" in unit_fieldnames:
            unit_fields.append("unit_status")

        units = frappe.get_list(
            "Blood Unit",
            filters={"blood_donation": ["in", donation_names]},
            fields=unit_fields,
            order_by="modified desc",
            page_length=1000,
        )

    unit_names = [row.name for row in units]

    screening_meta = frappe.get_meta("Blood Screening")
    screening_fieldnames = {
        field.fieldname for field in screening_meta.fields
    }
    screenings = []

    if unit_names and "blood_unit" in screening_fieldnames:
        screening_fields = ["name", "blood_unit"]
        for field in ("screening_status", "overall_result"):
            if field in screening_fieldnames:
                screening_fields.append(field)

        screenings = frappe.get_list(
            "Blood Screening",
            filters={"blood_unit": ["in", unit_names]},
            fields=screening_fields,
            order_by="modified desc",
            page_length=2000,
        )

    def unique_values(values):
        result = []
        for value in values:
            if value and value not in result:
                result.append(value)
        return result

    units_by_donation = {}
    for unit in units:
        units_by_donation.setdefault(unit.get("blood_donation"), []).append(unit)

    screenings_by_unit = {}
    for screening in screenings:
        screenings_by_unit.setdefault(screening.get("blood_unit"), []).append(
            screening
        )

    accepted_unit_statuses = {
        "Accepted", "Processing", "Available", "Reserved",
        "Issued", "Returned", "Expired", "Transfused",
    }

    for donation in donations:
        linked_units = units_by_donation.get(donation.name, [])
        linked_screenings = []

        for unit in linked_units:
            linked_screenings.extend(
                screenings_by_unit.get(unit.name, [])
            )

        unit_statuses = unique_values([
            unit.get("unit_status") for unit in linked_units
        ])
        screening_statuses = unique_values([
            item.get("screening_status") for item in linked_screenings
        ])
        overall_results = unique_values([
            item.get("overall_result") for item in linked_screenings
        ])

        donation["unit_statuses"] = unit_statuses
        donation["screening_statuses"] = screening_statuses
        donation["overall_results"] = overall_results

        donation_status = donation.get("donation_status") or ""
        has_rejection = (
            "Rejected" in unit_statuses
            or "Rejected" in screening_statuses
            or "Failed" in overall_results
        )
        has_acceptance = (
            any(status in accepted_unit_statuses for status in unit_statuses)
            or "Accepted" in screening_statuses
        )

        pending_units = any(
            status not in accepted_unit_statuses
            and status != "Rejected"
            for status in unit_statuses
        )
        pending_screening = any(
            status not in {"Accepted", "Rejected"}
            for status in screening_statuses
        )

        if donation_status in {"Cancelled", "Aborted"}:
            decision = "Cancelled"
            label = "ملغي أو متوقف"
            detail = "حالة التبرع ملغاة أو متوقفة."
        elif has_rejection and has_acceptance:
            decision = "Mixed"
            label = "نتائج مختلطة"
            detail = "توجد وحدات أو نتائج مقبولة وأخرى مرفوضة."
        elif has_rejection:
            decision = "Rejected"
            label = "مرفوض"
            detail = "توجد وحدة مرفوضة أو نتيجة فحص فاشلة."
        elif has_acceptance and (pending_units or pending_screening):
            decision = "Mixed"
            label = "قبول جزئي أو مراحل غير محسومة"
            detail = "توجد نتائج إيجابية، لكن بعض المراحل ما زالت غير محسومة."
        elif has_acceptance:
            decision = "Accepted"
            label = "مقبول"
            detail = "توجد حالة قبول مسجلة في الوحدة أو الفحص."
        elif "Passed" in overall_results:
            decision = "Pending"
            label = "نتيجة ناجحة بانتظار الاعتماد"
            detail = "نتيجة الفحص ناجحة، لكن حالة الاعتماد النهائي لم تُحسم."
        else:
            decision = "Pending"
            label = "لم تُحسم النتيجة"
            detail = "لا توجد نتيجة قبول أو رفض نهائية مرتبطة بهذا التبرع."

        donation["acceptance_status"] = decision
        donation["acceptance_label"] = label
        donation["acceptance_detail"] = detail

    return donations
