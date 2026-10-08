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
