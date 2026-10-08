
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

    def validate_blood_unit(self):

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

        previous = self.get_doc_before_save()

        # New disposition must start from Quarantine.
        if not previous:

            if unit.unit_status != "Quarantine":
                frappe.throw(
                    "Blood Unit Disposition requires "
                    "the Blood Unit to be in Quarantine."
                )

        # Draft -> Rejected
        elif (
            previous.disposition_status == "Draft"
            and self.disposition_status == "Rejected"
        ):

            if unit.unit_status != "Quarantine":
                frappe.throw(
                    "Reject Unit requires the Blood Unit "
                    "to remain in Quarantine."
                )

        # Rejected -> Discarded
        elif (
            previous.disposition_status == "Rejected"
            and self.disposition_status == "Discarded"
        ):

            if unit.unit_status != "Rejected":
                frappe.throw(
                    "Discard Unit requires the Blood Unit "
                    "to be Rejected first."
                )

        if self.disposition_status == "Rejected":

            if unit.unit_status not in [
                "Quarantine",
                "Rejected",
            ]:
                frappe.throw(
                    "Blood Unit is not eligible for Rejection."
                )

        if self.disposition_status == "Discarded":

            if unit.unit_status != "Rejected":
                frappe.throw(
                    "Blood Unit must be Rejected "
                    "before Discarding."
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
                    'Discarded'
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
