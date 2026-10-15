
import frappe
from frappe.model.document import Document


class BloodComponent(Document):

    # BB_SERVER_REQUIRED_COMPONENT_AUTOFILL
    def before_insert(self):
        import frappe

        if not self.preparation_date:
            self.preparation_date = frappe.utils.today()

        if (
            not self.component_number
            or str(self.component_number).startswith("PENDING-COMP-")
        ):
            from frappe.model.naming import make_autoname
            self.component_number = make_autoname("CMP-.YYYY.-.#####")

        # استعادة وحدة الدم من الفحص عند الحاجة.
        if self.blood_screening and not self.blood_unit:
            screening = frappe.db.get_value(
                "Blood Screening",
                self.blood_screening,
                ["screening_status", "overall_result", "blood_unit"],
                as_dict=True,
            )
            if not screening:
                frappe.throw("سجل فحص الدم المرتبط غير موجود.")
            if (
                screening.screening_status != "Accepted"
                or screening.overall_result != "Passed"
            ):
                frappe.throw("إنشاء المكوّن يتطلب فحصًا مقبولًا ونتيجته Passed.")
            self.blood_unit = screening.blood_unit

        # الأولوية للرابط الصريح المخزّن في وحدة الدم.
        if self.blood_unit and not self.blood_processing:
            unit = frappe.get_doc("Blood Unit", self.blood_unit)
            if unit.meta.get_field("blood_processing") and unit.blood_processing:
                self.blood_processing = unit.blood_processing

        # إذا لم يوجد رابط صريح، نبحث عن سجل معالجة وحيد مطابق.
        if self.blood_unit and not self.blood_processing:
            filters = {
                "blood_unit": self.blood_unit,
                "processing_status": "Component Separation",
            }
            if self.blood_screening:
                filters["blood_screening"] = self.blood_screening

            matches = frappe.get_all(
                "Blood Processing",
                filters=filters,
                fields=["name"],
                limit_page_length=2,
            )

            if len(matches) == 1:
                self.blood_processing = matches[0].name
            elif len(matches) > 1:
                frappe.throw(
                    "توجد سجلات معالجة متعددة مطابقة. "
                    "لم يتم اختيار سجل عشوائي."
                )

        if not self.blood_processing:
            frappe.throw(
                "تعذر جلب معالجة الدم تلقائيًا. "
                "تحقق من ربط وحدة الدم بسجل معالجة في حالة Component Separation."
            )

    def validate(self):

        self.load_source_information()
        self.validate_source_processing()

    def load_source_information(self):

        if not self.blood_processing:
            return

        processing = frappe.db.get_value(
            "Blood Processing",
            self.blood_processing,
            [
                "processing_status",
                "blood_screening",
                "blood_unit",
                "donor",
                "donor_name",
                "blood_group",
                "bag_number",
            ],
            as_dict=True,
        )

        if not processing:

            frappe.throw(
                "Blood Processing record not found."
            )

        if processing.processing_status != "Component Separation":

            frappe.throw(
                "Blood Component can only be created "
                "from Blood Processing in Component Separation."
            )

        self.blood_unit = processing.blood_unit
        self.blood_screening = processing.blood_screening
        self.donor = processing.donor
        self.donor_name = processing.donor_name
        self.blood_group = processing.blood_group
        self.bag_number = processing.bag_number

    def validate_source_processing(self):

        if not self.blood_processing:
            return

        processing = frappe.db.get_value(
            "Blood Processing",
            self.blood_processing,
            [
                "processing_status",
                "blood_unit",
            ],
            as_dict=True,
        )

        if not processing:
            frappe.throw(
                "Source Blood Processing not found."
            )

        if processing.processing_status != "Component Separation":

            frappe.throw(
                "Source Blood Processing must be "
                "in Component Separation."
            )

        if not self.blood_unit:

            frappe.throw(
                "Blood Component requires a Blood Unit."
            )

        if self.blood_unit != processing.blood_unit:

            frappe.throw(
                "Blood Unit does not match "
                "the Blood Processing source."
            )

        unit = frappe.db.get_value(
            "Blood Unit",
            self.blood_unit,
            [
                "unit_status",
                "blood_group",
                "bag_number",
            ],
            as_dict=True,
        )

        if not unit:

            frappe.throw(
                "Blood Unit record not found."
            )

        if unit.unit_status != "Quarantine":

            frappe.throw(
                "Blood Component creation requires "
                "the Blood Unit to remain in Quarantine."
            )

        if unit.blood_group != self.blood_group:

            frappe.throw(
                "Blood Group mismatch."
            )

        if unit.bag_number != self.bag_number:

            frappe.throw(
                "Bag Number mismatch."
            )
