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
    if not donor:
        return []
    if not frappe.db.exists("Blood Donor", donor):
        return []

    meta = frappe.get_meta("Blood Donation")
    available = {f.fieldname for f in meta.fields}
    requested = [
        "donation_date", "donation_type", "donation_status",
        "bag_number", "volume_collected", "collection_unit", "collection_staff"
    ]
    fields = ["name"] + [f for f in requested if f in available]

    return frappe.get_list(
        "Blood Donation",
        filters={"donor": donor},
        fields=fields,
        order_by="donation_date desc, creation desc",
        page_length=10,
    )
