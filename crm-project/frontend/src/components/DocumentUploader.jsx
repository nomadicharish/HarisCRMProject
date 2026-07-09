import React, { useState } from "react";
import API from "../services/api";
import { ALLOWED_DOCUMENT_ACCEPT, getValidatedDocumentFile, validateDocumentFiles } from "../utils/fileValidation";

function DocumentUploader({ applicantId }) {

  const [file, setFile] = useState(null);

  const handleUpload = async () => {

    if (!file) return alert("Select file");
    const fileValidation = validateDocumentFiles([file]);
    if (!fileValidation.valid) return alert(fileValidation.message);

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

      alert("Uploaded successfully");

    } catch (err) {
      console.error(err);
      alert("Upload failed");
    }
  };

  return (
    <div>

      <input
        type="file"
        accept={ALLOWED_DOCUMENT_ACCEPT}
        onChange={(e) => setFile(getValidatedDocumentFile(e.target.files[0], alert))}
      />

      <button onClick={handleUpload}>
        Upload Document
      </button>

    </div>
  );
}

export default DocumentUploader;
