import React from "react";
import VirtualizedRows from "./VirtualizedRows";

function CompaniesTable({
  rows = [],
  isSuperUser = false,
  rightIconSrc = "/right.png",
  formatEuroAmount,
  onOpenCompanyEdit,
  onOpenApplicantsForCompany
}) {
  const gridTemplateColumns = isSuperUser ? "2fr 1.5fr 1.5fr 1.5fr 1.2fr" : "2fr 1.5fr 1.2fr";

  if (rows.length > 40) {
    return (
      <div className="dashboardVirtualTable">
        <div className="dashboardVirtualHeader" style={{ gridTemplateColumns }}>
          <div>Company Name</div>
          <div>Country</div>
          {!isSuperUser ? <div>Applicants</div> : null}
          {isSuperUser ? <div>Employer POC</div> : null}
          {isSuperUser ? <div>Payment / Candidate</div> : null}
          {isSuperUser ? <div>Applicants</div> : null}
        </div>
        <VirtualizedRows
          items={rows}
          rowHeight={58}
          height={460}
          renderItem={(company) => (
            <div
              className="dashboardVirtualRow"
              style={{ gridTemplateColumns }}
              onClick={isSuperUser ? () => onOpenCompanyEdit(company.id) : undefined}
              role={isSuperUser ? "button" : undefined}
              tabIndex={isSuperUser ? 0 : undefined}
            >
              <div>
                {isSuperUser ? (
                  <button
                    type="button"
                    className="dashboardInlineLinkBtn dashboardCompanyNameBtn"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenCompanyEdit(company.id);
                    }}
                  >
                    {company.name || "-"}
                  </button>
                ) : (
                  <span>{company.name || "-"}</span>
                )}
              </div>
              <div>{company.countryName || "-"}</div>
              {!isSuperUser ? (
                <div>
                  <button
                    type="button"
                    className="dashboardInlineLinkBtn dashboardViewApplicantsBtn"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenApplicantsForCompany(company.id);
                    }}
                  >
                    View Applicants <img src={rightIconSrc} alt="" className="dashboardInlineIcon" />
                  </button>
                </div>
              ) : null}
              {isSuperUser ? <div>{company.employerNames || "-"}</div> : null}
              {isSuperUser ? <div>{formatEuroAmount(company.companyPaymentPerApplicant)}</div> : null}
              {isSuperUser ? (
                <div>
                  <button
                    type="button"
                    className="dashboardInlineLinkBtn"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenApplicantsForCompany(company.id);
                    }}
                  >
                    View Applicants <img src={rightIconSrc} alt="" className="dashboardInlineIcon" />
                  </button>
                </div>
              ) : null}
            </div>
          )}
        />
      </div>
    );
  }

  return (
    <table className="dashboardTable">
      <thead>
        <tr>
          <th>Company Name</th>
          <th>Country</th>
          {!isSuperUser ? <th>Applicants</th> : null}
          {isSuperUser ? <th>Employer POC</th> : null}
          {isSuperUser ? <th>Payment / Candidate</th> : null}
          {isSuperUser ? <th>Applicants</th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={isSuperUser ? 5 : 3} className="dashboardEmptyState">
              No companies found for the selected filters.
            </td>
          </tr>
        ) : (
          rows.map((company) => (
            <tr
              key={company.id}
              className={isSuperUser ? "dashboardTableRow" : ""}
              onClick={isSuperUser ? () => onOpenCompanyEdit(company.id) : undefined}
            >
              <td>
                {isSuperUser ? (
                  <button
                    type="button"
                    className="dashboardInlineLinkBtn dashboardCompanyNameBtn"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenCompanyEdit(company.id);
                    }}
                  >
                    {company.name || "-"}
                  </button>
                ) : (
                  <span>{company.name || "-"}</span>
                )}
              </td>
              <td>{company.countryName}</td>
              {!isSuperUser ? (
                <td>
                  <button
                    type="button"
                    className="dashboardInlineLinkBtn dashboardViewApplicantsBtn"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenApplicantsForCompany(company.id);
                    }}
                  >
                    View Applicants <img src={rightIconSrc} alt="" className="dashboardInlineIcon" />
                  </button>
                </td>
              ) : null}
              {isSuperUser ? <td>{company.employerNames || "-"}</td> : null}
              {isSuperUser ? <td>{formatEuroAmount(company.companyPaymentPerApplicant)}</td> : null}
              {isSuperUser ? (
                <td>
                  <button
                    type="button"
                    className="dashboardInlineLinkBtn"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenApplicantsForCompany(company.id);
                    }}
                  >
                    View Applicants <img src={rightIconSrc} alt="" className="dashboardInlineIcon" />
                  </button>
                </td>
              ) : null}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

export default CompaniesTable;
