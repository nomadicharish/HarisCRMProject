import React from "react";

const DOCUMENTS = [
  { key: "PASSPORT", label: "Passport Copy", required: true },
  { key: "PAN_CARD", label: "Pan Card Copy", required: true },
  { key: "EDUCATION_10TH", label: "10th Certificate", required: true },
  { key: "EDUCATION_12TH", label: "12th Certificate", required: true },
  { key: "DEGREE", label: "Degree", required: false },
  { key: "PHOTO", label: "Passport Photo", required: true },
  { key: "WORK_MEASUREMENT", label: "Work Measurement", required: false },
  { key: "IDP", label: "International Driving Permit", required: false },
  { key: "UNMARRIED_CERTIFICATE", label: "Unmarried Certificate", required: false },
  { key: "MARRIAGE_CERTIFICATE", label: "Marriage Certificate", required: false },
  { key: "BIRTH_CERTIFICATE", label: "Birth Certificate", required: true },
  { key: "MEDICAL_CERTIFICATE", label: "Medical Certificate", required: true }
];

function getLatestVersion(versions) {
  if (!Array.isArray(versions) || versions.length === 0) return null;
  return versions.reduce((latest, current) =>
    new Date(current.uploadedAt) > new Date(latest.uploadedAt) ? current : latest
  );
}

function ApplicantDocumentsTable({
  applicant,
  documents,
  selectedFiles,
  onFileSelect,
  onUpload,
  onDefer,
  onApprove,
  onReject,
  canReview
}) {
  return (
    <div className="card">
      <div className="cardTitleRow">
        <h3>Documents</h3>
      </div>

      <div className="tableWrap">
        <table className="docTable">
          <thead>
            <tr>
              <th>Document</th>
              <th>Status</th>
              <th style={{ width: "380px" }}>Action</th>
            </tr>
          </thead>

          <tbody>
            {DOCUMENTS.map((doc) => {
              if (doc.key === "UNMARRIED_CERTIFICATE" && applicant?.maritalStatus !== "Single")
                return null;
              if (doc.key === "MARRIAGE_CERTIFICATE" && applicant?.maritalStatus !== "Married")
                return null;

              const versions = documents?.[doc.key] || [];
              const selected = selectedFiles?.[doc.key];
              const latest = getLatestVersion(versions);

              const statusText = !latest
                ? "Not uploaded"
                : latest.status === "PENDING"
                ? "Pending"
                : latest.status === "APPROVED"
                ? "Approved"
                : latest.status === "REJECTED"
                ? "Rejected"
                : latest.status === "DEFERRED"
                ? "Deferred"
                : latest.status;

              return (
                <React.Fragment key={doc.key}>
                  <tr className="docHeaderRow">
                    <td>
                      <div className="docName">
                        {doc.label} {doc.required ? <span className="req">*</span> : null}
                      </div>
                      <div className="docSub">{doc.key}</div>
                    </td>

                    <td>
                      <span className={`statusBadge status-${String(latest?.status || "NONE").toLowerCase()}`}>
                        {statusText}
                      </span>
                    </td>

                    <td>
                      <div className="docActions">
                        {(!latest || latest.status === "REJECTED") && (
                          <>
                            <input
                              className="fileInput"
                              type="file"
                              onChange={(e) => onFileSelect(doc.key, e.target.files?.[0] || null)}
                            />

                            <button
                              className="btn btnPrimary btnSm"
                              type="button"
                              disabled={!selected}
                              onClick={() => onUpload(doc.key, selected)}
                            >
                              Upload
                            </button>
                          </>
                        )}

                        {!doc.required && !latest && (
                          <button className="btn btnSecondary btnSm" type="button" onClick={() => onDefer(doc.key)}>
                            Defer
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {versions.map((v, index) => (
                    <tr key={v.id} className="docVersionRow">
                      <td className="docVersionCell">Version {versions.length - index}</td>
                      <td>
                        <span className={`statusBadge status-${String(v.status).toLowerCase()}`}>
                          {String(v.status).toLowerCase()}
                        </span>
                        {v.status === "REJECTED" && v.rejectedReason ? (
                          <div className="docRejectReason">Reason: {v.rejectedReason}</div>
                        ) : null}
                      </td>
                      <td>
                        <div className="docActions">
                          {v.fileUrl ? (
                            <a className="linkBtn" href={v.fileUrl} target="_blank" rel="noreferrer">
                              View
                            </a>
                          ) : null}

                          {canReview && v.status === "PENDING" && (
                            <>
                              <button className="btn btnSuccess btnSm" type="button" onClick={() => onApprove(doc.key, v.id)}>
                                Approve
                              </button>
                              <button className="btn btnDanger btnSm" type="button" onClick={() => onReject(doc.key, v.id)}>
                                Reject
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ApplicantDocumentsTable;

