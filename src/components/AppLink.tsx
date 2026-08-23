"use client";

import Link, { LinkProps } from "next/link";
import { MouseEvent, ReactNode } from "react";
import { usePathname } from "next/navigation";
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

  const currentUrl = pathname;

  const targetUrl =
    typeof href === "string"
      ? href
      : href.pathname?.toString() || "";

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);

    if (event.defaultPrevented) return;

    /*
     * Ctrl/Cmd/Shift+clique ou o botão do meio abrem em nova
     * aba — a navegação não acontece nesta aba, então a barra
     * de progresso nunca deveria começar (senão fica girando
     * pra sempre, já que o pathname desta aba nunca muda).
     */
    const abreEmOutraAba =
      event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0;

    if (!abreEmOutraAba && targetUrl && targetUrl !== currentUrl) {
      startLoading();
    }
  };

  return (
    <Link href={href} className={className} onClick={handleClick} {...props}>
      {children}
    </Link>
  );
}