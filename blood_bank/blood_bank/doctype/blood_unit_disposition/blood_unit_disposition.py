
import frappe
from frappe.model.document import Document


class BloodUnitDisposition(Document):

    def validate(self):

        self.load_blood_unit_information()
        self.validate_blood_unit()
        self.validate_reasons()
        self.validate_duplicate_disposition()

    def before_save(self):

        previous = self.get_doc_before_save()

        if not previous:
            return

        # ==============================================
        # Draft -> Rejected
        # ==============================================

        if (
            previous.disposition_status == "Draft"
            and self.disposition_status == "Rejected"
        ):

            if not self.rejection_reason:
                frappe.throw(
                    "Rejection Reason is required."
                )

            if not self.rejected_at:
                self.rejected_at = (
                    frappe.utils.now_datetime()
                )

            if not self.rejected_by:
                self.rejected_by = (
                    frappe.session.user
                )

        # ==============================================
        # Rejected -> Discarded
        # ==============================================

        if (
            previous.disposition_status == "Rejected"
            and self.disposition_status == "Discarded"
        ):

            if not self.discard_reason:
                frappe.throw(
                    "Discard Reason is required."
                )

            if not self.discarded_at:
                self.discarded_at = (
                    frappe.utils.now_datetime()
                )

            if not self.discarded_by:
                self.discarded_by = (
                    frappe.session.user
                )

    def load_blood_unit_information(self):

        if not self.blood_unit:
            return

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

        self.blood_group = unit.blood_group
        self.bag_number = unit.bag_number


    def validate_completed_transfusion(self, unit):
        if not unit or unit.unit_status != "Transfused":
            frappe.throw("A completed transfusion is required for this disposition.")

        rows = frappe.get_all(
            "Blood Transfusion",
            filters={
                "blood_unit": self.blood_unit,
                "transfusion_status": "Transfused",
                "transfusion_result": "Completed",
            },
            fields=["name", "blood_issue", "blood_handover", "blood_storage"],
            order_by="modified desc",
            limit_page_length=20,
        )
        for tr in rows:
            if not tr.blood_issue or not tr.blood_handover or not tr.blood_storage:
                continue
            issue = frappe.db.get_value(
                "Blood Issue", tr.blood_issue,
                ["issue_status", "blood_unit", "blood_storage"], as_dict=True
            )
            handover = frappe.db.get_value(
                "Blood Handover", tr.blood_handover,
                ["handover_status", "blood_unit", "blood_issue", "blood_storage"],
                as_dict=True
            )
            storage = frappe.db.get_value(
                "Blood Storage", tr.blood_storage,
                ["storage_status", "blood_unit"], as_dict=True
            )
            if (
                issue and issue.issue_status == "Issued"
                and issue.blood_unit == self.blood_unit
                and issue.blood_storage == tr.blood_storage
                and handover and handover.handover_status == "Handed Over"
                and handover.blood_unit == self.blood_unit
                and handover.blood_issue == tr.blood_issue
                and handover.blood_storage == tr.blood_storage
                and storage and storage.storage_status == "Issued"
                and storage.blood_unit == self.blood_unit
            ):
                return
        frappe.throw("No matching completed transfusion, issue, handover and storage were found.")

    def validate_blood_unit(self):
        if not self.blood_unit:
            return

        unit = frappe.db.get_value(
            "Blood Unit",
            self.blood_unit,
            ["unit_status", "blood_group", "bag_number"],
            as_dict=True,
        )

        if not unit:
            frappe.throw("Blood Unit record not found.")

        previous = self.get_doc_before_save()

        # New record: allow quarantine workflow or verified transfusion.
        if not previous:
            if unit.unit_status == "Quarantine":
                pass
            elif (
                unit.unit_status == "Transfused"
                and self.disposition_status in ("Draft", "Transfused")
            ):
                self.validate_completed_transfusion(unit)
            else:
                frappe.throw(
                    "New disposition requires Quarantine or a "
                    "verified completed transfusion."
                )

        # Existing record transitions are checked only when a prior
        # saved document actually exists.
        else:
            if (
                previous.disposition_status == "Draft"
                and self.disposition_status == "Rejected"
            ):
                if unit.unit_status != "Quarantine":
                    frappe.throw(
                        "Reject Unit requires the Blood Unit "
                        "to remain in Quarantine."
                    )

            elif (
                previous.disposition_status == "Rejected"
                and self.disposition_status == "Discarded"
            ):
                if unit.unit_status != "Rejected":
                    frappe.throw(
                        "Discard Unit requires the Blood Unit "
                        "to be Rejected first."
                    )

        if self.disposition_status == "Transfused":
            self.validate_completed_transfusion(unit)

        if self.disposition_status == "Rejected":
            if unit.unit_status not in ("Quarantine", "Rejected"):
                frappe.throw("Blood Unit is not eligible for Rejection.")

        if self.disposition_status == "Discarded":
            if unit.unit_status != "Rejected":
                frappe.throw(
                    "Blood Unit must be Rejected before Discarding."
                )

    def validate_reasons(self):

        if self.disposition_status == "Rejected":

            if not self.rejection_reason:
                frappe.throw(
                    "Rejection Reason is required."
                )

        if self.disposition_status == "Discarded":

            if not self.rejection_reason:
                frappe.throw(
                    "Rejection Reason must be retained."
                )

            if not self.discard_reason:
                frappe.throw(
                    "Discard Reason is required."
                )

    def validate_duplicate_disposition(self):

        if not self.blood_unit:
            return

        existing = frappe.db.sql(
            """
            SELECT name, disposition_status
            FROM `tabBlood Unit Disposition`
            WHERE blood_unit = %s
              AND name != %s
              AND disposition_status IN (
                      'Rejected',
                      'Discarded',
                      'Transfused'
                )
            LIMIT 1
            """,
            (
                self.blood_unit,
                self.name,
            ),
            as_dict=True,
        )

        if existing:
            frappe.throw(
                "This Blood Unit already has an active "
                f"disposition: {existing[0].name}."
            )

    def on_update(self):

        previous = self.get_doc_before_save()

        if not previous:
            return

        # ==============================================
        # Draft -> Rejected
        # ==============================================

        if (
            previous.disposition_status == "Draft"
            and self.disposition_status == "Rejected"
        ):

            unit_status = frappe.db.get_value(
                "Blood Unit",
                self.blood_unit,
                "unit_status",
            )

            if unit_status != "Quarantine":
                frappe.throw(
                    "Blood Unit must be Quarantine "
                    "before Rejection."
                )

            frappe.db.set_value(
                "Blood Unit",
                self.blood_unit,
                "unit_status",
                "Rejected",
                update_modified=True,
            )

        # ==============================================
        # Rejected -> Discarded
        # ==============================================

        elif (
            previous.disposition_status == "Rejected"
            and self.disposition_status == "Discarded"
        ):

            unit_status = frappe.db.get_value(
                "Blood Unit",
                self.blood_unit,
                "unit_status",
            )

            if unit_status != "Rejected":
                frappe.throw(
                    "Blood Unit must be Rejected "
                    "before Discard."
                )

            frappe.db.set_value(
                "Blood Unit",
                self.blood_unit,
                "unit_status",
                "Discarded",
                update_modified=True,
            )

    def on_trash(self):

        if self.disposition_status == "Discarded":
            frappe.throw(
                "Discarded disposition records must not "
                "be deleted."
            )
