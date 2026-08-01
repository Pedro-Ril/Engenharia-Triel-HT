import type { CSSProperties, ReactNode } from "react";
import styles from "./FormGrid.module.css";

type FormGridColumns = 1 | 2 | 3 | 4;

interface FormGridProps {
  children: ReactNode;
  columns?: FormGridColumns;
  gap?: number;
  className?: string;
}

export function FormGrid({
  children,
  columns = 2,
  gap = 16,
  className = "",
}: FormGridProps) {
  const gridClassName = [styles.grid, className]
    .filter(Boolean)
    .join(" ");

  const style = {
    "--form-grid-columns": columns,
    "--form-grid-gap": `${gap}px`,
  } as CSSProperties;

  return (
    <div className={gridClassName} style={style}>
      {children}
    </div>
  );
}