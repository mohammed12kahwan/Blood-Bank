
import frappe
from frappe.model.document import Document


class BloodProcessing(Document):

    def validate(self):

        # Blood Screening is a later workflow stage.
        # Processing may start without a Screening record.
        # When a Screening is supplied, it must be Accepted and Passed.
        if self.blood_screening:
            self.validate_accepted_screening()
            self.load_source_information()

        # Resolve the originating donation and verified blood group.
        # Use the matching donor + bag; refuse to guess if ambiguous.
        if not self.blood_donation and self.donor and self.bag_number:
            matches = frappe.get_all(
                "Blood Donation",
                filters={
                    "donor": self.donor,
                    "bag_number": self.bag_number,
                },
                fields=["name"],
                limit_page_length=2,
            )

            if len(matches) == 1:
                self.blood_donation = matches[0].name
            elif len(matches) > 1:
                frappe.throw(
                    "Multiple Blood Donation records match this donor "
                    "and bag number. Select the source donation explicitly."
                )

        if self.donor and not self.blood_group:
            donor_group = frappe.db.get_value(
                "Blood Donor",
                self.donor,
                ["blood_group", "blood_group_verified"],
                as_dict=True,
            )

            if (
                donor_group
                and donor_group.blood_group_verified
                and donor_group.blood_group
            ):
                self.blood_group = donor_group.blood_group

        # Guarantee the audit fields when processing actually starts.
        # Do not overwrite existing values.
        if self.processing_status == "Processing":
            if not self.processing_started_at:
                self.processing_started_at = frappe.utils.now_datetime()

            if not self.processing_started_by:
                self.processing_started_by = frappe.session.user

        # Guarantee the separation audit fields when component
        # separation actually starts. Do not overwrite existing values.
        if self.processing_status == "Component Separation":
            if not self.separation_started_at:
                self.separation_started_at = frappe.utils.now_datetime()

            if not self.separation_started_by:
                self.separation_started_by = frappe.session.user

        self.validate_verified_donor_blood_group()
        self.validate_source_unit()

    def validate_verified_donor_blood_group(self):
        allowed_abo = {"A", "B", "AB", "O"}
        allowed_rh = {"Positive", "Negative"}

        donor_name = self.donor
        if not donor_name and self.blood_donation:
            donor_name = frappe.db.get_value(
                "Blood Donation", self.blood_donation, "donor"
            )

        if not donor_name:
            if self.blood_group or self.blood_screening:
                frappe.throw(
                    "تعذر التحقق من فصيلة المعالجة: سجل المتبرع غير مرتبط."
                )
            return

        source = frappe.db.get_value(
            "Blood Donor",
            donor_name,
            [
                "abo_group",
                "rh_factor",
                "blood_group",
                "blood_group_verified",
            ],
            as_dict=True,
        )

        if not source:
            frappe.throw("سجل المتبرع المصدر غير موجود.")

        if not source.blood_group_verified:
            if self.blood_group:
                frappe.throw(
                    "لا يمكن اعتماد فصيلة المعالجة؛ فصيلة المتبرع "
                    "غير معتمدة في سجل المتبرع."
                )
            return

        if source.abo_group not in allowed_abo:
            frappe.throw(
                "قيمة ABO في سجل المتبرع غير صحيحة. "
                "صحح سجل المتبرع وفق نتيجة الفحص الأصلية أولًا."
            )

        if source.rh_factor not in allowed_rh:
            frappe.throw(
                "عامل Rh في سجل المتبرع غير صحيح. "
                "صحح سجل المتبرع وفق نتيجة الفحص الأصلية أولًا."
            )

        expected_group = f"{source.abo_group} {source.rh_factor}"

        if source.blood_group != expected_group:
            frappe.throw(
                "الفصيلة المحفوظة في سجل المتبرع لا تطابق حقلي ABO وRh. "
                "يجب تصحيح المصدر قبل متابعة المعالجة."
            )

        if self.blood_donation:
            donation_donor = frappe.db.get_value(
                "Blood Donation", self.blood_donation, "donor"
            )
            if donation_donor and donation_donor != donor_name:
                frappe.throw(
                    "المتبرع في المعالجة لا يطابق المتبرع في التبرع المصدر."
                )

        if self.blood_screening:
            screening_source = frappe.db.get_value(
                "Blood Screening",
                self.blood_screening,
                ["donor", "blood_group"],
                as_dict=True,
            )
            if (
                screening_source
                and screening_source.donor
                and screening_source.donor != donor_name
            ):
                frappe.throw(
                    "المتبرع في سجل الفحص لا يطابق المتبرع المعتمد."
                )
            if (
                screening_source
                and screening_source.blood_group
                and screening_source.blood_group != expected_group
            ):
                frappe.throw(
                    "فصيلة سجل الفحص لا تطابق الفصيلة المعتمدة للمتبرع. "
                    "يجب مراجعة نتيجة الفحص قبل متابعة المعالجة."
                )

        if self.blood_group and self.blood_group != expected_group:
            frappe.throw(
                "فصيلة المعالجة لا تطابق الفصيلة المعتمدة في سجل المتبرع. "
                "لم يتم تعديل أي سجل تلقائيًا؛ راجع مصدر الفصيلة أولًا."
            )

        self.donor = donor_name
        self.blood_group = expected_group

    def validate_accepted_screening(self):

        if not self.blood_screening:
            return

        screening = frappe.db.get_value(
            "Blood Screening",
            self.blood_screening,
            [
                "screening_status",
                "overall_result",
            ],
            as_dict=True,
        )

        if not screening:
            frappe.throw(
                "Blood Screening record not found."
            )

        if screening.screening_status != "Accepted":
            frappe.throw(
                "Blood Processing requires "
                "an Accepted Blood Screening."
            )

        if screening.overall_result != "Passed":
            frappe.throw(
                "Blood Processing requires "
                "a Passed Screening Result."
            )

    def load_source_information(self):

        if not self.blood_screening:
            return

        screening = frappe.db.get_value(
            "Blood Screening",
            self.blood_screening,
            [
                "blood_unit",
                "donor",
                "donor_name",
                "blood_group",
                "bag_number",
            ],
            as_dict=True,
        )

        if not screening:
            frappe.throw(
                "Accepted Blood Screening not found."
            )

        self.blood_unit = screening.blood_unit
        self.donor = screening.donor
        self.donor_name = screening.donor_name
        # Blood Donor is the authoritative blood-group source.
        # Screening is checked against that source below; its
        # blood_group must not overwrite the donor-derived value.
        self.bag_number = screening.bag_number

    def validate_source_unit(self):

        # استرجاع الرابط العكسي فقط من وحدة تشير صراحةً إلى هذه المعالجة.
        if not self.blood_unit and self.name:
            linked_units = frappe.get_all(
                "Blood Unit",
                filters={
                    "blood_processing": self.name,
                    "unit_status": "Quarantine",
                },
                fields=["name", "blood_donation"],
                limit_page_length=2,
            )

            if len(linked_units) > 1:
                frappe.throw(
                    "توجد عدة وحدات حجر مرتبطة بهذه المعالجة. "
                    "تعذر تحديد الوحدة الصحيحة."
                )

            if len(linked_units) == 1:
                linked = linked_units[0]
                if (
                    self.blood_donation
                    and linked.blood_donation != self.blood_donation
                ):
                    frappe.throw(
                        "تعذر الربط: التبرع في وحدة الدم "
                        "لا يطابق التبرع في المعالجة."
                    )
                self.blood_unit = linked.name

        if not self.blood_unit:
            return

        unit = frappe.db.get_value(
            "Blood Unit",
            self.blood_unit,
            [
                "unit_status",
                "blood_group",
                "bag_number",
                "blood_processing",
                "blood_donation",
            ],
            as_dict=True,
        )

        if not unit:
            frappe.throw("Blood Unit record not found.")

        if (
            self.blood_donation
            and unit.blood_donation
            and unit.blood_donation != self.blood_donation
        ):
            frappe.throw(
                "Blood Donation mismatch between Processing and Unit."
            )

        if unit.blood_processing and unit.blood_processing != self.name:
            frappe.throw(
                "Blood Unit is linked to a different Blood Processing record."
            )

        if self.is_new() and unit.unit_status != "Quarantine":
            frappe.throw(
                "إنشاء المعالجة المرتبطة بوحدة الدم يتطلب حالة Quarantine."
            )

        if unit.unit_status not in ("Quarantine", "Accepted"):
            frappe.throw(
                "حالة وحدة الدم لا تسمح بمتابعة سجل المعالجة."
            )

        if unit.blood_group != self.blood_group:
            frappe.throw(
                "Blood Group mismatch between "
                "Blood Processing and Blood Unit."
            )

        if unit.bag_number != self.bag_number:
            frappe.throw(
                "Bag Number mismatch between "
                "Blood Processing and Blood Unit."
            )
