import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import API from "../services/api";
import "../styles/applicantDispatch.css";

function formatDispatchDate(createdAt) {
  if (!createdAt) return "-";

  if (typeof createdAt === "number" || typeof createdAt === "string") {
    const date = new Date(createdAt);
    return Number.isNaN(date.getTime())
      ? "-"
      : date.toLocaleDateString(undefined, {
          day: "2-digit",
          month: "short",
          year: "numeric"
        });
  }

  if (typeof createdAt?.toDate === "function") {
    return createdAt.toDate().toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }

  if (typeof createdAt === "object" && createdAt._seconds) {
    const date = new Date(createdAt._seconds * 1000);
    return Number.isNaN(date.getTime())
      ? "-"
      : date.toLocaleDateString(undefined, {
          day: "2-digit",
          month: "short",
          year: "numeric"
        });
  }

  return "-";
}

function DispatchSection({
  applicantId,
  canEdit = false,
  showTopBar = false,
  showTitle = true,
  compact = false,
  onSaved,
  truncateTrackingUrl = false
}) {
  const [dispatches, setDispatches] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    note: "",
    trackingUrl: "",
    awbNumber: ""
  });

  const loadDispatches = useCallback(async () => {
    try {
      setLoading(true);
      const res = await API.get(`/applicants/${applicantId}/dispatch`);
      setDispatches(res.data || []);
    } catch (error) {
      console.error(error);
      setDispatches([]);
    } finally {
      setLoading(false);
    }
  }, [applicantId]);

  useEffect(() => {
    if (applicantId) {
      loadDispatches();
    }
  }, [applicantId, loadDispatches]);

  const handleChange = (event) => {
    setForm((prev) => ({
      ...prev,
      [event.target.name]: event.target.value
    }));
  };

  const handleSubmit = async () => {
    if (!form.note.trim() || !form.awbNumber.trim()) {
      toast.error("Dispatch note and AWB number are required");
      return;
    }

    try {
      setSaving(true);
      await API.post(`/applicants/${applicantId}/dispatch`, {
        note: form.note.trim(),
        trackingUrl: form.trackingUrl.trim(),
        awbNumber: form.awbNumber.trim()
      });

      setForm({ note: "", trackingUrl: "", awbNumber: "" });
      await loadDispatches();

      if (typeof onSaved === "function") {
        await onSaved();
      }
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.message || "Failed to save dispatch");
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit && !loading && dispatches.length === 0) {
    return null;
  }

  return (
    <div className={`dispatchSection ${compact ? "dispatchSectionCompact" : ""}`}>
      {showTopBar ? (
        <div className="dispatchTopBar">
          <div>
            <div className="dispatchTopBarTitle">Dispatch the document</div>
          </div>
        </div>
      ) : null}

      <div className="card dispatchCard">
        {showTitle && canEdit ? (
          <h3 className="dispatchTitle">{canEdit ? "Dispatch Tracking" : "Dispatch History"}</h3>
        ) : null}

        {canEdit ? (
          <div className="dispatchFormGrid">
            <div className="input-field">
              <label htmlFor="dispatch-note">Dispatch Note</label>
              <input
                id="dispatch-note"
                name="note"
                placeholder="Enter dispatch note"
                value={form.note}
                onChange={handleChange}
                disabled={saving}
              />
            </div>

            <div className="input-field">
              <label htmlFor="dispatch-tracking-url">Tracking URL</label>
              <input
                id="dispatch-tracking-url"
                name="trackingUrl"
                placeholder="Enter tracking URL"
                value={form.trackingUrl}
                onChange={handleChange}
                disabled={saving}
              />
            </div>

            <div className="input-field">
              <label htmlFor="dispatch-awb">AWB Number</label>
              <input
                id="dispatch-awb"
                name="awbNumber"
                placeholder="Enter AWB Number"
                value={form.awbNumber}
                onChange={handleChange}
                disabled={saving}
              />
            </div>

            <div className="dispatchFormActions">
              <button
                type="button"
                className="btn btnPrimary"
                disabled={saving}
                onClick={handleSubmit}
              >
                {saving ? "Saving..." : "Add Dispatch"}
              </button>
            </div>
          </div>
        ) : null}

        {(loading || dispatches.length > 0) ? (
          <>
            <div className="dispatchHistoryHeader">
              <div className="dispatchHistoryTitle">Dispatch History</div>
            </div>

            <div className="tableWrap">
              <table className="docTable">
                <thead>
                  <tr>
                    <th>Dispatch Note</th>
                    <th>AWB Number</th>
                    <th>Tracking URL</th>
                    <th>Date</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="4" className="dispatchEmptyCell">
                        Loading dispatch history...
                      </td>
                    </tr>
                  ) : (
                    dispatches.map((dispatch) => (
                      <tr key={dispatch.id}>
                        <td>{dispatch.note || "-"}</td>
                        <td>{dispatch.awbNumber || "-"}</td>
                        <td>
                          {dispatch.trackingUrl ? (
                            <a className="linkBtn" href={dispatch.trackingUrl} target="_blank" rel="noreferrer">
                              <span className={truncateTrackingUrl ? "dispatchTrackingLink" : ""}>
                                {dispatch.trackingUrl}
                              </span>
                            </a>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td>{formatDispatchDate(dispatch.createdAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default DispatchSection;
