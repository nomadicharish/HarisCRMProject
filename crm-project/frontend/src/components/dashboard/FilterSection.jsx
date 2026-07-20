import React, { useState } from "react";

function FilterSection({ title, items, selectedValues, onToggle, visible = true }) {
  // Sections start collapsed, and only the user can change that state.  In
  // particular, clearing the final selected checkbox must not re-collapse an
  // open section.
  const [collapsed, setCollapsed] = useState(true);

  if (!visible) return null;

  return (
    <div className="dashboardFilterSection">
      <button
        type="button"
        className="dashboardFilterTitleBtn"
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
      >
        <span className="dashboardFilterTitle">{title}</span>
        <span className={`dashboardFilterChevron ${collapsed ? "dashboardFilterChevronCollapsed" : ""}`}>
          ^
        </span>
      </button>

      {!collapsed ? (
      <div className="dashboardFilterList">
        {!items.length ? <div className="dashboardFilterEmptyText">No options</div> : null}
        {items.map((item) => {
          const checked = selectedValues.includes(item.value);
          return (
            <label key={item.value} className="dashboardFilterOption">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(item.value)}
              />
              <span className="dashboardFilterOptionLabel">{item.label}</span>
              <span className="dashboardFilterCount">{item.count}</span>
            </label>
          );
        })}
      </div>
      ) : null}
    </div>
  );
}

export default FilterSection;
