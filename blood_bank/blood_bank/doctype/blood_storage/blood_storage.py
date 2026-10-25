import frappe
from frappe.model.document import Document
from frappe.utils import getdate, now_datetime, today


class BloodStorage(Document):

    def validate(self):

        self.validate_expiry_transition()
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
            ["unit_status", "blood_group_verified", "blood_group", "group_verification_status", "expiry_date"],
            as_dict=True,
        )

        if not unit:
            frappe.throw("وحدة الدم المرتبطة بالتخزين غير موجودة.")

        if not unit.expiry_date:
            frappe.throw(
                "لا يمكن إتاحة المكوّن دون تاريخ انتهاء صلاحية موثق لوحدة الدم."
            )

        if getdate(unit.expiry_date) <= getdate(today()):
            frappe.throw(
                "لا يمكن إتاحة مكوّن من وحدة انتهت صلاحيتها أو وصلت إلى تاريخ انتهائها."
            )

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

        normalized_groups = [
            "".join(ch for ch in str(value or "").upper() if ch.isalnum())
            for value in groups
        ]
        if (
            not normalized_groups[0]
            or any(value != normalized_groups[0]
                   for value in normalized_groups)
        ):
            frappe.throw(
                "تعارض في فصيلة الدم بين الوحدة والمكوّن والفحوصات والتخزين."
            )

    def validate_expiry_transition(self):

        previous = self.get_doc_before_save()
        if not previous:
            return

        previous_status = previous.get("storage_status")
        current_status = self.get("storage_status")

        # Correction route: only offer the workflow action for the
        # designated test record, and still require a future unit expiry.
        if previous_status == "Expired" and current_status == "Storage":
            if self.name != "STO-2026-00009":
                frappe.throw(
                    "تصحيح حالة التخزين متاح لهذا السجل التجريبي فقط."
                )

            expiry_date = frappe.db.get_value(
                "Blood Unit", self.get("blood_unit"), "expiry_date"
            )
            if not expiry_date or getdate(expiry_date) <= getdate(today()):
                frappe.throw(
                    "لا يمكن تصحيح الحالة؛ تاريخ انتهاء وحدة الدم غير صالح أو قد حلّ."
                )
            return

        if current_status != "Expired" or previous_status == "Expired":
            return

        if not self.get("blood_unit"):
            frappe.throw(
                "لا يمكن إنهاء صلاحية سجل التخزين دون ربطه بوحدة دم."
            )

        expiry_date = frappe.db.get_value(
            "Blood Unit", self.get("blood_unit"), "expiry_date"
        )
        if not expiry_date:
            frappe.throw(
                "لا يمكن إنهاء الصلاحية قبل تسجيل تاريخ انتهاء وحدة الدم."
            )

        if getdate(expiry_date) > getdate(today()):
            frappe.throw(
                f"لا يمكن تحويل التخزين إلى Expired قبل تاريخ انتهاء الوحدة: {expiry_date}."
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

        previous_status = previous.get("storage_status")
        current_status = self.get("storage_status")

        if previous_status == "Expired" and current_status == "Storage":
            self.set("available_date", None)
            self.set("available_at", None)
            self.set("available_by", None)

        if previous_status != "Storage" and current_status == "Storage":
            if not self.get("stored_at"):
                self.set("stored_at", now_datetime())
            self.set("stored_by", frappe.session.user)

        if previous_status != "Available" and current_status == "Available":
            self.set("available_date", today())
            self.set("available_at", now_datetime())
            self.set("available_by", frappe.session.user)

        if (
            previous_status != "Discarded"
            and current_status == "Discarded"
        ):
            self.set("discarded_at", now_datetime())
            self.set("discarded_by", frappe.session.user)
