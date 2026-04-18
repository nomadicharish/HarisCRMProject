import React, { useMemo, useState } from "react";

function VirtualizedRows({
  items = [],
  rowHeight = 56,
  height = 420,
  overscan = 6,
  renderItem
}) {
  const [scrollTop, setScrollTop] = useState(0);

  const totalHeight = items.length * rowHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleCount = Math.ceil(height / rowHeight) + overscan * 2;
  const endIndex = Math.min(items.length, startIndex + visibleCount);

  const visibleItems = useMemo(
    () => items.slice(startIndex, endIndex),
    [endIndex, items, startIndex]
  );

  return (
    <div
      style={{ height, overflowY: "auto", position: "relative" }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        {visibleItems.map((item, index) => {
          const itemIndex = startIndex + index;
          return (
            <div
              key={item?.id || itemIndex}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: itemIndex * rowHeight,
                height: rowHeight
              }}
            >
              {renderItem(item, itemIndex)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default VirtualizedRows;
