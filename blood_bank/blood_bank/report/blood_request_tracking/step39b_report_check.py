import frappe

def run():
    from blood_bank.blood_bank.report.blood_request_tracking.blood_request_tracking import (
        execute,
    )

    print("=" * 78)
    print("STEP 39-B | BLOOD REQUEST TRACKING REPORT CHECK")
    print("READ ONLY")
    print("=" * 78)

    report_exists = frappe.db.exists("Report", "Blood Request Tracking")
    print("Report registered in database:", bool(report_exists))

    columns, rows = execute({"request_id": "REQ-2026-00001"})

    print("Column count:", len(columns))
    print("Matching request rows:", len(rows))
    for row in rows:
        print("-" * 78)
        for key in (
            "name",
            "request_status",
            "patient",
            "patient_name",
            "request_type",
            "blood_group",
            "component_type",
            "requested_quantity",
            "crossmatch_statuses",
            "reservation_statuses",
            "issue_statuses",
            "handover_statuses",
            "transfusion_statuses",
            "disposition_statuses",
        ):
            print("{}: {}".format(key, row.get(key)))

    assert any(
        r.get("name") == "REQ-2026-00001"
        for r in rows
    ), "Expected existing request was not returned."

    assert len(columns) == 18, "Unexpected report column count."

    print("=" * 78)
    print("STEP 39-B REPORT EXECUTION PASS")
    print("No business record was created, changed or deleted.")
    print("=" * 78)
