import frappe

def setup():
    tab_name = frappe.db.get_value(
        "Custom Field",
        {"dt": "Blood Donor", "fieldname": "custom_tab_4"},
        "name"
    )
    if tab_name:
        frappe.delete_doc("Custom Field", tab_name, ignore_permissions=True)

    tab = frappe.new_doc("Custom Field")
    tab.dt = "Blood Donor"
    tab.fieldname = "custom_tab_4"
    tab.label = "وحدة الدم"
    tab.fieldtype = "Tab Break"
    tab.insert_after = "custom_tab_3"
    tab.insert(ignore_permissions=True)

    html_name = frappe.db.get_value(
        "Custom Field",
        {"dt": "Blood Donor", "fieldname": "blood_unit_embedded_form"},
        "name"
    )
    if html_name:
        frappe.delete_doc("Custom Field", html_name, ignore_permissions=True)

    html = frappe.new_doc("Custom Field")
    html.dt = "Blood Donor"
    html.fieldname = "blood_unit_embedded_form"
    html.label = "وحدة الدم"
    html.fieldtype = "HTML"
    html.insert_after = "custom_tab_4"
    html.insert(ignore_permissions=True)

    frappe.db.commit()
    print("OK - تمت إضافة Tab وحدة الدم داخل Blood Donor")
