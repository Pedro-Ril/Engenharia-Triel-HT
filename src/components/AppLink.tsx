"use client";

import Link, { LinkProps } from "next/link";
import { MouseEvent, ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useRouteLoading } from "./RouteLoadingProvider";

type AppLinkProps = LinkProps & {
  children: ReactNode;
  className?: string;
  title?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

export default function AppLink({
  children,
  className,
  onClick,
  href,
  ...props
}: AppLinkProps) {
  const { startLoading } = useRouteLoading();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentUrl = `${pathname}${
    searchParams?.toString() ? `?${searchParams.toString()}` : ""
  }`;

  const targetUrl =
    typeof href === "string" ? href : href.pathname?.toString() || "";

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);

    if (event.defaultPrevented) return;

    if (targetUrl && targetUrl !== currentUrl) {
      startLoading();
    }
  };

  return (
    <Link href={href} className={className} onClick={handleClick} {...props}>
      {children}
    </Link>
  );
}