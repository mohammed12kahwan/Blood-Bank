import frappe

def setup():
    items = [
        ("blood_donation_embedded_form", "التبرع بالدم", "custom_tab_2"),
        ("blood_processing_embedded_form", "معالجة الدم", "custom_tab_3"),
    ]

    for fieldname, label, insert_after in items:
        old = frappe.db.get_value(
            "Custom Field",
            {"dt": "Blood Donor", "fieldname": fieldname},
            "name",
        )

        if old:
            frappe.delete_doc("Custom Field", old, ignore_permissions=True)

        d = frappe.new_doc("Custom Field")
        d.dt = "Blood Donor"
        d.fieldname = fieldname
        d.label = label
        d.fieldtype = "HTML"
        d.insert_after = insert_after
        d.insert(ignore_permissions=True)

    frappe.db.commit()
    print("OK - تم إنشاء حقلي HTML داخل التبويبين")

