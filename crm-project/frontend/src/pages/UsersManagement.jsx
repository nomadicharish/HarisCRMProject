import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import PhoneInput from "react-phone-input-2";
import Select from "react-select";
import "react-phone-input-2/lib/style.css";
import API from "../services/api";
import DashboardTopbar from "../components/common/DashboardTopbar";
import PageLoader from "../components/common/PageLoader";
import ConfirmActionModal from "../components/common/ConfirmActionModal";
import SecureImage from "../components/common/SecureImage";
import { getStoredUser, isSuperUserLikeRole } from "../utils/auth";
import { hasRight } from "../utils/rights";
import { getCached } from "../services/cachedApi";
import { DEFAULT_RIGHTS, roleLabel, USER_RIGHTS, USER_ROLES } from "../config/userRights";
import "../styles/usersManagement.css";

const EMPTY_FORM = { name: "", email: "", contactNumber: "", role: "", countryId: "", countryIds: [], companyId: "", companyIds: [], rights: [] };

const multiSelectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 44,
    borderRadius: 8,
    borderColor: state.isFocused ? "#2563eb" : "#d0d5dd",
    boxShadow: state.isFocused ? "0 0 0 3px rgba(37,99,235,.12)" : "none",
    "&:hover": { borderColor: state.isFocused ? "#2563eb" : "#b8c4d6" }
  }),
  menu: (base) => ({ ...base, zIndex: 1600 }),
  multiValue: (base) => ({ ...base, borderRadius: 6, background: "#eef4ff" }),
  multiValueLabel: (base) => ({ ...base, color: "#0052cc", fontWeight: 600 })
};

function EditIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.2-1 10.6-10.6a2 2 0 0 0-2.8-2.8L5.4 16.2 4 20Z" /><path d="m14.5 7.1 2.8 2.8" /></svg>;
}

function DeleteIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" /></svg>;
}

function UploadIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0-4 4m4-4 4 4M5 14v5h14v-5" /></svg>;
}

function userInitials(name) {
  return String(name || "User").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U";
}

