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

  const shouldAutoApprove = Boolean(id) && searchParams.get("context") === "stage1";

  return (
    <ApplicantFormModal
      asPage
      user={user}
      editData={editData}
      autoApproveAfterSave={shouldAutoApprove}
      onApproveStage={
        shouldAutoApprove
          ? async () => {
              await API.patch(`/applicants/${id}/approve-stage`);
            }
          : undefined
      }
      onClose={() => navigate(id ? `/applicants/${id}` : "/dashboard")}
      onSaved={(change) => {
        invalidateCache("/applicants");
        if (id) {
          invalidateCache(`/applicants/${id}`);
          invalidateCache(`/applicants/${id}/workflow-bundle`);
          navigate(`/applicants/${id}`);
          return;
        }

        if (change?.id) {
          invalidateCache(`/applicants/${change.id}`);
          invalidateCache(`/applicants/${change.id}/workflow-bundle`);
          navigate(`/applicants/${change.id}`);
          return;
        }

        navigate("/dashboard");
      }}
    />
  );
}

export default CreateApplicant;
