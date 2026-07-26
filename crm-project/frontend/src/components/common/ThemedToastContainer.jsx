import { CircleCheckBig, CircleX, Info, TriangleAlert } from "lucide-react";
import { ToastContainer, cssTransition } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "../../styles/toast.css";

const toastTransition = cssTransition({
  enter: "crmToastSlideIn",
  exit: "crmToastFadeOut",
  collapse: true
});

const icons = {
  success: CircleCheckBig,
  error: CircleX,
  warning: TriangleAlert,
  info: Info
};

function ToastIcon({ type }) {
  const Icon = icons[type] || Info;
  return (
    <span className={`crmToastIcon crmToastIcon--${type || "info"}`} aria-hidden="true">
      <Icon size={20} strokeWidth={2.4} />
    </span>
  );
}

export default function ThemedToastContainer() {
  return (
    <ToastContainer
      position="top-right"
      autoClose={4000}
      closeOnClick
      pauseOnHover
      draggable
      newestOnTop
      icon={ToastIcon}
      transition={toastTransition}
      className="crmToastContainer"
      toastClassName={({ type }) => `crmToast crmToast--${type || "info"}`}
      bodyClassName="crmToastBody"
      progressClassName="crmToastProgress"
    />
  );
}
