import React from "react";
import "../styles/pipeline.css";

const stages = [
  { id: 1, name: "Candidate Created" },
  { id: 2, name: "Upload Documents" },
  { id: 3, name: "Dispatch Documents" },
  { id: 4, name: "Embassy Appointment" },
  { id: 5, name: "Biometrics" }
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