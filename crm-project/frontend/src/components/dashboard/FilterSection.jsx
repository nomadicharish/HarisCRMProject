import React from "react";

function FilterSection({ title, items, selectedValues, onToggle, visible = true }) {
  if (!visible || !items.length) return null;

  return (
    <div className="dashboardFilterSection">
      <div className="dashboardFilterTitle">{title}</div>

      <div className="dashboardFilterList">
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
    </div>
  );
}

export default FilterSection;
