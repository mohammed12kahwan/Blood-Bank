# Copyright (c) 2026, Hospital IT and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class BloodDonation(Document):

    def validate(self):
        # BB_STEP42X_COLLECTION_TIMESTAMP_V1
        # Capture timestamps only when the workflow changes state.
        previous = self.get_doc_before_save()
        previous_status = (
            previous.donation_status if previous else None
        )

        # Record the actual start of collection.
        if (
            previous_status == "Checked In"
            and self.donation_status == "Bleeding"
            and not self.collection_start
        ):
            self.collection_start = frappe.utils.now_datetime()

        # Record the end of the collection attempt, including an abort.
        if (
            previous_status == "Bleeding"
            and self.donation_status in {"Collected", "Aborted"}
            and not self.collection_end
        ):
            self.collection_end = frappe.utils.now_datetime()
        # Record the current employee when the donation reaches
        # an operational collection stage.
        if (
            self.donation_status in {
                "Checked In",
                "Bleeding",
                "Collected",
            }
            and not self.collection_staff
        ):
            self.collection_staff = frappe.session.user

        # Record the exact date/time when the donation enters
        # Quarantine. Do not overwrite an existing value.
        if (
            self.donation_status == "Quarantine"
            and not self.quarantine_date
        ):
            self.quarantine_date = frappe.utils.now_datetime()
