import React from "react";
import {
  getLatestVersion,
  getVisibleApplicantDocuments
} from "../../constants/applicantDocuments";

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
            {getVisibleApplicantDocuments(applicant).map((doc) => {
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
