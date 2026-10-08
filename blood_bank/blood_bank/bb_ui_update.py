import frappe

HTML = r'''
<div class="bb-staff" dir="rtl">
  <div class="bb-head">
    <div class="bb-icon">👨‍⚕️</div>
    <div>
      <div class="bb-title">عمل موظف بنك الدم</div>
      <div class="bb-sub">Blood Bank Staff Operations</div>
    </div>
  </div>

  <div class="bb-note">
    واجهة تشغيل موحّدة حسب تسلسل العمل. كل نافذة تحتفظ بحقوقها وحقولها وألوانها وتصميمها الحالي.
  </div>

  <details open>
    <summary>👤 المتبرع والتبرع</summary>
    <div class="bb-grid">
      <a class="bb-card blue" href="/app/blood-donor">
        <strong>👤 المتبرع</strong><small>Blood Donor</small>
      </a>
      <a class="bb-card red" href="/app/blood-donation">
        <strong>🩸 التبرع بالدم</strong><small>Blood Donation</small>
      </a>
    </div>
  </details>

  <details>
    <summary>⚙️ المعالجة والوحدة</summary>
    <div class="bb-grid">
      <a class="bb-card amber" href="/app/blood-processing">
        <strong>⚙️ معالجة الدم</strong><small>Blood Processing</small>
      </a>
      <a class="bb-card purple" href="/app/blood-unit">
        <strong>🧫 وحدة الدم</strong><small>Blood Unit</small>
      </a>
    </div>
  </details>

  <details>
    <summary>🔬 الفحص والجودة والمكوّن</summary>
    <div class="bb-grid">
      <a class="bb-card cyan" href="/app/blood-screening">
        <strong>🔬 فحص الدم</strong><small>Blood Screening</small>
      </a>
      <a class="bb-card green" href="/app/blood-component-quality-check">
        <strong>✅ فحص جودة المكوّن</strong><small>Blood Component Quality Check</small>
      </a>
      <a class="bb-card teal" href="/app/blood-component">
        <strong>🧫 مكوّن الدم</strong><small>Blood Component</small>
      </a>
    </div>
  </details>

  <details>
    <summary>❄️ التخزين</summary>
    <div class="bb-grid">
      <a class="bb-card blue" href="/app/blood-storage">
        <strong>❄️ التخزين</strong><small>Blood Storage</small>
      </a>
    </div>
  </details>

  <details>
    <summary>📋 الطلب والحجز والمطابقة</summary>
    <div class="bb-grid">
      <a class="bb-card cyan" href="/app/blood-request">
        <strong>📋 طلب الدم</strong><small>Blood Request</small>
      </a>
      <a class="bb-card amber" href="/app/blood-reservation">
        <strong>🔒 الحجز</strong><small>Blood Reservation</small>
      </a>
      <a class="bb-card purple" href="/app/blood-crossmatch">
        <strong>🔄 المطابقة</strong><small>Blood Crossmatch</small>
      </a>
    </div>
  </details>

  <details>
    <summary>📦 الصرف والتسليم</summary>
    <div class="bb-grid">
      <a class="bb-card amber" href="/app/blood-issue">
        <strong>📦 صرف الدم</strong><small>Blood Issue</small>
      </a>
      <a class="bb-card green" href="/app/blood-handover">
        <strong>🤝 تسليم الدم</strong><small>Blood Handover</small>
      </a>
    </div>
  </details>

  <details>
    <summary>💉 نقل الدم ومصير الوحدة</summary>
    <div class="bb-grid">
      <a class="bb-card red" href="/app/blood-transfusion">
        <strong>💉 نقل الدم</strong><small>Blood Transfusion</small>
      </a>
      <a class="bb-card dark" href="/app/blood-unit-disposition">
        <strong>🗑️ مصير الوحدة</strong><small>Blood Unit Disposition</small>
      </a>
    </div>
  </details>
</div>
'''

STYLE = r'''
.bb-staff{width:100%;font-family:inherit;box-sizing:border-box}
.bb-head{display:flex;align-items:center;gap:12px;background:#dce7f2;border:1px solid #9db2c7;border-radius:10px;padding:12px 14px;margin-bottom:8px}
.bb-icon{width:42px;height:42px;display:flex;align-items:center;justify-content:center;border-radius:10px;background:#b9d3e8;font-size:23px}
.bb-title{font-size:20px;font-weight:800;color:#17324d}
.bb-sub{margin-top:2px;font-size:10px;color:#617488;direction:ltr;text-align:right}
.bb-note{margin-bottom:8px;padding:9px 11px;background:#eef4f8;border:1px solid #c1d0dc;border-radius:8px;font-size:11px;color:#4c6274}
.bb-staff details{margin-bottom:7px;background:#f7f9fb;border:1px solid #b9c7d5;border-radius:8px;overflow:hidden}
.bb-staff summary{cursor:pointer;padding:9px 11px;background:#e1eaf2;color:#29475f;font-size:12px;font-weight:800;list-style:none}
.bb-staff summary::-webkit-details-marker{display:none}
.bb-staff details[open] summary{background:#cbd9e8}
.bb-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;padding:8px}
.bb-card{display:flex;flex-direction:column;justify-content:center;min-height:58px;padding:8px 10px;border-radius:8px;border:1px solid;text-decoration:none!important;box-sizing:border-box}
.bb-card:hover{transform:translateY(-1px);box-shadow:0 3px 7px rgba(15,23,42,.12)}
.bb-card strong{font-size:11.5px}
.bb-card small{margin-top:2px;font-size:9px;opacity:.72;direction:ltr;text-align:right}
.blue{background:#dceaf7;color:#24577f;border-color:#91b5d3}
.red{background:#f5dddd;color:#8d3030;border-color:#d29393}
.amber{background:#f3e7d2;color:#875a1b;border-color:#d5b071}
.purple{background:#e9e1f4;color:#604786;border-color:#ad99ce}
.cyan{background:#dceff2;color:#226071;border-color:#91bdc7}
.green{background:#deeedf;color:#2d6a36;border-color:#9fc2a3}
.teal{background:#dceeed;color:#206565;border-color:#91bbb8}
.dark{background:#e1e4e8;color:#414b55;border-color:#aab2ba}
@media(max-width:800px){.bb-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:520px){.bb-grid{grid-template-columns:1fr}}
'''

def update():
    doc = frappe.get_doc("Custom HTML Block", "Blood Bank UI Test Cards")
    doc.html = HTML
    doc.style = STYLE
    doc.script = ""
    doc.save(ignore_permissions=True)

    ws = frappe.get_doc("Workspace", "Blood Bank UI Test")
    for row in ws.custom_blocks:
        if row.custom_block_name == "Blood Bank UI Test Cards":
            row.label = "عمل موظف بنك الدم"

    ws.save(ignore_permissions=True)
    frappe.db.commit()
    print("تم إصلاح واجهة Blood Bank UI Test")
