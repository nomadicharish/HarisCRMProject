import React from "react";
import "../styles/pipeline.css";

const stages = [
  { id: 1, name: "Candidate Created" },
  { id: 2, name: "Upload Documents" },
  { id: 3, name: "Dispatch Documents" },
  { id: 4, name: "Issue of the Contract" },
  { id: 5, name: "Upload Signed Contract" },
  { id: 6, name: "Embassy Appointment Initiated" },
  { id: 7, name: "Embassy Appointment Completed" },
  { id: 8, name: "Embassy Interview Initiated" },
  { id: 9, name: "Embassy Interview Completed" },
  { id: 10, name: "Visa Collection Initiated" },
  { id: 11, name: "Visa Collection Completed" },
  { id: 12, name: "Applicant Travel Details" },
  { id: 13, name: "Candidate Arrived" }
];

function PipelineTracker({ currentStage }) {
  return (
    <div className="pipeline-container">

      {stages.map((stage, index) => {

        let status = "pending";

        if (stage.id < currentStage) status = "completed";
        if (stage.id === currentStage) status = "active";

        return (
          <div key={stage.id} className="pipeline-step">

            {/* Circle */}
            <div className={`circle ${status}`}>
              {stage.id}
            </div>

            {/* Label */}
            <p className={`label ${status}`}>
              {stage.name}
            </p>

            {/* Line */}
            {index !== stages.length - 1 && (
              <div className={`line ${stage.id < currentStage ? "completed" : ""}`}></div>
            )}

          </div>
        );
      })}

    </div>
  );
}

export default PipelineTracker;
