import frappe
from frappe.model.document import Document


def _require_lab_user():
    user = frappe.session.user
    if user == "Guest" or "Laboratory User" not in frappe.get_roles(user):
        frappe.throw(
            "هذا الإجراء مخصص لموظف المختبر المخول.",
            frappe.PermissionError,
        )
    return user


def _record_text(doctype, name, candidate_fields):
    if not name:
        return ""
    meta = frappe.get_meta(doctype)
    fields = [f for f in candidate_fields if meta.has_field(f)]
    if not fields:
        return str(name)
    values = frappe.db.get_value(doctype, name, fields, as_dict=True)
    if not values:
        return str(name)
    return " ".join(str(values.get(f) or "") for f in fields) + " " + str(name)


def _assert_not_test_record(unit, screening):
    donation = unit.get("blood_donation")
    donor = frappe.db.get_value("Blood Donation", donation, "donor") if donation else None
    processing = unit.get("blood_processing")

    parts = [
        str(unit.name or ""),
        str(unit.get("bag_number") or ""),
        str(unit.get("remarks") or ""),
        _record_text("Blood Donation", donation, ["remarks"]),
        _record_text("Blood Donor", donor, ["full_name", "donor_name", "remarks"]),
        _record_text("Blood Screening", screening.name, ["remarks", "sample_id"]),
        _record_text("Blood Processing", processing, ["remarks"]),
    ]
    combined = " ".join(parts).upper()
    markers = (
        "SYNTHETIC",
        "NOT A REAL",
        "NOT FOR CLINICAL USE",
        "TEST ONLY",
        "TEST-BAG",
        "RESTART TEST",
        "STEP 42",
    )
    if any(marker in combined for marker in markers):
        frappe.throw(
            "السجل مرتبط ببيانات اختبار اصطناعي؛ لا يمكن اعتماد تحقق "
            "مخبري على هذه الوحدة."
        )


def _get_verified_source(unit):
    if not unit.blood_donation:
        frappe.throw("وحدة الدم لا ترتبط بتبرع مصدر.")

    donor = frappe.db.get_value(
        "Blood Donation", unit.blood_donation, "donor"
    )
    if not donor:
        frappe.throw("تعذر تحديد المتبرع المصدر.")

    source = frappe.db.get_value(
        "Blood Donor",
        donor,
        ["abo_group", "rh_factor", "blood_group", "blood_group_verified"],
        as_dict=True,
    )
    if not source or not source.blood_group_verified:
        frappe.throw("فصيلة المتبرع المصدر غير موثقة.")

    if source.abo_group not in {"A", "B", "AB", "O"}:
        frappe.throw("فصيلة ABO المصدر غير صالحة.")
    if source.rh_factor not in {"Positive", "Negative"}:
        frappe.throw("عامل Rh المصدر غير صالح.")

    expected = f"{source.abo_group} {source.rh_factor}"
    if source.blood_group != expected:
        frappe.throw("فصيلة المصدر الكاملة لا تطابق ABO وRh.")

    if (
        unit.abo_group != source.abo_group
        or unit.rh_factor != source.rh_factor
        or unit.blood_group != expected
    ):
        frappe.throw("فصيلة وحدة الدم لا تطابق فصيلة المصدر.")

    return donor, source


def _set_unit_summary(verification, status, verified, review_notes=None):
    unit = frappe.get_doc("Blood Unit", verification.blood_unit)

    unit.tested_abo_group = verification.tested_abo_group
    unit.tested_rh_factor = verification.tested_rh_factor
    unit.group_verification_sample_id = verification.sample_id
    unit.group_verification_status = status
    unit.blood_group_verification_by = verification.tested_by
    unit.blood_group_verification_date = verification.tested_at

    notes = str(verification.test_notes or "").strip()
    if review_notes:
        notes = (notes + "\nReview: " + str(review_notes).strip()).strip()
    unit.group_verification_notes = notes
    unit.blood_group_verified = 1 if verified else 0

    previous_flag = getattr(
        frappe.flags, "bb_unit_group_verification_action", False
    )
    frappe.flags.bb_unit_group_verification_action = True
    try:
        unit.save(ignore_permissions=True)
    finally:
        frappe.flags.bb_unit_group_verification_action = previous_flag


