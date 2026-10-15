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
    print("STEP 38 - READ-ONLY DOCTYPE AND WORKFLOW AUDIT")
    print("=" * 72)

    for doctype in DOCTYPE_NAMES:
        print("\n" + "-" * 72)
        print("DOCTYPE:", doctype)

        if not frappe.db.exists("DocType", doctype):
            print("RESULT: DOCTYPE NOT FOUND")
            continue

        meta = frappe.get_meta(doctype)

        print("Module:", meta.module)
        print("Is Submittable:", meta.is_submittable)
        print("Title Field:", meta.title_field)
        print("Autoname:", meta.autoname)

        print("\nFIELDS")
        for field in meta.fields:
            if field.fieldtype in (
                "Section Break", "Column Break", "Tab Break",
                "Heading", "HTML", "Fold"
            ):
                continue

            options = (field.options or "").replace("\n", "/")
            print(
                f"{field.fieldname} | {field.label} | "
                f"{field.fieldtype} | required={field.reqd} | "
                f"read_only={field.read_only} | options={options}"
            )

        workflows = frappe.get_all(
            "Workflow",
            filters={
                "document_type": doctype,
                "is_active": 1,
            },
            fields=["name", "workflow_state_field"],
        )

        print("\nACTIVE WORKFLOWS:", len(workflows))

        for row in workflows:
            print(
                f"WORKFLOW: {row.name} | "
                f"STATE FIELD: {row.workflow_state_field}"
            )

            workflow = frappe.get_doc("Workflow", row.name)

            print("STATES:")
            for state in workflow.states:
                print(
                    f"  {state.state} | "
                    f"doc_status={state.doc_status}"
                )

            print("TRANSITIONS:")
            for transition in workflow.transitions:
                print(
                    f"  {transition.state} -> "
                    f"{transition.next_state} | "
                    f"action={transition.action}"
                )

        print("\nRELATED REPORTS")
        try:
            reports = frappe.get_all(
                "Report",
                filters={"ref_doctype": doctype},
                fields=["name", "report_type", "is_standard"],
                order_by="name asc",
            )
            if reports:
                for report in reports:
                    print(
                        f"  {report.name} | "
                        f"type={report.report_type} | "
                        f"standard={report.is_standard}"
                    )
            else:
                print("  No reports registered for this DocType")
        except Exception as exc:
            print("  Could not list reports:", str(exc))

    print("\n" + "=" * 72)
    print("AUDIT COMPLETE - NO BUSINESS RECORDS MODIFIED")
    print("=" * 72)
