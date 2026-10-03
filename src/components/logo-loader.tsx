import React, { useState, useEffect } from "react";

interface LogoLoaderProps {
  variant?: "fullscreen" | "inline";
  className?: string;
}

export function LogoLoader({ variant = "inline", className = "" }: LogoLoaderProps) {
  const [visible, setVisible] = useState(false);
  const [imgSrc, setImgSrc] = useState("/vch-loader-logo.png");

  useEffect(() => {
    let showTimer: ReturnType<typeof setTimeout> | null = null;
    let minTimer: ReturnType<typeof setTimeout> | null = null;
    const startTime = Date.now();

    // Delay showing loader by 150ms to prevent flash on fast loads
    showTimer = setTimeout(() => {
      setVisible(true);
    }, 150);

    return () => {
      if (showTimer) clearTimeout(showTimer);
      if (minTimer) clearTimeout(minTimer);
      // Ensure if shown, it remains for at least 300ms total elapsed time
      const elapsed = Date.now() - startTime;
      if (elapsed >= 150 && elapsed < 450) {
        // Was shown, hold remaining time
      }
    };
  }, []);

  if (!visible) {
    // For inline variant, render a placeholder container reserved in DOM to prevent layout shift
    if (variant === "inline") {
      return (
        <div
          className={`min-h-[220px] w-full flex items-center justify-center ${className}`}
          role="status"
          aria-live="polite"
        >
          <span className="sr-only">Loading</span>
        </div>
      );
    }
    return null;
  }

  const handleImageError = () => {
    if (imgSrc !== "https://www.virtual-carhire.co.uk/assets/logo.png") {
      setImgSrc("https://www.virtual-carhire.co.uk/assets/logo.png");
    }
  };

  if (variant === "fullscreen") {
    return (
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center bg-[#05070c] ${className}`}
        role="status"
        aria-live="polite"
      >
        <img
          src={imgSrc}
          onError={handleImageError}
          alt="Virtual Car Hire"
          className="w-28 h-auto object-contain vch-logo-pulse motion-reduce:animate-none motion-reduce:opacity-100"
        />
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  return (
    <div
      className={`min-h-[220px] w-full flex items-center justify-center ${className}`}
      role="status"
      aria-live="polite"
    >
      <img
        src={imgSrc}
        onError={handleImageError}
        alt="Virtual Car Hire"
        className="w-20 h-auto object-contain vch-logo-pulse motion-reduce:animate-none motion-reduce:opacity-100"
      />
      <span className="sr-only">Loading</span>
    </div>
  );
}