class BloodGroupVerification(Document):
    # BB_GROUP_VERIFICATION_SERVER_CONTROL_V1
    def validate(self):
        if not getattr(
            frappe.flags, "bb_group_verification_system_action", False
        ):
            frappe.throw(
                "لا يجوز إنشاء أو تعديل سجل التحقق مباشرة؛ "
                "استخدم إجراءات المختبر المخصصة."
            )

        if not self.blood_unit or not self.blood_screening:
            frappe.throw("يجب تحديد وحدة الدم وسجل فحص العينة.")

        unit = frappe.db.get_value(
            "Blood Unit",
            self.blood_unit,
            [
                "blood_donation", "donor", "bag_number",
                "abo_group", "rh_factor", "blood_group",
            ],
            as_dict=True,
        )
        screening = frappe.db.get_value(
            "Blood Screening",
            self.blood_screening,
            ["blood_unit", "sample_id"],
            as_dict=True,
        )
        if not unit or not screening:
            frappe.throw("تعذر قراءة الوحدة أو سجل الفحص المرتبط.")

        if screening.blood_unit != self.blood_unit:
            frappe.throw("سجل فحص العينة لا يخص وحدة الدم المحددة.")
        if not screening.sample_id or screening.sample_id != self.sample_id:
            frappe.throw("رقم العينة لا يطابق سجل فحص المختبر.")
        if self.blood_donation != unit.blood_donation:
            frappe.throw("التبرع لا يطابق التبرع المصدر لوحدة الدم.")
        if self.donor != unit.donor or self.bag_number != unit.bag_number:
            frappe.throw("بيانات المتبرع أو كيس الدم لا تطابق الوحدة.")
        if (
            self.source_abo_group != unit.abo_group
            or self.source_rh_factor != unit.rh_factor
            or self.source_blood_group != unit.blood_group
        ):
            frappe.throw("فصيلة المصدر المسجلة لا تطابق بيانات الوحدة.")

        required = (
            self.sample_id,
            self.tested_abo_group,
            self.tested_rh_factor,
            self.test_method,
            self.tested_by,
            self.tested_at,
        )
        if not all(required) or not self.sample_identity_confirmed:
            frappe.throw(
                "نتيجة الفحص غير مكتملة أو لم تؤكد مطابقة بطاقة العينة."
            )

        matched = (
            self.tested_abo_group == self.source_abo_group
            and self.tested_rh_factor == self.source_rh_factor
        )
        if self.verification_status == "Pending Review" and not matched:
            frappe.throw("النتيجة غير المطابقة لا يمكن وضعها بانتظار الاعتماد.")
        if self.verification_status == "Discrepancy" and matched:
            frappe.throw("النتيجة المطابقة لا تُسجل كتعارض.")
        if self.verification_status == "Verified":
            if not matched:
                frappe.throw("لا يمكن اعتماد نتيجة لا تطابق المصدر.")
            if (
                not self.reviewed_by
                or not self.reviewed_at
                or self.reviewed_by == self.tested_by
            ):
                frappe.throw(
                    "الاعتماد يتطلب مراجعًا مستقلًا غير منفذ الفحص."
                )
        if self.verification_status == "Rejected":
            if (
                not self.reviewed_by
                or not self.reviewed_at
                or self.reviewed_by == self.tested_by
            ):
                frappe.throw("الرفض يتطلب مراجعة مستقلة موثقة.")


# BB_GROUP_VERIFICATION_RECORD_TEST_V1
@frappe.whitelist()
def record_group_test(
    unit_name,
    screening_name,
    tested_abo_group,
    tested_rh_factor,
    test_method,
    sample_identity_confirmed=0,
    test_reference=None,
    test_notes=None,
):
    user = _require_lab_user()
    unit = frappe.get_doc("Blood Unit", unit_name)
    unit.check_permission("write")

    if unit.unit_status != "Quarantine":
        frappe.throw("يجب أن تكون وحدة الدم في الحجر قبل فحص فصيلتها.")
    if unit.blood_group_verified:
        frappe.throw("وحدة الدم معتمدة بالفعل ولا تحتاج إلى سجل تحقق جديد.")

    screening = frappe.get_doc("Blood Screening", screening_name)
    screening.check_permission("read")
    if screening.blood_unit != unit.name:
        frappe.throw("سجل فحص المختبر لا يخص وحدة الدم المحددة.")
    if screening.screening_status not in ("Screening", "Results Review"):
        frappe.throw(
            "يجب أن يكون سجل فحص العينة في Screening أو Results Review."
        )
    if not screening.sample_id:
        frappe.throw("سجل فحص المختبر لا يحتوي على رقم عينة.")

    _assert_not_test_record(unit, screening)
    donor, source = _get_verified_source(unit)

    tested_abo_group = str(tested_abo_group or "").strip().upper()
    tested_rh_factor = str(tested_rh_factor or "").strip()
    test_method = str(test_method or "").strip()
    test_reference = str(test_reference or "").strip()
    test_notes = str(test_notes or "").strip()

    if tested_abo_group not in {"A", "B", "AB", "O"}:
        frappe.throw("قيمة ABO المدخلة غير صالحة.")
    if tested_rh_factor not in {"Positive", "Negative"}:
        frappe.throw("قيمة Rh المدخلة غير صالحة.")
    if not test_method:
        frappe.throw("طريقة الفحص مطلوبة.")
    if not frappe.utils.cint(sample_identity_confirmed):
        frappe.throw("يجب تأكيد مطابقة بطاقة العينة الفعلية قبل التسجيل.")

    matched = (
        tested_abo_group == source.abo_group
        and tested_rh_factor == source.rh_factor
    )
    if not matched and not test_notes:
        frappe.throw("اشرح تعارض النتيجة في ملاحظات الفحص.")

    if frappe.db.exists(
        "Blood Group Verification", {"sample_id": screening.sample_id}
    ):
        frappe.throw(
            "للعينة سجل تحقق سابق؛ استخدم عينة جديدة موثقة لإعادة الفحص."
        )

    existing = frappe.db.exists(
        "Blood Group Verification",
        {
            "blood_unit": unit.name,
            "verification_status": ["in", ["Pending Review", "Verified"]],
        },
    )
    if existing:
        frappe.throw(
            "توجد مراجعة تحقق معلقة أو سجل معتمد لهذه الوحدة."
        )

    status = "Pending Review" if matched else "Discrepancy"
    doc = frappe.get_doc({
        "doctype": "Blood Group Verification",
        "naming_series": "BGV-.YYYY.-.#####",
        "verification_status": status,
        "blood_unit": unit.name,
        "blood_donation": unit.blood_donation,
        "donor": donor,
        "bag_number": unit.bag_number,
        "blood_screening": screening.name,
        "sample_id": screening.sample_id,
        "source_abo_group": source.abo_group,
        "source_rh_factor": source.rh_factor,
        "source_blood_group": source.blood_group,
        "tested_abo_group": tested_abo_group,
        "tested_rh_factor": tested_rh_factor,
        "test_method": test_method,
        "test_reference": test_reference,
        "sample_identity_confirmed": 1,
        "test_notes": test_notes,
        "tested_by": user,
        "tested_at": frappe.utils.now_datetime(),
    })

    old_flag = getattr(
        frappe.flags, "bb_group_verification_system_action", False
    )
    frappe.flags.bb_group_verification_system_action = True
    try:
        doc.insert(ignore_permissions=True)
    finally:
        frappe.flags.bb_group_verification_system_action = old_flag

    _set_unit_summary(
        doc,
        "Pending" if matched else "Discrepancy",
        False,
    )

    return {
        "name": doc.name,
        "status": status,
        "message": (
            "سُجلت النتيجة وهي بانتظار مراجعة موظف مختبر آخر. "
            "لم تُعتمد الوحدة بعد."
            if matched
            else
            "النتيجة لا تطابق المصدر؛ سُجل التعارض وبقيت الوحدة غير معتمدة."
        ),
    }


