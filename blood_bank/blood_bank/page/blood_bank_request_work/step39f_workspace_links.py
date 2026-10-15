import json
from pathlib import Path

import frappe


WORKSPACE_NAME = "Blood Bank UI Test"

TARGETS = [
    {
        "type": "Report",
        "link_to": "Blood Request Tracking",
        "label": "تقرير طلبات الدم",
        "card_id": "bbreqrep39f",
    },
    {
        "type": "Page",
        "link_to": "blood-bank-request-work",
        "label": "متابعة طلبات الدم",
        "card_id": "bbreqpage39f",
    },
]


def _load_content(value):
    if not value:
        return []

    if isinstance(value, list):
        return value

    parsed = json.loads(value)
    if not isinstance(parsed, list):
        raise ValueError("Workspace content must be a JSON list.")

    return parsed


def _shortcut_rows(workspace):
    child_field = frappe.get_meta("Workspace").get_field("shortcuts")
    if not child_field or not child_field.options:
        raise RuntimeError(
            "لم يتم العثور على جدول shortcuts في Workspace."
        )

    child_meta = frappe.get_meta(child_field.options)
    fieldnames = {field.fieldname for field in child_meta.fields}

    for required in ("type", "label", "link_to"):
        if required not in fieldnames:
            raise RuntimeError(
                "حقل Workspace Shortcut المطلوب غير موجود: " + required
            )

    return child_meta, fieldnames


def run():
    print("=" * 78)
    print("STEP 39-F | WORKSPACE REPORT AND PAGE LINKS")
    print("=" * 78)

    # Verify the destinations exist before changing Workspace.
    if not frappe.db.exists("Report", "Blood Request Tracking"):
        raise RuntimeError(
            "تقرير Blood Request Tracking غير مسجل؛ أوقفنا التعديل."
        )

    if not frappe.db.exists("Page", "blood-bank-request-work"):
        raise RuntimeError(
            "صفحة blood-bank-request-work غير مسجلة؛ أوقفنا التعديل."
        )

    if not frappe.db.exists("Workspace", WORKSPACE_NAME):
        raise RuntimeError(
            "لم يتم العثور على Workspace: " + WORKSPACE_NAME
        )

    workspace = frappe.get_doc("Workspace", WORKSPACE_NAME)
    child_meta, child_fields = _shortcut_rows(workspace)

    print("Workspace:", workspace.name)
    print("Shortcuts before:", len(workspace.get("shortcuts") or []))

    # Preserve existing shortcuts. Add only missing destinations.
    for target in TARGETS:
        exists = any(
            row.get("type") == target["type"]
            and row.get("link_to") == target["link_to"]
            for row in (workspace.get("shortcuts") or [])
        )

        if exists:
            print(
                "Shortcut already exists:",
                target["type"],
                target["link_to"],
            )
            continue

        row_data = {
            "type": target["type"],
            "label": target["label"],
            "link_to": target["link_to"],
        }

        # Set an icon only if the installed child DocType supports it.
        if "icon" in child_fields:
            row_data["icon"] = (
                "chart-no-axes-combined"
                if target["type"] == "Report"
                else "panels-top-left"
            )

        workspace.append("shortcuts", row_data)

        print(
            "Added shortcut:",
            target["type"],
            target["link_to"],
            "->",
            target["label"],
        )

    # Preserve the current Workspace content and add cards for the
    # shortcuts so both entries are visible directly on the workspace.
    content = _load_content(workspace.content)
    existing_card_names = set()

    for block in content:
        if not isinstance(block, dict):
            continue
        data = block.get("data") or {}
        if block.get("type") == "shortcut":
            existing_card_names.add(data.get("shortcut_name"))

    for target in TARGETS:
        if target["label"] in existing_card_names:
            print("Workspace card already exists:", target["label"])
            continue

        content.append({
            "id": target["card_id"],
            "type": "shortcut",
            "data": {
                "shortcut_name": target["label"],
                "col": 3,
            },
        })

        print("Added workspace card:", target["label"])

    workspace.content = json.dumps(content, ensure_ascii=False)
    workspace.flags.ignore_permissions = True
    workspace.save(ignore_permissions=True)
    frappe.db.commit()

    # Re-read saved database values and assert both links and cards exist.
    saved = frappe.get_doc("Workspace", WORKSPACE_NAME)

    for target in TARGETS:
        shortcut_ok = any(
            row.get("type") == target["type"]
            and row.get("link_to") == target["link_to"]
            and row.get("label") == target["label"]
            for row in (saved.get("shortcuts") or [])
        )

        saved_content = _load_content(saved.content)
        card_ok = any(
            isinstance(block, dict)
            and block.get("type") == "shortcut"
            and (block.get("data") or {}).get("shortcut_name")
                == target["label"]
            for block in saved_content
        )

        print(
            "{} | shortcut={} | workspace_card={}".format(
                target["label"],
                "PASS" if shortcut_ok else "FAIL",
                "PASS" if card_ok else "FAIL",
            )
        )

        if not shortcut_ok or not card_ok:
            raise AssertionError(
                "Workspace link verification failed: " + target["label"]
            )

    # Update the standard Workspace JSON when the app source file exists.
    source_json = Path(
        "/home/mohammed/frappe-bench/apps/blood_bank/"
        "blood_bank/blood_bank/workspace/"
        "blood_bank_ui_test/blood_bank_ui_test.json"
    )

    if source_json.is_file():
        raw = json.loads(source_json.read_text(encoding="utf-8"))

        raw["content"] = saved.content

        serialized_shortcuts = []
        for row in saved.get("shortcuts") or []:
            item = {}
            for field in child_meta.fields:
                key = field.fieldname
                if not key or key in {
                    "name", "owner", "creation", "modified",
                    "modified_by", "parent", "parentfield",
                    "parenttype", "docstatus",
                }:
                    continue

                value = row.get(key)
                if value not in (None, ""):
                    item[key] = value

            if row.get("idx"):
                item["idx"] = row.idx

            serialized_shortcuts.append(item)

        raw["shortcuts"] = serialized_shortcuts
        source_json.write_text(
            json.dumps(raw, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print("Workspace source JSON synchronized:", source_json)
    else:
        print(
            "NOTE: Workspace source JSON was not found at the expected path. "
            "Database Workspace links were saved and verified."
        )

    print("-" * 78)
    print("Existing shortcuts and cards were preserved.")
    print("No blood-bank operational records were changed.")
    print("STEP 39-F WORKSPACE LINKS PASS")
    print("=" * 78)
