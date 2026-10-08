
import frappe
from frappe.model.document import Document


class BloodCrossmatch(Document):

    def validate(self):

        self.load_request_information()
        self.load_candidate_information()
        self.validate_request()
        self.validate_candidate()
        self.validate_result()

    def load_request_information(self):

        if not self.blood_request:
            return

        request = frappe.db.get_value(
            "Blood Request",
            self.blood_request,
            [
                "request_status",
                "patient",
                "patient_name",
                "blood_group",
                "component_type",
            ],
            as_dict=True,
        )

        if not request:
            frappe.throw(
                "Blood Request record not found."
            )

        self.patient = request.patient
        self.patient_name = request.patient_name
        self.required_blood_group = request.blood_group
        self.required_component_type = request.component_type

    def load_candidate_information(self):

        if not self.candidate_storage:
            return

        storage = frappe.db.get_value(
            "Blood Storage",
            self.candidate_storage,
            [
                "storage_status",
                "blood_component",
                "blood_unit",
                "blood_group",
                "component_type",
                "component_number",
                "bag_number",
            ],
            as_dict=True,
        )

        if not storage:
            frappe.throw(
                "Candidate Blood Storage record not found."
            )

        self.candidate_component = storage.blood_component
        self.candidate_blood_unit = storage.blood_unit
        self.candidate_blood_group = storage.blood_group
        self.candidate_component_type = storage.component_type
        self.candidate_component_number = storage.component_number
        self.candidate_bag_number = storage.bag_number

    def validate_request(self):

        if not self.blood_request:
            return

        status = frappe.db.get_value(
            "Blood Request",
            self.blood_request,
            "request_status",
        )

        if status != "Approved":
            frappe.throw(
                "Crossmatch requires an Approved Blood Request."
            )

    def validate_candidate(self):

        if not self.candidate_storage:
            return

        storage_status = frappe.db.get_value(
            "Blood Storage",
            self.candidate_storage,
            "storage_status",
        )

        if storage_status != "Available":
            frappe.throw(
                "Crossmatch requires the candidate "
                "Blood Storage to be Available."
            )

    def validate_result(self):

        if self.crossmatch_status in [
            "Compatible",
        ]:

            if self.compatibility_result != "Compatible":
                frappe.throw(
                    "Compatible status requires "
                    "a Compatible result."
                )

        if self.crossmatch_status in [
            "Incompatible",
            "Reject Candidate",
        ]:

            if self.compatibility_result != "Incompatible":
                frappe.throw(
                    "Incompatible candidate requires "
                    "an Incompatible result."
                )

            if not self.incompatibility_reason:
                frappe.throw(
                    "Incompatibility Reason is required."
                )
