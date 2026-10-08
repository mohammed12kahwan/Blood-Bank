
import frappe
from frappe.model.document import Document


class BloodRequest(Document):

    def validate(self):

        self.load_patient_information()
        self.validate_request_values()

    def load_patient_information(self):

        if not self.patient:
            return

        patient = frappe.db.get_value(
            "Patient",
            self.patient,
            [
                "patient_name",
            ],
            as_dict=True,
        )

        if not patient:
            frappe.throw(
                "Patient record not found."
            )

        self.patient_name = patient.patient_name

    def validate_request_values(self):

        if self.requested_quantity is not None:

            if self.requested_quantity <= 0:
                frappe.throw(
                    "Requested Quantity must be greater than zero."
                )

        if self.blood_group:

            allowed_groups = [
                "A Positive",
                "A Negative",
                "B Positive",
                "B Negative",
                "AB Positive",
                "AB Negative",
                "O Positive",
                "O Negative",
            ]

            if self.blood_group not in allowed_groups:
                frappe.throw(
                    "Invalid Blood Group."
                )
