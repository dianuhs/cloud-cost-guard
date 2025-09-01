// src/components/ui/alert.jsx
import * as React from "react";

// Simple, dependency-free alert primitives.
// - Renders a container with role="alert"
// - Only renders <h5> if children exist (avoids a11y error)

export const Alert = React.forwardRef(function Alert(
  { className = "", children, ...props },
  ref
) {
  return (
    <div ref={ref} role="alert" className={className} {...props}>
      {children}
    </div>
  );
});

export const AlertTitle = React.forwardRef(function AlertTitle(
  { className = "", children, ...props },
  ref
) {
  if (!children) return null; // key fix: no empty heading rendered
  return (
    <h5 ref={ref} className={className} {...props}>
      {children}
    </h5>
  );
});

export const AlertDescription = React.forwardRef(function AlertDescription(
  { className = "", children, ...props },
  ref
) {
  return (
    <div ref={ref} className={className} {...props}>
      {children}
    </div>
  );
});
