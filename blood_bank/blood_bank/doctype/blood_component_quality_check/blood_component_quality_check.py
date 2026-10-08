
import frappe
from frappe.model.document import Document


COMPONENT_DOCTYPE = "Blood Component"


class BloodComponentQualityCheck(Document):

    def validate(self):

        self.validate_component()
        self.validate_result()
        self.validate_rejection()
        self.validate_discard()

    def before_save(self):

        previous = self.get_doc_before_save()

        if not previous:
            return

        # ==============================================
        # Inspection -> Failed
        # ==============================================

        if (
            previous.qc_status == "Inspection"
            and self.qc_status == "Failed"
        ):

            if self.overall_result != "Failed":
                frappe.throw(
                    "Failed QC requires "
                    "Overall Result = Failed."
                )

            if not self.failure_reason:
                frappe.throw(
                    "Failure Reason is required."
                )

        # ==============================================
        # Failed -> Rejected
        # ==============================================

        if (
            previous.qc_status == "Failed"
            and self.qc_status == "Rejected"
        ):

            if self.overall_result != "Failed":
                frappe.throw(
                    "Rejected QC requires "
                    "Overall Result = Failed."
                )

            if not self.failure_reason:
                frappe.throw(
                    "Failure Reason is required."
                )

        # ==============================================
        # Rejected -> Discarded
        # ==============================================

        if (
            previous.qc_status == "Rejected"
            and self.qc_status == "Discarded"
        ):

            if self.overall_result != "Failed":
                frappe.throw(
                    "Discarded QC requires "
                    "Overall Result = Failed."
                )

            if not self.failure_reason:
                frappe.throw(
                    "Failure Reason is required."
                )

            if not self.discard_reason:
                frappe.throw(
                    "Discard Reason is required."
                )

            if not self.discarded_at:
                self.discarded_at = (
                    frappe.utils.now_datetime()
                )

            if not self.discarded_by:
                self.discarded_by = (
                    frappe.session.user
                )

    def validate_component(self):

        if not self.blood_component:
            frappe.throw(
                "Blood Component is required."
            )

        component = frappe.db.get_value(
            COMPONENT_DOCTYPE,
            self.blood_component,
            [
                "component_status",
                "blood_group",
                "component_type",
                "bag_number",
            ],
            as_dict=True,
        )

        if not component:
            frappe.throw(
                "Blood Component record not found."
            )

        previous = self.get_doc_before_save()

        # ==============================================
        # New QC
        # ==============================================

        if not previous:

            if component.component_status != "Quality Check":
                frappe.throw(
                    "New Quality Check requires "
                    "Blood Component = Quality Check."
                )

        # ==============================================
        # Inspection -> Passed
        # ==============================================

        elif (
            previous.qc_status == "Inspection"
            and self.qc_status == "Passed"
        ):

            if component.component_status != "Quality Check":
                frappe.throw(
                    "Passed QC requires the component "
                    "to remain Quality Check."
                )

        # ==============================================
        # Inspection -> Failed
        # ==============================================

        elif (
            previous.qc_status == "Inspection"
            and self.qc_status == "Failed"
        ):

            if component.component_status != "Quality Check":
                frappe.throw(
                    "Failed QC requires the component "
                    "to remain Quality Check."
                )

        # ==============================================
        # Failed -> Rejected
        # ==============================================

        elif (
            previous.qc_status == "Failed"
            and self.qc_status == "Rejected"
        ):

            if component.component_status != "Quality Check":
                frappe.throw(
                    "Reject Failed Component requires "
                    "Blood Component = Quality Check."
                )

        # ==============================================
        # Rejected -> Discarded
        # ==============================================

        elif (
            previous.qc_status == "Rejected"
            and self.qc_status == "Discarded"
        ):

            if component.component_status != "Rejected":
                frappe.throw(
                    "Discard Component requires "
                    "Blood Component = Rejected."
                )

        # ==============================================
        # Existing historical states
        # ==============================================

        elif self.qc_status == "Rejected":

            if component.component_status not in [
                "Quality Check",
                "Rejected",
            ]:
                frappe.throw(
                    "Rejected QC has an invalid "
                    "Blood Component status."
                )

        elif self.qc_status == "Discarded":

            if component.component_status not in [
                "Rejected",
                "Discarded",
            ]:
                frappe.throw(
                    "Discarded QC has an invalid "
                    "Blood Component status."
                )

    def validate_result(self):

        if not self.overall_result:
            frappe.throw(
                "Overall Result is required."
            )

        if self.qc_status == "Passed":

            if self.overall_result != "Passed":
                frappe.throw(
                    "Passed QC requires "
                    "Overall Result = Passed."
                )

        if self.qc_status in [
            "Failed",
            "Rejected",
            "Discarded",
        ]:

            if self.overall_result != "Failed":
                frappe.throw(
                    "Failed/Rejected/Discarded QC requires "
                    "Overall Result = Failed."
                )

    def validate_rejection(self):

        if self.qc_status in [
            "Failed",
            "Rejected",
            "Discarded",
        ]:

            if not self.failure_reason:
                frappe.throw(
                    "Failure Reason is required."
                )

    def validate_discard(self):

        if self.qc_status == "Discarded":

            if not self.discard_reason:
                frappe.throw(
                    "Discard Reason is required."
                )

    def on_update(self):

        previous = self.get_doc_before_save()

        if not previous:
            return

        # ==============================================
        # Failed -> Rejected
        # ==============================================

        if (
            previous.qc_status == "Failed"
            and self.qc_status == "Rejected"
        ):

            component_status = frappe.db.get_value(
                COMPONENT_DOCTYPE,
                self.blood_component,
                "component_status",
            )

            if component_status != "Quality Check":
                frappe.throw(
                    "Blood Component must be "
                    "Quality Check before rejection."
                )

            frappe.db.set_value(
                COMPONENT_DOCTYPE,
                self.blood_component,
                "component_status",
                "Rejected",
                update_modified=True,
            )

        # ==============================================
        # Rejected -> Discarded
        # ==============================================

        elif (
            previous.qc_status == "Rejected"
            and self.qc_status == "Discarded"
        ):

            component_status = frappe.db.get_value(
                COMPONENT_DOCTYPE,
                self.blood_component,
                "component_status",
            )

            if component_status != "Rejected":
                frappe.throw(
                    "Blood Component must be "
                    "Rejected before discard."
                )

            frappe.db.set_value(
                COMPONENT_DOCTYPE,
                self.blood_component,
                "component_status",
                "Discarded",
                update_modified=True,
            )

    def on_trash(self):

        if self.qc_status == "Discarded":
            frappe.throw(
                "Discarded Quality Check records "
                "must not be deleted."
            )
