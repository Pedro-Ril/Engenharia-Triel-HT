import { forwardRef } from "react";
import type {
  CSSProperties,
  HTMLAttributes,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";

import styles from "./Table.module.css";

type CellAlign = "left" | "center" | "right";

interface TableProps
  extends TableHTMLAttributes<HTMLTableElement> {
  minWidth?: number;
}

interface TableHeaderCellProps
  extends ThHTMLAttributes<HTMLTableCellElement> {
  align?: CellAlign;
}

interface TableCellProps
  extends TdHTMLAttributes<HTMLTableCellElement> {
  align?: CellAlign;
}

export function Table({
  children,
  minWidth = 720,
  className = "",
  style,
  ...props
}: TableProps) {
  const tableClassName = [styles.table, className]
    .filter(Boolean)
    .join(" ");

  const tableStyle = {
    "--table-min-width": `${minWidth}px`,
    ...style,
  } as CSSProperties;

  return (
    <div className={styles.wrapper}>
      <table
        className={tableClassName}
        style={tableStyle}
        {...props}
      >
        {children}
      </table>
    </div>
  );
}

export function TableHead({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={[styles.head, className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </thead>
  );
}

export function TableBody({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      className={[styles.body, className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </tbody>
  );
}

export const TableRow = forwardRef<
  HTMLTableRowElement,
  HTMLAttributes<HTMLTableRowElement>
>(function TableRow({ children, className = "", ...props }, ref) {
  return (
    <tr
      ref={ref}
      className={[styles.row, className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </tr>
  );
});

export function TableHeaderCell({
  children,
  align = "left",
  className = "",
  ...props
}: TableHeaderCellProps) {
  return (
    <th
      className={[
        styles.headerCell,
        styles[align],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </th>
  );
}

export function TableCell({
  children,
  align = "left",
  className = "",
  ...props
}: TableCellProps) {
  return (
    <td
      className={[
        styles.cell,
        styles[align],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </td>
  );
}