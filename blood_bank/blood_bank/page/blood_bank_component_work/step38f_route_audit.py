import frappe
from pathlib import Path


def run():
    print("\n" + "=" * 68)
    print("STEP 38-F - PAGE ROUTE AND WORKSPACE AUDIT")
    print("=" * 68)

    route = "blood-bank-component-work"

    print("\n>>> PAGE REGISTRY")
    print("Registered:", bool(frappe.db.exists("Page", route)))

    if frappe.db.exists("Page", route):
        page = frappe.get_doc("Page", route)
        print("Name:", page.name)
        print("Title:", page.title)
        print("Module:", page.module)
        print("Standard:", page.standard)

    print("\n>>> WORKSPACE MATCHES")
    for workspace in frappe.get_all(
        "Workspace",
        fields=["name", "label", "module", "public"],
        order_by="name",
        limit_page_length=1000,
    ):
        text = f"{workspace.name} {workspace.label or ''}"
        if "blood" in text.lower() or "بنك" in text:
            print(
                workspace.name,
                "| label =", workspace.label,
                "| module =", workspace.module,
                "| public =", workspace.public,
            )

    print("\n>>> MATCHING WORKSPACE FILES")
    root = Path("apps/blood_bank")
    found = False

    for p in root.rglob("*.json"):
        if "workspace" in str(p).lower() and (
            "ui_test" in p.name.lower()
            or "blood_bank_ui_test" in str(p).lower()
        ):
            found = True
            print(p)

    if not found:
        print("No matching workspace JSON found in blood_bank app.")

    print("\nAUDIT COMPLETE - NO BUSINESS RECORDS MODIFIED")
