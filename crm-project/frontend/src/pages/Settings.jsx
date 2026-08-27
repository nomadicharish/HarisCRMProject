import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import API from "../services/api";
import PhoneInput from "react-phone-input-2";
import Select from "react-select";
import "react-phone-input-2/lib/style.css";
import DashboardTopbar from "../components/common/DashboardTopbar";
import PageLoader from "../components/common/PageLoader";
import SecureImage from "../components/common/SecureImage";
import CountryManagerModal from "../components/dashboard/CountryManagerModal";
import EntityFormModal from "../components/dashboard/EntityFormModal";
import EmployersTable from "../components/dashboard/EmployersTable";
import AgenciesTable from "../components/dashboard/AgenciesTable";
import { getCached, invalidateCache, readCached, writeCached } from "../services/cachedApi";
import { getStoredUser, isSuperUserLikeRole, updateStoredUser } from "../utils/auth";
import { hasAnyRight, hasRight } from "../utils/rights";
import { toast } from "../utils/toast";
import "../styles/settings.css";
import "../styles/applicantsDashboard.css";
import "../styles/applicantDocuments.css";

const SETTINGS_MODULE_VERSION = "2026-08-24.1";

function getInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.length ? parts.map((part) => part[0]).join("").toUpperCase() : "U";
}

function normalizeListResponse(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.items)) return response.items;
  return [];
}

function getEmployerCompanyIds(employer = {}) {
  if (Array.isArray(employer.companyIds) && employer.companyIds.length) return employer.companyIds;
  return employer.companyId ? [employer.companyId] : [];
}

function getEmployerCountryIds(employer = {}, companyMap = {}) {
  if (Array.isArray(employer.countryIds) && employer.countryIds.length) return employer.countryIds;
  const companyCountryIds = getEmployerCompanyIds(employer)
    .map((companyId) => companyMap[companyId]?.countryId)
    .filter(Boolean);
  return companyCountryIds.length ? Array.from(new Set(companyCountryIds)) : employer.countryId ? [employer.countryId] : [];
}

function TrashIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m4 20 4.2-1 10.6-10.6a2 2 0 0 0-2.8-2.8L5.4 16.2 4 20Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UploadFileIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 16V4m0 0-4 4m4-4 4 4M5 14v5h14v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function formatReferenceUploadDate(value) {
  const timestampSeconds = value?.seconds ?? value?._seconds;
  const date = typeof value?.toDate === "function"
    ? value.toDate()
    : timestampSeconds != null
      ? new Date(Number(timestampSeconds) * 1000)
      : value
        ? new Date(value)
        : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })
    : "-";
}

const referenceCountrySelectStyles = {
  control: (base, state) => ({ ...base, minHeight: 44, borderRadius: 8, borderColor: state.isFocused ? "#2563eb" : "#d0d5dd", boxShadow: state.isFocused ? "0 0 0 3px rgba(37,99,235,.12)" : "none", "&:hover": { borderColor: state.isFocused ? "#2563eb" : "#b8c4d6" } }),
  menu: (base) => ({ ...base, zIndex: 1600 }),
  multiValue: (base) => ({ ...base, borderRadius: 6, background: "#eef4ff" }),
  multiValueLabel: (base) => ({ ...base, color: "#0052cc", fontWeight: 600 })
};

