import frappe

DOCTYPE_NAMES = [
    "Blood Donation",
    "Blood Processing",
    "Blood Unit",
]

RELEVANT_FIELDS = [
    "donation_status",
    "donor",
    "donor_name",
    "donation_date",
    "donation_type",
    "bag_number",
    "blood_donation",
    "blood_processing",
    "blood_unit",
    "processing_status",
    "unit_status",
    "blood_group",
    "component_status",
]

def run():
    print("\n" + "=" * 72)
    print("STEP 38 - DONATION LINKAGE AUDIT")
    print("=" * 72)

    for doctype in DOCTYPE_NAMES:
        print("\n" + "-" * 72)
        print("DOCTYPE:", doctype)

        if not frappe.db.exists("DocType", doctype):
            print("DOCTYPE NOT FOUND")
            continue

        meta = frappe.get_meta(doctype)
        fieldnames = {field.fieldname for field in meta.fields}

        print("\nFIELDS:")
        for field in meta.fields:
            if field.fieldtype in (
                "Section Break", "Column Break",
                "Tab Break", "Heading", "HTML", "Fold"
            ):
                continue

            print(
                f"  {field.fieldname} | {field.label} | "
                f"{field.fieldtype} | required={field.reqd} | "
                f"read_only={field.read_only} | "
                f"options={(field.options or '').replace(chr(10), '/')}"
            )

        selected = [
            field for field in RELEVANT_FIELDS
            if field in fieldnames
        ]
        fields = ["name"] + selected

        print("\nLATEST RECORDS:")
        records = frappe.get_all(
            doctype,
            fields=fields,
            order_by="modified desc",
            limit_page_length=12,
        )

        if not records:
            print("  No records found")
        else:
            for record in records:
                print(" ", dict(record))

        workflows = frappe.get_all(
            "Workflow",
            filters={
                "document_type": doctype,
                "is_active": 1,
            },
            fields=["name", "workflow_state_field"],
        )

        print("\nACTIVE WORKFLOWS:", len(workflows))
        for item in workflows:
            print(
                f"  {item.name} | State field: "
                f"{item.workflow_state_field}"
            )

    print("\n" + "=" * 72)
    print("AUDIT COMPLETE - NO BUSINESS RECORDS MODIFIED")
    print("=" * 72)
