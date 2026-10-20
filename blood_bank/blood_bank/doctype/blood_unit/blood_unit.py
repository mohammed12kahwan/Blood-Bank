# Copyright (c) 2026, Hospital IT and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class BloodUnit(Document):
    # BB_CENTRAL_PROCESSING_LINK_VALIDATION_V1
    def validate(self):
        self.validate_blood_processing_link()
        self.sync_blood_group_from_verified_donor()
        self.validate_group_verification_integrity()

    # BB_UNIT_GROUP_VERIFICATION_INTEGRITY_V1
    def validate_group_verification_integrity(self):
        authorized_action = bool(
            getattr(frappe.flags, "bb_unit_group_verification_action", False)
        )
        previous = self.get_doc_before_save() if not self.is_new() else None
        protected = (
            "tested_abo_group", "tested_rh_factor",
            "group_verification_sample_id", "group_verification_status",
            "blood_group_verification_by", "blood_group_verification_date",
            "group_verification_notes", "blood_group_verified",
        )

        if previous and not authorized_action:
            changed = []
            for field in protected:
                before, after = previous.get(field), self.get(field)
                if (
                    field == "group_verification_status"
                    and before in (None, "") and after == "Pending"
                ):
                    continue
                if before != after:
                    changed.append(field)
            if changed:
                frappe.throw(
                    "لا يجوز تعديل تحقق الفصيلة مباشرة؛ استخدم إجراء المختبر."
                )
        elif not previous and not authorized_action:
            if any(
                self.get(field) for field in protected
                if field != "group_verification_status"
            ):
                frappe.throw(
                    "لا يمكن إدخال بيانات التحقق مباشرة عند إنشاء الوحدة."
                )

        status = self.get("group_verification_status")
        if status in ("Verified", "Discrepancy"):
            required = (
                "tested_abo_group", "tested_rh_factor",
                "group_verification_sample_id",
                "blood_group_verification_by",
                "blood_group_verification_date",
            )
            if any(not self.get(field) for field in required):
                frappe.throw("سجل تحقق الفصيلة غير مكتمل.")

        if self.get("blood_group_verified"):
            if status != "Verified":
                frappe.throw("تفعيل التحقق يتطلب حالة Verified.")
            if (
                self.get("tested_abo_group") != self.get("abo_group")
                or self.get("tested_rh_factor") != self.get("rh_factor")
            ):
                frappe.throw("نتيجة فحص الفصيلة لا تطابق بيانات المصدر.")
        elif status == "Verified":
            frappe.throw("لا يمكن اعتماد Verified دون تفعيل التحقق.")

    def sync_blood_group_from_verified_donor(self):
        allowed_abo = {"A", "B", "AB", "O"}
        allowed_rh = {"Positive", "Negative"}

        donation_name = self.get("blood_donation")
        if not donation_name:
            return

        donor_name = frappe.db.get_value(
            "Blood Donation", donation_name, "donor"
        )
        if not donor_name:
            frappe.throw(
                "تعذر جلب الفصيلة: التبرع المصدر لا يحتوي على متبرع مرتبط."
            )

        source = frappe.db.get_value(
            "Blood Donor",
            donor_name,
            [
                "abo_group",
                "rh_factor",
                "blood_group",
                "blood_group_verified",
            ],
            as_dict=True,
        )
        if not source:
            frappe.throw("سجل المتبرع المصدر غير موجود.")

        if not source.blood_group_verified:
            if (
                self.get("abo_group")
                or self.get("rh_factor")
                or self.get("blood_group")
                or self.get("blood_group_verified")
            ):
                frappe.throw(
                    "بيانات الفصيلة الموجودة في وحدة الدم لا يمكن "
                    "مطابقتها مع متبرع غير معتمد. راجع المصدر أولًا."
                )
            return

        if source.abo_group not in allowed_abo:
            frappe.throw(
                "لا يمكن نقل الفصيلة: قيمة ABO في سجل المتبرع غير صحيحة. "
                "صحح سجل المتبرع وفق نتيجة الفحص الأصلية أولًا."
            )

        if source.rh_factor not in allowed_rh:
            frappe.throw(
                "لا يمكن نقل الفصيلة: عامل Rh في سجل المتبرع غير صحيح. "
                "صحح سجل المتبرع وفق نتيجة الفحص الأصلية أولًا."
            )

        expected_group = f"{source.abo_group} {source.rh_factor}"
        if source.blood_group != expected_group:
            frappe.throw(
                "الفصيلة الكاملة في سجل المتبرع لا تطابق ABO وRh. "
                "أوقف النقل حتى يصحح المصدر."
            )

        # Check the linked Processing record before copying its source group.
        processing_name = self.get("blood_processing")
        if processing_name:
            processing = frappe.db.get_value(
                "Blood Processing",
                processing_name,
                ["blood_donation", "donor", "blood_group"],
                as_dict=True,
            )
            if not processing:
                frappe.throw("سجل المعالجة المرتبط بوحدة الدم غير موجود.")

            if (
                processing.blood_donation
                and processing.blood_donation != donation_name
            ):
                frappe.throw(
                    "التبرع في وحدة الدم لا يطابق التبرع في المعالجة."
                )

            if processing.donor and processing.donor != donor_name:
                frappe.throw(
                    "المتبرع في المعالجة لا يطابق المتبرع في التبرع المصدر."
                )

            if (
                processing.blood_group
                and processing.blood_group != expected_group
            ):
                frappe.throw(
                    "فصيلة المعالجة لا تطابق الفصيلة المعتمدة للمتبرع. "
                    "لن يتم تجاوز هذا التعارض تلقائيًا."
                )

        # New unsaved Select fields may default to the first option (A).
        # Treat these as UI defaults and populate from the verified donor.
        # For existing units, conflicting saved values must never be
        # silently overwritten.
        if not self.is_new():
            expected_fields = {
                "abo_group": source.abo_group,
                "rh_factor": source.rh_factor,
                "blood_group": expected_group,
            }
            for field, expected in expected_fields.items():
                current = self.get(field)
                if current and current != expected:
                    frappe.throw(
                        f"حقل {field} في وحدة الدم ({current}) لا يطابق "
                        f"المتبرع المعتمد ({expected}). "
                        "لم يتم استبدال القيمة المتعارضة تلقائيًا."
                    )

        if self.get("donor") and self.donor != donor_name:
            frappe.throw(
                "المتبرع المرتبط بوحدة الدم لا يطابق متبرع التبرع المصدر."
            )

        self.donor = donor_name
        self.abo_group = source.abo_group
        self.rh_factor = source.rh_factor
        self.blood_group = expected_group
        # Preserve unit-level verification as a separate workflow gate.
        # Do not set blood_group_verified from donor approval alone.

    def validate_blood_processing_link(self):
        donation = self.get("blood_donation")
        processing_name = self.get("blood_processing")

        if not donation:
            if self.is_new():
                frappe.throw("يجب تحديد التبرع قبل إنشاء وحدة الدم.")
            return

        if processing_name:
            source = frappe.db.get_value(
                "Blood Processing",
                processing_name,
                ["blood_donation", "processing_status"],
                as_dict=True,
            )

            if not source:
                frappe.throw("سجل المعالجة المرتبط بوحدة الدم غير موجود.")

            if source.blood_donation != donation:
                frappe.throw(
                    "لا يمكن ربط وحدة الدم بمعالجة تخص تبرعًا مختلفًا."
                )

            if source.processing_status != "Component Separation":
                frappe.throw(
                    "لا يمكن إنشاء وحدة الدم قبل اكتمال فصل المكونات "
                    "في سجل المعالجة المرتبط."
                )
            return

        matches = frappe.get_all(
            "Blood Processing",
            filters={
                "blood_donation": donation,
                "processing_status": "Component Separation",
            },
            fields=["name"],
            limit_page_length=2,
        )

        if len(matches) == 1:
            self.blood_processing = matches[0].name
            return

        if len(matches) > 1:
            frappe.throw(
                "توجد عدة سجلات معالجة مكتملة للتبرع نفسه. "
                "حدد سجل المعالجة الصحيح قبل حفظ وحدة الدم."
            )

        if self.is_new():
            frappe.throw(
                "لم تُنشأ وحدة الدم: يجب إكمال فصل المكونات أولًا "
                "ووجود سجل معالجة مطابق للتبرع."
            )
        # التوافق مع السجلات التاريخية: لا نخمن رابطًا عند تعديل
        # سجل قديم إذا لم توجد معالجة مكتملة مطابقة.

    # BB_RECIPROCAL_PROCESSING_UNIT_LINK_V1
    def on_update(self):
        # مزامنة الرابط المقابل بعد حفظ وحدة موجودة في الحجر فقط.
        if self.unit_status != "Quarantine" or not self.blood_processing:
            return

        processing = frappe.get_doc(
            "Blood Processing", self.blood_processing
        )

        if processing.processing_status != "Component Separation":
            frappe.throw(
                "لا يمكن ربط وحدة الدم قبل اكتمال فصل المكونات."
            )

        if processing.blood_donation != self.blood_donation:
            frappe.throw(
                "لا يمكن ربط وحدة الدم بمعالجة تخص تبرعًا مختلفًا."
            )

        if processing.blood_unit and processing.blood_unit != self.name:
            frappe.throw(
                "المعالجة مرتبطة بوحدة دم أخرى بالفعل."
            )

        if not processing.blood_unit:
            processing.blood_unit = self.name
            processing.save(ignore_permissions=True)



# BB_UNIT_GROUP_VERIFICATION_TEMPORARILY_DISABLED_V1
@frappe.whitelist()
def record_blood_group_verification(
    name=None, tested_abo_group=None, tested_rh_factor=None,
    sample_id=None, notes=None
):
    frappe.throw(
        "تم تعليق التحقق اليدوي مؤقتًا. يجب تسجيل نتيجة فحص الفصيلة "
        "في سجل مخبري مستقل موثق قبل اعتماد الوحدة."
    )
