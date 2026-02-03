import React, { useMemo, useState } from "react";

const cx = (...a) => a.filter(Boolean).join(" ");

export default function ConfirmDeleteButton({
  confirming, // optional (controlled)
  onStart,
  onCancel,
  onConfirm,

  label = "Șterge",
  confirmLabel = "Da",
  cancelLabel = "Nu",

  disabled = false,
  className = "",

  // optional: dacă vrei “full width” în grid
  fullWidth = true,
}) {
  const isControlled = typeof confirming === "boolean";
  const [local, setLocal] = useState(false);

  const isConfirming = useMemo(
    () => (isControlled ? confirming : local),
    [isControlled, confirming, local],
  );

  const start = () => {
    if (disabled) return;
    if (!isControlled) setLocal(true);
    onStart?.();
  };

  const cancel = () => {
    if (!isControlled) setLocal(false);
    onCancel?.();
  };

  const confirm = () => {
    if (disabled) return;
    onConfirm?.();
  };

  return (
    <div
      className={cx(
        "uiConfirmDelete",
        fullWidth && "is-full",
        isConfirming && "is-confirming",
        className,
      )}
    >
      {!isConfirming ? (
        <button
          type="button"
          className="uiConfirmDelete__danger"
          onClick={start}
          disabled={disabled}
        >
          {label}
        </button>
      ) : (
        <>
          <button
            type="button"
            className="uiConfirmDelete__danger"
            onClick={confirm}
            disabled={disabled}
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            className="uiConfirmDelete__cancel"
            onClick={cancel}
            disabled={disabled}
          >
            {cancelLabel}
          </button>
        </>
      )}
    </div>
  );
}
