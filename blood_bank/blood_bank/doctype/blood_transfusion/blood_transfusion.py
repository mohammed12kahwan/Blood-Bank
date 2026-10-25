
import frappe
from frappe.model.document import Document


class BloodTransfusion(Document):

    def validate(self):

        self.load_handover_information()
        self.validate_handover()
        self.validate_issue()
        self.validate_storage()
        self.validate_patient()
        self.validate_transfusion_result()
        self.validate_outcome()

    def before_save(self):

        previous = self.get_doc_before_save()

        if not previous:
            return

        # ==============================================
        # Draft -> Transfusion
        # ==============================================

        if (
            previous.transfusion_status == "Draft"
            and self.transfusion_status == "Transfusion"
        ):

            if not self.transfusion_started_at:
                self.transfusion_started_at = (
                    frappe.utils.now_datetime()
                )

            if not self.transfusion_started_by:
                self.transfusion_started_by = (
                    frappe.session.user
                )

        # ==============================================
        # Transfusion -> Transfused
        # ==============================================

        if (
            previous.transfusion_status == "Transfusion"
            and self.transfusion_status == "Transfused"
        ):

            if self.transfusion_result != "Completed":
                frappe.throw(
                    "Transfusion can only be completed "
                    "when the result is Completed."
                )

            if not self.transfused_at:
                self.transfused_at = (
                    frappe.utils.now_datetime()
                )

            unit_status = frappe.db.get_value(
                "Blood Unit", self.blood_unit, "unit_status"
            )
            if unit_status not in ("Issued", "Transfused"):
                frappe.throw(
                    "Completed transfusion requires the Blood Unit "
                    f"to be Issued. Current status: {unit_status}"
                )

            frappe.db.set_value(
                "Blood Unit", self.blood_unit, "unit_status",
                "Transfused", update_modified=True,
            )

            if not self.transfused_by:
                self.transfused_by = (
                    frappe.session.user
                )

        # ==============================================
        # Transfusion -> Stopped
        # ==============================================

        if (
            previous.transfusion_status == "Transfusion"
            and self.transfusion_status == "Stopped"
        ):

            if self.transfusion_result != "Stopped":
                frappe.throw(
                    "Stopped Transfusion requires "
                    "a Stopped result."
                )

            if not self.stop_reason:
                frappe.throw(
                    "Stop Reason is required."
                )

            if not self.stopped_at:
                self.stopped_at = (
                    frappe.utils.now_datetime()
                )

            if not self.stopped_by:
                self.stopped_by = (
                    frappe.session.user
                )

        # ==============================================
        # Stopped -> Assessment
        # ==============================================

        if (
            previous.transfusion_status == "Stopped"
            and self.transfusion_status == "Assessment"
        ):

            if not self.assessment_started_at:
                self.assessment_started_at = (
                    frappe.utils.now_datetime()
                )

            if not self.assessment_started_by:
                self.assessment_started_by = (
                    frappe.session.user
                )

        # ==============================================
        # Assessment -> Outcome
        # ==============================================

        if (
            previous.transfusion_status == "Assessment"
            and self.transfusion_status in [
                "Returned",
                "Discarded",
                "Other Approved Outcome",
            ]
        ):

            if not self.post_transfusion_outcome:
                frappe.throw(
                    "A post-transfusion outcome is required."
                )

            if not self.outcome_recorded_at:
                self.outcome_recorded_at = (
                    frappe.utils.now_datetime()
                )

            if not self.outcome_recorded_by:
                self.outcome_recorded_by = (
                    frappe.session.user
                )

    def load_handover_information(self):

        if not self.blood_handover:
            return

        handover = frappe.db.get_value(
            "Blood Handover",
            self.blood_handover,
            [
                "handover_status",
                "blood_issue",
                "blood_reservation",
                "blood_request",
                "patient",
                "patient_name",
                "blood_storage",
                "blood_component",
                "blood_unit",
                "blood_group",
                "component_type",
                "bag_number",
                "receiver_name",
                "receiver_identifier",
                "receiving_location",
            ],
            as_dict=True,
        )

        if not handover:
            frappe.throw(
                "Blood Handover record not found."
            )

        self.blood_issue = handover.blood_issue
        self.blood_reservation = handover.blood_reservation
        self.blood_request = handover.blood_request
        self.patient = handover.patient
        self.patient_name = handover.patient_name
        self.blood_storage = handover.blood_storage
        self.blood_component = handover.blood_component
        self.blood_unit = handover.blood_unit
        self.blood_group = handover.blood_group
        self.component_type = handover.component_type
        self.bag_number = handover.bag_number
        self.receiver_name = handover.receiver_name
        self.receiver_identifier = handover.receiver_identifier
        self.receiving_location = handover.receiving_location

    def validate_handover(self):

        if not self.blood_handover:
            return

        handover = frappe.db.get_value(
            "Blood Handover",
            self.blood_handover,
            [
                "handover_status",
                "blood_issue",
                "blood_reservation",
                "blood_request",
                "blood_storage",
                "blood_component",
                "blood_unit",
            ],
            as_dict=True,
        )

        if not handover:
            frappe.throw(
                "Blood Handover record not found."
            )

        if handover.handover_status != "Handed Over":
            frappe.throw(
                "Blood Transfusion requires a "
                "Blood Handover in Handed Over status."
            )

        if handover.blood_issue != self.blood_issue:
            frappe.throw(
                "Blood Issue does not match the Handover."
            )

        if handover.blood_reservation != self.blood_reservation:
            frappe.throw(
                "Blood Reservation does not match the Handover."
            )

        if handover.blood_request != self.blood_request:
            frappe.throw(
                "Blood Request does not match the Handover."
            )

        if handover.blood_storage != self.blood_storage:
            frappe.throw(
                "Blood Storage does not match the Handover."
            )

        if handover.blood_component != self.blood_component:
            frappe.throw(
                "Blood Component does not match the Handover."
            )

        if handover.blood_unit != self.blood_unit:
            frappe.throw(
                "Blood Unit does not match the Handover."
            )

    def validate_issue(self):

        if not self.blood_issue:
            return

        issue = frappe.db.get_value(
            "Blood Issue",
            self.blood_issue,
            [
                "issue_status",
                "blood_reservation",
                "blood_request",
                "blood_storage",
                "blood_component",
                "blood_unit",
            ],
            as_dict=True,
        )

        if not issue:
            frappe.throw(
                "Blood Issue record not found."
            )

        if issue.issue_status != "Issued":
            frappe.throw(
                "Blood Transfusion requires "
                "Blood Issue to be Issued."
            )

        if issue.blood_reservation != self.blood_reservation:
            frappe.throw(
                "Blood Reservation does not match the Issue."
            )

        if issue.blood_request != self.blood_request:
            frappe.throw(
                "Blood Request does not match the Issue."
            )

        if issue.blood_storage != self.blood_storage:
            frappe.throw(
                "Blood Storage does not match the Issue."
            )

        if issue.blood_component != self.blood_component:
            frappe.throw(
                "Blood Component does not match the Issue."
            )

        if issue.blood_unit != self.blood_unit:
            frappe.throw(
                "Blood Unit does not match the Issue."
            )

    def validate_storage(self):

        if not self.blood_storage:
            return

        storage = frappe.db.get_value(
            "Blood Storage",
            self.blood_storage,
            [
                "storage_status",
                "blood_component",
                "blood_unit",
                "blood_group",
                "component_type",
                "bag_number",
            ],
            as_dict=True,
        )

        if not storage:
            frappe.throw(
                "Blood Storage record not found."
            )

        if storage.storage_status != "Issued":
            frappe.throw(
                "Blood Transfusion requires Blood Storage "
                "to remain Issued."
            )

        if storage.blood_component != self.blood_component:
            frappe.throw(
                "Blood Component does not match."
            )

        if storage.blood_unit != self.blood_unit:
            frappe.throw(
                "Blood Unit does not match."
            )

        if storage.blood_group != self.blood_group:
            frappe.throw(
                "Blood Group does not match."
            )

        if storage.component_type != self.component_type:
            frappe.throw(
                "Component Type does not match."
            )

        if storage.bag_number != self.bag_number:
            frappe.throw(
                "Bag Number does not match."
            )

    def validate_patient(self):

        if not self.blood_request:
            return

        request = frappe.db.get_value(
            "Blood Request",
            self.blood_request,
            [
                "request_status",
                "patient",
                "blood_group",
                "component_type",
            ],
            as_dict=True,
        )

        if not request:
            frappe.throw(
                "Blood Request record not found."
            )

        if request.request_status != "Approved":
            frappe.throw(
                "Blood Transfusion requires "
                "an Approved Blood Request."
            )

        if request.patient != self.patient:
            frappe.throw(
                "Patient does not match the Blood Request."
            )

        if request.blood_group != self.blood_group:
            frappe.throw(
                "Blood Group does not match the Blood Request."
            )

        if request.component_type != self.component_type:
            frappe.throw(
                "Component Type does not match the Blood Request."
            )

    # DISPOSITION_SYNC_COMPLETED_TRANSFUSION_V1
    def on_update(self):
        if self.transfusion_status != "Transfused":
            return
        if self.transfusion_result != "Completed":
            frappe.throw("Transfused requires Completed result.")
        if not self.blood_unit or not self.blood_issue or not self.blood_handover or not self.blood_storage:
            frappe.throw("Completed transfusion links are incomplete.")

        issue = frappe.db.get_value(
            "Blood Issue", self.blood_issue,
            ["issue_status", "blood_unit", "blood_storage"], as_dict=True
        )
        handover = frappe.db.get_value(
            "Blood Handover", self.blood_handover,
            ["handover_status", "blood_unit", "blood_issue", "blood_storage"],
            as_dict=True
        )
        storage = frappe.db.get_value(
            "Blood Storage", self.blood_storage,
            ["storage_status", "blood_unit"], as_dict=True
        )
        if not (
            issue and issue.issue_status == "Issued"
            and issue.blood_unit == self.blood_unit
            and issue.blood_storage == self.blood_storage
            and handover and handover.handover_status == "Handed Over"
            and handover.blood_unit == self.blood_unit
            and handover.blood_issue == self.blood_issue
            and handover.blood_storage == self.blood_storage
            and storage and storage.storage_status == "Issued"
            and storage.blood_unit == self.blood_unit
        ):
            frappe.throw("Transfusion links or upstream statuses do not match.")

        current = frappe.db.get_value("Blood Unit", self.blood_unit, "unit_status")
        if current not in ("Accepted", "Issued", "Transfused"):
            frappe.throw(f"Unexpected Blood Unit status: {current}")
        if current != "Transfused":
            frappe.db.set_value(
                "Blood Unit", self.blood_unit, "unit_status", "Transfused",
                update_modified=True
            )

    def validate_transfusion_result(self):

        if self.transfusion_status == "Transfused":

            if self.transfusion_result != "Completed":
                frappe.throw(
                    "Transfused requires "
                    "Completed result."
                )

        if self.transfusion_status == "Stopped":

            if self.transfusion_result != "Stopped":
                frappe.throw(
                    "Stopped requires "
                    "Stopped result."
                )

            if not self.stop_reason:
                frappe.throw(
                    "Stop Reason is required."
                )

    def validate_outcome(self):

        if self.transfusion_status == "Returned":

            if self.post_transfusion_outcome != "Returned":
                frappe.throw(
                    "Returned status requires "
                    "Returned outcome."
                )

        if self.transfusion_status == "Discarded":

            if self.post_transfusion_outcome != "Discarded":
                frappe.throw(
                    "Discarded status requires "
                    "Discarded outcome."
                )

        if self.transfusion_status == "Other Approved Outcome":

            if self.post_transfusion_outcome != "Other Approved Outcome":
                frappe.throw(
                    "Other Approved Outcome status requires "
                    "matching outcome."
                )

        if self.transfusion_status in [
            "Returned",
            "Discarded",
            "Other Approved Outcome",
        ]:

            if not self.outcome_reason:
                frappe.throw(
                    "Outcome Reason is required."
                )
