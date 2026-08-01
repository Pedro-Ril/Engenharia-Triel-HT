import type {
  CSSProperties,
  HTMLAttributes,
  ReactNode,
} from "react";

import styles from "./Stack.module.css";

type StackDirection = "row" | "column";
type StackAlign =
  | "stretch"
  | "start"
  | "center"
  | "end";
type StackJustify =
  | "start"
  | "center"
  | "end"
  | "between";

interface StackProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  direction?: StackDirection;
  gap?: number;
  align?: StackAlign;
  justify?: StackJustify;
  wrap?: boolean;
  fullWidth?: boolean;
}

export function Stack({
  children,
  direction = "column",
  gap = 12,
  align = "stretch",
  justify = "start",
  wrap = false,
  fullWidth = false,
  className = "",
  style,
  ...props
}: StackProps) {
  const stackClassName = [
    styles.stack,
    styles[direction],
    styles[`align-${align}`],
    styles[`justify-${justify}`],
    wrap ? styles.wrap : "",
    fullWidth ? styles.fullWidth : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const stackStyle = {
    "--stack-gap": `${gap}px`,
    ...style,
  } as CSSProperties;

  return (
    <div
      className={stackClassName}
      style={stackStyle}
      {...props}
    >
      {children}
    </div>
  );
}