"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import styles from "./TopRouteLoader.module.css";

type RouteLoadingContextType = {
  startLoading: () => void;
  stopLoading: () => void;
  isLoading: boolean;
};

const RouteLoadingContext = createContext<RouteLoadingContextType | null>(null);

const MIN_LOADING_TIME = 250;

export function RouteLoadingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [isLoading, setIsLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [animate, setAnimate] = useState(false);

  const loadingStartedAt = useRef<number | null>(null);

  const startLoading = useCallback(() => {
    loadingStartedAt.current = Date.now();
    setIsLoading(true);
    setVisible(true);

    requestAnimationFrame(() => {
      setAnimate(true);
    });
  }, []);

  const stopLoading = useCallback(() => {
    const startedAt = loadingStartedAt.current ?? Date.now();
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(MIN_LOADING_TIME - elapsed, 0);

    window.setTimeout(() => {
      setAnimate(false);

      window.setTimeout(() => {
        setVisible(false);
        setIsLoading(false);
        loadingStartedAt.current = null;
      }, 180);
    }, remaining);
  }, []);

  useEffect(() => {
    if (isLoading) {
      stopLoading();
    }
  }, [pathname, searchParams, isLoading, stopLoading]);

  const value = useMemo(
    () => ({
      startLoading,
      stopLoading,
      isLoading,
    }),
    [startLoading, stopLoading, isLoading]
  );

  return (
    <RouteLoadingContext.Provider value={value}>
      {visible && (
        <div className={styles.loaderWrapper}>
          <div
            className={`${styles.loaderBar} ${
              animate ? styles.loaderBarActive : ""
            }`}
          />
        </div>
      )}

      {children}
    </RouteLoadingContext.Provider>
  );
}

export function useRouteLoading() {
  const context = useContext(RouteLoadingContext);

  if (!context) {
    throw new Error(
      "useRouteLoading deve ser usado dentro de RouteLoadingProvider."
    );
  }

  return context;
}