const THEME = {
  primary: "#0052CC",
  border: "#DFE1E6",
  error: "red"
};

const overlay = {
  position: "fixed",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: "10px",
  zIndex: 1000
};

const modal = {
  background: "#fff",
  borderRadius: 16,
  width: "100%",
  maxWidth: "600px",
  maxHeight: "90vh",
  overflowY: "auto",
  padding: "24px",
  boxShadow: "0 20px 54px rgba(15, 23, 42, 0.12)",
  border: "1px solid #e7edf5"
};

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "16px",
  width: "100%"
};

const input = {
  width: "100%",
  minHeight: "44px",
  padding: "10px 14px",
  borderRadius: 12,
  border: `1px solid ${THEME.border}`,
  background: "#FFFFFF",
  fontSize: "14px",
  boxSizing: "border-box",
  outline: "none",
  transition: "border 0.2s ease, box-shadow 0.2s ease"
};

const actions = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: "20px"
};

const actionsRight = {
  display: "flex",
  justifyContent: "flex-end",
  marginTop: "20px"
};

const btnPrimary = {
  background: "#0052CC",
  color: "#fff",
  border: "none",
  padding: "12px 20px",
  borderRadius: 10,
  cursor: "pointer",
  fontWeight: "600",
  fontSize: "14px"
};

const btnSecondary = {
  background: "#fff",
  border: "1px solid #d9e2f0",
  padding: "12px 20px",
  borderRadius: 10,
  cursor: "pointer",
  color: "#344054",
  fontSize: "14px"
};

const stepText = {
  fontSize: "13px",
  color: "#6b7280",
  marginBottom: "15px",
  fontFamily: "Inter, sans-serif"
};

const label = {
  fontSize: "13px",
  marginBottom: "6px",
  display: "block",
  color: "#667085",
  fontWeight: "600"
};

const errorText = {
  color: "red",
  fontSize: "12px",
  marginTop: "3px"
};

const handleFocus = (event) => {
  event.target.style.border = `1px solid ${THEME.primary}`;
  event.target.style.boxShadow = "0 0 0 3px rgba(0,82,204,0.12)";
};

const handleBlur = (event, hasError) => {
  event.target.style.border = hasError ? `1px solid ${THEME.error}` : `1px solid ${THEME.border}`;
  event.target.style.boxShadow = "none";
};

const getSelectStyles = () => ({
  control: (base) => ({
    ...base,
    padding: "0",
    borderRadius: 12,
    border: `1px solid ${THEME.border}`,
    boxShadow: "none",
    minHeight: input.minHeight,
    height: input.minHeight,
    overflow: "hidden",
    background: input.background,
    alignItems: "center",
    "&:hover": {
      border: `1px solid ${THEME.primary}`
    }
  }),
  valueContainer: (base) => ({
    ...base,
    padding: "0 14px 0 42px",
    minHeight: input.minHeight,
    height: input.minHeight,
    display: "flex",
    alignItems: "center"
  }),
  indicatorsContainer: (base) => ({
    ...base,
    minHeight: input.minHeight,
    height: input.minHeight
  }),
  placeholder: (base) => ({
    ...base,
    margin: 0,
    lineHeight: "1.2"
  }),
  singleValue: (base) => ({
    ...base,
    margin: 0,
    lineHeight: "1.2"
  }),
  input: (base) => ({
    ...base,
    margin: 0,
    padding: 0
  }),
  menu: (base) => ({
    ...base,
    borderRadius: 12,
    zIndex: 9999
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isFocused ? "#f0f6ff" : "#fff",
    color: "#333",
    cursor: "pointer",
    minHeight: "36px",
    display: "flex",
    alignItems: "center"
  })
});

export {
  THEME,
  overlay,
  modal,
  grid,
  input,
  actions,
  actionsRight,
  btnPrimary,
  btnSecondary,
  stepText,
  label,
  errorText,
  handleFocus,
  handleBlur,
  getSelectStyles
};