# BB_GROUP_VERIFICATION_INDEPENDENT_REVIEW_V1
@frappe.whitelist()
def review_group_test(name, decision, review_notes):
    reviewer = _require_lab_user()
    record = frappe.get_doc("Blood Group Verification", name)
    record.check_permission("write")

    if record.verification_status != "Pending Review":
        frappe.throw("هذا السجل ليس بانتظار المراجعة.")
    if reviewer == record.tested_by:
        frappe.throw("لا يجوز لمن نفّذ الفحص أن يعتمد النتيجة بنفسه.")
    review_notes = str(review_notes or "").strip()
    if not review_notes:
        frappe.throw("ملاحظات المراجعة مطلوبة.")
    if decision not in ("Verify", "Reject"):
        frappe.throw("قرار المراجعة غير صالح.")

    unit = frappe.get_doc("Blood Unit", record.blood_unit)
    unit.check_permission("write")
    if unit.unit_status != "Quarantine" or unit.blood_group_verified:
        frappe.throw("حالة الوحدة لم تعد تسمح باعتماد سجل التحقق.")

    screening = frappe.get_doc("Blood Screening", record.blood_screening)
    if (
        screening.blood_unit != unit.name
        or screening.sample_id != record.sample_id
    ):
        frappe.throw("رابط العينة أو الوحدة تغيّر؛ أوقف الاعتماد.")

    _assert_not_test_record(unit, screening)
    donor, source = _get_verified_source(unit)

    if decision == "Verify":
        if (
            record.tested_abo_group != source.abo_group
            or record.tested_rh_factor != source.rh_factor
        ):
            frappe.throw("النتيجة لا تطابق فصيلة المصدر؛ لا يمكن اعتمادها.")

        record.verification_status = "Verified"
        unit_summary_status = "Verified"
        verified = True
        message = (
            "تم اعتماد سجل التحقق بواسطة مراجع مستقل. "
            "الوحدة ما زالت في الحجر؛ لم يتم قبولها تلقائيًا."
        )
    else:
        record.verification_status = "Rejected"
        unit_summary_status = "Discrepancy"
        verified = False
        message = (
            "رُفض سجل التحقق بعد المراجعة. بقيت الوحدة غير معتمدة وفي الحجر."
        )

    record.reviewed_by = reviewer
    record.reviewed_at = frappe.utils.now_datetime()
    record.review_notes = review_notes

    old_flag = getattr(
        frappe.flags, "bb_group_verification_system_action", False
    )
    frappe.flags.bb_group_verification_system_action = True
    try:
        record.save(ignore_permissions=True)
    finally:
        frappe.flags.bb_group_verification_system_action = old_flag

    _set_unit_summary(
        record, unit_summary_status, verified, review_notes
    )

    return {
        "name": record.name,
        "status": record.verification_status,
        "message": message,
    }
