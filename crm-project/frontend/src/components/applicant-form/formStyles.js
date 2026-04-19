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
  borderRadius: 0,
  width: "100%",
  maxWidth: "600px",
  maxHeight: "90vh",
  overflowY: "auto",
  padding: "20px"
};

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "12px",
  width: "100%"
};

const input = {
  width: "100%",
  minHeight: "36px",
  padding: "6px 10px",
  borderRadius: 0,
  border: `1px solid ${THEME.border}`,
  background: "#FAFBFC",
  fontSize: "14px",
  boxSizing: "border-box",
  outline: "none",
  transition: "border 0.2s ease"
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
  padding: "8px 12px",
  borderRadius: 0,
  cursor: "pointer",
  fontWeight: "500",
  fontSize: "14px"
};

const btnSecondary = {
  background: "transparent",
  border: "none",
  padding: "8px 12px",
  borderRadius: 0,
  cursor: "pointer",
  color: "#333",
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
  marginBottom: "5px",
  display: "block",
  color: "#6B778C",
  fontWeight: "500"
};

const errorText = {
  color: "red",
  fontSize: "12px",
  marginTop: "3px"
};

const handleFocus = (event) => {
  event.target.style.border = `1px solid ${THEME.primary}`;
};

const handleBlur = (event, hasError) => {
  event.target.style.border = hasError ? `1px solid ${THEME.error}` : `1px solid ${THEME.border}`;
};

const getSelectStyles = () => ({
  control: (base) => ({
    ...base,
    padding: "0",
    borderRadius: 0,
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
    padding: "0 10px",
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
    borderRadius: 0,
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
