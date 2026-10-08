
import frappe
from frappe.model.document import Document


class BloodComponent(Document):

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
