import React, { useRef } from "react";

interface DebugOverlayProps {
  data: Record<string, string | number | boolean | (number | string)[]>;
  smoothingWindow?: number; // Optional prop to define N
}

const formatValue = (value: string | number | boolean): string => {
  if (typeof value === "number") {
    return value.toFixed(3);
  }
  return String(value);
};

const DebugOverlay: React.FC<DebugOverlayProps> = ({ data, smoothingWindow = 50 }) => {
  const valueHistoryRef = useRef<Record<string, number[]>>({});

  const smoothData: typeof data = {};

  Object.entries(data).forEach(([key, value]) => {
    if (typeof value === "number") {
      if (!valueHistoryRef.current[key]) {
        valueHistoryRef.current[key] = [];
      }
      const history = valueHistoryRef.current[key];
      history.push(value);
      if (history.length > smoothingWindow) {
        history.shift();
      }
      const average = history.reduce((sum, v) => sum + v, 0) / history.length;
      smoothData[key] = average;
    } else if (Array.isArray(value) && value.every((v) => typeof v === "number")) {
      // Optional: apply smoothing to numeric arrays
      value.forEach((v, i) => {
        const historyKey = `${key}[${i}]`;
        if (!valueHistoryRef.current[historyKey]) {
          valueHistoryRef.current[historyKey] = [];
        }
        const history = valueHistoryRef.current[historyKey];
        history.push(v as number);
        if (history.length > smoothingWindow) {
          history.shift();
        }
        const average = history.reduce((sum, n) => sum + n, 0) / history.length;
        if (!smoothData[key]) smoothData[key] = [];
        (smoothData[key] as number[])[i] = average;
      });
    } else {
      smoothData[key] = value;
    }
  });

  return (
    <div className="bg-black bg-opacity-70 text-white text-xs p-2 rounded shadow-md max-w-xs z-50 font-mono whitespace-pre">
      {Object.entries(smoothData).map(([key, value]) => (
        <div key={key}>
          <strong>{key}:</strong>{" "}
          {Array.isArray(value) ? value.map(formatValue).join(", ") : formatValue(value)}
        </div>
      ))}
    </div>
  );
};

export default DebugOverlay;
