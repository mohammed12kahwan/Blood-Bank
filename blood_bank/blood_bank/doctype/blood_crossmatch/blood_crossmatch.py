
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

        if self.crossmatch_status == "Compatible":

            if self.compatibility_result != "Compatible":
                frappe.throw(
                    "Compatible status requires "
                    "a Compatible result."
                )

            if not self.blood_request or not self.candidate_storage:
                frappe.throw(
                    "A Blood Request and candidate Blood Storage "
                    "are required for a Compatible crossmatch."
                )

            request = frappe.db.get_value(
                "Blood Request",
                self.blood_request,
                ["blood_group", "component_type"],
                as_dict=True,
            )

            storage = frappe.db.get_value(
                "Blood Storage",
                self.candidate_storage,
                [
                    "storage_status",
                    "blood_group",
                    "component_type",
                ],
                as_dict=True,
            )

            if not request or not storage:
                frappe.throw(
                    "Cannot mark crossmatch Compatible: "
                    "the request or candidate storage was not found."
                )

            if storage.storage_status != "Available":
                frappe.throw(
                    "Cannot mark crossmatch Compatible: "
                    "candidate Blood Storage must be Available."
                )

            requested_type = (request.component_type or "").strip()
            actual_type = (storage.component_type or "").strip()

            if not requested_type or not actual_type:
                frappe.throw(
                    "Cannot mark crossmatch Compatible: "
                    "the requested and candidate component types "
                    "must both be specified."
                )

            if requested_type != actual_type:
                frappe.throw(
                    "Cannot mark crossmatch Compatible: "
                    "candidate component type does not match "
                    "the Blood Request."
                )

            requested_group = (request.blood_group or "").strip()
            actual_group = (storage.blood_group or "").strip()

            if not requested_group or requested_group != actual_group:
                frappe.throw(
                    "Cannot mark crossmatch Compatible: "
                    "candidate blood group does not match "
                    "the Blood Request."
                )

            # BB_FIFO_CROSSMATCH_SERVER_ENFORCEMENT_V1
            # A UI filter alone is insufficient: enforce FIFO on the server.
            from blood_bank.blood_bank.inventory import (
                get_eligible_available_storages,
            )

            fifo_rows = get_eligible_available_storages(
                requested_group,
                requested_type,
            )

            if not fifo_rows:
                frappe.throw(
                    "Cannot mark crossmatch Compatible: "
                    "no eligible Available stock matches the request. "
                    "Verify storage status, unit acceptance, blood-group "
                    "verification, and expiry."
                )

            oldest_storage = fifo_rows[0].get("name")
            if self.candidate_storage != oldest_storage:
                frappe.throw(
                    "FIFO rule: select the oldest eligible Available "
                    "storage first: " + str(oldest_storage)
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
