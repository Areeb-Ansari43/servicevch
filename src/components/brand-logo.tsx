import React from "react";

interface BrandLogoProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  className?: string;
  size?: number | string;
}

export function BrandLogo({ className = "", size, style, alt = "Virtual Car Hire Logo", ...props }: BrandLogoProps) {
  const combinedStyle: React.CSSProperties = {
    ...(size ? { width: size, height: size } : {}),
    ...style,
  };

  return (
    <img
      src="/assets/logo.png"
      onError={(e) => {
        // Fallback if local asset is unavailable
        const target = e.currentTarget;
        if (target.src !== "https://www.virtual-carhire.co.uk/assets/logo.png") {
          target.src = "https://www.virtual-carhire.co.uk/assets/logo.png";
        }
      }}
      alt={alt}
      className={`object-contain ${className}`}
      style={combinedStyle}
      {...props}
    />
  );
}
