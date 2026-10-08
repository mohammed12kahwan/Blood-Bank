
import frappe
from frappe.model.document import Document


class BloodHandover(Document):

    def validate(self):

        self.load_issue_information()
        self.validate_issue()
        self.validate_storage()
        self.validate_duplicate_handover()

    def before_save(self):

        previous = self.get_doc_before_save()

        if not previous:
            return

        # ==============================================
        # Draft -> Handover
        # ==============================================

        if (
            previous.handover_status == "Draft"
            and self.handover_status == "Handover"
        ):

            if not self.handover_started_at:
                self.handover_started_at = (
                    frappe.utils.now_datetime()
                )

            if not self.handover_started_by:
                self.handover_started_by = (
                    frappe.session.user
                )

        # ==============================================
        # Handover -> Handed Over
        # ==============================================

        if (
            previous.handover_status == "Handover"
            and self.handover_status == "Handed Over"
        ):

            if not self.receiver_name:
                frappe.throw(
                    "Receiver Name is required before "
                    "confirming Blood Handover."
                )

            if not self.handover_completed_at:
                self.handover_completed_at = (
                    frappe.utils.now_datetime()
                )

            if not self.handover_completed_by:
                self.handover_completed_by = (
                    frappe.session.user
                )

    def load_issue_information(self):

        if not self.blood_issue:
            return

        issue = frappe.db.get_value(
            "Blood Issue",
            self.blood_issue,
            [
                "issue_status",
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
            ],
            as_dict=True,
        )

        if not issue:
            frappe.throw(
                "Blood Issue record not found."
            )

        self.blood_reservation = issue.blood_reservation
        self.blood_request = issue.blood_request
        self.patient = issue.patient
        self.patient_name = issue.patient_name
        self.blood_storage = issue.blood_storage
        self.blood_component = issue.blood_component
        self.blood_unit = issue.blood_unit
        self.blood_group = issue.blood_group
        self.component_type = issue.component_type
        self.bag_number = issue.bag_number

    def validate_issue(self):

        if not self.blood_issue:
            return

        issue = frappe.db.get_value(
            "Blood Issue",
            self.blood_issue,
            [
                "issue_status",
                "blood_request",
                "blood_reservation",
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
                "Blood Handover requires a Blood Issue "
                "in Issued status."
            )

        if issue.blood_request != self.blood_request:
            frappe.throw(
                "Blood Request does not match the Blood Issue."
            )

        if issue.blood_reservation != self.blood_reservation:
            frappe.throw(
                "Blood Reservation does not match the Blood Issue."
            )

        if issue.blood_storage != self.blood_storage:
            frappe.throw(
                "Blood Storage does not match the Blood Issue."
            )

        if issue.blood_component != self.blood_component:
            frappe.throw(
                "Blood Component does not match the Blood Issue."
            )

        if issue.blood_unit != self.blood_unit:
            frappe.throw(
                "Blood Unit does not match the Blood Issue."
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
                "Blood Handover requires Blood Storage "
                "to be Issued."
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

    def validate_duplicate_handover(self):

        if not self.blood_issue:
            return

        existing = frappe.db.sql(
            """
            SELECT name, handover_status
            FROM `tabBlood Handover`
            WHERE blood_issue = %s
              AND name != %s
              AND handover_status = 'Handed Over'
            LIMIT 1
            """,
            (
                self.blood_issue,
                self.name,
            ),
            as_dict=True,
        )

        if existing:
            frappe.throw(
                "This Blood Issue has already been handed over "
                f"through {existing[0].name}."
            )
