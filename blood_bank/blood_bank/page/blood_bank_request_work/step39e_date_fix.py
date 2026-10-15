import os
import re
from pathlib import Path

root = Path(os.environ["D"])
js_path = root / "blood_bank_request_work.js"
api_path = root / "ui_api.py"

js = js_path.read_text(encoding="utf-8")
api = api_path.read_text(encoding="utf-8")

# Find the existing normalizer, whether or not this fix has run before.
start = js.find("    function normalizeFieldValue(field, value) {")
if start < 0:
    start = js.find("    function normalizeDefault(field) {")

end = js.find("    function makeFieldContainerLayout", start)

if start < 0 or end < 0:
    raise SystemExit(
        "ERROR: لم يتم العثور على حدود دالة التاريخ في JavaScript. "
        "لم تُكتب التغييرات."
    )

normalizer = r'''    function normalizeFieldValue(field, value) {
        if (value === null || value === undefined || value === "") {
            return "";
        }

        const type = String(field.fieldtype || "");
        const text = String(value).trim();
        const token = text.toLowerCase();

        if (type === "Date") {
            if (["today", "now", "now_datetime"].includes(token)) {
                return frappe.datetime.get_today();
            }

            const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
            return match ? match[1] : value;
        }

        if (type === "Datetime") {
            if (["today", "now", "now_datetime"].includes(token)) {
                return frappe.datetime.now_datetime();
            }

            const match = text.match(
                /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?(?:Z)?$/
            );

            if (match) {
                return match[1] + " " + match[2];
            }

            if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
                return text + " 00:00:00";
            }

            return value;
        }

        if (type === "Time") {
            if (["today", "now", "now_datetime"].includes(token)) {
                return frappe.datetime.now_datetime().slice(11, 19);
            }

            const match = text.match(
                /^\d{4}-\d{2}-\d{2}[ T](\d{2}:\d{2}:\d{2})/
            );

            if (match) {
                return match[1];
            }
        }

        return value;
    }

    function normalizeDefault(field) {
        return normalizeFieldValue(field, field.default);
    }

'''

js = js[:start] + normalizer + js[end:]

old_default = "default: field.default || undefined,"
new_default = "default: normalizeDefault(field) || undefined,"

if old_default in js:
    js = js.replace(old_default, new_default, 1)
elif new_default not in js:
    raise SystemExit(
        "ERROR: تعذر تحديد قيمة default لحقل Frappe. "
        "لم تُكتب التغييرات."
    )

# Normalize saved field values before setting native Frappe controls.
old_value = re.compile(
    r'''            let value = state\.currentValues\[field\.fieldname\];\n'''
    r'''(?:.*\n)*?'''
    r'''            control\.set_value\(value === null \|\| value === undefined \? "" : value\);''',
    re.M,
)

new_value = '''            let value = normalizeFieldValue(
                field,
                state.currentValues[field.fieldname]
            );

            if ((value === null || value === undefined || value === "") &&
                field.default) {
                value = normalizeDefault(field);
            }

            control.set_value(value === null || value === undefined ? "" : value);'''

if old_value.search(js):
    js, count = old_value.subn(new_value, js, count=1)
    if count != 1:
        raise SystemExit("ERROR: تعذر تحديث تمرير القيم إلى الحقول.")
elif "let value = normalizeFieldValue(" not in js:
    raise SystemExit(
        "ERROR: لم يتم العثور على كتلة تمرير القيم المتوقعة. "
        "لم تُكتب التغييرات."
    )

# Normalize server defaults according to the actual DocField type.
function_start = api.find("def get_stage_defaults(")
if function_start < 0:
    raise SystemExit("ERROR: دالة get_stage_defaults غير موجودة.")

block_start = api.find("        if field.default:", function_start)
if block_start < 0:
    raise SystemExit("ERROR: كتلة defaults غير موجودة.")

block_end_marker = "            defaults[field.fieldname] = value"
block_end = api.find(block_end_marker, block_start)
if block_end < 0:
    raise SystemExit("ERROR: نهاية كتلة defaults غير موجودة.")
block_end += len(block_end_marker)

old_python_block = api[block_start:block_end]

if 'token = str(field.default).strip().lower()' in old_python_block:
    new_python_block = old_python_block
else:
    new_python_block = '''        if field.default:
            token = str(field.default).strip().lower()

            if token in ("today", "now", "now_datetime"):
                if field.fieldtype == "Date":
                    value = today()
                elif field.fieldtype == "Datetime":
                    value = frappe.utils.now_datetime().strftime(
                        "%Y-%m-%d %H:%M:%S"
                    )
                elif field.fieldtype == "Time":
                    value = frappe.utils.now_datetime().strftime("%H:%M:%S")
                else:
                    value = field.default
            else:
                value = field.default

            # A Date field must never receive a timestamp string.
            if field.fieldtype == "Date" and value:
                match = re.match(r"^(\\d{4}-\\d{2}-\\d{2})", str(value).strip())
                if match:
                    value = match.group(1)

            defaults[field.fieldname] = value'''

    api = api[:block_start] + new_python_block + api[block_end:]

if not re.search(r"^import re$", api, re.M):
    api = "import re\n" + api

# Write only after all source checks have passed.
js_path.write_text(js, encoding="utf-8")
api_path.write_text(api, encoding="utf-8")

print("STEP 39-E: Date normalization updated.")
print("JavaScript: Date / Datetime / Time normalization OK.")
print("Python: server defaults normalized by field type.")
print("Backup:", os.environ.get("BACKUP_PATH", "(created before this script)"))
