import re
from pathlib import Path
import frappe
from . import ui_api

def run():
    request_name = "REQ-2026-00001"

    print("=" * 76)
    print("STEP 39-E | DATE DEFAULT AUDIT")
    print("READ ONLY")
    print("=" * 76)

    schema = ui_api.get_page_schema()
    assert len(schema) == 7, "Expected seven workflow stages."

    for item in schema:
        doctype = item["doctype"]
        defaults = ui_api.get_stage_defaults(doctype, request_name)
        meta = frappe.get_meta(doctype)

        for field in meta.fields:
            if field.fieldtype != "Date":
                continue

            value = defaults.get(field.fieldname)
            if value in (None, ""):
                continue

            text = str(value).strip()
            print("{} | {} = {}".format(doctype, field.fieldname, text))

            assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", text), (
                "Invalid Date value: {}.{}={!r}".format(
                    doctype, field.fieldname, value
                )
            )

    page_dir = Path(ui_api.__file__).resolve().parent
    js = (page_dir / "blood_bank_request_work.js").read_text(
        encoding="utf-8"
    )

    assert "normalizeFieldValue" in js
    assert "default: normalizeDefault(field) || undefined" in js

    print("-" * 76)
    print("All returned Date values are date-only.")
    print("STEP 39-E DATE AUDIT PASS")
    print("No operational records were created, changed or deleted.")
    print("=" * 76)
