import os
import re
from pathlib import Path

cw = Path(os.environ["CW"])
rw = Path(os.environ["RW"])

request_js_path = rw / "blood_bank_request_work.js"
component_js_path = cw / "blood_bank_component_work.js"
component_html_path = cw / "blood_bank_component_work.html"

request_js = request_js_path.read_text(encoding="utf-8")
component_js = component_js_path.read_text(encoding="utf-8")
component_html = component_html_path.read_text(encoding="utf-8")

# Blood Request toolbar button must open the native tracking report.
request_pattern = re.compile(
    r'frappe\.set_route\(\s*["\']List["\']\s*,\s*["\']Blood Request["\']\s*\)'
)
request_js, request_count = request_pattern.subn(
    'frappe.set_route("query-report", "Blood Request Tracking")',
    request_js,
)

if request_count != 1:
    raise SystemExit(
        "STOP: expected exactly one direct Blood Request List route; "
        "found {}. No files were written.".format(request_count)
    )

# Blood Unit navigation should open the existing initial-work page,
# not the underlying DocType List view.
unit_pattern = re.compile(
    r'frappe\.set_route\(\s*["\']List["\']\s*,\s*["\']Blood Unit["\']\s*\)'
)
component_js, unit_count = unit_pattern.subn(
    'frappe.set_route("blood-bank-initial-work")',
    component_js,
)

if unit_count != 1:
    raise SystemExit(
        "STOP: expected exactly one direct Blood Unit List route; "
        "found {}. No files were written.".format(unit_count)
    )

# Align the button label with its new destination.
old_label = "📋 قائمة وحدات الدم"
new_label = "🗂 نافذة العمل الأولية"

if component_html.count(old_label) != 1:
    raise SystemExit(
        "STOP: expected exactly one Blood Unit navigation button label. "
        "No files were written."
    )

component_html = component_html.replace(old_label, new_label, 1)

# Verify no static direct List/Form DocType navigation remains
# in these two grouped workflow pages.
direct_route = re.compile(
    r'frappe\.set_route\(\s*["\'](?:List|Form)["\']\s*,\s*["\']([^"\']+)["\']'
)

remaining = []
for filename, source in (
    ("blood_bank_request_work.js", request_js),
    ("blood_bank_component_work.js", component_js),
):
    for match in direct_route.finditer(source):
        remaining.append("{} -> {}".format(filename, match.group(1)))

if remaining:
    raise SystemExit(
        "STOP: unresolved direct DocType routes remain:\n"
        + "\n".join(remaining)
        + "\nNo files were written."
    )

# Write only after all preflight checks pass.
request_js_path.write_text(request_js, encoding="utf-8")
component_js_path.write_text(component_js, encoding="utf-8")
component_html_path.write_text(component_html, encoding="utf-8")

print("=" * 72)
print("STEP 39-I | NAVIGATION ROUTES UPDATED")
print('Request list -> query-report / Blood Request Tracking')
print('Blood Unit navigation -> page / blood-bank-initial-work')
print("No direct static List/Form routes remain in the two grouped pages.")
print("Request report remains independent from its workflow page.")
print("Backup:", os.environ["BACKUP"])
print("=" * 72)
