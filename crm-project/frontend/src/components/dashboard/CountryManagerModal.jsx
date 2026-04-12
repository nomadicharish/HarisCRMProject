import React, { useMemo, useState } from "react";
import API from "../../services/api";
import "../../styles/applicantContract.css";
import "../../styles/applicantsDashboard.css";

function EditIcon() {
  return (
    <svg className="dashboardCountryIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20h4l10-10-4-4L4 16v4Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.5 5.5 16.5 9.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CountryManagerModal({ countries = [], onClose, onSaved }) {
  const [newCountryName, setNewCountryName] = useState("");
  const [editingCountryId, setEditingCountryId] = useState("");
  const [editingName, setEditingName] = useState("");
  const [saving, setSaving] = useState(false);
  const [rowSavingId, setRowSavingId] = useState("");
  const [error, setError] = useState("");

  const sortedCountries = useMemo(
    () =>
      [...countries].sort((a, b) =>
        String(a?.name || "").localeCompare(String(b?.name || ""), undefined, { sensitivity: "base" })
      ),
    [countries]
  );

  const resetInlineEdit = () => {
    setEditingCountryId("");
    setEditingName("");
  };

  const handleAddCountry = async () => {
    const trimmedName = newCountryName.trim();
    if (!trimmedName) {
      setError("Country name is required");
      return;
    }

    try {
      setSaving(true);
      setError("");
      await API.post("/add-country", { name: trimmedName });
      setNewCountryName("");

      if (typeof onSaved === "function") {
        await onSaved();
      }
    } catch (submitError) {
      console.error(submitError);
      setError(submitError?.response?.data?.message || "Failed to save country");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateCountry = async (countryId) => {
    const trimmedName = editingName.trim();
    if (!trimmedName) {
      setError("Country name is required");
      return;
    }

    try {
      setRowSavingId(countryId);
      setError("");
      await API.patch(`/countries/${countryId}`, { name: trimmedName });
      resetInlineEdit();

      if (typeof onSaved === "function") {
        await onSaved();
      }
    } catch (submitError) {
      console.error(submitError);
      setError(submitError?.response?.data?.message || "Failed to update country");
    } finally {
      setRowSavingId("");
    }
  };

  return (
    <div className="contractModalOverlay">
      <div className="contractModalCard dashboardCountryModal">
        <div className="dashboardModalHeader">
          <h3 className="dashboardModalTitle">Add / Update Country</h3>
          <button type="button" className="dashboardModalCloseBtn" onClick={onClose}>
            x
          </button>
        </div>

        <div className="dashboardCountryAddRow">
          <div className="input-field dashboardEntityFullWidth">
            <label className="contractUploadLabel" htmlFor="country-name">
              Country Name
            </label>
            <input
              id="country-name"
              type="text"
              value={newCountryName}
              onChange={(event) => {
                setNewCountryName(event.target.value);
                setError("");
              }}
              placeholder="Enter country name"
            />
          </div>

          <button type="button" className="dashboardPrimaryBtn" disabled={saving} onClick={handleAddCountry}>
            {saving ? "Saving..." : "Add Country"}
          </button>
        </div>

        <div className="dashboardCountryList">
          {sortedCountries.length === 0 ? (
            <div className="dashboardEmptyInlineState">No countries added yet.</div>
          ) : (
            sortedCountries.map((country) => {
              const isEditing = editingCountryId === country.id;
              const isBusy = rowSavingId === country.id;

              return (
                <div key={country.id} className={`dashboardCountryRow ${isEditing ? "dashboardCountryRowEditing" : ""}`}>
                  {isEditing ? (
                    <>
                      <input
                        type="text"
                        value={editingName}
                        onChange={(event) => {
                          setEditingName(event.target.value);
                          setError("");
                        }}
                        className="dashboardCountryInput"
                        placeholder="Country name"
                      />
                      <div className="dashboardCountryRowActions">
                        <button
                          type="button"
                          className="dashboardPrimaryBtn"
                          disabled={isBusy}
                          onClick={() => handleUpdateCountry(country.id)}
                        >
                          {isBusy ? "Updating..." : "Update"}
                        </button>
                        <button type="button" className="dashboardPaginationBtn" onClick={resetInlineEdit}>
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="dashboardCountryName">{country.name || "-"}</span>
                      <button
                        type="button"
                        className="dashboardCountryIconBtn"
                        onClick={() => {
                          setEditingCountryId(country.id);
                          setEditingName(country.name || "");
                          setError("");
                        }}
                        aria-label={`Edit ${country.name || "country"}`}
                        title="Edit country"
                      >
                        <EditIcon />
                      </button>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        {error ? <div className="dashboardInlineError">{error}</div> : null}
      </div>
    </div>
  );
}

export default CountryManagerModal;
