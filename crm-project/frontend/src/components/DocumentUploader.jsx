import React, { useState } from "react";
import API from "../services/api";
import { ALLOWED_DOCUMENT_ACCEPT, getValidatedDocumentFile, validateDocumentFiles } from "../utils/fileValidation";
import { toast } from "../utils/toast";

function DocumentUploader({ applicantId }) {

  const [file, setFile] = useState(null);

  const handleUpload = async () => {

    if (!file) return toast.error("Select a file to upload");
    const fileValidation = validateDocumentFiles([file]);
    if (!fileValidation.valid) return toast.error(fileValidation.message);

    const formData = new FormData();
    formData.append("file", file);

    try {

      await API.post(
        `/applicants/${applicantId}/upload-document`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data"
          }
        }
      );

      toast.success("Document uploaded successfully");

    } catch (err) {
      console.error(err);
      toast.error("Document upload failed");
    }
  };

  return (
    <div>

      <input
        type="file"
        accept={ALLOWED_DOCUMENT_ACCEPT}
        onChange={(e) => setFile(getValidatedDocumentFile(e.target.files[0], toast.error))}
      />

      <button onClick={handleUpload}>
        Upload Document
      </button>

    </div>
  );
}

export default DocumentUploader;
