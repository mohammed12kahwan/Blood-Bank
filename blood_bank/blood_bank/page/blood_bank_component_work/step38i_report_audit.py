import frappe
from pathlib import Path


def run():
    report_name = "Blood Donation Tracking"
    page_route = "blood-bank-component-work"

    print("\n" + "=" * 68)
    print("STEP 38-I - REPORT REGISTRATION AND EXECUTION")
    print("=" * 68)

    print("\n>>> REPORT REGISTRY")
    if not frappe.db.exists("Report", report_name):
        print("REPORT NOT REGISTERED:", report_name)
        print("لا تنتقل إلى المتصفح بعد.")
        return

    report = frappe.get_doc("Report", report_name)
    print("Name:", report.name)
    print("Reference DocType:", report.ref_doctype)
    print("Report Type:", report.report_type)
    print("Is Standard:", report.is_standard)
    print("Disabled:", report.disabled)

    print("\n>>> WINDOWS PAGE REGISTRY")
    print("Registered:", bool(frappe.db.exists("Page", page_route)))

    if frappe.db.exists("Page", page_route):
        page = frappe.get_doc("Page", page_route)
        print("Route:", page.name)
        print("Title:", page.title)
        print("Module:", page.module)

    print("\n>>> REPORT FILES")
    report_dir = Path(
        "apps/blood_bank/blood_bank/blood_bank/"
        "report/blood_donation_tracking"
    )

    for filename in (
        "blood_donation_tracking.json",
        "blood_donation_tracking.py",
        "blood_donation_tracking.js",
    ):
        path = report_dir / filename
        print(filename, "EXISTS" if path.is_file() else "MISSING")

    print("\n>>> EXECUTE REPORT FOR TEST DONATION")
    execute = frappe.get_attr(
        "blood_bank.blood_bank.report."
        "blood_donation_tracking.blood_donation_tracking.execute"
    )

    columns, data = execute({
        "donation_id": "DONN-2026-00022"
    })

    print("Columns:", len(columns))
    print("Rows:", len(data))

    for row in data:
        print({
            "donation_id": row.get("name"),
            "donor": row.get("donor_name"),
            "status": row.get("donation_status"),
            "bag_number": row.get("bag_number"),
        })

    matching = [
        row for row in data
        if row.get("name") == "DONN-2026-00022"
    ]

    if not matching:
        raise Exception(
            "The report did not return DONN-2026-00022."
        )

    print("\nSTEP 38-I PASS")
    print("Report is registered and returned the requested donation.")
    print("No business records were modified.")
