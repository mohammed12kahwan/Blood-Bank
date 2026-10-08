import frappe
from frappe.model.document import Document


class BloodDonor(Document):

    def validate(self):
        self.set_blood_group()

    def set_blood_group(self):
        if self.abo_group and self.rh_factor:
            self.blood_group = f"{self.abo_group} {self.rh_factor}"
        else:
            self.blood_group = None
