import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import DashboardTopbar from "../components/common/DashboardTopbar";
import PageLoader from "../components/common/PageLoader";
import { getStoredUser } from "../utils/auth";
import "../styles/settings.css";
import "../styles/applicantsDashboard.css";

function BrandMark() {
  return (
    <svg className="settingsBrandIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3 20 7.2V10c0 5.4-3.6 9.8-8 11-4.4-1.2-8-5.6-8-11V7.2L12 3Z" fill="currentColor" />
      <path d="M12 3v18" stroke="#ffffff" strokeWidth="2" opacity="0.65" />
      <path d="M6 9h12" stroke="#ffffff" strokeWidth="2" opacity="0.65" />
    </svg>
  );
}

function getInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) return "U";
  return parts.map((part) => part[0]).join("").toUpperCase();
}

function Settings() {
  const navigate = useNavigate();
  const storedUser = getStoredUser();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    contactNumber: "",
    passwordMasked: "********"
  });

  useEffect(() => {
    let active = true;

    async function loadSettings() {
      try {
        const response = await API.get("/auth/settings");
        if (!active) return;
        const userData = response.data || {};
        setForm({
          name: userData?.name || "",
          email: userData?.email || "",
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
  }, []);

  const initials = useMemo(() => getInitials(form.name || storedUser?.name), [form.name, storedUser?.name]);

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
      setSuccessMessage("Settings updated successfully.");
    } catch (saveError) {
      setError(saveError?.response?.data?.message || "Unable to update settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settingsPage">
      <DashboardTopbar user={{ name: form.name || storedUser?.name || "User" }} />

      <div className="settingsShell">
        <div className="settingsShellHeader">
          <h1 className="settingsShellTitle">Your profile settings</h1>
        </div>

        <div className="settingsShellBody">
          <aside className="settingsSidebar">
            <button type="button" className="settingsNavItem settingsNavItemActive">
              <span className="settingsNavIcon" />
              <span>General</span>
            </button>
            <button type="button" className="settingsNavItem" disabled>
              <span className="settingsNavIcon" />
              <span>Notifications</span>
            </button>
            <button type="button" className="settingsNavItem" disabled>
              <span className="settingsNavIcon" />
              <span>Account</span>
            </button>
          </aside>

          <section className="settingsContent">
            {loading ? (
              <PageLoader label="Loading settings..." />
            ) : (
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
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default Settings;