function Settings() {
  const navigate = useNavigate();
  const location = useLocation();
  const storedUser = getStoredUser();
  const cachedSettings = readCached("/auth/settings");
  const currentUser = cachedSettings || storedUser;
  const canViewBankDetails = hasRight(currentUser, "VIEW_BANK_DETAILS");
  const canAddBankDetails = hasRight(currentUser, "CREATE_BANK_DETAILS");
  const canManageBankDetails = canViewBankDetails || canAddBankDetails;
  const canManageUsers = hasAnyRight(currentUser, ["ADD_USERS", "VIEW_USERS"]);
  const isSuperUser = isSuperUserLikeRole(currentUser?.role);
  const activeSection = new URLSearchParams(location.search).get("section") || "general";
  const [loading, setLoading] = useState(!cachedSettings);
  const [saving, setSaving] = useState(false);
  const [profilePhotoUploading, setProfilePhotoUploading] = useState(false);
  const [commonDocumentsLoading, setCommonDocumentsLoading] = useState(false);
  const [standardReferences, setStandardReferences] = useState([]);
  const [referenceForm, setReferenceForm] = useState(null);
  // Kept for backwards-compatible rendering of the legacy block while the
  // country-mapped manager is used above it.
  const [standardReference, setStandardReference] = useState({ standardReferenceFileName: "", standardReferenceUrl: "" });
  const [standardReferenceFile, setStandardReferenceFile] = useState(null);
  const profilePhotoInputRef = useRef(null);
  const referenceFileInputRef = useRef(null);
  const [bankAccountsLoading, setBankAccountsLoading] = useState(false);
  const [accountantsLoading, setAccountantsLoading] = useState(false);
  const [bankSaving, setBankSaving] = useState(false);
  const [removingBankAccount, setRemovingBankAccount] = useState(false);
  const [accountantSaving, setAccountantSaving] = useState(false);
  const [removingAccountant, setRemovingAccountant] = useState(false);
  const [resettingAccountantUid, setResettingAccountantUid] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [bankAccounts, setBankAccounts] = useState([]);
  const [accountants, setAccountants] = useState([]);
  const [countries, setCountries] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [employers, setEmployers] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [organizationLoading, setOrganizationLoading] = useState(false);
  const [organizationSearch, setOrganizationSearch] = useState("");
  const [organizationCountryId, setOrganizationCountryId] = useState("");
  const [organizationCompanyId, setOrganizationCompanyId] = useState("");
  const [entityModalType, setEntityModalType] = useState("");
  const [entityEditData, setEntityEditData] = useState(null);
  const [showCountryManager, setShowCountryManager] = useState(false);
  const [showAddBankModal, setShowAddBankModal] = useState(false);
  const [bankAccountToRemove, setBankAccountToRemove] = useState(null);
  const [editingBankAccount, setEditingBankAccount] = useState(null);
  const [showAddAccountantModal, setShowAddAccountantModal] = useState(false);
  const [accountantToRemove, setAccountantToRemove] = useState(null);
  const [editingAccountant, setEditingAccountant] = useState(null);
  const [bankForm, setBankForm] = useState({ beneficiaryName: "", accountNumber: "", bankNameBranch: "" });
  const [bankFormErrors, setBankFormErrors] = useState({});
  const [accountantForm, setAccountantForm] = useState({
    name: "",
    contactNumber: "",
    email: "",
    accountantType: "JUNIOR_ACCOUNTANT"
  });
  const [accountantFormErrors, setAccountantFormErrors] = useState({});
  const [form, setForm] = useState({
    name: cachedSettings?.name || "",
    email: cachedSettings?.email || "",
    role: cachedSettings?.role || storedUser?.role || "",
    contactNumber: cachedSettings?.contactNumber || "",
    passwordMasked: cachedSettings?.passwordMasked || "********"
    ,profilePhotoUrl: cachedSettings?.profilePhotoUrl || ""
  });

  const dashboardTabs = useMemo(() => {
    const role = form.role || cachedSettings?.role || storedUser?.role;
    if (role === "JUNIOR_ACCOUNTANT") return ["home", "applicants"];
    return ["home", "applicants", "companies"];
  }, [cachedSettings?.role, form.role, storedUser?.role]);

  const handleDashboardTabChange = (tabKey) => {
    navigate(tabKey === "home" ? "/dashboard" : `/dashboard?tab=${tabKey}`);
  };

  useEffect(() => {
    let active = true;
    getCached("/auth/settings", { ttlMs: 120000 })
      .then((userData) => {
        if (!active) return;
        setForm({
          name: userData?.name || "",
          email: userData?.email || "",
          role: userData?.role || storedUser?.role || "",
          contactNumber: userData?.contactNumber || "",
          passwordMasked: userData?.passwordMasked || "********"
          ,profilePhotoUrl: userData?.profilePhotoUrl || ""
        });
      })
      .catch((loadError) => active && setError(loadError?.response?.data?.message || "Unable to load settings"))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [storedUser?.role]);

  const loadCommonDocuments = useCallback(async () => {
    if (!isSuperUser) return;
    try {
      setCommonDocumentsLoading(true);
      const [response, countriesData] = await Promise.all([
        API.get("/auth/common-documents"),
        getCached("/countries", { ttlMs: 120000 })
      ]);
      setStandardReferences(Array.isArray(response.data?.items) ? response.data.items : []);
      setCountries(normalizeListResponse(countriesData));
    } catch (loadError) {
      setError(loadError?.response?.data?.message || "Unable to load common documents");
    } finally {
      setCommonDocumentsLoading(false);
    }
  }, [isSuperUser]);

  useEffect(() => { if (activeSection === "common-documents") loadCommonDocuments(); }, [activeSection, loadCommonDocuments]);

  const loadBankAccounts = useCallback(async () => {
    if (!canManageBankDetails) return;
    try {
      setBankAccountsLoading(true);
      const response = await API.get("/auth/bank-accounts");
      setBankAccounts(Array.isArray(response.data?.items) ? response.data.items : []);
    } catch (loadError) {
      setError(loadError?.response?.data?.message || "Unable to load bank accounts");
    } finally {
      setBankAccountsLoading(false);
    }
  }, [canManageBankDetails]);

  const loadAccountants = useCallback(async () => {
    if (!canManageBankDetails) return;
    try {
      setAccountantsLoading(true);
      const response = await API.get("/auth/accountants");
      setAccountants(Array.isArray(response.data?.items) ? response.data.items : []);
    } catch (loadError) {
      setError(loadError?.response?.data?.message || "Unable to load accountants");
    } finally {
      setAccountantsLoading(false);
    }
  }, [canManageBankDetails]);

  const loadOrganizationData = useCallback(async ({ force = false } = {}) => {
    if (!canManageBankDetails) return;
    try {
      setOrganizationLoading(true);
      setError("");
      const [countriesData, companiesData, employersData, agenciesData] = await Promise.all([
        getCached("/countries", { ttlMs: 120000, force }),
        getCached("/companies", { params: { paginated: "false" }, ttlMs: 600000, force }),
        getCached("/employers", { params: { paginated: "false" }, ttlMs: 600000, force }),
        getCached("/agencies", { params: { paginated: "false" }, ttlMs: 600000, force })
      ]);
      setCountries(normalizeListResponse(countriesData));
      setCompanies(normalizeListResponse(companiesData));
      setEmployers(normalizeListResponse(employersData));
      setAgencies(normalizeListResponse(agenciesData));
    } catch (loadError) {
      setError(loadError?.response?.data?.message || "Unable to load organization settings");
    } finally {
      setOrganizationLoading(false);
    }
  }, [canManageBankDetails]);

  useEffect(() => {
    if (activeSection === "bank-details") loadBankAccounts();
    if (activeSection === "accountants") loadAccountants();
    if (["countries", "employers", "agencies"].includes(activeSection)) loadOrganizationData();
  }, [activeSection, loadAccountants, loadBankAccounts, loadOrganizationData]);

  const initials = useMemo(() => getInitials(form.name || storedUser?.name), [form.name, storedUser?.name]);
  const companyMap = useMemo(
    () => Object.fromEntries(companies.map((company) => [company.id, company])),
    [companies]
  );
  const countryMap = useMemo(
    () => Object.fromEntries(countries.map((country) => [country.id, country.name])),
    [countries]
  );
  const filteredEmployers = useMemo(() => {
    const query = organizationSearch.trim().toLowerCase();
    return employers.filter((employer) => {
      const employerCompanyIds = getEmployerCompanyIds(employer);
      const employerCountryIds = getEmployerCountryIds(employer, companyMap);
      if (organizationCountryId && !employerCountryIds.includes(organizationCountryId)) return false;
      if (organizationCompanyId && !employerCompanyIds.includes(organizationCompanyId)) return false;
      if (!query) return true;
      const companyNames = employerCompanyIds.map((id) => companyMap[id]?.name).filter(Boolean);
      const countryNames = employerCountryIds.map((id) => countryMap[id]).filter(Boolean);
      return [
        employer.name,
        employer.email,
        employer.contactNumber,
        ...companyNames,
        ...countryNames
      ].some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [
    companyMap,
    countryMap,
    employers,
    organizationCompanyId,
    organizationCountryId,
    organizationSearch
  ]);
  const filteredAgencies = useMemo(() => {
    const query = organizationSearch.trim().toLowerCase();
    return agencies.filter((agency) => {
      const assignedCompanyIds = Array.from(new Set([
        ...(Array.isArray(agency.assignedCompanyIds) ? agency.assignedCompanyIds : []),
        ...Object.values(companyMap)
          .filter((company) => Array.isArray(company?.agencyIds) && company.agencyIds.includes(agency.id))
          .map((company) => company.id)
      ]));
      if (organizationCompanyId && !assignedCompanyIds.includes(organizationCompanyId)) return false;
      if (
        organizationCountryId &&
        !assignedCompanyIds.some((id) => companyMap[id]?.countryId === organizationCountryId)
      ) return false;
      if (!query) return true;
      const companyNames = assignedCompanyIds.map((id) => companyMap[id]?.name).filter(Boolean);
      const countryNames = assignedCompanyIds.map((id) => countryMap[companyMap[id]?.countryId]).filter(Boolean);
      return [agency.name, agency.email, agency.contactNumber, ...companyNames, ...countryNames]
        .some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [
    agencies,
    companyMap,
    countryMap,
    organizationCompanyId,
    organizationCountryId,
    organizationSearch
  ]);

  const openEntityModal = (type, editData = null) => {
    setEntityModalType(type);
    setEntityEditData(editData);
  };

  const handleEntitySaved = async (change = {}) => {
    if (change.operation === "delete" && change.type === "employer") {
      setEmployers((current) => current.filter((item) => item.id !== change.id));
    }
    if (change.operation === "delete" && change.type === "agency") {
      setAgencies((current) => current.filter((item) => item.id !== change.id));
    }
    setEntityModalType("");
    setEntityEditData(null);
    invalidateCache("/employers");
    invalidateCache("/agencies");
    invalidateCache("/companies");
    await loadOrganizationData({ force: true });
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError("Name is required");
      toast.warning("Please complete: Name is required");
      return;
    }
    if (!form.contactNumber.trim()) {
      setError("Contact number is required");
      toast.warning("Please complete: Contact number is required");
      return;
    }
    try {
      setSaving(true);
      setError("");
      const name = form.name.trim();
      const contactNumber = form.contactNumber.trim();
      const response = await API.patch("/auth/settings", { name, contactNumber });
      const nextSettings = { ...form, name: response.data?.name || name, contactNumber };
      setForm(nextSettings);
      updateStoredUser({ name: nextSettings.name });
      writeCached("/auth/settings", nextSettings, { ttlMs: 120000 });
      setSuccessMessage("Settings updated successfully.");
    } catch (saveError) {
      setError(saveError?.response?.data?.message || "Unable to update settings");
    } finally {
      setSaving(false);
    }
  };

  const selectSection = (section) => {
    navigate(section === "general" ? "/settings" : `/settings?section=${section}`);
  };

  const handleProfilePhotoUpload = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Please choose a JPEG or PNG image"); return; }
    try {
      setProfilePhotoUploading(true);
      const body = new FormData();
      body.append("file", file);
      const response = await API.post("/auth/settings/profile-photo", body, { headers: { "Content-Type": "multipart/form-data" } });
      const profilePhotoUrl = response.data?.profilePhotoUrl || "";
      setForm((current) => ({ ...current, profilePhotoUrl }));
      updateStoredUser({ profilePhotoUrl });
      toast.success("Profile picture updated successfully");
    } catch (uploadError) { setError(uploadError?.response?.data?.message || "Unable to upload profile picture"); }
    finally { setProfilePhotoUploading(false); }
  };

  const openReferenceForm = (reference = null) => {
    setReferenceForm(reference ? {
      id: reference.id,
      countryIds: Array.isArray(reference.countryIds) ? reference.countryIds : [],
      file: null
    } : { id: "", countryIds: [], file: null });
    if (referenceFileInputRef.current) referenceFileInputRef.current.value = "";
  };

  const handleStandardReferenceSave = async () => {
    if (!referenceForm.countryIds.length) { setError("Select at least one country"); return; }
    if (!referenceForm.file) { setError(referenceForm.id ? "Upload the replacement document" : "Select a document to upload"); return; }
    try {
      setCommonDocumentsLoading(true);
      setError("");
      const body = new FormData();
      body.append("file", referenceForm.file);
      body.append("countryIds", JSON.stringify(referenceForm.countryIds));
      const response = referenceForm.id
        ? await API.patch(`/auth/common-documents/standard-reference/${referenceForm.id}`, body, { headers: { "Content-Type": "multipart/form-data" } })
        : await API.post("/auth/common-documents/standard-reference", body, { headers: { "Content-Type": "multipart/form-data" } });
      const item = response.data?.item;
      if (item) setStandardReferences((items) => referenceForm.id ? items.map((entry) => entry.id === item.id ? item : entry) : [...items, item]);
      setReferenceForm(null);
      toast.success(response.data?.message || "Standard reference document saved successfully");
    } catch (uploadError) { setError(uploadError?.response?.data?.message || "Unable to upload standard reference document"); }
    finally { setCommonDocumentsLoading(false); }
  };

  const handleStandardReferenceUpload = () => {};

  const resetBankForm = () => {
    setBankForm({ beneficiaryName: "", accountNumber: "", bankNameBranch: "" });
    setBankFormErrors({});
  };

  const openBankAccountModal = (account = null) => {
    setEditingBankAccount(account);
    setBankForm(account ? {
      beneficiaryName: account.beneficiaryName || "",
      accountNumber: account.accountNumber || "",
      bankNameBranch: account.bankNameBranch || ""
    } : { beneficiaryName: "", accountNumber: "", bankNameBranch: "" });
    setBankFormErrors({});
    setShowAddBankModal(true);
  };

  const handleAddBankAccount = async () => {
    const nextErrors = {};
    if (!bankForm.beneficiaryName.trim()) nextErrors.beneficiaryName = "Beneficiary name is required";
    if (!bankForm.accountNumber.trim()) nextErrors.accountNumber = "Account number is required";
    if (!bankForm.bankNameBranch.trim()) nextErrors.bankNameBranch = "Bank name and branch are required";
    setBankFormErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      toast.warning(`Please complete: ${Object.values(nextErrors).join(", ")}`);
      return;
    }
    try {
      setBankSaving(true);
      const response = editingBankAccount
        ? await API.patch(`/auth/bank-accounts/${editingBankAccount.id}`, bankForm)
        : await API.post("/auth/bank-accounts", bankForm);
      if (response.data?.bankAccount) {
        setBankAccounts((current) => editingBankAccount
          ? current.map((item) => item.id === editingBankAccount.id ? response.data.bankAccount : item)
          : [response.data.bankAccount, ...current]);
      }
      invalidateCache("/auth/bank-accounts");
      setShowAddBankModal(false);
      setEditingBankAccount(null);
      resetBankForm();
    } catch (saveError) {
      setBankFormErrors((current) => ({ ...current, form: saveError?.response?.data?.message || "Unable to add bank account" }));
    } finally {
      setBankSaving(false);
    }
  };

  const handleRemoveBankAccount = async () => {
    if (!bankAccountToRemove) return;
    try {
      setRemovingBankAccount(true);
      await API.delete(`/auth/bank-accounts/${bankAccountToRemove.id}`);
      invalidateCache("/auth/bank-accounts");
      setBankAccounts((current) => current.filter((item) => item.id !== bankAccountToRemove.id));
      setBankAccountToRemove(null);
    } catch (removeError) {
      setError(removeError?.response?.data?.message || "Unable to remove bank account");
    } finally {
      setRemovingBankAccount(false);
    }
  };

  const resetAccountantForm = () => {
    setAccountantForm({ name: "", contactNumber: "", email: "", accountantType: "JUNIOR_ACCOUNTANT" });
    setAccountantFormErrors({});
  };

  const openAccountantModal = (accountant = null) => {
    setEditingAccountant(accountant);
    setAccountantForm(accountant ? {
      name: accountant.name || "",
      contactNumber: accountant.contactNumber || "",
      email: accountant.email || "",
      accountantType: accountant.role || "JUNIOR_ACCOUNTANT"
    } : { name: "", contactNumber: "", email: "", accountantType: "JUNIOR_ACCOUNTANT" });
    setAccountantFormErrors({});
    setShowAddAccountantModal(true);
  };

  const handleAddAccountant = async () => {
    const nextErrors = {};
    if (!accountantForm.name.trim()) nextErrors.name = "Name is required";
    if (!accountantForm.contactNumber.trim()) nextErrors.contactNumber = "Contact with country code is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountantForm.email.trim())) nextErrors.email = "Valid email is required";
    setAccountantFormErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      toast.warning(`Please complete: ${Object.values(nextErrors).join(", ")}`);
      return;
    }

    try {
      setAccountantSaving(true);
      const payload = {
        ...accountantForm,
        name: accountantForm.name.trim(),
        email: accountantForm.email.trim().toLowerCase()
      };
      const response = editingAccountant
        ? await API.patch(`/auth/accountants/${editingAccountant.uid}`, payload)
        : await API.post("/auth/accountants", payload);
      if (response.data?.accountant) {
        setAccountants((current) => (
          editingAccountant
            ? current.map((item) => item.uid === editingAccountant.uid ? response.data.accountant : item)
            : [...current, response.data.accountant]
        ).sort((a, b) => a.name.localeCompare(b.name)));
      }
      setShowAddAccountantModal(false);
      setEditingAccountant(null);
      resetAccountantForm();
      toast.success(editingAccountant ? "User updated successfully" : "User added successfully");
      if (!editingAccountant && response.data?.welcomeEmail?.sent === false) {
        toast.warning("User was added, but the welcome email was not sent.");
      }
    } catch (saveError) {
      setAccountantFormErrors((current) => ({
        ...current,
        form: saveError?.response?.data?.message || "Unable to add accountant"
      }));
    } finally {
      setAccountantSaving(false);
    }
  };

  const handleRemoveAccountant = async () => {
    if (!accountantToRemove) return;
    try {
      setRemovingAccountant(true);
      await API.delete(`/auth/accountants/${accountantToRemove.uid}`);
      setAccountants((current) => current.filter((item) => item.uid !== accountantToRemove.uid));
      setAccountantToRemove(null);
      invalidateCache("/auth/accountants");
      await loadAccountants();
    } catch (removeError) {
      setError(removeError?.response?.data?.message || "Unable to remove accountant");
    } finally {
      setRemovingAccountant(false);
    }
  };

  const handleResetAccountantPassword = async (accountant) => {
    if (!isSuperUser || !accountant?.uid) return;
    if (!window.confirm(`Reset ${accountant.name || "this accountant"}'s password and email a new one-time password?`)) return;
    try {
      setResettingAccountantUid(accountant.uid);
      await API.post(`/auth/accountants/${accountant.uid}/reset-password`);
      toast.success("A new one-time password was sent to the accountant.");
    } catch (resetError) {
      setError(resetError?.response?.data?.message || "Unable to reset accountant password");
    } finally {
      setResettingAccountantUid("");
    }
  };

  return (
    <div className="settingsPage" data-module-version={SETTINGS_MODULE_VERSION}>
      <DashboardTopbar
        user={{ name: form.name || storedUser?.name || "User", role: form.role || storedUser?.role, profilePhotoUrl: form.profilePhotoUrl || storedUser?.profilePhotoUrl || "" }}
        showTabs
        tabs={dashboardTabs.map((key) => ({ key, label: key === "home" ? "Home" : key === "applicants" ? "Applicants" : "Companies" }))}
        activeTab="settings"
        onTabChange={handleDashboardTabChange}
      />
      <div className="settingsShell">
        <div className="settingsShellHeader"><h1 className="settingsShellTitle">Settings</h1></div>
        <div className="settingsShellBody">
          <aside className="settingsSidebar">
            <button type="button" className={`settingsNavItem ${activeSection === "general" ? "settingsNavItemActive" : ""}`} onClick={() => selectSection("general")}>
              General
            </button>
            {canManageBankDetails ? (
              <button type="button" className={`settingsNavItem ${activeSection === "bank-details" ? "settingsNavItemActive" : ""}`} onClick={() => selectSection("bank-details")}>
                Bank Details
              </button>
            ) : null}
            {canManageBankDetails ? (
              <button type="button" className={`settingsNavItem ${activeSection === "countries" ? "settingsNavItemActive" : ""}`} onClick={() => { selectSection("countries"); setOrganizationSearch(""); setOrganizationCountryId(""); setOrganizationCompanyId(""); }}>
                Countries
              </button>
            ) : null}
            {canManageUsers ? (
              <button type="button" className="settingsNavItem" onClick={() => navigate("/settings/users")}>
                Users
              </button>
            ) : null}
            {isSuperUser ? (
              <button type="button" className={`settingsNavItem ${activeSection === "common-documents" ? "settingsNavItemActive" : ""}`} onClick={() => selectSection("common-documents")}>Common Documents</button>
            ) : null}
          </aside>
          <section className="settingsContent">
            {loading ? <PageLoader label="Loading settings..." /> : activeSection === "general" ? (
              <>
                <div className="settingsProfileHead">
                  <button type="button" className="settingsAvatar settingsAvatarUpload" onClick={() => profilePhotoInputRef.current?.click()} disabled={profilePhotoUploading} title="Change profile picture">
                    {form.profilePhotoUrl ? <SecureImage src={form.profilePhotoUrl} alt="Profile" fallback={initials} /> : initials}
                  </button>
                  <div><div className="settingsProfileName">{form.name || "-"}</div><div className="settingsProfileEmail">{form.email || "-"}</div></div>
                </div>
                <input ref={profilePhotoInputRef} className="settingsVisuallyHidden" type="file" accept="image/jpeg,image/png" disabled={profilePhotoUploading} onChange={(event) => handleProfilePhotoUpload(event.target.files?.[0])} />
                {profilePhotoUploading ? <div className="settingsModalHelp">Uploading picture...</div> : null}
                <div className="settingsBlock">
                  <label className="settingsLabel" htmlFor="settings-name">Name</label>
                  <input id="settings-name" className="settingsInput" value={form.name} maxLength={100} autoComplete="name" onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
                </div>
                <div className="settingsBlock">
                  <label className="settingsLabel" htmlFor="settings-contact">Phone number</label>
                  <input id="settings-contact" className="settingsInput" value={form.contactNumber} onChange={(event) => setForm((prev) => ({ ...prev, contactNumber: event.target.value }))} />
                </div>
                <div className="settingsBlock">
                  <label className="settingsLabel">Password</label>
                  <div className="settingsValue">{form.passwordMasked}</div>
                  <button type="button" className="settingsTextLink" onClick={() => navigate("/settings/change-password")}>Change Password</button>
                </div>
                {error ? <div className="settingsError">{error}</div> : null}
                {successMessage ? <div className="settingsSuccess">{successMessage}</div> : null}
                <div className="settingsInlineActions"><button type="button" className="settingsPrimaryBtn" disabled={saving} onClick={handleSave}>{saving ? "Saving..." : "Save changes"}</button></div>
              </>
            ) : activeSection === "common-documents" ? (
              <div className="settingsAdminPanel">
                {referenceForm ? <div className="settingsReferenceForm">
                  <div className="settingsAdminHeader"><div><button type="button" className="settingsReferenceBack" onClick={() => setReferenceForm(null)} aria-label="Back to common documents">←</button><h2 className="settingsSectionTitle">{referenceForm.id ? "Update" : "Add"} Standard Reference Document</h2><p className="settingsSectionDescription">Map one document to one or more countries. Each country can have only one reference document.</p></div></div>
                  <div className="settingsReferenceFields">
                    <div className="settingsReferenceField"><label className="settingsLabel">{referenceForm.id ? "Replacement Document" : "Upload Document"} <span>*</span></label><label className="docsFileBox docsFileBoxUpload settingsReferenceFilePicker"><input ref={referenceFileInputRef} className="docsFileInput" type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" disabled={commonDocumentsLoading} onChange={(event) => setReferenceForm((form) => ({ ...form, file: event.target.files?.[0] || null }))} /><div className="docsFileBoxLeft"><span className="docsUploadIcon"><UploadFileIcon /></span><div><div className="docsFileName">{referenceForm.file?.name || "Choose file"}</div><div className="docsFileMeta">PDF, DOC, DOCX, JPG or PNG (Max 5MB)</div></div></div></label></div>
                    <div className="settingsReferenceField"><label className="settingsLabel">Select Country <span>*</span></label><Select isMulti options={countries.map((country) => ({ value: country.id, label: country.name }))} value={countries.filter((country) => referenceForm.countryIds.includes(country.id)).map((country) => ({ value: country.id, label: country.name }))} isDisabled={commonDocumentsLoading} placeholder="Select Country" styles={referenceCountrySelectStyles} onChange={(selected) => setReferenceForm((form) => ({ ...form, countryIds: (selected || []).map((option) => option.value) }))} /><p className="settingsModalHelp">Select the countries where this reference document is available.</p></div>
                  </div>
                  <div className="settingsInlineActions"><button type="button" className="settingsMutedBtn" disabled={commonDocumentsLoading} onClick={() => setReferenceForm(null)}>Cancel</button><button type="button" className="settingsPrimaryBtn" disabled={commonDocumentsLoading} onClick={handleStandardReferenceSave}>{commonDocumentsLoading ? "Saving..." : "Save Document"}</button></div>
                </div> : <div className="settingsReferencePanel">
                  <div className="settingsAdminHeader"><div><h2 className="settingsSectionTitle">Standard Reference Document</h2><p className="settingsSectionDescription">Reference documents available to users during applicant document upload.</p></div><button type="button" className="settingsPrimaryBtn settingsAddAdminBtn" onClick={() => openReferenceForm()}>+ Add Document</button></div>
                  {commonDocumentsLoading ? <PageLoader label="Loading standard reference documents..." /> : <div className="settingsAdminTableWrap settingsOrganizationTable"><table className="settingsAdminTable"><thead><tr><th>Document Name</th><th>Countries Mapped</th><th>Uploaded On</th><th>Actions</th></tr></thead><tbody>{standardReferences.length ? standardReferences.map((reference) => <tr key={reference.id}><td><strong>{reference.name || reference.fileName}</strong><div className="settingsModalHelp">{reference.fileName}</div></td><td>{reference.countryIds.map((countryId) => countryMap[countryId] || countryId).join(", ") || "-"}</td><td>{formatReferenceUploadDate(reference.createdAt || reference.updatedAt)}</td><td><button type="button" className="settingsAdminEditBtn" onClick={() => openReferenceForm(reference)} aria-label="Edit standard reference document"><EditIcon /></button></td></tr>) : <tr><td colSpan={4} className="settingsAdminEmpty">No standard reference documents added.</td></tr>}</tbody></table></div>}
                </div>}
                <div style={{ display: "none" }}>
                <h2 className="settingsSectionTitle">Common Documents</h2>
                <p className="settingsSectionDescription">This reference document is available to every applicant during document upload.</p>
                <div className="settingsBlock">
                  <label className="settingsLabel" htmlFor="standard-reference-document">Add Standard Reference Document</label>
                  <div className="docsFileCell settingsCommonDocumentUpload">
                    <label className="docsFileBox docsFileBoxUpload docsFileBoxEmpty">
                      <input className="settingsVisuallyHidden" id="standard-reference-document" type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" disabled={commonDocumentsLoading} onChange={(event) => setStandardReferenceFile(event.target.files?.[0] || null)} />
                      <span className="docsFileBoxLeft"><span className="docsUploadIcon">↑</span><span className="docsFileName">{standardReferenceFile?.name || "Select document"}</span></span>
                    </label>
                    <button type="button" className="settingsPrimaryBtn" disabled={!standardReferenceFile || commonDocumentsLoading} onClick={handleStandardReferenceUpload}>{commonDocumentsLoading ? "Uploading..." : "Upload"}</button>
                  </div>
                  {standardReferenceFile ? <div className="settingsModalHelp">Selected: {standardReferenceFile.name}</div> : null}
                  {standardReference.standardReferenceUrl ? <a className="settingsTextLink" href={standardReference.standardReferenceUrl} target="_blank" rel="noreferrer">View current document: {standardReference.standardReferenceFileName || "Standard Reference"}</a> : null}
                </div>
                </div>
              </div>
            ) : activeSection === "bank-details" ? (
              <div className="settingsAdminPanel">
                <div className="settingsAdminHeader">
                  <h2 className="settingsSectionTitle">Bank Account Details</h2>
                  {canAddBankDetails ? <button type="button" className="settingsPrimaryBtn settingsAddAdminBtn" onClick={() => openBankAccountModal()}>+ Add Bank Account</button> : null}
                </div>
                {bankAccountsLoading ? <PageLoader label="Loading bank accounts..." /> : (
                  <div className="settingsAdminTableWrap">
                    <table className="settingsAdminTable settingsBankTable">
                      <thead><tr><th>Beneficiary Name</th><th>Account Number</th><th>Bank Name &amp; Branch</th><th>Actions</th></tr></thead>
                      <tbody>
                        {bankAccounts.length ? bankAccounts.map((account) => (
                          <tr key={account.id}>
                            <td>{account.beneficiaryName || "-"}</td><td>{account.accountNumber || "-"}</td><td>{account.bankNameBranch || "-"}</td>
                            <td><span className="settingsRowActions">
                              <button type="button" className="settingsAdminEditBtn" onClick={() => openBankAccountModal(account)} aria-label="Edit bank account"><EditIcon /></button>
                              <button type="button" className="settingsAdminDeleteBtn" onClick={() => setBankAccountToRemove(account)} aria-label="Remove bank account"><TrashIcon /></button>
                            </span></td>
                          </tr>
                        )) : <tr><td colSpan={4} className="settingsAdminEmpty">No bank accounts added.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : activeSection === "accountants" ? (
              <div className="settingsAdminPanel">
                <div className="settingsAdminHeader">
                  <h2 className="settingsSectionTitle">Accountants</h2>
                  <button type="button" className="settingsPrimaryBtn settingsAddAdminBtn" onClick={() => openAccountantModal()}>+ Add Accountant</button>
                </div>
                {accountantsLoading ? <PageLoader label="Loading accountants..." /> : (
                  <div className="settingsAdminTableWrap">
                    <table className="settingsAdminTable">
                      <thead><tr><th>Name</th><th>Contact</th><th>Email</th><th>Accountant Type</th><th>Actions</th></tr></thead>
                      <tbody>
                        {accountants.length ? accountants.map((accountant) => (
                          <tr key={accountant.uid}>
                            <td><span className="settingsAdminNameCell"><span className="settingsAdminAvatar">{getInitials(accountant.name)}</span>{accountant.name || "-"}</span></td>
                            <td>{accountant.contactNumber || "-"}</td>
                            <td>{accountant.email || "-"}</td>
                            <td>{accountant.accountantType || "-"}</td>
                            <td><span className="settingsRowActions">
                              <button type="button" className="settingsAdminEditBtn" onClick={() => openAccountantModal(accountant)} aria-label="Edit accountant"><EditIcon /></button>
                              {isSuperUser ? <button type="button" className="settingsAdminResetBtn" onClick={() => handleResetAccountantPassword(accountant)} disabled={resettingAccountantUid === accountant.uid}>{resettingAccountantUid === accountant.uid ? "Sending..." : "Reset Password"}</button> : null}
                              <button type="button" className="settingsAdminDeleteBtn" onClick={() => setAccountantToRemove(accountant)} aria-label="Remove accountant"><TrashIcon /></button>
                            </span></td>
                          </tr>
                        )) : <tr><td colSpan={5} className="settingsAdminEmpty">No accountants added.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div className="settingsAdminPanel settingsOrganizationPanel">
                <div className="settingsAdminHeader">
                  <div>
                    <h2 className="settingsSectionTitle">
                      {activeSection === "countries"
                        ? "Countries"
                        : activeSection === "employers"
                        ? "European Agencies"
                        : "Agencies"}
                    </h2>
                    <p className="settingsSectionDescription">
                      Manage {activeSection} used throughout the applicant workflow.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="settingsPrimaryBtn settingsAddAdminBtn"
                    onClick={() => {
                      if (activeSection === "countries") setShowCountryManager(true);
                      else openEntityModal(activeSection === "employers" ? "employer" : "agency");
                    }}
                  >
                    + {activeSection === "countries"
                      ? "Add / Update Country"
                      : activeSection === "employers"
                      ? "Add European Agency"
                      : "Add Agency"}
                  </button>
                </div>

                {activeSection !== "countries" ? (
                  <div className="settingsOrganizationToolbar">
                    <input
                      className="settingsInput settingsOrganizationSearch"
                      type="search"
                      value={organizationSearch}
                      onChange={(event) => setOrganizationSearch(event.target.value)}
                      placeholder={`Search ${activeSection}`}
                    />
                    <select
                      className="settingsInput settingsOrganizationSelect"
                      value={organizationCountryId}
                      onChange={(event) => {
                        setOrganizationCountryId(event.target.value);
                        setOrganizationCompanyId("");
                      }}
                    >
                      <option value="">All countries</option>
                      {countries.map((country) => (
                        <option key={country.id} value={country.id}>{country.name}</option>
                      ))}
                    </select>
                    <select
                      className="settingsInput settingsOrganizationSelect"
                      value={organizationCompanyId}
                      onChange={(event) => setOrganizationCompanyId(event.target.value)}
                    >
                      <option value="">All companies</option>
                      {companies
                        .filter((company) => !organizationCountryId || company.countryId === organizationCountryId)
                        .map((company) => (
                          <option key={company.id} value={company.id}>{company.name}</option>
                        ))}
                    </select>
                    <span className="settingsOrganizationCount">
                      Showing {activeSection === "employers" ? filteredEmployers.length : filteredAgencies.length} {activeSection === "employers" ? "European Agencies" : "agencies"}
                    </span>
                  </div>
                ) : null}

                {error ? <div className="settingsError">{error}</div> : null}
                {organizationLoading ? (
                  <PageLoader label={`Loading ${activeSection}...`} />
                ) : activeSection === "countries" ? (
                  <div className="settingsCountrySummary">
                    <strong>{countries.length}</strong>
                    <span>{countries.length === 1 ? "country" : "countries"} configured</span>
                    <div className="settingsCountryTags">
                      {countries.map((country) => <span key={country.id}>{country.name}</span>)}
                    </div>
                  </div>
                ) : (
                  <div className="settingsOrganizationTable dashboardTableCard">
                    {activeSection === "employers" ? (
                      <EmployersTable
                        rows={filteredEmployers}
                        companyMap={companyMap}
                        countryMap={countryMap}
                        onOpenEmployer={(employer) => openEntityModal("employer", employer)}
                      />
                    ) : (
                      <AgenciesTable
                        rows={filteredAgencies}
                        companyMap={companyMap}
                        countryMap={countryMap}
                        onOpenAgency={(agency) => openEntityModal("agency", agency)}
                      />
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      {entityModalType ? (
        <EntityFormModal
          type={entityModalType}
          countries={countries}
          companies={companies}
          employers={employers}
          editData={entityEditData}
          isSuperUser={isSuperUser}
          onClose={() => {
            setEntityModalType("");
            setEntityEditData(null);
          }}
          onSaved={handleEntitySaved}
        />
      ) : null}

      {showCountryManager ? (
        <CountryManagerModal
          countries={countries}
          onClose={() => setShowCountryManager(false)}
          onSaved={async () => {
            invalidateCache("/countries");
            const countriesData = await getCached("/countries", { ttlMs: 0, force: true });
            setCountries(normalizeListResponse(countriesData));
          }}
        />
      ) : null}

      {showAddBankModal ? (
        <div className="settingsModalBackdrop"><div className="settingsModal settingsAddAdminModal">
          <div className="settingsModalHeader"><h3>{editingBankAccount ? "Edit Bank Account" : "Add Bank Account"}</h3><button type="button" className="settingsModalCloseBtn" onClick={() => { setShowAddBankModal(false); setEditingBankAccount(null); resetBankForm(); }}>x</button></div>
          {[
            ["beneficiaryName", "Beneficiary Name"],
            ["accountNumber", "Account Number"],
            ["bankNameBranch", "Bank Name & Branch"]
          ].map(([key, label]) => (
            <div className="settingsModalField" key={key}>
              <label>{label} <span>*</span></label>
              <input value={bankForm[key]} onChange={(event) => setBankForm((prev) => ({ ...prev, [key]: event.target.value }))} />
              {bankFormErrors[key] ? <div className="settingsInlineError">{bankFormErrors[key]}</div> : null}
            </div>
          ))}
          {bankFormErrors.form ? <div className="settingsError">{bankFormErrors.form}</div> : null}
          <div className="settingsModalActions">
            <button type="button" className="settingsMutedBtn" onClick={() => { setShowAddBankModal(false); setEditingBankAccount(null); resetBankForm(); }}>Cancel</button>
            <button type="button" className="settingsPrimaryBtn" onClick={handleAddBankAccount} disabled={bankSaving}>{bankSaving ? "Saving..." : editingBankAccount ? "Save Changes" : "Add Bank Account"}</button>
          </div>
        </div></div>
      ) : null}

      {showAddAccountantModal ? (
        <div className="settingsModalBackdrop"><div className="settingsModal settingsAddAdminModal">
          <div className="settingsModalHeader"><h3>{editingAccountant ? "Edit Accountant" : "Add Accountant"}</h3><button type="button" className="settingsModalCloseBtn" onClick={() => { setShowAddAccountantModal(false); setEditingAccountant(null); resetAccountantForm(); }}>x</button></div>
          <div className="settingsModalField">
            <label>Name <span>*</span></label>
            <input value={accountantForm.name} onChange={(event) => setAccountantForm((prev) => ({ ...prev, name: event.target.value }))} />
            {accountantFormErrors.name ? <div className="settingsInlineError">{accountantFormErrors.name}</div> : null}
          </div>
          <div className="settingsModalField settingsPhoneField">
            <label>Contact with Country Code <span>*</span></label>
            <PhoneInput
              country="in"
              value={accountantForm.contactNumber}
              onChange={(value) => setAccountantForm((prev) => ({ ...prev, contactNumber: value ? `+${value}` : "" }))}
              enableSearch
              inputProps={{ name: "accountantContact", required: true }}
            />
            {accountantFormErrors.contactNumber ? <div className="settingsInlineError">{accountantFormErrors.contactNumber}</div> : null}
          </div>
          <div className="settingsModalField">
            <label>Email <span>*</span></label>
            <input type="email" value={accountantForm.email} onChange={(event) => setAccountantForm((prev) => ({ ...prev, email: event.target.value }))} />
            {accountantFormErrors.email ? <div className="settingsInlineError">{accountantFormErrors.email}</div> : null}
          </div>
          <div className="settingsModalField">
            <label>Accountant Type <span>*</span></label>
            <select value={accountantForm.accountantType} onChange={(event) => setAccountantForm((prev) => ({ ...prev, accountantType: event.target.value }))}>
              <option value="JUNIOR_ACCOUNTANT">Junior Accountant</option>
              <option value="SENIOR_ACCOUNTANT">Senior Accountant</option>
            </select>
          </div>
          {accountantFormErrors.form ? <div className="settingsError">{accountantFormErrors.form}</div> : null}
          <div className="settingsModalActions">
            <button type="button" className="settingsMutedBtn" onClick={() => { setShowAddAccountantModal(false); setEditingAccountant(null); resetAccountantForm(); }}>Cancel</button>
            <button type="button" className="settingsPrimaryBtn" onClick={handleAddAccountant} disabled={accountantSaving}>{accountantSaving ? "Saving..." : editingAccountant ? "Save Changes" : "Add Accountant"}</button>
          </div>
        </div></div>
      ) : null}

      {bankAccountToRemove ? (
        <div className="settingsModalBackdrop"><div className="settingsModal settingsConfirmModal">
          <h3>Remove Bank Account</h3><p>Remove the account for <strong>{bankAccountToRemove.beneficiaryName}</strong>?</p>
          <div className="settingsModalActions settingsModalActionsCenter">
            <button type="button" className="settingsMutedBtn" onClick={() => setBankAccountToRemove(null)}>Cancel</button>
            <button type="button" className="settingsDangerBtn" onClick={handleRemoveBankAccount} disabled={removingBankAccount}>{removingBankAccount ? "Removing..." : "Remove"}</button>
          </div>
        </div></div>
      ) : null}

      {accountantToRemove ? (
        <div className="settingsModalBackdrop"><div className="settingsModal settingsConfirmModal">
          <h3>Remove Accountant</h3><p>Remove <strong>{accountantToRemove.name}</strong>?</p>
          <div className="settingsModalActions settingsModalActionsCenter">
            <button type="button" className="settingsMutedBtn" onClick={() => setAccountantToRemove(null)}>Cancel</button>
            <button type="button" className="settingsDangerBtn" onClick={handleRemoveAccountant} disabled={removingAccountant}>{removingAccountant ? "Removing..." : "Remove"}</button>
          </div>
        </div></div>
      ) : null}
    </div>
  );
}

export default Settings;
