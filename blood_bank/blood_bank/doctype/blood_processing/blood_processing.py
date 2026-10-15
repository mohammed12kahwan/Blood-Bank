
import frappe
from frappe.model.document import Document


class BloodProcessing(Document):

    def validate(self):

        # Blood Screening is a later workflow stage.
        # Processing may start without a Screening record.
        # When a Screening is supplied, it must be Accepted and Passed.
        if self.blood_screening:
            self.validate_accepted_screening()
            self.load_source_information()

        # Resolve the originating donation and verified blood group.
        # Use the matching donor + bag; refuse to guess if ambiguous.
        if not self.blood_donation and self.donor and self.bag_number:
            matches = frappe.get_all(
                "Blood Donation",
                filters={
                    "donor": self.donor,
                    "bag_number": self.bag_number,
                },
                fields=["name"],
                limit_page_length=2,
            )

            if len(matches) == 1:
                self.blood_donation = matches[0].name
            elif len(matches) > 1:
                frappe.throw(
                    "Multiple Blood Donation records match this donor "
                    "and bag number. Select the source donation explicitly."
                )

        if self.donor and not self.blood_group:
            donor_group = frappe.db.get_value(
                "Blood Donor",
                self.donor,
                ["blood_group", "blood_group_verified"],
                as_dict=True,
            )

            if (
                donor_group
                and donor_group.blood_group_verified
                and donor_group.blood_group
            ):
                self.blood_group = donor_group.blood_group

        # Guarantee the audit fields when processing actually starts.
        # Do not overwrite existing values.
        if self.processing_status == "Processing":
            if not self.processing_started_at:
                self.processing_started_at = frappe.utils.now_datetime()

            if not self.processing_started_by:
                self.processing_started_by = frappe.session.user

        # Guarantee the separation audit fields when component
        # separation actually starts. Do not overwrite existing values.
        if self.processing_status == "Component Separation":
            if not self.separation_started_at:
                self.separation_started_at = frappe.utils.now_datetime()

            if not self.separation_started_by:
                self.separation_started_by = frappe.session.user

        self.validate_source_unit()

    def validate_accepted_screening(self):

        if not self.blood_screening:
            return

        screening = frappe.db.get_value(
            "Blood Screening",
            self.blood_screening,
            [
                "screening_status",
                "overall_result",
            ],
            as_dict=True,
        )

        if not screening:
            frappe.throw(
                "Blood Screening record not found."
            )

        if screening.screening_status != "Accepted":
            frappe.throw(
                "Blood Processing requires "
                "an Accepted Blood Screening."
            )

        if screening.overall_result != "Passed":
            frappe.throw(
                "Blood Processing requires "
                "a Passed Screening Result."
            )

    def load_source_information(self):

        if not self.blood_screening:
            return

        screening = frappe.db.get_value(
            "Blood Screening",
            self.blood_screening,
            [
                "blood_unit",
                "donor",
                "donor_name",
                "blood_group",
                "bag_number",
            ],
            as_dict=True,
        )

        if not screening:
            frappe.throw(
                "Accepted Blood Screening not found."
            )

        self.blood_unit = screening.blood_unit
        self.donor = screening.donor
        self.donor_name = screening.donor_name
        self.blood_group = screening.blood_group
        self.bag_number = screening.bag_number

    def validate_source_unit(self):

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

        if unit.unit_status != "Quarantine":
            frappe.throw(
                "Blood Processing requires "
                "the Blood Unit to be in Quarantine."
            )

        if unit.blood_group != self.blood_group:
            frappe.throw(
                "Blood Group mismatch between "
                "Blood Processing and Blood Unit."
            )

        if unit.bag_number != self.bag_number:
            frappe.throw(
                "Bag Number mismatch between "
                "Blood Processing and Blood Unit."
            )
