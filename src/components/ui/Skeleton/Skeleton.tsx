import type { CSSProperties, HTMLAttributes } from "react";

import styles from "./Skeleton.module.css";

type SkeletonVariant =
  | "text"
  | "rectangle"
  | "circle";

interface SkeletonProps
  extends HTMLAttributes<HTMLDivElement> {
  width?: number | string;
  height?: number | string;
  variant?: SkeletonVariant;
  animated?: boolean;
}

function normalizeSize(value?: number | string) {
  if (typeof value === "number") {
    return `${value}px`;
  }

  return value;
}

export function Skeleton({
  width,
  height,
  variant = "rectangle",
  animated = true,
  className = "",
  style,
  ...props
}: SkeletonProps) {
  const skeletonClassName = [
    styles.skeleton,
    styles[variant],
    animated ? styles.animated : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const skeletonStyle: CSSProperties = {
    width: normalizeSize(width),
    height: normalizeSize(height),
    ...style,
  };

  return (
    <div
      className={skeletonClassName}
      style={skeletonStyle}
      aria-hidden="true"
      {...props}
    />
  );
}