import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class BloodStorage(Document):

    def validate(self):

        self.validate_discard_state()
        self.validate_discard_reason()
        self.validate_available_release()

    def validate_available_release(self):
        if self.get("storage_status") != "Available":
            return

        if self.is_new():
            frappe.throw(
                "لا يمكن إنشاء سجل تخزين مباشرة بحالة Available. "
                "أنشئ السجل أولًا ثم استخدم إجراء Make Available."
            )

        if not self.blood_component or not self.quality_check or not self.blood_unit:
            frappe.throw(
                "الإتاحة تتطلب ربط المكوّن وفحص الجودة ووحدة الدم."
            )

        unit = frappe.db.get_value(
            "Blood Unit",
            self.blood_unit,
            ["unit_status", "blood_group_verified", "blood_group", "group_verification_status"],
            as_dict=True,
        )

        if not unit:
            frappe.throw("وحدة الدم المرتبطة بالتخزين غير موجودة.")

        if unit.unit_status != "Accepted":
            frappe.throw(
                "لا يمكن إتاحة المكوّن قبل قبول وحدة الدم "
                "بعد فحص المختبر."
            )

        if (
            not unit.blood_group_verified
            or unit.group_verification_status != "Verified"
        ):
            frappe.throw("لا يمكن الإتاحة دون تحقق مخبري موثق من الفصيلة.")

        component = frappe.db.get_value(
            "Blood Component",
            self.blood_component,
            [
                "component_status",
                "blood_screening",
                "blood_unit",
                "blood_group",
            ],
            as_dict=True,
        )

        if not component:
            frappe.throw("مكوّن الدم المرتبط بالتخزين غير موجود.")

        if component.component_status != "Quality Check":
            frappe.throw(
                "المكوّن ليس في المرحلة المطلوبة قبل التخزين والإتاحة."
            )

        if component.blood_unit != self.blood_unit:
            frappe.throw(
                "وحدة الدم لا تطابق الوحدة المرتبطة بالمكوّن."
            )

        if not component.blood_screening:
            frappe.throw(
                "المكوّن غير مرتبط بسجل فحص المختبر."
            )

        screening = frappe.db.get_value(
            "Blood Screening",
            component.blood_screening,
            [
                "screening_status",
                "overall_result",
                "blood_unit",
                "blood_group",
            ],
            as_dict=True,
        )

        if (
            not screening
            or screening.screening_status != "Accepted"
            or screening.overall_result != "Passed"
            or screening.blood_unit != self.blood_unit
        ):
            frappe.throw(
                "الإتاحة تتطلب فحص مختبر مقبولًا بنتيجة Passed "
                "للوحدة نفسها."
            )

        qc = frappe.db.get_value(
            "Blood Component Quality Check",
            self.quality_check,
            [
                "qc_status",
                "overall_result",
                "blood_component",
                "blood_unit",
                "blood_group",
            ],
            as_dict=True,
        )

        if (
            not qc
            or qc.qc_status != "Passed"
            or qc.overall_result != "Passed"
            or qc.blood_component != self.blood_component
            or qc.blood_unit != self.blood_unit
        ):
            frappe.throw(
                "الإتاحة تتطلب فحص جودة ناجحًا للمكوّن نفسه."
            )

        groups = [
            unit.blood_group,
            component.blood_group,
            screening.blood_group,
            qc.blood_group,
            self.get("blood_group"),
        ]

        if not groups[0] or any(value != groups[0] for value in groups):
            frappe.throw(
                "تعارض في فصيلة الدم بين الوحدة والمكوّن والفحوصات والتخزين."
            )

    def validate_discard_state(self):

        if self.get("storage_status") != "Discarded":
            return

        previous = self.get_doc_before_save()

        # A newly created Discarded record must also have
        # a reason. Existing operational history is untouched.
        if not previous:
            return

        previous_status = previous.get(
            "storage_status"
        )

        # Discarded is a terminal operational status.
        # Once reached, it must not be moved backward.
        if previous_status == "Discarded":

            if not self.get("discard_reason"):
                frappe.throw(
                    "Discard Reason / سبب التخلص is mandatory "
                    "for Discarded Storage."
                )

            return

        # Every transition INTO Discarded requires a reason.
        if not self.get("discard_reason"):

            frappe.throw(
                "Discard Reason / سبب التخلص is mandatory "
                "before Storage can become Discarded."
            )

    def validate_discard_reason(self):

        if (
            self.get("storage_status") == "Discarded"
            and not self.get("discard_reason")
        ):
            frappe.throw(
                "Cannot save Discarded Storage without "
                "Discard Reason / سبب التخلص."
            )

    def before_save(self):

        previous = self.get_doc_before_save()

        if not previous:
            return

        if (
            previous.get("storage_status")
            != "Discarded"
            and self.get("storage_status")
            == "Discarded"
        ):

            self.set(
                "discarded_at",
                now_datetime(),
            )

            self.set(
                "discarded_by",
                frappe.session.user,
            )
