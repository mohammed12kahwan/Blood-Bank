frappe.pages["blood-bank-staff-operations"].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __("عمل موظف بنك الدم"),
        single_column: true,
    });

    $(frappe.render_template("blood_bank_staff_operations")).appendTo(
        page.body.addClass("no-border")
    );

    const body = $(page.body);
    const frame = body.find("#bb-staff-frame");

    const WORKFLOW = [
        { doctype: "Blood Donor", route: "blood-donor", label: "المتبرع" },
        { doctype: "Blood Donation", route: "blood-donation", label: "التبرع" },
        { doctype: "Blood Processing", route: "blood-processing", label: "المعالجة" },
        { doctype: "Blood Unit", route: "blood-unit", label: "وحدة الدم" },
        { doctype: "Blood Screening", route: "blood-screening", label: "الفحص" },
        { doctype: "Blood Component", route: "blood-component", label: "المكوّن" },
        { doctype: "Blood Component Quality Check", route: "blood-component-quality-check", label: "جودة المكوّن" },
        { doctype: "Blood Storage", route: "blood-storage", label: "التخزين" },
        { doctype: "Blood Request", route: "blood-request", label: "طلب الدم" },
        { doctype: "Blood Reservation", route: "blood-reservation", label: "الحجز" },
        { doctype: "Blood Crossmatch", route: "blood-crossmatch", label: "المطابقة" },
        { doctype: "Blood Issue", route: "blood-issue", label: "الصرف" },
        { doctype: "Blood Handover", route: "blood-handover", label: "التسليم" },
        { doctype: "Blood Transfusion", route: "blood-transfusion", label: "نقل الدم" },
        { doctype: "Blood Unit Disposition", route: "blood-unit-disposition", label: "مصير الوحدة" }
    ];

    let pending_transfer = null;
    let bind_timer = null;

    function current_item() {
        const route = body.find(".bb-window.active").attr("data-route");
        return WORKFLOW.find(x => x.route === route);
    }

    function next_item(doctype) {
        const i = WORKFLOW.findIndex(x => x.doctype === doctype);
        return i >= 0 ? WORKFLOW[i + 1] : null;
    }

    // Preserve the current workflow window and its open document.
    const BB_ROUTE_STORAGE_KEY = "bb_staff_ops_route_v1";
    const BB_URL_STORAGE_KEY = "bb_staff_ops_url_v1";

    function bb_route_from_url(url) {
        const path = String(url || "").split(/[?#]/, 1)[0];
        const match = path.match(/^\/app\/([^/]+)/);
        return match ? match[1] : "";
    }

    function bb_save_window(route, url) {
        try {
            if (route && WORKFLOW.some(x => x.route === route)) {
                sessionStorage.setItem(BB_ROUTE_STORAGE_KEY, route);
            }

            if (url && bb_route_from_url(url) === route) {
                sessionStorage.setItem(BB_URL_STORAGE_KEY, url);
            }
        } catch (e) {
            console.warn("Blood Bank window state:", e);
        }
    }

    function bb_current_frame_url() {
        try {
            const child = frame[0] && frame[0].contentWindow;
            if (!child) return "";

            const url =
                child.location.pathname +
                child.location.search +
                child.location.hash;

            return url.startsWith("/app/") ? url : "";
        } catch (e) {
            return "";
        }
    }

    function bb_remember_current_window() {
        const item = current_item();
        if (!item) return;

        try {
            sessionStorage.setItem(BB_ROUTE_STORAGE_KEY, item.route);
        } catch (e) {}

        const url = bb_current_frame_url();

        if (url && bb_route_from_url(url) === item.route) {
            bb_save_window(item.route, url);
        }
    }

    function bb_restore_saved_window() {
        let savedRoute = "";
        let savedUrl = "";

        try {
            savedRoute = sessionStorage.getItem(BB_ROUTE_STORAGE_KEY) || "";
            savedUrl = sessionStorage.getItem(BB_URL_STORAGE_KEY) || "";
        } catch (e) {}

        const urlRoute = bb_route_from_url(savedUrl);
        const savedRouteIsValid = WORKFLOW.some(
            x => x.route === savedRoute
        );

        const route = savedRouteIsValid ? savedRoute : urlRoute;
        if (!route || !WORKFLOW.some(x => x.route === route)) {
            return;
        }

        // Restore the saved document only when its route matches.
        const targetUrl = urlRoute === route
            ? savedUrl
            : `/app/${route}/new`;

        body.find(".bb-window").removeClass("active");
        body.find(`.bb-window[data-route="${route}"]`).addClass("active");

        const item = WORKFLOW.find(x => x.route === route);
        if (item) {
            body.find(".bb-staff-current-title").text(item.label);
        }

        body.find(".bb-dashboard").hide();
        body.find(".bb-staff-workspace").show();

        bb_save_window(route, targetUrl);
        frame.attr("src", targetUrl);
    }

    // Resolve the donor's readable name before applying transferred fields.
    function apply_transfer_with_donor_name(frm, child) {
        const transfer = pending_transfer;

        if (!transfer || transfer.to_doctype !== frm.doctype) {
            apply_transfer(frm);
            return;
        }

        const data = transfer.data || {};
        const donor = data.donor;

        if (!donor || !child || !child.frappe || !child.frappe.db) {
            apply_transfer(frm);
            return;
        }

        if (transfer.__bb_name_lookup_pending) return;
        transfer.__bb_name_lookup_pending = true;

        Promise.resolve(
            child.frappe.db.get_value(
                "Blood Donor",
                donor,
                "full_name"
            )
        ).then(function (r) {
            transfer.__bb_name_lookup_pending = false;

            if (pending_transfer !== transfer) return;

            const fullName = r && r.message && r.message.full_name;
            if (fullName) {
                transfer.data.donor_name = fullName;
            }

            apply_transfer(frm);
        }).catch(function (err) {
            transfer.__bb_name_lookup_pending = false;
            console.warn("Blood Bank donor name lookup:", err);

            if (pending_transfer === transfer) {
                apply_transfer(frm);
            }
        });
    }

    function transfer_data(from_doctype, doc) {
        if (from_doctype === "Blood Donor") {
            return {
                donor: doc.name || "",
                donor_name: doc.full_name || ""
            };
        }

        if (from_doctype === "Blood Donation") {
            let processing_type = "";

            if (doc.donation_type === "Whole Blood") {
                processing_type = "Whole Blood Processing";
            } else if (doc.donation_type === "Apheresis") {
                processing_type = "Apheresis Processing";
            } else if (doc.donation_type === "Other") {
                processing_type = "Other";
            }

            return {
                blood_donation: doc.name || "",
                donor: doc.donor || "",
                donor_name: doc.donor_name || "",
                bag_number: doc.bag_number || "",
                donation_type: doc.donation_type || "",
                collection_start: doc.collection_start || "",
                collection_end: doc.collection_end || "",
                volume_collected: doc.volume_collected ?? "",
                collection_unit: doc.collection_unit || "",
                processing_date: doc.donation_date || "",
                processing_type: processing_type
            };
        }

        if (from_doctype === "Blood Unit") {
            return {
                blood_unit: doc.name || "",
                blood_donation: doc.blood_donation || "",
                donor: doc.donor || "",
                donor_name: doc.donor_name || "",
                blood_group: doc.blood_group || "",
                bag_number: doc.bag_number || "",
                unit_type: doc.unit_type || ""
            };
        }

        if (from_doctype === "Blood Screening") {
            return {
                blood_screening: doc.name || "",
                blood_unit: doc.blood_unit || "",
                donor: doc.donor || "",
                donor_name: doc.donor_name || "",
                blood_group: doc.blood_group || "",
                bag_number: doc.bag_number || ""
            };
        }

        if (from_doctype === "Blood Processing") {
            let unit_type = "";

            if (doc.processing_type === "Whole Blood Processing") {
                unit_type = "Whole Blood";
            } else if (doc.processing_type === "Apheresis Processing") {
                unit_type = "Apheresis";
            } else if (doc.processing_type === "Other") {
                unit_type = "Other";
            }

            return {
                blood_processing: doc.name || "",
                blood_donation: doc.blood_donation || "",
                donor: doc.donor || "",
                donor_name: doc.donor_name || "",
                blood_group: doc.blood_group || "",
                bag_number: doc.bag_number || "",
                unit_type: unit_type
            };
        }

        return {};
    }

    function apply_transfer(frm) {
        if (!pending_transfer || pending_transfer.to_doctype !== frm.doctype) {
            return;
        }

        const data = pending_transfer.data || {};
        pending_transfer = null;

        Object.keys(data).forEach(fieldname => {
            if (frm.fields_dict[fieldname]) {
                frm.set_value(fieldname, data[fieldname]);
            }
        });
    }

    function bind_child_form() {
        clearTimeout(bind_timer);

        try {
            const child = frame[0]?.contentWindow;
            const frm = child?.cur_frm;

            if (!child || !child.frappe || !frm || !frm.doctype) {
                bind_timer = setTimeout(bind_child_form, 250);
                return;
            }

            // The iframe can fire "load" before Frappe has replaced
            // cur_frm with the destination DocType. Keep polling until
            // the expected form is actually ready to receive the transfer.
            if (
                pending_transfer &&
                pending_transfer.to_doctype &&
                frm.doctype !== pending_transfer.to_doctype
            ) {
                bind_timer = setTimeout(bind_child_form, 250);
                return;
            }

            /*
             * Recovery for a unit that reached Quarantine before the
             * navigation fix was installed. Do not repeat its workflow action.
             */
            if (
                !pending_transfer &&
                frm.doctype === "Blood Unit" &&
                frm.doc.name &&
                String(frm.doc.unit_status || "").trim() === "Quarantine" &&
                body.find(".bb-window.active").attr("data-route") === "blood-unit" &&
                !frm.__bb_quarantine_recovery_redirected
            ) {
                const next = next_item("Blood Unit");

                if (next) {
                    frm.__bb_quarantine_recovery_redirected = true;

                    pending_transfer = {
                        from_doctype: "Blood Unit",
                        to_doctype: next.doctype,
                        data: transfer_data("Blood Unit", frm.doc)
                    };

                    body.find(".bb-window")
                        .removeClass("active");

                    body.find(
                        `.bb-window[data-route="${next.route}"]`
                    ).addClass("active");

                    body.find(".bb-staff-current-title")
                        .text(next.label);

                    console.info(
                        "Blood Bank quarantine recovery transition:",
                        frm.doc.name,
                        "=>",
                        next.doctype
                    );

                    frame.attr("src", `/app/${next.route}/new`);
                    return;
                }
            }

            if (frm.__bb_staff_flow_bound) {
                apply_transfer_with_donor_name(frm, child);
                return;
            }

            frm.__bb_staff_flow_bound = true;

            child.frappe.ui.form.on(frm.doctype, {

                before_save(saved_frm) {
                    if (saved_frm.doctype === "Blood Unit") {
                        saved_frm.set_value(
                            "unit_status",
                            saved_frm.doc.unit_status || "Quarantine"
                        );
                    }
                },

                /*
                 * Record the CURRENT logged-in user as the actor BEFORE
                 * the workflow action is sent to the server.
                 *
                 * This makes the actor value part of the same workflow
                 * operation instead of changing it afterward.
                 */
                before_workflow_action(workflow_frm) {
                    if (!workflow_frm || !workflow_frm.doc) {
                        return;
                    }

                    const action = String(
                        workflow_frm.selected_workflow_action || ""
                    ).trim().toLowerCase();

                    const current_user = child.frappe.session.user;

                    if (!action || !current_user) {
                        return;
                    }

                    function set_actor(fieldname) {
                        if (!workflow_frm.fields_dict[fieldname]) {
                            return;
                        }

                        if (
                            workflow_frm.doc[fieldname] === undefined ||
                            workflow_frm.doc[fieldname] === null ||
                            workflow_frm.doc[fieldname] === ""
                        ) {
                            workflow_frm.set_value(
                                fieldname,
                                current_user
                            );
                        }
                    }

                    function set_review_date() {
                        if (
                            workflow_frm.fields_dict
                                .eligibility_review_date
                        ) {
                            workflow_frm.set_value(
                                "eligibility_review_date",
                                child.frappe.datetime.get_today()
                            );
                        }
                    }

                    /*
                     * ----------------------------------------------------
                     * Blood Donor
                     * ----------------------------------------------------
                     */
                    if (
                        workflow_frm.doctype === "Blood Donor" &&
                        (
                            action.includes("eligible") ||
                            action.includes("defer") ||
                            action.includes("reject")
                        )
                    ) {
                        set_actor("eligibility_reviewed_by");
                        set_review_date();
                    }

                    /*
                     * ----------------------------------------------------
                     * Blood Donation
                     * ----------------------------------------------------
                     */
                    if (
                        workflow_frm.doctype === "Blood Donation" &&
                        (
                            action.includes("check in") ||
                            action.includes("bleed") ||
                            action.includes("collection") ||
                            action.includes("complete collection")
                        )
                    ) {
                        set_actor("collection_staff");
                    }

                    /*
                     * ----------------------------------------------------
                     * Blood Processing
                     * ----------------------------------------------------
                     */
                    if (
                        workflow_frm.doctype === "Blood Processing" &&
                        action.includes("process")
                    ) {
                        set_actor("processing_started_by");
                    }

                    if (
                        workflow_frm.doctype === "Blood Processing" &&
                        action.includes("separat")
                    ) {
                        set_actor("separation_started_by");

                        if (
                            workflow_frm.fields_dict.separation_started_at &&
                            !workflow_frm.doc.separation_started_at
                        ) {
                            workflow_frm.set_value(
                                "separation_started_at",
                                child.frappe.datetime.now_datetime()
                            );
                        }
                    }

                    /*
                     * ----------------------------------------------------
                     * Blood Unit
                     * ----------------------------------------------------
                     */
                    if (
                        workflow_frm.doctype === "Blood Unit" &&
                        (
                            action.includes("collect") ||
                            action.includes("bleed")
                        )
                    ) {
                        set_actor("collection_staff");
                    }

                    /*
                     * ----------------------------------------------------
                     * Blood Screening
                     * ----------------------------------------------------
                     */
                    if (
                        workflow_frm.doctype === "Blood Screening" &&
                        action.includes("screen")
                    ) {
                        set_actor("screened_by");
                    }

                    if (
                        workflow_frm.doctype === "Blood Screening" &&
                        (
                            action.includes("review") ||
                            action.includes("approve")
                        )
                    ) {
                        set_actor("reviewer");

                        if (
                            workflow_frm.fields_dict.review_date
                        ) {
                            workflow_frm.set_value(
                                "review_date",
                                child.frappe.datetime.get_today()
                            );
                        }
                    }

                    /*
                     * ----------------------------------------------------
                     * Blood Component Quality Check
                     * ----------------------------------------------------
                     */
                    if (
                        workflow_frm.doctype ===
                            "Blood Component Quality Check" &&
                        action.includes("inspect")
                    ) {
                        set_actor("inspected_by");
                    }

                    if (
                        workflow_frm.doctype ===
                            "Blood Component Quality Check" &&
                        (
                            action.includes("discard") ||
                            action.includes("reject")
                        )
                    ) {
                        set_actor("discarded_by");
                    }

                    /*
                     * ----------------------------------------------------
                     * Blood Component
                     * ----------------------------------------------------
                     */
                    if (
                        workflow_frm.doctype === "Blood Component" &&
                        (
                            action.includes("prepar") ||
                            action.includes("creat")
                        )
                    ) {
                        set_actor("prepared_by");
                    }

                    /*
                     * ----------------------------------------------------
                     * Blood Storage
                     * ----------------------------------------------------
                     */
                    if (
                        workflow_frm.doctype === "Blood Storage" &&
                        action.includes("stor")
                    ) {
                        set_actor("stored_by");
                    }

                    if (
                        workflow_frm.doctype === "Blood Storage" &&
                        (
                            action.includes("avail") ||
                            action.includes("release")
                        )
                    ) {
                        set_actor("available_by");
                    }

                    if (
                        workflow_frm.doctype === "Blood Storage" &&
                        (
                            action.includes("discard") ||
                            action.includes("reject")
                        )
                    ) {
                        set_actor("discarded_by");
                    }

                    /*
                     * ----------------------------------------------------
                     * Blood Reservation
                     * ----------------------------------------------------
                     */
                    if (
                        workflow_frm.doctype === "Blood Reservation" &&
                        (
                            action.includes("reserv") ||
                            action.includes("book")
                        )
                    ) {
                        set_actor("reserved_by");
                    }

                    if (
                        workflow_frm.doctype === "Blood Reservation" &&
                        (
                            action.includes("ready") ||
                            action.includes("approve")
                        )
                    ) {
                        set_actor("ready_for_issue_by");
                    }

                    /*
                     * ----------------------------------------------------
                     * Blood Crossmatch
                     * ----------------------------------------------------
                     */
                    if (
                        workflow_frm.doctype === "Blood Crossmatch"
                    ) {
                        set_actor("performed_by");
                    }

                    /*
                     * ----------------------------------------------------
                     * Blood Issue
                     * ----------------------------------------------------
                     */
                    if (
                        workflow_frm.doctype === "Blood Issue" &&
                        (
                            action.includes("verif") ||
                            action.includes("check")
                        )
                    ) {
                        set_actor("verification_started_by");
                    }

                    if (
                        workflow_frm.doctype === "Blood Issue" &&
                        (
                            action.includes("issu") ||
                            action.includes("deliver")
                        )
                    ) {
                        set_actor("issued_by");
                    }

                    if (
                        workflow_frm.doctype === "Blood Issue" &&
                        (
                            action.includes("return")
                        )
                    ) {
                        set_actor("returned_by");
                    }

                    /*
                     * ----------------------------------------------------
                     * Blood Handover
                     * ----------------------------------------------------
                     */
                    if (
                        workflow_frm.doctype === "Blood Handover" &&
                        action.includes("start")
                    ) {
                        set_actor("handover_started_by");
                    }

                    if (
                        workflow_frm.doctype === "Blood Handover" &&
                        (
                            action.includes("complete") ||
                            action.includes("finish")
                        )
                    ) {
                        set_actor("handover_completed_by");
                    }

                    /*
                     * ----------------------------------------------------
                     * Blood Transfusion
                     * ----------------------------------------------------
                     */
                    if (
                        workflow_frm.doctype === "Blood Transfusion" &&
                        action.includes("assessment")
                    ) {
                        set_actor("assessment_started_by");
                    }

                    if (
                        workflow_frm.doctype === "Blood Transfusion" &&
                        (
                            action.includes("start") ||
                            action.includes("transfus")
                        )
                    ) {
                        set_actor("transfusion_started_by");
                    }

                    if (
                        workflow_frm.doctype === "Blood Transfusion" &&
                        (
                            action.includes("complete") ||
                            action.includes("transfus")
                        )
                    ) {
                        set_actor("transfused_by");
                    }

                    if (
                        workflow_frm.doctype === "Blood Transfusion" &&
                        (
                            action.includes("stop") ||
                            action.includes("abort")
                        )
                    ) {
                        set_actor("stopped_by");
                    }

                    if (
                        workflow_frm.doctype === "Blood Transfusion" &&
                        (
                            action.includes("outcome") ||
                            action.includes("result")
                        )
                    ) {
                        set_actor("outcome_recorded_by");
                    }

                    /*
                     * ----------------------------------------------------
                     * Blood Unit Disposition
                     * ----------------------------------------------------
                     */
                    if (
                        workflow_frm.doctype ===
                            "Blood Unit Disposition" &&
                        action.includes("reject")
                    ) {
                        set_actor("rejected_by");
                    }

                    if (
                        workflow_frm.doctype ===
                            "Blood Unit Disposition" &&
                        action.includes("discard")
                    ) {
                        set_actor("discarded_by");
                    }
                },

                /*
                 * SAVE NEVER MOVES TO THE NEXT WINDOW.
                 */
                after_save(saved_frm) {
                    return;
                },

                /*
                 * This event fires after Frappe has successfully applied
                 * and refreshed the workflow action.
                 *
                 * Donor -> Donation is triggered only by the final
                 * approval state Ready for Donation.
                 */
                after_workflow_action(workflow_frm) {
if (!workflow_frm || !workflow_frm.doc) {
return;
}

/*
 * Window 02 terminal transition:
 * Blood Donation -> Quarantine -> Blood Processing
 *
 * Quarantine is the terminal operational state of
 * Blood Donation. Once the workflow action succeeds,
 * move directly to the next operational window.
 */
const DIRECT_BLOOD_DONATION_QUARANTINE =
    workflow_frm.doctype === "Blood Donation" &&
    String(
        workflow_frm.doc.donation_status || ""
    ).trim() === "Quarantine";

if (DIRECT_BLOOD_DONATION_QUARANTINE) {
    const next = next_item("Blood Donation");

    if (!next) {
        console.warn(
            "Blood Bank: no next window after Blood Donation"
        );
        return;
    }

    const data = transfer_data(
        workflow_frm.doctype,
        workflow_frm.doc
    );

    pending_transfer = {
        from_doctype: workflow_frm.doctype,
        to_doctype: next.doctype,
        data: data
    };

    body.find(".bb-window")
        .removeClass("active");

    const next_button = body.find(
        `.bb-window[data-route="${next.route}"]`
    );

    next_button.addClass("active");

    body.find(
        ".bb-staff-current-title"
    ).text(next.label);

    console.info(
        "Blood Bank transition:",
        "Blood Donation",
        "=>",
        next.doctype,
        "state:",
        "Quarantine"
    );


    /*
     * Open the next Frappe form directly inside the staff iframe.
     * pending_transfer remains available until bind_child_form()
     * loads the new Blood Processing document.
     */
    const next_route = `/app/${next.route}/new`;

    console.info(
        "Blood Bank opening next form:",
        next_route
    );

    frame.attr("src", next_route);

    return;

}

                      /*
                       * Window 04 terminal transition:
                       * Blood Unit -> Quarantine -> Blood Screening.
                       */
                      const DIRECT_BLOOD_UNIT_QUARANTINE =
                          workflow_frm.doctype === "Blood Unit" &&
                          String(
                              workflow_frm.doc.unit_status || ""
                          ).trim() === "Quarantine";

                      if (DIRECT_BLOOD_UNIT_QUARANTINE) {
                          const next = next_item("Blood Unit");

                          if (!next) {
                              console.warn(
                                  "Blood Bank: no next window after Blood Unit"
                              );
                              return;
                          }

                          const data = transfer_data(
                              "Blood Unit",
                              workflow_frm.doc
                          );

                          pending_transfer = {
                              from_doctype: "Blood Unit",
                              to_doctype: next.doctype,
                              data: data
                          };

                          body.find(".bb-window")
                              .removeClass("active");

                          body.find(
                              `.bb-window[data-route="${next.route}"]`
                          ).addClass("active");

                          body.find(".bb-staff-current-title")
                              .text(next.label);

                          console.info(
                              "Blood Bank transition:",
                              "Blood Unit",
                              "=>",
                              next.doctype,
                              "state:",
                              "Quarantine"
                          );

                          const next_route = `/app/${next.route}/new`;

                          console.info(
                              "Blood Bank opening next form:",
                              next_route
                          );

                          frame.attr("src", next_route);
                          return;
                      }

/*
                     * The workflow state field for each Blood Bank window.
                     */
                    const STATE_FIELDS = {
                        "Blood Donor": "donor_status",
                        "Blood Donation": "donation_status",
                        "Blood Processing": "processing_status",
                        "Blood Unit": "unit_status",
                        "Blood Screening": "screening_status",
                        "Blood Component Quality Check": "qc_status",
                        "Blood Component": "component_status",
                        "Blood Storage": "storage_status",
                        "Blood Request": "request_status",
                        "Blood Reservation": "reservation_status",
                        "Blood Crossmatch": "crossmatch_status",
                        "Blood Issue": "issue_status",
                        "Blood Handover": "handover_status",
                        "Blood Transfusion": "transfusion_status",
                        "Blood Unit Disposition": "disposition_status"
                    };

                    const state_field =
                        STATE_FIELDS[workflow_frm.doctype];

                    /*
                     * We only move after the current workflow has reached
                     * a terminal state.
                     *
                     * Frappe will tell us whether any workflow actions
                     * are still available for the current document.
                     */
                    child.frappe.call({
                        method: "frappe.model.workflow.get_transitions",
                        args: {
                            doc: workflow_frm.doc
                        },
                        callback: function (r) {
                            const transitions = r.message || [];

                            /*
                             * There are still workflow actions available.
                             * Therefore the current window is NOT complete.
                             */
                            if (transitions.length > 0) {
                                return;
                            }

                            const current_state =
                                state_field &&
                                workflow_frm.doc[state_field]
                                    ? String(
                                        workflow_frm.doc[state_field]
                                    ).trim()
                                    : "";

                            const negative_state =
                                /cancel|cancelled|aborted|abort|reject|rejected|defer|deferred|discard|discarded|fail|failed|return|returned|stop|stopped/i
                                    .test(current_state);

                            /*
                             * Negative terminal states do not advance
                             * the donor/unit/case to the next operational
                             * stage.
                             */
                            if (negative_state) {
                                console.info(
                                    "Blood Bank workflow terminal state - no next step:",
                                    workflow_frm.doctype,
                                    current_state
                                );
                                return;
                            }

                            const next =
                                next_item(workflow_frm.doctype);

                            /*
                             * Last window: there is no next step.
                             */
                            if (!next) {
                                return;
                            }

                            /*
                             * Carry the COMPLETE business context to the
                             * next window. Status/workflow/system fields
                             * are excluded by transfer_data().
                             */
                            const data = transfer_data(
                                workflow_frm.doctype,
                                workflow_frm.doc
                            );

                            pending_transfer = {
                                from_doctype:
                                    workflow_frm.doctype,

                                to_doctype:
                                    next.doctype,

                                data: data
                            };

                            body.find(".bb-window")
                                .removeClass("active");

                            const next_button = body.find(
                                `.bb-window[data-route="${next.route}"]`
                            );

                            next_button.addClass("active");

                            body.find(
                                ".bb-staff-current-title"
                            ).text(next.label);

                            console.info(
                                "Blood Bank automatic workflow transition:",
                                workflow_frm.doctype,
                                "=>",
                                next.doctype,
                                "state:",
                                current_state
                            );

                            /*
                             * Open a NEW document only after the current
                             * workflow has actually completed.
                             *
                             * pending_transfer is already populated, so
                             * bind_child_form() will apply the transferred
                             * donor/context fields automatically.
                             */
                            try {
                                child.frappe.new_doc(
                                    next.doctype
                                );
                            } catch (e) {
                                console.warn(
                                    "Blood Bank automatic next:",
                                    e
                                );

                                frame.attr(
                                    "src",
                                    `/app/${next.route}/new`
                                );
                            }
                        }
                    });
                }

            });

            apply_transfer_with_donor_name(frm, child);

        } catch (e) {
            console.warn("Blood Bank staff flow:", e);
            bind_timer = setTimeout(bind_child_form, 250);
        }
    }

    frame.on("load.bbflow", function () {
        bind_child_form();
        bb_remember_current_window();
    });

    body.on("click", ".bb-window", function () {
        const btn = $(this);
        const route = btn.attr("data-route");

        if (!route) {
            return;
        }

        body.find(".bb-window").removeClass("active");
        btn.addClass("active");

        const item = WORKFLOW.find(x => x.route === route);

        if (item) {
            body.find(".bb-staff-current-title").text(item.label);
        }

        // Prepare Window 03 -> Window 04 transfer only from a
        // saved, completed Blood Processing record.
        pending_transfer = null;

        const source_child = frame[0] && frame[0].contentWindow;
        const source_frm = source_child && source_child.cur_frm;

        if (
            route === "blood-unit" &&
            source_frm &&
            source_frm.doctype === "Blood Processing" &&
            source_frm.doc &&
            source_frm.doc.name &&
            source_frm.doc.processing_status === "Component Separation"
        ) {
            const isNew =
                typeof source_frm.is_new === "function" &&
                source_frm.is_new();

            const isDirty =
                typeof source_frm.is_dirty === "function" &&
                source_frm.is_dirty();

            if (isNew || isDirty) {
                frappe.msgprint(
                    __("احفظ سجل المعالجة أولًا قبل نقله إلى نافذة وحدة الدم.")
                );
                return;
            }

            const transfer = transfer_data(
                "Blood Processing",
                source_frm.doc
            );

            if (
                !transfer.blood_donation ||
                !transfer.bag_number ||
                !transfer.blood_group ||
                !transfer.donor
            ) {
                frappe.msgprint(
                    __("تعذر النقل: تحقق من التبرع المصدر والمتبرع ورقم الكيس وفصيلة الدم في سجل المعالجة.")
                );
                return;
            }

            pending_transfer = {
                from_doctype: "Blood Processing",
                to_doctype: "Blood Unit",
                data: transfer
            };

            console.info(
                "Blood Bank: prepared Window 03 -> Window 04 transfer",
                source_frm.doc.name
            );
        }

        body.find(".bb-dashboard").hide();
        body.find(".bb-staff-workspace").show();

        bb_save_window(route, `/app/${route}/new`);
        frame.attr("src", `/app/${route}/new`);
    });


    body.on("click.bbrefresh", "#bb-refresh-current", function () {
        const child = frame[0] && frame[0].contentWindow;
        const frm = child && child.cur_frm;

        if (!frm || !frm.doc) {
            frappe.msgprint(__("لا يوجد نموذج مفتوح للتحديث."));
            return;
        }

        if (typeof frm.is_new === "function" && frm.is_new()) {
            frappe.msgprint(
                __("هذا نموذج جديد غير محفوظ. احفظ السجل أولًا قبل تحديث بياناته.")
            );
            return;
        }

        if (typeof frm.is_dirty === "function" && frm.is_dirty()) {
            frappe.msgprint(
                __("توجد تعديلات غير محفوظة. احفظها أو ألغها قبل جلب أحدث البيانات.")
            );
            return;
        }

        if (typeof frm.reload_doc === "function") {
            frm.reload_doc();
        } else if (child.location) {
            child.location.reload();
        }
    });

    // Restore the last selected window in this browser tab.
    bb_restore_saved_window();

    if (window.__bbStaffOpsRememberTimer) {
        window.clearInterval(window.__bbStaffOpsRememberTimer);
    }

    window.__bbStaffOpsRememberTimer = window.setInterval(
        bb_remember_current_window,
        500
    );

    function set_count(id, value) {
        body.find(id).text(Number(value || 0).toLocaleString("en-US"));
    }

    frappe.call({
        method: "blood_bank.blood_bank.page.blood_bank_staff_operations.blood_bank_staff_operations.get_dashboard_data",
        callback: function (r) {
            const d = r.message || {};

            set_count("#bb-count-donors", d.donors);
            set_count("#bb-count-donations", d.donations);
            set_count("#bb-count-units", d.units);
            set_count("#bb-count-requests", d.requests);
            set_count("#bb-count-reservations", d.reservations);
            set_count("#bb-count-issues", d.issues);
            set_count("#bb-count-transfusions", d.transfusions);

            body.find("#bb-dashboard-time").text(d.system_time || "--");
        }
    });
};

/* Hide the real Frappe desk toolbar inside every embedded Blood Bank window */
(function () {
    function hide_toolbar() {
        const frame = document.querySelector("#bb-staff-frame");
        if (!frame) return;

        try {
            const win = frame.contentWindow;
            const doc = frame.contentDocument;

            if (!win || !doc || !doc.head) return;

            /* Prevent the hidden toolbar from reserving vertical space */
            doc.documentElement.style.setProperty("--navbar-height", "0px", "important");

            let style = doc.getElementById("bb-hide-real-toolbar");

            if (!style) {
                style = doc.createElement("style");
                style.id = "bb-hide-real-toolbar";
                style.textContent = `
                    header.navbar.navbar-expand,
                    header.navbar.navbar-expand[role="navigation"],
                    body > header.navbar,
                    body > nav.navbar {
                        display: none !important;
                        visibility: hidden !important;
                        height: 0 !important;
                        min-height: 0 !important;
                        max-height: 0 !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        overflow: hidden !important;
                    }

                    .page-head {
                        display: flex !important;
                        visibility: visible !important;
                    }
                `;
                doc.head.appendChild(style);
            }

            const toolbar = doc.querySelector(
                'header.navbar.navbar-expand[role="navigation"]'
            ) || doc.querySelector("header.navbar.navbar-expand")
              || doc.querySelector("body > header.navbar")
              || doc.querySelector("body > nav.navbar");

            if (toolbar) {
                toolbar.style.setProperty("display", "none", "important");
                toolbar.style.setProperty("visibility", "hidden", "important");
                toolbar.style.setProperty("height", "0", "important");
                toolbar.style.setProperty("min-height", "0", "important");
                toolbar.style.setProperty("max-height", "0", "important");
                toolbar.style.setProperty("margin", "0", "important");
                toolbar.style.setProperty("padding", "0", "important");
            }

            if (!frame.__bb_toolbar_observer) {
                frame.__bb_toolbar_observer = new MutationObserver(function () {
                    const el =
                        doc.querySelector('header.navbar.navbar-expand[role="navigation"]') ||
                        doc.querySelector("header.navbar.navbar-expand") ||
                        doc.querySelector("body > header.navbar") ||
                        doc.querySelector("body > nav.navbar");

                    if (el) {
                        el.style.setProperty("display", "none", "important");
                        el.style.setProperty("visibility", "hidden", "important");
                        el.style.setProperty("height", "0", "important");
                    }
                });

                frame.__bb_toolbar_observer.observe(doc.documentElement, {
                    childList: true,
                    subtree: true
                });
            }

            if (!frame.__bb_toolbar_interval) {
                frame.__bb_toolbar_interval = setInterval(hide_toolbar, 500);
            }

        } catch (e) {
            console.warn("Blood Bank toolbar hide:", e);
        }
    }

    document.addEventListener("DOMContentLoaded", function () {
        const frame = document.querySelector("#bb-staff-frame");

        if (frame) {
            frame.addEventListener("load", function () {
                setTimeout(hide_toolbar, 100);
                setTimeout(hide_toolbar, 500);
                setTimeout(hide_toolbar, 1000);
                setTimeout(hide_toolbar, 2000);
            });
        }

        hide_toolbar();
    });

    setTimeout(hide_toolbar, 500);
    setTimeout(hide_toolbar, 1500);
    setTimeout(hide_toolbar, 3000);
})();


/* ============================================================
   GLOBAL STAFF OPERATIONS DROPDOWN FIX
   Applies to every Frappe form opened inside the Staff iframe.

   Goal:
   - Dropdown appears OUTSIDE section/card/table boundaries.
   - Dropdown does NOT change form height.
   - Native Frappe Link/Awesomeplete behavior is preserved.
   - Applies to ALL Blood Bank windows.
   ============================================================ */

(function () {

    function install_dropdown_fix(frame) {

        if (!frame) {
            return;
        }

        try {

            const win = frame.contentWindow;
            const doc = frame.contentDocument;

            if (!win || !doc || !doc.head) {
                return;
            }

            /* ------------------------------------------------
               GLOBAL OVERFLOW
               ------------------------------------------------ */

            let style =
                doc.getElementById(
                    "bb-staff-global-dropdown-style"
                );

            if (!style) {

                style =
                    doc.createElement("style");

                style.id =
                    "bb-staff-global-dropdown-style";

                style.textContent = `

                    html,
                    body,
                    .page-container,
                    .layout-main,
                    .layout-main-section,
                    .layout-main-section-wrapper,
                    .form-page,
                    .form-page-body,
                    .form-layout,
                    .form-layout .form-section,
                    .form-layout .section-body,
                    .form-layout .form-column,
                    .form-layout .frappe-control,
                    .form-layout .control-input,
                    .form-layout .control-input-wrapper,
                    .awesomplete {
                        overflow: visible !important;
                    }

                    /*
                     * Native Frappe Link dropdown
                     */
                    .awesomplete > ul {

                        z-index: 2147483647 !important;

                        max-height: 280px !important;

                        overflow-y: auto !important;

                        box-sizing: border-box !important;

                        margin-top: 2px !important;
                    }

                    /*
                     * Other Frappe/Bootstrap dropdowns
                     */
                    .link-autocomplete,
                    .dropdown-menu,
                    .form-select-options {
                        z-index: 2147483647 !important;
                    }

                    /*
                     * Never allow dropdown contents to
                     * enlarge the form section.
                     */
                    .awesomplete > ul {
                        height: auto !important;
                        min-height: 0 !important;
                    }
                `;

                doc.head.appendChild(style);
            }


            /* ------------------------------------------------
               PORTAL Frappe AWESOMEPLATE MENUS TO BODY
               This is the important part: the menu leaves
               the field/card container completely.
               ------------------------------------------------ */

            function portal_menus() {

                const menus =
                    Array.from(
                        doc.querySelectorAll(
                            ".awesomplete > ul"
                        )
                    );

                menus.forEach(function (menu) {

                    let anchor =
                        menu.__bb_anchor || null;

                    if (!anchor) {

                        const aw =
                            menu.parentElement;

                        if (aw) {

                            anchor =
                                aw.querySelector(
                                    "input"
                                );
                        }
                    }

                    if (!anchor) {
                        return;
                    }

                    menu.__bb_anchor =
                        anchor;

                    /*
                     * Move the native Frappe list
                     * outside the field/card DOM tree.
                     */
                    if (
                        menu.parentElement !==
                        doc.body
                    ) {
                        doc.body.appendChild(menu);
                    }

                    menu.style.setProperty(
                        "position",
                        "absolute",
                        "important"
                    );

                    menu.style.setProperty(
                        "z-index",
                        "2147483647",
                        "important"
                    );

                    function align_menu() {

                        if (
                            !anchor ||
                            !anchor.isConnected
                        ) {
                            return;
                        }

                        const rect =
                            anchor.getBoundingClientRect();

                        const left =
                            rect.left +
                            win.scrollX;

                        const top =
                            rect.bottom +
                            win.scrollY;

                        menu.style.setProperty(
                            "left",
                            `${left}px`,
                            "important"
                        );

                        menu.style.setProperty(
                            "top",
                            `${top + 2}px`,
                            "important"
                        );

                        menu.style.setProperty(
                            "width",
                            `${rect.width}px`,
                            "important"
                        );
                    }

                    align_menu();

                    if (
                        !menu.__bb_position_bound
                    ) {

                        menu.__bb_position_bound =
                            true;

                        win.addEventListener(
                            "resize",
                            align_menu,
                            true
                        );

                        doc.addEventListener(
                            "scroll",
                            align_menu,
                            true
                        );

                        anchor.addEventListener(
                            "input",
                            align_menu,
                            true
                        );

                        anchor.addEventListener(
                            "focus",
                            align_menu,
                            true
                        );
                    }

                });
            }


            if (!frame.__bb_global_dropdown_observer) {

                frame.__bb_global_dropdown_observer =
                    new MutationObserver(
                        function () {
                            portal_menus();
                        }
                    );

                frame.__bb_global_dropdown_observer.observe(
                    doc.body,
                    {
                        childList: true,
                        subtree: true
                    }
                );
            }


            if (!frame.__bb_global_dropdown_interval) {

                frame.__bb_global_dropdown_interval =
                    setInterval(
                        portal_menus,
                        300
                    );
            }


            portal_menus();

        } catch (e) {

            console.warn(
                "Blood Bank global dropdown fix:",
                e
            );
        }
    }


    function start_global_fix() {

        const frame =
            document.querySelector(
                "#bb-staff-frame"
            );

        if (!frame) {
            return;
        }

        frame.addEventListener(
            "load.bbglobaldropdown",
            function () {

                setTimeout(
                    function () {
                        install_dropdown_fix(frame);
                    },
                    100
                );

                setTimeout(
                    function () {
                        install_dropdown_fix(frame);
                    },
                    500
                );

                setTimeout(
                    function () {
                        install_dropdown_fix(frame);
                    },
                    1000
                );

                setTimeout(
                    function () {
                        install_dropdown_fix(frame);
                    },
                    2000
                );
            }
        );

        install_dropdown_fix(frame);
    }


    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            start_global_fix
        );

    } else {

        start_global_fix();
    }

})();

