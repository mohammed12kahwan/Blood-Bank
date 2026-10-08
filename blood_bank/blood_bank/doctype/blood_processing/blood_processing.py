
import frappe
from frappe.model.document import Document


class BloodProcessing(Document):

    def validate(self):

        self.validate_accepted_screening()
        self.load_source_information()
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
