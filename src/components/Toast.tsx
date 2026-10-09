import { useEffect } from "react";

interface ToastProps {
  message: string;
  duration?: number;
  onDone: () => void;
}

export function Toast({ message, duration = 2500, onDone }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDone, duration);
    return () => clearTimeout(timer);
  }, [duration, onDone]);

  return (
    <div
      className="toast"
      style={{
        position: "fixed",
        bottom: 48,
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(0,0,0,0.82)",
        color: "#fff",
        padding: "8px 20px",
        borderRadius: 8,
        fontSize: 13,
        zIndex: 9999,
        pointerEvents: "none",
        animation: "toastIn 0.3s ease",
      }}
    >
      {message}
    </div>
  );
}
