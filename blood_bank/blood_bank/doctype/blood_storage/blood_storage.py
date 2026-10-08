import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class BloodStorage(Document):

    def validate(self):

        self.validate_discard_state()
        self.validate_discard_reason()

    def validate_discard_state(self):

        if self.get("storage_status") != "Discarded":
            return

        previous = self.get_doc_before_save()

        # A newly created Discarded record must also have
        # a reason. Existing operational history is untouched.
        if not previous:
            return

        previous_status = previous.get(
            "storage_status"
        )

        # Discarded is a terminal operational status.
        # Once reached, it must not be moved backward.
        if previous_status == "Discarded":

            if not self.get("discard_reason"):
                frappe.throw(
                    "Discard Reason / سبب التخلص is mandatory "
                    "for Discarded Storage."
                )

            return

        # Every transition INTO Discarded requires a reason.
        if not self.get("discard_reason"):

            frappe.throw(
                "Discard Reason / سبب التخلص is mandatory "
                "before Storage can become Discarded."
            )

    def validate_discard_reason(self):

        if (
            self.get("storage_status") == "Discarded"
            and not self.get("discard_reason")
        ):
            frappe.throw(
                "Cannot save Discarded Storage without "
                "Discard Reason / سبب التخلص."
            )

    def before_save(self):

        previous = self.get_doc_before_save()

        if not previous:
            return

        if (
            previous.get("storage_status")
            != "Discarded"
            and self.get("storage_status")
            == "Discarded"
        ):

            self.set(
                "discarded_at",
                now_datetime(),
            )

            self.set(
                "discarded_by",
                frappe.session.user,
            )
