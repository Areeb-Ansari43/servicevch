import React from "react";

export interface BrandLogoProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  size?: number | string;
  className?: string;
}

export function BrandLogo({
  size = 40,
  className = "",
  alt = "Virtual Car Hire",
  style,
  ...props
}: BrandLogoProps) {
  const dimension = typeof size === "number" ? `${size}px` : size;
  const numSize = typeof size === "number" ? size : undefined;

  return (
    <img
      src="/logo.png"
      alt={alt}
      width={numSize}
      height={numSize}
      style={{ width: dimension, height: dimension, ...style }}
      className={`object-contain ${className}`}
      {...props}
    />
  );
}