function UsersManagement() {
  const navigate = useNavigate();
  const storedUser = getStoredUser();
  const canAddUsers = hasRight(storedUser, "ADD_USERS");
  const canViewUsers = hasRight(storedUser, "VIEW_USERS");
  const canDeleteUsers = hasRight(storedUser, "DELETE_USERS");
  const isSuperUser = isSuperUserLikeRole(storedUser?.role);
  const [users, setUsers] = useState([]);
  const [countries, setCountries] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [userToDelete, setUserToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [userToReset, setUserToReset] = useState(null);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [profilePhotoFile, setProfilePhotoFile] = useState(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState("");
  const photoInputRef = useRef(null);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await API.get("/users");
      setUsers(response.data?.items || []);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Unable to load users");
    } finally { setLoading(false); }
  };

  useEffect(() => { if (canViewUsers) loadUsers(); else setLoading(false); }, [canViewUsers]);
  useEffect(() => {
    Promise.all([
      getCached("/countries", { ttlMs: 120000 }),
      getCached("/companies", { params: { paginated: "false" }, ttlMs: 120000 })
    ]).then(([countryData, companyData]) => {
      setCountries(Array.isArray(countryData) ? countryData : countryData?.items || []);
      setCompanies(Array.isArray(companyData) ? companyData : companyData?.items || []);
    }).catch(() => setError("Unable to load countries and companies"));
  }, []);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const nonSuperUsers = users.filter((user) => user.role !== "SUPER_USER");
    return query ? nonSuperUsers.filter((user) => user.name.toLowerCase().includes(query)) : nonSuperUsers;
  }, [search, users]);
  const countryOptions = useMemo(
    () => countries.map((country) => ({ value: country.id, label: country.name })),
    [countries]
  );
  const companyOptions = useMemo(
    () => companies
      .filter((company) => !form.countryIds.length || form.countryIds.includes(company.countryId))
      .map((company) => ({ value: company.id, label: company.name })),
    [companies, form.countryIds]
  );

  const resetPhoto = () => {
    if (profilePhotoPreview.startsWith("blob:")) URL.revokeObjectURL(profilePhotoPreview);
    setProfilePhotoFile(null);
    setProfilePhotoPreview("");
  };
  const openAdd = () => { setError(""); setEditing(null); setForm(EMPTY_FORM); resetPhoto(); setFormOpen(false); };
  const openNew = () => { setError(""); setEditing(null); setForm(EMPTY_FORM); resetPhoto(); setFormOpen(true); };
  const openEdit = (user) => {
    setError("");
    setEditing(user);
    setForm({
      ...EMPTY_FORM,
      ...user,
      countryIds: Array.isArray(user.countryIds) && user.countryIds.length ? user.countryIds : user.countryId ? [user.countryId] : [],
      companyIds: Array.isArray(user.companyIds) && user.companyIds.length ? user.companyIds : user.companyId ? [user.companyId] : [],
      rights: user.rights || DEFAULT_RIGHTS[user.role] || []
    });
    resetPhoto();
    setFormOpen(true);
  };
  const updateRole = (nextRole) => setForm((current) => ({ ...current, role: nextRole, rights: [...(DEFAULT_RIGHTS[nextRole] || [])] }));
  const toggleRight = (right) => setForm((current) => ({ ...current, rights: current.rights.includes(right) ? current.rights.filter((item) => item !== right) : [...current.rights, right] }));

  const selectProfilePhoto = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) { setError("Please select a JPG, JPEG or PNG image."); return; }
    if (file.size > 5 * 1024 * 1024) { setError("Profile photo must be 5 MB or smaller."); return; }
    if (profilePhotoPreview.startsWith("blob:")) URL.revokeObjectURL(profilePhotoPreview);
    setError("");
    setProfilePhotoFile(file);
    setProfilePhotoPreview(URL.createObjectURL(file));
  };

  const saveUser = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.contactNumber.trim() || !form.role) {
      setError("Complete all required basic details."); return;
    }
    try {
      setSaving(true); setError("");
      const response = editing ? await API.patch(`/users/${editing.uid}`, form) : await API.post("/users", form);
      const uid = editing?.uid || response.data?.uid;
      if (profilePhotoFile && uid) {
        const photoData = new FormData();
        photoData.append("file", profilePhotoFile);
        await API.post(`/users/${uid}/profile-photo`, photoData);
      }
      setEditing(null); setForm(EMPTY_FORM); setFormOpen(false); await loadUsers();
    } catch (requestError) { setError(requestError?.response?.data?.message || "Unable to save user"); }
    finally { setSaving(false); }
  };

  const deleteUser = async () => {
    if (!userToDelete) return;
    try {
      setDeleting(true);
      await API.delete(`/users/${userToDelete.uid}`);
      setUserToDelete(null);
      await loadUsers();
    } catch (requestError) { setError(requestError?.response?.data?.message || "Unable to delete user"); }
    finally { setDeleting(false); }
  };

  const resetUserPassword = async () => {
    if (!userToReset) return;
    try {
      setResettingPassword(true);
      setError("");
      await API.post(`/users/${userToReset.uid}/reset-password`);
      setUserToReset(null);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Unable to reset user password");
    } finally {
      setResettingPassword(false);
    }
  };

  const isFormOpen = formOpen;
  return (
    <div className="settingsPage usersPage">
      <DashboardTopbar user={storedUser} showTabs tabs={[{ key: "home", label: "Home" }, { key: "applicants", label: "Applicants" }, { key: "companies", label: "Companies" }]} activeTab="settings" onTabChange={(key) => navigate(key === "home" ? "/dashboard" : `/dashboard?tab=${key}`)} />
      <div className="settingsShell">
        <div className="settingsShellHeader"><h1 className="settingsShellTitle">Settings</h1></div>
        <div className="settingsShellBody">
        <aside className="settingsSidebar">
          <button type="button" className="settingsNavItem" onClick={() => navigate("/settings")}>General</button><button type="button" className="settingsNavItem" onClick={() => navigate("/settings?section=bank-details")}>Bank Details</button><button type="button" className="settingsNavItem" onClick={() => navigate("/settings?section=countries")}>Countries</button><button type="button" className="settingsNavItem settingsNavItemActive">Users</button>{isSuperUser ? <button type="button" className="settingsNavItem" onClick={() => navigate("/settings?section=common-documents")}>Common Documents</button> : null}
        </aside>
        <main className="settingsContent usersContent">
          {isFormOpen ? <form onSubmit={saveUser} className="userFormPage">
            <button type="button" className="usersBack" onClick={openAdd} aria-label="Back to users">←</button><h1>{editing ? "Edit User" : "Add New User"}</h1><p>Create a user and customize their role and access rights.</p>
            <section><h2>1. Basic Details</h2><div className="userBasicGrid">
              <div className="userPhotoField"><span>Profile Picture</span><div className="userPhotoUpload">
                {profilePhotoPreview ? <img src={profilePhotoPreview} alt="Selected profile" /> : editing?.profilePhotoUrl ? <SecureImage src={editing.profilePhotoUrl} alt={`${editing.name}'s profile`} fallback={<span className="userPhotoFallback">{userInitials(editing.name)}</span>} /> : <span className="userPhotoFallback">{userInitials(form.name)}</span>}
                <button type="button" className="userPhotoButton" onClick={() => photoInputRef.current?.click()}><UploadIcon />{profilePhotoPreview || editing?.profilePhotoUrl ? "Update Photo" : "Upload Photo"}</button>
                <input ref={photoInputRef} type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" onChange={selectProfilePhoto} />
              </div><small>JPG, PNG or JPEG (Max 5MB)</small></div>
              <label>Full Name *<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Enter full name" /></label>
              <label>Email Address *<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Enter email address" /></label>
              <label>Contact Number *<PhoneInput country="in" value={String(form.contactNumber || "").replace(/^\+/, "")} onChange={(value) => setForm({ ...form, contactNumber: value ? `+${value}` : "" })} enableSearch inputProps={{ name: "userContactNumber" }} /></label>
              <label>User Role *<select value={form.role} onChange={(e) => updateRole(e.target.value)}><option value="">Select user role</option>{USER_ROLES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <label>Country<Select isMulti options={countryOptions} value={countryOptions.filter((option) => form.countryIds.includes(option.value))} onChange={(selected) => {
                const countryIds = (selected || []).map((option) => option.value);
                setForm((current) => ({
                  ...current,
                  countryIds,
                  countryId: countryIds[0] || "",
                  companyIds: current.companyIds.filter((companyId) => {
                    const company = companies.find((item) => item.id === companyId);
                    return company && countryIds.includes(company.countryId);
                  }),
                  companyId: current.companyIds.find((companyId) => {
                    const company = companies.find((item) => item.id === companyId);
                    return company && countryIds.includes(company.countryId);
                  }) || ""
                }));
              }} placeholder="Select countries" styles={multiSelectStyles} /></label>
              <label>Company<Select isMulti options={companyOptions} value={companyOptions.filter((option) => form.companyIds.includes(option.value))} onChange={(selected) => {
                const companyIds = (selected || []).map((option) => option.value);
                setForm((current) => ({ ...current, companyIds, companyId: companyIds[0] || "" }));
              }} isDisabled={!form.countryIds.length} placeholder={form.countryIds.length ? "Select companies" : "Select countries first"} styles={multiSelectStyles} /></label>
            </div></section>
            <section><h2>2. Assign Rights</h2><p>Select the rights you want to grant to this user.</p><div className="rightsGrid">{USER_RIGHTS.map(([key, label], index) => <label key={key} className="rightToggle"><span>{index + 1}. {label}</span><input type="checkbox" checked={form.rights.includes(key)} onChange={() => toggleRight(key)} /><i /></label>)}</div></section>
            {error ? <div className="usersError">{error}</div> : null}<div className="usersActions"><button type="button" onClick={openAdd}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving..." : editing ? "Save Changes" : "Create User"}</button></div>
          </form> : <>
            <header className="usersHeader"><div><h1>Users</h1><p>{canViewUsers ? "View and manage all users in the system." : "Create a new user and assign access rights."}</p></div>{canAddUsers ? <button className="primary" onClick={openNew}>+ Add User</button> : null}</header>
            {canViewUsers ? <><div className="usersToolbar"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name" /><span>Showing {filteredUsers.length} users</span></div>{error ? <div className="usersError">{error}</div> : null}{loading ? <PageLoader label="Loading users..." /> : <div className="usersTableWrap"><table><thead><tr><th>Name</th><th>Contact Number</th><th>Email Address</th><th>User Role</th>{canAddUsers || canDeleteUsers ? <th>Actions</th> : null}</tr></thead><tbody>{filteredUsers.map((user) => <tr key={user.uid}><td><div className="usersNameCell">{user.profilePhotoUrl ? <SecureImage className="usersAvatar" src={user.profilePhotoUrl} alt="" fallback={<span className="usersAvatar usersAvatarFallback">{userInitials(user.name)}</span>} /> : <span className="usersAvatar usersAvatarFallback">{userInitials(user.name)}</span>}<span>{user.name}</span></div></td><td>{user.contactNumber || "-"}</td><td>{user.email}</td><td>{roleLabel(user.role)}</td>{canAddUsers || canDeleteUsers ? <td>{canAddUsers ? <button className="usersIconButton" type="button" onClick={() => openEdit(user)} aria-label={`Edit ${user.name}`} title="Edit user"><EditIcon /></button> : null}{isSuperUser ? <button className="usersResetButton" type="button" onClick={() => setUserToReset(user)}>Reset Password</button> : null}{canDeleteUsers ? <button className="usersIconButton danger" type="button" onClick={() => setUserToDelete(user)} aria-label={`Delete ${user.name}`} title="Delete user"><DeleteIcon /></button> : null}</td> : null}</tr>)}{!filteredUsers.length ? <tr><td colSpan={canAddUsers || canDeleteUsers ? "5" : "4"}>No users found.</td></tr> : null}</tbody></table></div>}</> : <div className="usersError">You do not have permission to view the user list.</div>}
          </>}
        </main>
        </div></div>
      {userToDelete ? <ConfirmActionModal title="Delete User" message={`Are you sure you want to delete ${userToDelete.name}? Their account will be disabled.`} confirmLabel="Delete User" isBusy={deleting} onConfirm={deleteUser} onClose={() => !deleting && setUserToDelete(null)} /> : null}
      {userToReset ? <ConfirmActionModal title="Reset Password" message={`Reset ${userToReset.name}'s password and email a new one-time password?`} confirmLabel="Reset Password" busyLabel="Sending email..." confirmClassName="btn btnPrimary" isBusy={resettingPassword} onConfirm={resetUserPassword} onClose={() => !resettingPassword && setUserToReset(null)} /> : null}
    </div>
  );
}

export default UsersManagement;
