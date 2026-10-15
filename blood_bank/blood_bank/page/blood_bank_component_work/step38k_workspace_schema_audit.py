import frappe
import json


def run():
    workspace_name = "Blood Bank UI Test"

    print("\n" + "=" * 72)
    print("STEP 38-K - WORKSPACE LINK STRUCTURE")
    print("=" * 72)

    if not frappe.db.exists("Workspace", workspace_name):
        print("ERROR: Workspace not found:", workspace_name)
        return

    meta = frappe.get_meta("Workspace")
    doc = frappe.get_doc("Workspace", workspace_name)

    print("\n>>> WORKSPACE FIELDS")
    for field in meta.fields:
        if field.fieldtype in ("Table", "Table MultiSelect"):
            print(
                f"\nTABLE FIELD: {field.fieldname}"
                f" | CHILD DOCTYPE: {field.options}"
            )

            if not field.options or not frappe.db.exists(
                "DocType", field.options
            ):
                print("  Child DocType unavailable")
                continue

            child_meta = frappe.get_meta(field.options)
            print("  Child fields:")
            for child_field in child_meta.fields:
                if child_field.fieldtype in (
                    "Section Break", "Column Break",
                    "Tab Break", "Heading", "Fold"
                ):
                    continue
                print(
                    f"    {child_field.fieldname}"
                    f" | {child_field.fieldtype}"
                    f" | options={child_field.options or ''}"
                )

            rows = doc.get(field.fieldname) or []
            print("  Existing rows:", len(rows))

            for row in rows:
                data = row.as_dict()
                keep = {
                    key: data.get(key)
                    for key in (
                        "label", "type", "link_type",
                        "link_to", "is_query_report",
                        "dependencies", "hidden",
                    )
                    if key in data
                }
                if keep:
                    print("   ", json.dumps(
                        keep, ensure_ascii=False, default=str
                    ))

    print("\n>>> WORKSPACE CONTENT")
    content = doc.get("content")
    if isinstance(content, str):
        try:
            content = json.loads(content)
        except Exception:
            pass

    if content is not None:
        serialized = json.dumps(
            content, ensure_ascii=False, default=str
        )
        print(serialized[:5000])
    else:
        print("No content field or no serialized content.")

    print("\n>>> REPORT AND PAGE")
    for doctype, name in [
        ("Report", "Blood Donation Tracking"),
        ("Page", "blood-bank-component-work"),
    ]:
        print(
            doctype, name,
            "| exists =", bool(frappe.db.exists(doctype, name))
        )

    print("\nAUDIT COMPLETE - NOTHING MODIFIED")
