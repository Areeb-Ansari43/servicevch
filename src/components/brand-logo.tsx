import React from "react";

export interface BrandLogoProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  size?: number | string;
  className?: string;
}

export function BrandLogo({ size = 40, className = "", alt = "Virtual Car Hire Logo", ...props }: BrandLogoProps) {
  const dimension = typeof size === "number" ? `${size}px` : size;
  return (
    <img
      src="/brand-logo.png"
      alt={alt}
      width={typeof size === "number" ? size : undefined}
      height={typeof size === "number" ? size : undefined}
      style={{ width: dimension, height: dimension }}
      className={`object-contain rounded-xl ${className}`}
      {...props}
    />
  );
}
