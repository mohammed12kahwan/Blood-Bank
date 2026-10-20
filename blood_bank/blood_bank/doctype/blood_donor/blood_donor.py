import frappe
from frappe.model.document import Document


class BloodDonor(Document):

    def validate(self):
        self.sync_eligibility_with_workflow_state()
        self.validate_blood_group_source()
        self.set_blood_group()
        self.set_blood_group_verification_date()

    def sync_eligibility_with_workflow_state(self):
        """
        Keep eligibility aligned with the authoritative workflow state.
        """
        previous = self.get_doc_before_save()

        state_to_eligibility = {
            "New": "Pending",
            "Under Assessment": "Pending",
            "Eligible": "Eligible",
            "Ready for Donation": "Eligible",
            "Deferred": "Deferred",
            "Rejected": "Rejected",
        }

        eligibility = state_to_eligibility.get(self.donor_status)
        if not eligibility:
            return

        state_changed = bool(
            previous and previous.donor_status != self.donor_status
        )

        if (
            self.donor_status == "Deferred"
            and not str(self.deferral_reason or "").strip()
        ):
            frappe.throw(
                "لا يمكن تأجيل المتبرع دون تسجيل سبب التأجيل."
            )

        # Workflow state is authoritative, even if the eligibility field
        # was manually changed in the form or submitted through an API.
        self.eligibility_status = eligibility

        if self.donor_status in {"New", "Under Assessment"}:
            self.eligibility_review_date = None
            self.eligibility_reviewed_by = None

        # Record the reviewer/date on the actual decision transition,
        # and preserve them during later saves and Ready for Donation.
        elif state_changed and self.donor_status in {
            "Eligible", "Deferred", "Rejected"
        }:
            self.eligibility_review_date = frappe.utils.today()
            self.eligibility_reviewed_by = frappe.session.user

    def validate_blood_group_source(self):
        allowed_abo = {"A", "B", "AB", "O"}
        allowed_rh = {"Positive", "Negative"}

        if self.abo_group and self.abo_group not in allowed_abo:
            frappe.throw(
                "فصيلة ABO غير صحيحة. اختر A أو B أو AB أو O فقط، "
                "وحدد موجب أو سالب في حقل Rh Factor بصورة مستقلة."
            )

        if self.rh_factor and self.rh_factor not in allowed_rh:
            frappe.throw(
                "عامل Rh غير صحيح. القيم المسموحة هي Positive أو Negative."
            )

        if self.blood_group_verified and not (
            self.abo_group and self.rh_factor
        ):
            frappe.throw(
                "لا يمكن اعتماد فصيلة الدم قبل تحديد ABO وRh بصورة صحيحة."
            )

        previous = self.get_doc_before_save()
        if previous and (
            previous.abo_group != self.abo_group
            or previous.rh_factor != self.rh_factor
        ):
            # Changing the source type invalidates its previous approval.
            self.blood_group_verified = 0

    def set_blood_group(self):
        if self.abo_group and self.rh_factor:
            self.blood_group = f"{self.abo_group} {self.rh_factor}"
        else:
            self.blood_group = None

    def set_blood_group_verification_date(self):
        if self.blood_group_verified:
            self.blood_group_verification_date = frappe.utils.today()
        else:
            self.blood_group_verification_date = None
