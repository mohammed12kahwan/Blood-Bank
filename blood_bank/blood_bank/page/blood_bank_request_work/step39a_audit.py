import frappe

DOCTYPES = [
    ("Blood Request", "request_status"),
    ("Blood Reservation", "reservation_status"),
    ("Blood Crossmatch", "crossmatch_status"),
    ("Blood Issue", "issue_status"),
    ("Blood Handover", "handover_status"),
    ("Blood Transfusion", "transfusion_status"),
    ("Blood Unit Disposition", "disposition_status"),
]

def run():
    print("=" * 92)
    print("STEP 39-A | REQUEST WORKFLOW STRUCTURE AUDIT")
    print("READ ONLY - NO BUSINESS RECORDS WILL BE CREATED, MODIFIED OR DELETED")
    print("=" * 92)

    known_doctypes = {dt for dt, _ in DOCTYPES}

    for dt, expected_status in DOCTYPES:
        print("\n" + "=" * 92)
        print("DOCTYPE:", dt)

        if not frappe.db.exists("DocType", dt):
            print("ERROR: DOCTYPE DOES NOT EXIST")
            continue

        meta = frappe.get_meta(dt)
        print("Module:", meta.module)
        print("Is Submittable:", meta.is_submittable)
        print("Naming:", meta.autoname)
        print("Count:", frappe.db.count(dt))
        print("Expected Status Field:", expected_status)
        print("Status Field Exists:", bool(meta.get_field(expected_status)))

        print("\nFIELDS:")
        for f in meta.fields:
            if f.fieldtype in (
                "Section Break", "Column Break", "Tab Break",
                "HTML", "Fold", "Heading", "Button"
            ):
                continue
            if f.hidden:
                continue

            opts = (f.options or "").replace("\n", "/")
            print(
                "  {fieldname} | {label} | {fieldtype} | "
                "options={options} | required={reqd} | readonly={readonly} "
                "| list={in_list_view} | fetch_from={fetch_from}".format(
                    fieldname=f.fieldname,
                    label=f.label or "",
                    fieldtype=f.fieldtype,
                    options=opts,
                    reqd=int(bool(f.reqd)),
                    readonly=int(bool(f.read_only)),
                    in_list_view=int(bool(f.in_list_view)),
                    fetch_from=f.fetch_from or "",
                )
            )

        print("\nLINK FIELDS BETWEEN REQUEST WORKFLOW DOCTYPES:")
        found_links = False
        for f in meta.fields:
            if f.fieldtype == "Link" and f.options in known_doctypes:
                found_links = True
                print(
                    "  {0} -> {1} | required={2} | readonly={3}".format(
                        f.fieldname,
                        f.options,
                        int(bool(f.reqd)),
                        int(bool(f.read_only)),
                    )
                )
        if not found_links:
            print("  No direct links to the seven workflow doctypes found.")

        workflows = frappe.get_all(
            "Workflow",
            filters={"document_type": dt, "is_active": 1},
            fields=["name", "workflow_state_field"],
            order_by="name asc",
        )
        print("\nACTIVE WORKFLOWS:")
        if not workflows:
            print("  None")
        for wf in workflows:
            print(
                "  {0} | State Field: {1}".format(
                    wf.name, wf.workflow_state_field or ""
                )
            )

        sample_names = frappe.get_all(
            dt,
            pluck="name",
            order_by="modified desc",
            limit_page_length=2,
        )
        print("\nRECENT RECORDS AND THEIR WORKFLOW ACTIONS:")
        if not sample_names:
            print("  No existing records")
        for name in sample_names:
            doc = frappe.get_doc(dt, name)
            state = doc.get(expected_status) if meta.get_field(expected_status) else None
            print("  RECORD:", name, "| STATUS:", state)

            for f in meta.fields:
                if f.fieldtype == "Link" and f.options and doc.get(f.fieldname):
                    print(
                        "    LINK {0} -> {1}".format(
                            f.fieldname, doc.get(f.fieldname)
                        )
                    )

            try:
                from frappe.model.workflow import get_transitions
                transitions = get_transitions(doc)
                actions = [
                    x.get("action")
                    for x in (transitions or [])
                    if x.get("action")
                ]
                print("    AVAILABLE WORKFLOW ACTIONS:", actions)
            except Exception as exc:
                print(
                    "    ACTION INSPECTION UNAVAILABLE:",
                    type(exc).__name__,
                    str(exc)[:180],
                )

    print("\n" + "=" * 92)
    print("STEP 39-A COMPLETE | READ ONLY")
    print("No save, insert, update, submit, cancel or delete operation was performed.")
    print("=" * 92)
