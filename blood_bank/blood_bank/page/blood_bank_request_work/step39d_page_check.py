from pathlib import Path
import frappe

def run():
    from . import ui_api

    page_dir = Path(ui_api.__file__).resolve().parent

    required_files = [
        "blood_bank_request_work.json",
        "blood_bank_request_work.html",
        "blood_bank_request_work.js",
        "blood_bank_request_work.css",
        "ui_api.py",
    ]

    print("=" * 80)
    print("STEP 39-D | REQUEST WORK PAGE CHECK")
    print("READ ONLY - NO BUSINESS RECORD CHANGES")
    print("=" * 80)

    for filename in required_files:
        exists = (page_dir / filename).is_file()
        print("{}: {}".format(filename, "OK" if exists else "MISSING"))
        assert exists, "Missing page file: {}".format(filename)

    page_exists = frappe.db.exists("Page", "blood-bank-request-work")
    report_exists = frappe.db.exists("Report", "Blood Request Tracking")

    print("Page registered:", bool(page_exists))
    print("Report registered:", bool(report_exists))

    schema = ui_api.get_page_schema()
    print("Stage count:", len(schema))
    print("Stage order:", " -> ".join(x["doctype"] for x in schema))

    expected = [
        "Blood Request",
        "Blood Reservation",
        "Blood Crossmatch",
        "Blood Issue",
        "Blood Handover",
        "Blood Transfusion",
        "Blood Unit Disposition",
    ]

    assert len(schema) == 7, "Incorrect stage count"
    assert [x["doctype"] for x in schema] == expected, "Workflow order mismatch"
    assert page_exists, "Page did not register in the site"
    assert report_exists, "Report did not register in the site"

    html = (page_dir / "blood_bank_request_work.html").read_text(encoding="utf-8")
    assert "bb-rw-stage-tabs" in html
    assert "bb-request-tracking-cell" not in html
    assert "report-filters" not in html.lower()
    assert "<table" not in html.lower()

    print("Page remains separate from report: PASS")
    print("=" * 80)
    print("STEP 39-D PAGE CHECK PASS")
    print("No operational record was created, changed or deleted.")
    print("=" * 80)
