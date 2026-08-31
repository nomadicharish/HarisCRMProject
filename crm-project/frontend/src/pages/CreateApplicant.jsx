import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import ApplicantFormModal from "../components/applicant-form/ApplicantFormModal";
import PageLoader from "../components/common/PageLoader";
import API from "../services/api";
import { getCached, invalidateCache } from "../services/cachedApi";

function CreateApplicant() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [user, setUser] = useState(null);
  const [editData, setEditData] = useState(null);
  const [loading, setLoading] = useState(Boolean(id));

  const loadContext = useCallback(async () => {
    try {
      const me = await getCached("/auth/me", { ttlMs: 120000 });
      setUser(me || null);

      if (id) {
        const data = await getCached(`/applicants/${id}`, { ttlMs: 10000 });
        setEditData(data || null);
      }
    } catch (error) {
      console.error(error);
      setEditData(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadContext();
  }, [loadContext]);

  if (loading) {
    return <PageLoader label="Loading applicant data..." />;
  }

  const isPostApprovalEdit = Boolean(id) && searchParams.get("edit") === "approved";
  const shouldAutoApprove =
    Boolean(id) && searchParams.get("context") === "stage1" && !isPostApprovalEdit;
  const applicantContextParams = new URLSearchParams(searchParams);
  applicantContextParams.delete("context");
  applicantContextParams.delete("edit");
  const applicantContextSuffix = applicantContextParams.toString() ? `?${applicantContextParams.toString()}` : "";
  const applicantListPath = () => {
    const params = new URLSearchParams(applicantContextParams);
    params.set("tab", "applicants");
    return `/dashboard?${params.toString()}`;
  };
  const initialApplicationDetails = !id && searchParams.get("source") === "job-position-link"
    ? {
        countryId: searchParams.get("countryId") || "",
        companyId: searchParams.get("companyId") || "",
        jobPositionId: searchParams.get("jobPositionId") || ""
      }
    : null;

  return (
    <ApplicantFormModal
      asPage
      user={user}
      editData={editData}
      initialApplicationDetails={initialApplicationDetails}
      keepOpenAfterCreate={!id}
      editSubmitLabel={isPostApprovalEdit ? "Save" : ""}
      autoApproveAfterSave={shouldAutoApprove}
      onApproveStage={
        shouldAutoApprove
          ? async () => {
              await API.patch(`/applicants/${id}/approve-stage`);
            }
          : undefined
      }
      onClose={() => navigate(shouldAutoApprove ? applicantListPath() : id ? `/applicants/${id}${applicantContextSuffix}` : "/dashboard")}
      onSaved={(change) => {
        invalidateCache("/applicants");
        if (id) {
          invalidateCache(`/applicants/${id}`);
          invalidateCache(`/applicants/${id}/workflow-bundle`);
          navigate(shouldAutoApprove ? applicantListPath() : `/applicants/${id}${applicantContextSuffix}`);
          return;
        }

        if (change?.id) {
          invalidateCache(`/applicants/${change.id}`);
          invalidateCache(`/applicants/${change.id}/workflow-bundle`);
          return;
        }
      }}
    />
  );
}

export default CreateApplicant;
