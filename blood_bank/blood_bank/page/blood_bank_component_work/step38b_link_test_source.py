import frappe


DONATION = "DONN-2026-00022"
PROCESSING = "PROC-2026-00013"
UNIT = "BU-2026-00013"


def run():
    print("\n" + "=" * 68)
    print("STEP 38-B - VALIDATE AND LINK TEST SOURCE RECORDS")
    print("=" * 68)

    donation = frappe.get_doc("Blood Donation", DONATION)
    processing = frappe.get_doc("Blood Processing", PROCESSING)
    unit = frappe.get_doc("Blood Unit", UNIT)

    if processing.blood_donation != DONATION:
        frappe.throw("Processing does not reference the selected donation.")

    if unit.blood_donation != DONATION:
        frappe.throw("Blood Unit does not reference the selected donation.")

    if processing.processing_status != "Component Separation":
        frappe.throw("Processing is not in Component Separation.")

    if unit.unit_status != "Quarantine":
        frappe.throw("Blood Unit is not in Quarantine.")

    # Ensure there is only one eligible Processing record for this donation.
    processes = frappe.get_all(
        "Blood Processing",
        filters={
            "blood_donation": DONATION,
            "processing_status": "Component Separation",
        },
        fields=["name"],
        limit_page_length=100,
    )

    if [row.name for row in processes] != [PROCESSING]:
        frappe.throw(
            "Expected exactly the selected Processing record in "
            "Component Separation. No link changes made."
        )

    # Ensure there is only one quarantined Blood Unit for this donation.
    units = frappe.get_all(
        "Blood Unit",
        filters={
            "blood_donation": DONATION,
            "unit_status": "Quarantine",
        },
        fields=["name"],
        limit_page_length=100,
    )

    if [row.name for row in units] != [UNIT]:
        frappe.throw(
            "Expected exactly the selected quarantined Blood Unit. "
            "No link changes made."
        )

    # Never overwrite a link to a different record.
    if processing.blood_unit and processing.blood_unit != UNIT:
        frappe.throw(
            f"Processing already points to another unit: "
            f"{processing.blood_unit}"
        )

    if unit.blood_processing and unit.blood_processing != PROCESSING:
        frappe.throw(
            f"Unit already points to another Processing record: "
            f"{unit.blood_processing}"
        )

    # Verify shared source information.
    checks = [
        ("donor", donation.donor, processing.donor),
        ("donor", donation.donor, unit.donor),
        ("bag_number", donation.bag_number, processing.bag_number),
        ("bag_number", donation.bag_number, unit.bag_number),
        ("blood_group", processing.blood_group, unit.blood_group),
    ]

    for field, left, right in checks:
        if left and right and left != right:
            frappe.throw(
                f"Source mismatch in {field}: {left} != {right}. "
                "No link changes made."
            )

    print("Pre-checks passed.")
    print("Donation:", DONATION)
    print("Processing:", PROCESSING, processing.processing_status)
    print("Blood Unit:", UNIT, unit.unit_status)

    try:
        # Fill only the missing reciprocal links.
        # Do not change either Workflow state.
        if not processing.blood_unit:
            processing.blood_unit = UNIT
            processing.save(ignore_permissions=True)

        unit.reload()

        if not unit.blood_processing:
            unit.blood_processing = PROCESSING
            unit.save(ignore_permissions=True)

        frappe.db.commit()

    except Exception:
        frappe.db.rollback()
        raise

    processing.reload()
    unit.reload()

    if processing.blood_unit != UNIT:
        frappe.throw("Post-save verification failed: Processing -> Unit.")

    if unit.blood_processing != PROCESSING:
        frappe.throw("Post-save verification failed: Unit -> Processing.")

    if processing.processing_status != "Component Separation":
        frappe.throw("Processing status changed unexpectedly.")

    if unit.unit_status != "Quarantine":
        frappe.throw("Blood Unit status changed unexpectedly.")

    print("\nLINK VERIFICATION PASS")
    print("Processing.blood_unit =", processing.blood_unit)
    print("Unit.blood_processing =", unit.blood_processing)
    print("Processing status =", processing.processing_status)
    print("Unit status =", unit.unit_status)
    print("No business records were created or deleted.")
