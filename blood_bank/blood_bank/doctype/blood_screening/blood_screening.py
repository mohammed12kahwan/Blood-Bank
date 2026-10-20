import frappe
# Copyright (c) 2026, Hospital IT and contributors
# For license information, please see license.txt

from frappe.model.document import Document
from frappe.model.naming import make_autoname


class BloodScreening(Document):
    def before_insert(self):
        # BB AUTO SAMPLE ID
        if not self.sample_id:
            self.sample_id = make_autoname("SMP-.YYYY.-.#####")

    # BB_UNIT_GROUP_VERIFICATION_SERVER_GATE_V1
    def validate(self):
        if self.screening_status != "Accepted":
            return
        previous = self.get_doc_before_save()
        if previous and previous.screening_status == "Accepted":
            return
        if self.overall_result != "Passed":
            frappe.throw("لا يمكن قبول فحص المختبر ما لم تكن النتيجة Passed.")
        if not self.blood_unit:
            frappe.throw("سجل فحص الدم لا يحتوي على وحدة مرتبطة.")
        unit = frappe.db.get_value(
            "Blood Unit", self.blood_unit,
            ["unit_status", "blood_group_verified", "group_verification_status"],
            as_dict=True,
        )
        if not unit:
            frappe.throw("وحدة الدم المرتبطة بالفحص غير موجودة.")
        if (
            not unit.blood_group_verified
            or unit.group_verification_status != "Verified"
        ):
            frappe.throw("لا يمكن قبول الفحص قبل توثيق تحقق فصيلة الوحدة.")
        if unit.unit_status not in ("Quarantine", "Accepted"):
            frappe.throw("حالة الوحدة لا تسمح بقبول فحص المختبر.")

    def _bb_sync_processing_link_after_accept(self):
        """Link one matching processing record after screening acceptance."""
        if (
            self.screening_status != "Accepted"
            or self.overall_result != "Passed"
            or not self.blood_unit
        ):
            return

        unit = frappe.db.get_value(
            "Blood Unit",
            self.blood_unit,
            [
                "unit_status",
                "blood_donation",
                "donor",
                "blood_group",
                "bag_number",
            ],
            as_dict=True,
        )

        if not unit or unit.unit_status != "Quarantine":
            return

        # Do not link records if the screening and unit disagree.
        for field in ("donor", "blood_group", "bag_number"):
            screen_value = self.get(field)
            unit_value = unit.get(field)
            if not screen_value or not unit_value or screen_value != unit_value:
                return

        lookup_filters = [
            {"blood_screening": self.name},
            {"blood_unit": self.blood_unit},
        ]

        if unit.blood_donation:
            lookup_filters.append({"blood_donation": unit.blood_donation})

        if unit.donor and unit.bag_number:
            lookup_filters.append({
                "donor": unit.donor,
                "bag_number": unit.bag_number,
            })

        for match_filters in lookup_filters:
            rows = frappe.get_all(
                "Blood Processing",
                filters={
                    **match_filters,
                    "processing_status": "Component Separation",
                },
                fields=[
                    "name",
                    "blood_unit",
                    "blood_screening",
                    "blood_donation",
                    "donor",
                    "blood_group",
                    "bag_number",
                ],
                limit_page_length=20,
            )

            valid = []
            for row in rows:
                if row.blood_unit and row.blood_unit != self.blood_unit:
                    continue
                if row.blood_screening and row.blood_screening != self.name:
                    continue
                if row.donor and row.donor != unit.donor:
                    continue
                if row.blood_group and row.blood_group != unit.blood_group:
                    continue
                if row.bag_number and row.bag_number != unit.bag_number:
                    continue
                if (
                    row.blood_donation
                    and unit.blood_donation
                    and row.blood_donation != unit.blood_donation
                ):
                    continue
                valid.append(row)

            # Never guess when no unique source processing exists.
            if len(valid) > 1:
                return

            if len(valid) == 1:
                processing = frappe.get_doc(
                    "Blood Processing", valid[0].name
                )

                if (
                    processing.blood_unit
                    and processing.blood_unit != self.blood_unit
                ):
                    return
                if (
                    processing.blood_screening
                    and processing.blood_screening != self.name
                ):
                    return

                processing.blood_unit = self.blood_unit
                processing.blood_screening = self.name
                processing.save(ignore_permissions=True)
                return


    def on_update(self):
        self._bb_sync_processing_link_after_accept()

