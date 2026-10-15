# Copyright (c) 2026, Hospital IT and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class BloodDonation(Document):

    def validate(self):
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
