import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import DashboardTopbar from "../components/common/DashboardTopbar";
import PageLoader from "../components/common/PageLoader";
import { getCached, readCached, writeCached } from "../services/cachedApi";
import { getStoredUser, isRootSuperUserRole, validateEmail } from "../utils/auth";
import "../styles/settings.css";
import "../styles/applicantsDashboard.css";

function getInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) return "U";
  return parts.map((part) => part[0]).join("").toUpperCase();
}

function ModalCloseIcon() {
  return <span aria-hidden="true">x</span>;
}

function TrashIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="42" height="42" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Settings() {
  const navigate = useNavigate();
  const storedUser = getStoredUser();
  const cachedSettings = readCached("/auth/settings");
  const canManageAdmins = isRootSuperUserRole(cachedSettings?.role || storedUser?.role);
  const [activeSection, setActiveSection] = useState("general");
  const [loading, setLoading] = useState(!cachedSettings);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adminSaving, setAdminSaving] = useState(false);
  const [removingAdmin, setRemovingAdmin] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [admins, setAdmins] = useState([]);
  const [adminSearch, setAdminSearch] = useState("");
  const [showAddAdminModal, setShowAddAdminModal] = useState(false);
  const [adminToRemove, setAdminToRemove] = useState(null);
  const [successModal, setSuccessModal] = useState(null);
  const [adminForm, setAdminForm] = useState({
    name: "",
    email: "",
    contactNumber: "",
    whatsappNumber: ""
  });
  const [adminFormErrors, setAdminFormErrors] = useState({});
  const [form, setForm] = useState({
    name: cachedSettings?.name || "",
    email: cachedSettings?.email || "",
    role: cachedSettings?.role || storedUser?.role || "",
    contactNumber: cachedSettings?.contactNumber || "",
    passwordMasked: cachedSettings?.passwordMasked || "********"
  });

  useEffect(() => {
    let active = true;

    async function loadSettings() {
      try {
        const userData = await getCached("/auth/settings", { ttlMs: 120000 });
        if (!active) return;
        setForm({
          name: userData?.name || "",
          email: userData?.email || "",
          role: userData?.role || storedUser?.role || "",
          contactNumber: userData?.contactNumber || "",
          passwordMasked: userData?.passwordMasked || "********"
        });
      } catch (loadError) {
        if (!active) return;
        setError(loadError?.response?.data?.message || "Unable to load settings");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadSettings();
    return () => {
      active = false;
    };
  }, [storedUser?.role]);

  const initials = useMemo(() => getInitials(form.name || storedUser?.name), [form.name, storedUser?.name]);
  const filteredAdmins = useMemo(() => {
    const query = adminSearch.trim().toLowerCase();
    if (!query) return admins;
    return admins.filter((admin) =>
      [admin.name, admin.email, admin.contactNumber, admin.whatsappNumber]
        .some((value) => String(value || "").toLowerCase().includes(query))
    );
  }, [adminSearch, admins]);

  const loadAdmins = async () => {
    if (!canManageAdmins) return;
    try {
      setAdminsLoading(true);
      const response = await API.get("/auth/admins");
      setAdmins(Array.isArray(response.data?.items) ? response.data.items : []);
    } catch (loadError) {
      setError(loadError?.response?.data?.message || "Unable to load admins");
    } finally {
      setAdminsLoading(false);
    }
  };

  useEffect(() => {
    if (activeSection === "admins" && canManageAdmins) {
      loadAdmins();
    }
  }, [activeSection, canManageAdmins]);

  const handleSave = async () => {
    if (!String(form.contactNumber || "").trim()) {
      setError("Contact number is required");
      setSuccessMessage("");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccessMessage("");
      await API.patch("/auth/settings", { contactNumber: form.contactNumber.trim() });
      writeCached(
        "/auth/settings",
        {
          ...form,
          contactNumber: form.contactNumber.trim()
        },
        { ttlMs: 120000 }
      );
      setSuccessMessage("Settings updated successfully.");
    } catch (saveError) {
      setError(saveError?.response?.data?.message || "Unable to update settings");
    } finally {
      setSaving(false);
    }
  };

  const resetAdminForm = () => {
    setAdminForm({
      name: "",
      email: "",
      contactNumber: "",
      whatsappNumber: ""
    });
    setAdminFormErrors({});
  };

  const validateAdminForm = () => {
    const nextErrors = {};
    if (!adminForm.name.trim()) nextErrors.name = "Name is required";
    const emailError = validateEmail(adminForm.email);
    if (emailError) nextErrors.email = emailError;
    if (!adminForm.contactNumber.trim()) nextErrors.contactNumber = "Contact number is required";
    setAdminFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleAddAdmin = async () => {
    if (!validateAdminForm()) return;

    try {
      setAdminSaving(true);
      setError("");
      const response = await API.post("/auth/admins", {
        name: adminForm.name.trim(),
        email: adminForm.email.trim().toLowerCase(),
        contactNumber: adminForm.contactNumber.trim(),
        whatsappNumber: adminForm.whatsappNumber.trim()
      });
      const createdAdmin = response.data?.admin;
      setAdmins((current) => createdAdmin ? [...current, createdAdmin].sort((a, b) => a.name.localeCompare(b.name)) : current);
      setShowAddAdminModal(false);
      setSuccessModal({
        type: "added",
        title: "Admin Added Successfully",
        message: `${adminForm.name.trim()} has been added as Admin.`
      });
      resetAdminForm();
    } catch (saveError) {
      setAdminFormErrors((current) => ({
        ...current,
        form: saveError?.response?.data?.message || "Unable to add admin"
      }));
    } finally {
      setAdminSaving(false);
    }
  };

  const handleRemoveAdmin = async () => {
    if (!adminToRemove) return;

    try {
      setRemovingAdmin(true);
      await API.delete(`/auth/admins/${adminToRemove.uid}`);
      setAdmins((current) => current.filter((admin) => admin.uid !== adminToRemove.uid));
      setSuccessModal({
        type: "removed",
        title: "Admin Removed Successfully",
        message: `${adminToRemove.name || "Admin"} has been removed.`
      });
      setAdminToRemove(null);
    } catch (removeError) {
      setError(removeError?.response?.data?.message || "Unable to remove admin");
    } finally {
      setRemovingAdmin(false);
    }
  };

  return (
    <div className="settingsPage">
      <DashboardTopbar user={{ name: form.name || storedUser?.name || "User", role: form.role || storedUser?.role }} />

      <div className="settingsShell">
        <div className="settingsShellHeader">
          <h1 className="settingsShellTitle">Your profile settings</h1>
        </div>

        <div className="settingsShellBody">
          <aside className="settingsSidebar">
            <button
              type="button"
              className={`settingsNavItem ${activeSection === "general" ? "settingsNavItemActive" : ""}`}
              onClick={() => setActiveSection("general")}
            >
              <span className="settingsNavIcon settingsNavIconGeneral" />
              <span>General</span>
            </button>
            {canManageAdmins ? (
              <button
                type="button"
                className={`settingsNavItem ${activeSection === "admins" ? "settingsNavItemActive" : ""}`}
                onClick={() => setActiveSection("admins")}
              >
                <span className="settingsNavIcon settingsNavIconAdmins" />
                <span>Admins</span>
              </button>
            ) : null}
          </aside>

          <section className="settingsContent">
            {loading ? (
              <PageLoader label="Loading settings..." />
            ) : activeSection === "general" ? (
              <>
                <div className="settingsProfileHead">
                  <div className="settingsAvatar">{initials}</div>
                  <div>
                    <div className="settingsProfileName">{form.name || "-"}</div>
                    <div className="settingsProfileEmail">{form.email || "-"}</div>
                  </div>
                </div>

                <div className="settingsBlock">
                  <label className="settingsLabel" htmlFor="settings-contact">
                    Phone number
                  </label>
                  <input
                    id="settings-contact"
                    className="settingsInput"
                    value={form.contactNumber}
                    onChange={(event) => {
                      setForm((prev) => ({ ...prev, contactNumber: event.target.value }));
                      setError("");
                      setSuccessMessage("");
                    }}
                  />
                  <button type="button" className="settingsTextLink" onClick={() => document.getElementById("settings-contact")?.focus()}>
                    Update number
                  </button>
                </div>

                <div className="settingsBlock">
                  <label className="settingsLabel">Password</label>
                  <div className="settingsValue">{form.passwordMasked}</div>
                  <button type="button" className="settingsTextLink" onClick={() => navigate("/settings/change-password")}>
                    Change Password
                  </button>
                </div>

                {error ? <div className="settingsError">{error}</div> : null}
                {successMessage ? <div className="settingsSuccess">{successMessage}</div> : null}

                <div className="settingsInlineActions">
                  <button type="button" className="settingsPrimaryBtn" disabled={saving} onClick={handleSave}>
                    {saving ? "Saving..." : "Save changes"}
                  </button>
                </div>
              </>
            ) : (
              <div className="settingsAdminPanel">
                <div className="settingsAdminHeader">
                  <h2 className="settingsSectionTitle">Admin Management</h2>
                  <button type="button" className="settingsPrimaryBtn settingsAddAdminBtn" onClick={() => setShowAddAdminModal(true)}>
                    <span aria-hidden="true">+</span>
                    Add Admin
                  </button>
                </div>

                <div className="settingsAdminToolbar">
                  <div className="settingsAdminSearch">
                    <input
                      value={adminSearch}
                      onChange={(event) => setAdminSearch(event.target.value)}
                      placeholder="Search admin by name or email..."
                    />
                    <SearchIcon />
                  </div>
                  <div className="settingsAdminTotal">Total Admins: {admins.length}</div>
                </div>

                {adminsLoading ? (
                  <PageLoader label="Loading admins..." />
                ) : (
                  <div className="settingsAdminTableWrap">
                    <table className="settingsAdminTable">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Contact Number</th>
                          <th>WhatsApp Number</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAdmins.length ? filteredAdmins.map((admin) => (
                          <tr key={admin.uid}>
                            <td>
                              <span className="settingsAdminNameCell">
                                <span className="settingsAdminAvatar">{getInitials(admin.name)}</span>
                                {admin.name || "-"}
                              </span>
                            </td>
                            <td>{admin.email || "-"}</td>
                            <td>{admin.contactNumber || "-"}</td>
                            <td>{admin.whatsappNumber || admin.contactNumber || "-"}</td>
                            <td>
                              <button
                                type="button"
                                className="settingsAdminDeleteBtn"
                                aria-label={`Remove ${admin.name || "admin"}`}
                                onClick={() => setAdminToRemove(admin)}
                              >
                                <TrashIcon />
                              </button>
                            </td>
                          </tr>
                        )) : (
                          <tr>
                            <td colSpan={5} className="settingsAdminEmpty">No admins found.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {error ? <div className="settingsError">{error}</div> : null}
                <p className="settingsAdminNote">Note: Only Super User can add or remove admins.</p>
              </div>
            )}
          </section>
        </div>
      </div>

      {showAddAdminModal ? (
        <div className="settingsModalBackdrop">
          <div className="settingsModal settingsAddAdminModal">
            <div className="settingsModalHeader">
              <h3>Add New Admin</h3>
              <button type="button" className="settingsModalCloseBtn" onClick={() => { setShowAddAdminModal(false); resetAdminForm(); }}>
                <ModalCloseIcon />
              </button>
            </div>

            <div className="settingsModalField">
              <label>Name <span>*</span></label>
              <input value={adminForm.name} onChange={(event) => setAdminForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Enter full name" />
              {adminFormErrors.name ? <div className="settingsInlineError">{adminFormErrors.name}</div> : null}
            </div>
            <div className="settingsModalField">
              <label>Email <span>*</span></label>
              <input type="email" value={adminForm.email} onChange={(event) => setAdminForm((prev) => ({ ...prev, email: event.target.value }))} placeholder="Enter email address" />
              {adminFormErrors.email ? <div className="settingsInlineError">{adminFormErrors.email}</div> : null}
            </div>
            <div className="settingsModalField">
              <label>Contact Number <span>*</span></label>
              <input value={adminForm.contactNumber} onChange={(event) => setAdminForm((prev) => ({ ...prev, contactNumber: event.target.value }))} placeholder="Enter contact number" />
              {adminFormErrors.contactNumber ? <div className="settingsInlineError">{adminFormErrors.contactNumber}</div> : null}
            </div>
            <div className="settingsModalField">
              <label>WhatsApp Number</label>
              <input value={adminForm.whatsappNumber} onChange={(event) => setAdminForm((prev) => ({ ...prev, whatsappNumber: event.target.value }))} placeholder="Enter whatsapp number (optional)" />
              <div className="settingsModalHelp">If left empty, contact number will be used.</div>
            </div>
            {adminFormErrors.form ? <div className="settingsError">{adminFormErrors.form}</div> : null}

            <div className="settingsModalActions">
              <button type="button" className="settingsMutedBtn" onClick={() => { setShowAddAdminModal(false); resetAdminForm(); }} disabled={adminSaving}>Cancel</button>
              <button type="button" className="settingsPrimaryBtn" onClick={handleAddAdmin} disabled={adminSaving}>{adminSaving ? "Adding..." : "Add Admin"}</button>
            </div>
          </div>
        </div>
      ) : null}

      {adminToRemove ? (
        <div className="settingsModalBackdrop">
          <div className="settingsModal settingsConfirmModal">
            <button type="button" className="settingsModalCloseBtn settingsModalFloatingClose" onClick={() => setAdminToRemove(null)} disabled={removingAdmin}>
              <ModalCloseIcon />
            </button>
            <div className="settingsWarningIcon">!</div>
            <h3>Remove Admin</h3>
            <p>Are you sure you want to remove <strong>{adminToRemove.name}</strong>?</p>
            <p className="settingsModalHelp">This action cannot be undone.</p>
            <div className="settingsModalActions settingsModalActionsCenter">
              <button type="button" className="settingsMutedBtn" onClick={() => setAdminToRemove(null)} disabled={removingAdmin}>Cancel</button>
              <button type="button" className="settingsDangerBtn" onClick={handleRemoveAdmin} disabled={removingAdmin}>{removingAdmin ? "Removing..." : "Remove Admin"}</button>
            </div>
          </div>
        </div>
      ) : null}

      {successModal ? (
        <div className="settingsModalBackdrop">
          <div className="settingsModal settingsSuccessModal">
            <button type="button" className="settingsModalCloseBtn settingsModalFloatingClose" onClick={() => setSuccessModal(null)}>
              <ModalCloseIcon />
            </button>
            <div className="settingsSuccessIcon"><CheckIcon /></div>
            <h3>{successModal.title}</h3>
            <p>{successModal.message}</p>
            <button type="button" className="settingsPrimaryBtn" onClick={() => setSuccessModal(null)}>Close</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default Settings;
