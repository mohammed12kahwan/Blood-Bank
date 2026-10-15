import frappe

DOCTYPE_NAMES = [
    "Blood Donation",
    "Blood Component",
    "Blood Screening",
    "Blood Component Quality Check",
    "Blood Storage",
]

def run():
    print("\n" + "=" * 72)
    print("STEP 38 - SECOND PAGE READ-ONLY AUDIT")
    print("=" * 72)

    for doctype in DOCTYPE_NAMES:
        print("\n" + "-" * 72)
        print("DOCTYPE:", doctype)

        if not frappe.db.exists("DocType", doctype):
            print("RESULT: DOCTYPE NOT FOUND")
            continue

        meta = frappe.get_meta(doctype)
        print("Module:", meta.module)
        print("Autoname:", meta.autoname)
        print("Title Field:", meta.title_field)

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

        links = [
            f"{field.fieldname} -> {field.options}"
            for field in meta.fields
            if field.fieldtype == "Link"
        ]
        print("\nLINK FIELDS:")
        for link in links:
            print(" ", link)

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
                f"  {item.name} | State Field: "
                f"{item.workflow_state_field}"
            )
            workflow = frappe.get_doc("Workflow", item.name)

            print("  STATES:")
            for state in workflow.states:
                print("   ", state.state)

            print("  TRANSITIONS:")
            for transition in workflow.transitions:
                print(
                    f"    {transition.state} -> "
                    f"{transition.next_state} | "
                    f"{transition.action}"
                )

    print("\n" + "=" * 72)
    print("AUDIT COMPLETE - NO BUSINESS RECORDS MODIFIED")
    print("=" * 72)
