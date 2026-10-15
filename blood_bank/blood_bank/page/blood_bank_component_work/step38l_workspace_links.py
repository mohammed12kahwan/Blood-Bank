import frappe
import json
from pathlib import Path


WORKSPACE = "Blood Bank UI Test"
REPORT_NAME = "Blood Donation Tracking"
REPORT_LABEL = "تقرير التبرعات"
PAGE_ROUTE = "blood-bank-component-work"
PAGE_LABEL = "متابعة مكونات الدم"


def run():
    print("\n" + "=" * 68)
    print("STEP 38-L - WORKSPACE REPORT AND PAGE SHORTCUTS")
    print("=" * 68)

    if not frappe.db.exists("Workspace", WORKSPACE):
        raise Exception(f"Workspace not found: {WORKSPACE}")

    if not frappe.db.exists("Report", REPORT_NAME):
        raise Exception(f"Report not registered: {REPORT_NAME}")

    if not frappe.db.exists("Page", PAGE_ROUTE):
        raise Exception(f"Page not registered: {PAGE_ROUTE}")

    doc = frappe.get_doc("Workspace", WORKSPACE)

    # Preserve the original state as a local recovery snapshot.
    backup_path = Path("/tmp/step38l_workspace_backup.json")
    backup_path.write_text(
        json.dumps({
            "workspace": WORKSPACE,
            "shortcuts": [row.as_dict() for row in doc.shortcuts],
            "content": doc.get("content"),
        }, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )
    print("Backup:", backup_path)

    def ensure_shortcut(shortcut_type, link_to, label):
        matches = [
            row for row in doc.shortcuts
            if row.type == shortcut_type and row.link_to == link_to
        ]

        if matches:
            for row in matches:
                row.label = label
            print("UPDATED SHORTCUT:", shortcut_type, link_to, "=>", label)
        else:
            doc.append("shortcuts", {
                "type": shortcut_type,
                "link_to": link_to,
                "label": label,
            })
            print("ADDED SHORTCUT:", shortcut_type, link_to, "=>", label)

    ensure_shortcut("Report", REPORT_NAME, REPORT_LABEL)
    ensure_shortcut("Page", PAGE_ROUTE, PAGE_LABEL)

    content = doc.get("content") or []
    if isinstance(content, str):
        try:
            content = json.loads(content)
        except Exception as exc:
            raise Exception(
                "Workspace content is not valid JSON; stopped without saving."
            ) from exc

    if not isinstance(content, list):
        raise Exception(
            "Workspace content is not a list; stopped without saving."
        )

    report_block = None

    # Correct the visual label in existing shortcut blocks.
    for block in content:
        if not isinstance(block, dict):
            continue
        data = block.get("data") or {}
        label = data.get("shortcut_name")

        if label == "متابعة مكونات الدم11":
            data["shortcut_name"] = PAGE_LABEL

        if label == REPORT_LABEL:
            report_block = block

    # Add the report card once, before other shortcut cards.
    if report_block is None:
        report_block = {
            "id": "bbdontrack1",
            "type": "shortcut",
            "data": {
                "shortcut_name": REPORT_LABEL,
                "col": 3,
            },
        }

        insertion_index = next(
            (
                index
                for index, block in enumerate(content)
                if isinstance(block, dict)
                and block.get("type") == "shortcut"
            ),
            len(content),
        )
        content.insert(insertion_index, report_block)
        print("ADDED REPORT CARD TO WORKSPACE CONTENT")
    else:
        print("REPORT CARD ALREADY EXISTS")

    doc.content = json.dumps(
        content,
        ensure_ascii=False,
        separators=(",", ":"),
    )

    doc.save(ignore_permissions=True)
    frappe.db.commit()

    # Verify saved child records and visible content.
    saved = frappe.get_doc("Workspace", WORKSPACE)

    print("\n>>> SAVED SHORTCUTS")
    for row in saved.shortcuts:
        print(
            f"{row.type} | {row.link_to} | {row.label}"
        )

    print("\n>>> REPORT CARD")
    parsed = saved.get("content") or []
    if isinstance(parsed, str):
        parsed = json.loads(parsed)

    for block in parsed:
        if (
            isinstance(block, dict)
            and block.get("type") == "shortcut"
            and (block.get("data") or {}).get("shortcut_name")
            in (REPORT_LABEL, PAGE_LABEL)
        ):
            print(json.dumps(block, ensure_ascii=False))

    print("\nSTEP 38-L PASS")
    print("Report and independent work page are registered in the workspace.")
    print("No business records were created, deleted, or changed.")


