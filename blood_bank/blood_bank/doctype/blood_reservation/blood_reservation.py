
import frappe
from frappe.model.document import Document


class BloodReservation(Document):

    def validate(self):

        self.load_crossmatch_information()
        self.validate_crossmatch()
        self.validate_candidate_storage()
        self.validate_duplicate_reservation()

    def load_crossmatch_information(self):

        if not self.blood_crossmatch:
            return

        crossmatch = frappe.db.get_value(
            "Blood Crossmatch",
            self.blood_crossmatch,
            [
                "crossmatch_status",
                "blood_request",
                "patient",
                "patient_name",
                "candidate_storage",
                "candidate_component",
                "candidate_blood_unit",
                "candidate_blood_group",
                "candidate_component_type",
                "candidate_bag_number",
                "compatibility_result",
            ],
            as_dict=True,
        )

        if not crossmatch:
            frappe.throw(
                "Blood Crossmatch record not found."
            )

        self.blood_request = crossmatch.blood_request
        self.patient = crossmatch.patient
        self.patient_name = crossmatch.patient_name
        self.blood_storage = crossmatch.candidate_storage
        self.blood_component = crossmatch.candidate_component
        self.blood_unit = crossmatch.candidate_blood_unit
        self.blood_group = crossmatch.candidate_blood_group
        self.component_type = crossmatch.candidate_component_type
        self.bag_number = crossmatch.candidate_bag_number

    def validate_crossmatch(self):

        if not self.blood_crossmatch:
            return

        crossmatch = frappe.db.get_value(
            "Blood Crossmatch",
            self.blood_crossmatch,
            [
                "crossmatch_status",
                "compatibility_result",
            ],
            as_dict=True,
        )

        if not crossmatch:
            frappe.throw(
                "Blood Crossmatch record not found."
            )

        if crossmatch.crossmatch_status != "Compatible":
            frappe.throw(
                "Reservation requires a Compatible Crossmatch."
            )

        if crossmatch.compatibility_result != "Compatible":
            frappe.throw(
                "Reservation requires a Compatible result."
            )

    def validate_candidate_storage(self):

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

        previous = self.get_doc_before_save()

        # Initial creation must point to Available storage.
        if not previous:

            if storage.storage_status != "Available":
                frappe.throw(
                    "A new Reservation requires "
                    "Available Blood Storage."
                )

        # Draft -> Reserved must happen only while
        # candidate storage is still Available.
        elif (
            previous.reservation_status == "Draft"
            and self.reservation_status == "Reserved"
        ):

            if storage.storage_status != "Available":
                frappe.throw(
                    "Reservation requires candidate "
                    "Blood Storage to be Available "
                    "before reservation."
                )

        # Reserved -> Ready for Issue keeps
        # storage in Reserved state.
        elif (
            previous.reservation_status == "Reserved"
            and self.reservation_status == "Ready for Issue"
        ):

            if storage.storage_status != "Reserved":
                frappe.throw(
                    "Ready for Issue requires the "
                    "Blood Storage to remain Reserved."
                )

        elif self.reservation_status == "Reserved":

            if storage.storage_status not in [
                "Available",
                "Reserved",
            ]:
                frappe.throw(
                    "Blood Storage is not eligible "
                    "for Reservation."
                )

        elif self.reservation_status == "Ready for Issue":

            if storage.storage_status != "Reserved":
                frappe.throw(
                    "Ready for Issue requires "
                    "Reserved Blood Storage."
                )

        if storage.blood_component != self.blood_component:
            frappe.throw(
                "Blood Component does not match the candidate."
            )

        if storage.blood_unit != self.blood_unit:
            frappe.throw(
                "Blood Unit does not match the candidate."
            )

        if storage.blood_group != self.blood_group:
            frappe.throw(
                "Blood Group does not match the candidate."
            )

        if storage.component_type != self.component_type:
            frappe.throw(
                "Component Type does not match the candidate."
            )

        if storage.bag_number != self.bag_number:
            frappe.throw(
                "Bag Number does not match the candidate."
            )

    def validate_duplicate_reservation(self):

        if not self.blood_storage:
            return

        existing = frappe.db.sql(
            """
            SELECT name, reservation_status
            FROM `tabBlood Reservation`
            WHERE blood_storage = %s
              AND name != %s
              AND reservation_status IN (
                    'Reserved',
                    'Ready for Issue'
              )
            LIMIT 1
            """,
            (
                self.blood_storage,
                self.name,
            ),
            as_dict=True,
        )

        if existing:
            frappe.throw(
                "This Blood Storage is already reserved by "
                f"{existing[0].name}."
            )

    def on_update(self):

        previous = self.get_doc_before_save()

        if not previous:
            return

        # Draft -> Reserved:
        # update the inventory boundary exactly here.
        if (
            previous.reservation_status == "Draft"
            and self.reservation_status == "Reserved"
        ):

            storage_status = frappe.db.get_value(
                "Blood Storage",
                self.blood_storage,
                "storage_status",
            )

            if storage_status != "Available":
                frappe.throw(
                    "Blood Storage must be Available "
                    "when reservation is confirmed."
                )

            now = frappe.utils.now_datetime()

            frappe.db.set_value(
                "Blood Storage",
                self.blood_storage,
                {
                    "storage_status": "Reserved",
                },
                update_modified=True,
            )

            frappe.db.set_value(
                "Blood Reservation",
                self.name,
                {
                    "reserved_at": now,
                    "reserved_by": frappe.session.user,
                },
                update_modified=True,
            )

        # Reserved -> Ready for Issue:
        # inventory remains Reserved.
        elif (
            previous.reservation_status == "Reserved"
            and self.reservation_status == "Ready for Issue"
        ):

            storage_status = frappe.db.get_value(
                "Blood Storage",
                self.blood_storage,
                "storage_status",
            )

            if storage_status != "Reserved":
                frappe.throw(
                    "Blood Storage must remain Reserved."
                )

            now = frappe.utils.now_datetime()

            frappe.db.set_value(
                "Blood Reservation",
                self.name,
                {
                    "ready_for_issue_at": now,
                    "ready_for_issue_by": frappe.session.user,
                },
                update_modified=True,
            )
