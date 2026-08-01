import { toast as reactToast } from "react-toastify";

const durationByType = {
  success: 3000,
  error: 4000,
  warning: 4000,
  info: 4000
};

const show = (type, message, options = {}) => reactToast[type](message, {
  autoClose: durationByType[type],
  ...options
});

// Use this module for every app notification so timing and presentation stay consistent.
export const toast = {
  success: (message, options) => show("success", message, options),
  error: (message, options) => show("error", message, options),
  warning: (message, options) => show("warning", message, options),
  info: (message, options) => show("info", message, options),
  dismiss: reactToast.dismiss,
  isActive: reactToast.isActive,
  clearWaitingQueue: reactToast.clearWaitingQueue
};
