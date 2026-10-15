import frappe
from .stage_ops import STAGES


@frappe.whitelist()
def get_stage_schema():
    """Return the editable fields used by the independent second page."""
    result = []

    for doctype, config in STAGES.items():
        if not frappe.has_permission(doctype, "read"):
            continue

        meta = frappe.get_meta(doctype)
        fields = []

        for fieldname in config["fields"]:
            df = meta.get_field(fieldname)
            if not df:
                continue

            fields.append({
                "fieldname": df.fieldname,
                "label": df.label or df.fieldname,
                "fieldtype": df.fieldtype,
                "options": df.options or "",
                "reqd": bool(df.reqd),
                "read_only": bool(df.read_only),
                "default": df.default,
                "description": df.description or "",
            })

        result.append({
            "doctype": doctype,
            "status_field": config["status_field"],
            "fields": fields,
        })

    return result
