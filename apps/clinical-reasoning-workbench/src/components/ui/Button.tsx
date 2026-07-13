import { forwardRef, type ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className = "", type = "button", variant = "outline", ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={`button button--${variant} ${className}`.trim()}
        {...props}
      />
    );
  },
);
