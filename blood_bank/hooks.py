app_name = "blood_bank"
app_title = "Blood Bank"
app_publisher = "Hospital IT"
app_description = "Blood Bank Management System"
app_email = "bloodbank@localhost"
app_license = "mit"

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "blood_bank",
# 		"logo": "/assets/blood_bank/logo.png",
# 		"title": "Blood Bank",
# 		"route": "/blood_bank",
# 		"has_permission": "blood_bank.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/blood_bank/css/blood_bank.css"
# app_include_js = "/assets/blood_bank/js/blood_bank.js"

# include js, css files in header of web template
# web_include_css = "/assets/blood_bank/css/blood_bank.css"
# web_include_js = "/assets/blood_bank/js/blood_bank.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "blood_bank/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "blood_bank/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "blood_bank.utils.jinja_methods",
# 	"filters": "blood_bank.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "blood_bank.install.before_install"
# after_install = "blood_bank.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "blood_bank.uninstall.before_uninstall"
# after_uninstall = "blood_bank.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "blood_bank.utils.before_app_install"
# after_app_install = "blood_bank.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "blood_bank.utils.before_app_uninstall"
# after_app_uninstall = "blood_bank.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "blood_bank.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
# 	}
# }

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"blood_bank.tasks.all"
# 	],
# 	"daily": [
# 		"blood_bank.tasks.daily"
# 	],
# 	"hourly": [
# 		"blood_bank.tasks.hourly"
# 	],
# 	"weekly": [
# 		"blood_bank.tasks.weekly"
# 	],
# 	"monthly": [
# 		"blood_bank.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "blood_bank.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "blood_bank.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "blood_bank.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["blood_bank.utils.before_request"]
# after_request = ["blood_bank.utils.after_request"]

# Job Events
# ----------
# before_job = ["blood_bank.utils.before_job"]
# after_job = ["blood_bank.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"blood_bank.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []

# === BLOOD BANK WORKSPACE UI ASSETS ===

_bb_css = globals().get("app_include_css", [])
if isinstance(_bb_css, str):
    _bb_css = [_bb_css]

app_include_css = list(dict.fromkeys(
    _bb_css + [
        "/assets/blood_bank/css/blood_bank_workspace.css?v=3"
    ]
))


_bb_js = globals().get("app_include_js", [])
if isinstance(_bb_js, str):
    _bb_js = [_bb_js]

app_include_js = list(dict.fromkeys(
    _bb_js + [
        "/assets/blood_bank/js/blood_bank_workspace.js?v=3"
    ]
))

# === BLOOD BANK FORM CSS ROUTING ===
# Individual form CSS is loaded only on its matching DocType route.
# The CSS files themselves are intentionally unchanged.

# === BLOOD BANK NAVIGATION ASSETS ===

_bb_nav_js = globals().get("app_include_js", [])
if isinstance(_bb_nav_js, str):
    _bb_nav_js = [_bb_nav_js]

app_include_js = list(dict.fromkeys(
    _bb_nav_js + [
        "/assets/blood_bank/js/blood_bank_navigation.js?v=2",
    ]
))

_bb_nav_css = globals().get("app_include_css", [])
if isinstance(_bb_nav_css, str):
    _bb_nav_css = [_bb_nav_css]

app_include_css = list(dict.fromkeys(
    _bb_nav_css + [
        "/assets/blood_bank/css/blood_bank_navigation.css?v=3",
    ]
))


app_include_js = list(dict.fromkeys(globals().get("app_include_js", []) + ["/assets/blood_bank/js/blood_donor_embedded_forms.js?v=1", "/assets/blood_bank/js/blood_bank_workspace_shortcut.js?v=7"]))

_bb_workspace_css = globals().get("app_include_css", [])
_bb_workspace_css = _bb_workspace_css if isinstance(_bb_workspace_css, list) else [_bb_workspace_css]
app_include_css = list(dict.fromkeys(_bb_workspace_css + ["/assets/blood_bank/css/blood_bank_workspace_shortcut.css?v=6"]))


# BB_UNIFIED_NAVIGATION_ASSETS_V1
_bb_unified_nav_js = globals().get("app_include_js", [])
if isinstance(_bb_unified_nav_js, str):
    _bb_unified_nav_js = [_bb_unified_nav_js]
else:
    _bb_unified_nav_js = list(_bb_unified_nav_js or [])
app_include_js = list(dict.fromkeys(
    _bb_unified_nav_js + [
        "/assets/blood_bank/js/blood_bank_unified_navigation.js?v=3"
    ]
))

_bb_unified_nav_css = globals().get("app_include_css", [])
if isinstance(_bb_unified_nav_css, str):
    _bb_unified_nav_css = [_bb_unified_nav_css]
else:
    _bb_unified_nav_css = list(_bb_unified_nav_css or [])
app_include_css = list(dict.fromkeys(
    _bb_unified_nav_css + [
        "/assets/blood_bank/css/blood_bank_unified_navigation.css?v=4"
    ]
))

# Shared hospital messaging shortcut on Blood Bank routes.
app_include_js = list(globals().get('app_include_js', []) or [])
_bb_messaging_asset = '/assets/blood_bank/js/blood_bank_messaging_shortcut.js'
if _bb_messaging_asset not in app_include_js:
    app_include_js.append(_bb_messaging_asset)

# BB_ACTION_BUTTON_THEME_V1
_bb_action_theme_asset = (
    "/assets/blood_bank/js/blood_bank_action_button_theme.js?v=1"
)
if _bb_action_theme_asset not in app_include_js:
    app_include_js.append(_bb_action_theme_asset)


# BB_FORM_CSS_ROUTING_V1
_bb_form_css_router_asset = "/assets/blood_bank/js/blood_bank_form_css_router.js?v=1"
_bb_form_css_router_js = globals().get("app_include_js", []) or []
if isinstance(_bb_form_css_router_js, str):
    _bb_form_css_router_js = [_bb_form_css_router_js]
else:
    _bb_form_css_router_js = list(_bb_form_css_router_js)

if _bb_form_css_router_asset not in _bb_form_css_router_js:
    _bb_form_css_router_js.append(_bb_form_css_router_asset)

app_include_js = _bb_form_css_router_js


# BB_COMPONENT_WORK_DESK_CSS_V1
# Load the component work page styles in Desk.
_bb_component_css_path = "/assets/blood_bank/css/blood_bank_component_work.css"
_bb_current_app_css = globals().get("app_include_css", [])
if isinstance(_bb_current_app_css, str):
    _bb_current_app_css = [_bb_current_app_css]
else:
    _bb_current_app_css = list(_bb_current_app_css or [])
if _bb_component_css_path not in _bb_current_app_css:
    _bb_current_app_css.append(_bb_component_css_path)
app_include_css = _bb_current_app_css
del _bb_component_css_path, _bb_current_app_css
