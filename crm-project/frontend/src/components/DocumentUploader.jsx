import React, { useState } from "react";
import API from "../services/api";

function DocumentUploader({ applicantId }) {

  const [file, setFile] = useState(null);

  const handleUpload = async () => {

    if (!file) return alert("Select file");

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
        onChange={(e) => setFile(e.target.files[0])}
      />

      <button onClick={handleUpload}>
        Upload Document
      </button>

    </div>
  );
}

export default DocumentUploader;