import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class BloodIssue(Document):

    def before_save(self):
        self.validate_issue_data()
        self.validate_return_data()

    def on_update(self):
        old_doc = self.get_doc_before_save()

        old_status = old_doc.issue_status if old_doc else None
        new_status = self.issue_status

        if old_status == new_status:
            return

        if new_status == "Issued":
            self.handle_issued(old_status)

        elif new_status == "Returned":
            self.handle_returned(old_status)

        elif new_status == "Eligible":
            self.handle_return_eligible(old_status)

        elif new_status == "Not Eligible":
            self.handle_return_not_eligible(old_status)

    # ---------------------------------------------------------
    # VALIDATION
    # ---------------------------------------------------------

    def validate_issue_data(self):
        if not self.get("blood_storage"):
            frappe.throw("Blood Storage is required.")

        if not self.get("blood_reservation"):
            frappe.throw("Blood Reservation is required.")

    def validate_return_data(self):
        if self.issue_status == "Returned":
            if not self.get("return_reason"):
                frappe.throw(
                    "Return Reason is required when an issue is marked Returned."
                )

        if self.issue_status == "Eligible":
            if self.get("return_evaluation") != "Eligible":
                frappe.throw(
                    "Return Evaluation must be Eligible before marking the issue Eligible."
                )

        if self.issue_status == "Not Eligible":
            if self.get("return_evaluation") != "Not Eligible":
                frappe.throw(
                    "Return Evaluation must be Not Eligible before marking the issue Not Eligible."
                )

            if not self.get("return_disposition_reason"):
                frappe.throw(
                    "Return Disposition Reason is required when the returned unit is Not Eligible."
                )

    # ---------------------------------------------------------
    # ISSUED
    # ---------------------------------------------------------

    def handle_issued(self, old_status):
        if old_status != "Final Verification":
            return

        storage_name = self.get("blood_storage")

        if not storage_name:
            frappe.throw(
                "Blood Storage is required before confirming Issue."
            )

        storage_status = frappe.db.get_value(
            "Blood Storage",
            storage_name,
            "storage_status",
        )

        if storage_status != "Reserved":
            frappe.throw(
                f"Blood Storage {storage_name} must be Reserved before Issue. "
                f"Current status: {storage_status}"
            )

        # IMPORTANT:
        # Storage is changed only AFTER Blood Issue successfully reaches Issued.
        frappe.db.set_value(
            "Blood Storage",
            storage_name,
            "storage_status",
            "Issued",
        )

        self.db_set(
            "issued_at",
            now_datetime(),
            update_modified=False,
        )

        self.db_set(
            "issued_by",
            frappe.session.user,
            update_modified=False,
        )

    # ---------------------------------------------------------
    # RETURNED
    # ---------------------------------------------------------

    def handle_returned(self, old_status):
        if old_status != "Issued":
            return

        storage_name = self.get("blood_storage")

        if not storage_name:
            frappe.throw(
                "Blood Storage is required when returning an issued unit."
            )

        storage_status = frappe.db.get_value(
            "Blood Storage",
            storage_name,
            "storage_status",
        )

        if storage_status != "Issued":
            frappe.throw(
                f"Blood Storage {storage_name} must remain Issued when "
                f"Blood Issue becomes Returned. Current status: {storage_status}"
            )

        # Returned does NOT automatically make the storage Available.
        self.db_set(
            "returned_at",
            now_datetime(),
            update_modified=False,
        )

        self.db_set(
            "returned_by",
            frappe.session.user,
            update_modified=False,
        )

    # ---------------------------------------------------------
    # RETURN ELIGIBLE
    # ---------------------------------------------------------

    def handle_return_eligible(self, old_status):
        if old_status != "Return Evaluation":
            return

        if self.get("return_evaluation") != "Eligible":
            frappe.throw(
                "Return Evaluation must be Eligible."
            )

        storage_name = self.get("blood_storage")

        if not storage_name:
            frappe.throw(
                "Blood Storage is required for an Eligible return."
            )

        storage_status = frappe.db.get_value(
            "Blood Storage",
            storage_name,
            "storage_status",
        )

        if storage_status != "Issued":
            frappe.throw(
                f"Blood Storage {storage_name} must be Issued before "
                f"an Eligible return can become Available. "
                f"Current status: {storage_status}"
            )

        frappe.db.set_value(
            "Blood Storage",
            storage_name,
            "storage_status",
            "Available",
        )

    # ---------------------------------------------------------
    # RETURN NOT ELIGIBLE
    # ---------------------------------------------------------

    def handle_return_not_eligible(self, old_status):
        if old_status != "Return Evaluation":
            return

        if self.get("return_evaluation") != "Not Eligible":
            frappe.throw(
                "Return Evaluation must be Not Eligible."
            )

        if not self.get("return_disposition_reason"):
            frappe.throw(
                "Return Disposition Reason is required."
            )

        storage_name = self.get("blood_storage")

        if not storage_name:
            frappe.throw(
                "Blood Storage is required for a Not Eligible return."
            )

        storage_status = frappe.db.get_value(
            "Blood Storage",
            storage_name,
            "storage_status",
        )

        if storage_status != "Issued":
            frappe.throw(
                f"Blood Storage {storage_name} must be Issued before "
                f"being discarded after an ineligible return. "
                f"Current status: {storage_status}"
            )

        now = now_datetime()
        user = frappe.session.user

        frappe.db.set_value(
            "Blood Storage",
            storage_name,
            {
                "storage_status": "Discarded",
                "discard_reason": self.return_disposition_reason,
                "discarded_at": now,
                "discarded_by": user,
            },
        )
