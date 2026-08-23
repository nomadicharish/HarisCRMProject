import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/style.css";
import API from "../services/api";
import DashboardTopbar from "../components/common/DashboardTopbar";
import PageLoader from "../components/common/PageLoader";
import ConfirmActionModal from "../components/common/ConfirmActionModal";
import { getStoredUser, isSuperUserLikeRole } from "../utils/auth";
import { hasRight } from "../utils/rights";
import { getCached } from "../services/cachedApi";
import { DEFAULT_RIGHTS, roleLabel, USER_RIGHTS, USER_ROLES } from "../config/userRights";
import "../styles/usersManagement.css";

const EMPTY_FORM = { name: "", email: "", contactNumber: "", role: "", countryId: "", companyId: "", rights: [] };

function EditIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.2-1 10.6-10.6a2 2 0 0 0-2.8-2.8L5.4 16.2 4 20Z" /><path d="m14.5 7.1 2.8 2.8" /></svg>;
}

function DeleteIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" /></svg>;
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

  const openAdd = () => { setError(""); setEditing(null); setForm(EMPTY_FORM); setFormOpen(false); };
  const openNew = () => { setError(""); setEditing(null); setForm(EMPTY_FORM); setFormOpen(true); };
  const openEdit = (user) => { setError(""); setEditing(user); setForm({ ...EMPTY_FORM, ...user, rights: user.rights || DEFAULT_RIGHTS[user.role] || [] }); setFormOpen(true); };
  const updateRole = (nextRole) => setForm((current) => ({ ...current, role: nextRole, rights: [...(DEFAULT_RIGHTS[nextRole] || [])] }));
  const toggleRight = (right) => setForm((current) => ({ ...current, rights: current.rights.includes(right) ? current.rights.filter((item) => item !== right) : [...current.rights, right] }));

  const saveUser = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.contactNumber.trim() || !form.role) {
      setError("Complete all required basic details."); return;
    }
    try {
      setSaving(true); setError("");
      if (editing) await API.patch(`/users/${editing.uid}`, form);
      else await API.post("/users", form);
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
              <label>Full Name *<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Enter full name" /></label>
              <label>Email Address *<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Enter email address" /></label>
              <label>Contact Number *<PhoneInput country="in" value={String(form.contactNumber || "").replace(/^\+/, "")} onChange={(value) => setForm({ ...form, contactNumber: value ? `+${value}` : "" })} enableSearch inputProps={{ name: "userContactNumber" }} /></label>
              <label>User Role *<select value={form.role} onChange={(e) => updateRole(e.target.value)}><option value="">Select user role</option>{USER_ROLES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <label>Country<select value={form.countryId} onChange={(e) => setForm({ ...form, countryId: e.target.value })}><option value="">Select country (optional)</option>{countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select></label>
              <label>Company<select value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })}><option value="">Select company (optional)</option>{companies.filter((company) => !form.countryId || company.countryId === form.countryId).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
            </div></section>
            <section><h2>2. Assign Rights</h2><p>Select the rights you want to grant to this user.</p><div className="rightsGrid">{USER_RIGHTS.map(([key, label], index) => <label key={key} className="rightToggle"><span>{index + 1}. {label}</span><input type="checkbox" checked={form.rights.includes(key)} onChange={() => toggleRight(key)} /><i /></label>)}</div></section>
            {error ? <div className="usersError">{error}</div> : null}<div className="usersActions"><button type="button" onClick={openAdd}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving..." : editing ? "Save Changes" : "Create User"}</button></div>
          </form> : <>
            <header className="usersHeader"><div><h1>Users</h1><p>{canViewUsers ? "View and manage all users in the system." : "Create a new user and assign access rights."}</p></div>{canAddUsers ? <button className="primary" onClick={openNew}>+ Add User</button> : null}</header>
            {canViewUsers ? <><div className="usersToolbar"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name" /><span>Showing {filteredUsers.length} users</span></div>{error ? <div className="usersError">{error}</div> : null}{loading ? <PageLoader label="Loading users..." /> : <div className="usersTableWrap"><table><thead><tr><th>Name</th><th>Contact Number</th><th>Email Address</th><th>User Role</th>{canAddUsers || canDeleteUsers ? <th>Actions</th> : null}</tr></thead><tbody>{filteredUsers.map((user) => <tr key={user.uid}><td>{user.name}</td><td>{user.contactNumber || "-"}</td><td>{user.email}</td><td>{roleLabel(user.role)}</td>{canAddUsers || canDeleteUsers ? <td>{canAddUsers ? <button className="usersIconButton" type="button" onClick={() => openEdit(user)} aria-label={`Edit ${user.name}`} title="Edit user"><EditIcon /></button> : null}{isSuperUser ? <button className="usersResetButton" type="button" onClick={() => setUserToReset(user)}>Reset Password</button> : null}{canDeleteUsers ? <button className="usersIconButton danger" type="button" onClick={() => setUserToDelete(user)} aria-label={`Delete ${user.name}`} title="Delete user"><DeleteIcon /></button> : null}</td> : null}</tr>)}{!filteredUsers.length ? <tr><td colSpan={canAddUsers || canDeleteUsers ? "5" : "4"}>No users found.</td></tr> : null}</tbody></table></div>}</> : <div className="usersError">You do not have permission to view the user list.</div>}
          </>}
        </main>
        </div></div>
      {userToDelete ? <ConfirmActionModal title="Delete User" message={`Are you sure you want to delete ${userToDelete.name}? Their account will be disabled.`} confirmLabel="Delete User" isBusy={deleting} onConfirm={deleteUser} onClose={() => !deleting && setUserToDelete(null)} /> : null}
      {userToReset ? <ConfirmActionModal title="Reset Password" message={`Reset ${userToReset.name}'s password and email a new one-time password?`} confirmLabel="Reset Password" busyLabel="Sending email..." confirmClassName="btn btnPrimary" isBusy={resettingPassword} onConfirm={resetUserPassword} onClose={() => !resettingPassword && setUserToReset(null)} /> : null}
    </div>
  );
}

export default UsersManagement;
