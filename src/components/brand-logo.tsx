import React, { useState } from "react";

interface BrandLogoProps {
  className?: string;
  style?: React.CSSProperties;
  alt?: string;
}

const LOCAL_LOGO = "/vch-brand-logo.png";
const FALLBACK_LOGO = "https://www.virtual-carhire.co.uk/assets/logo.png";

export function BrandLogo({ className = "h-8 w-auto", style, alt = "Virtual Car Hire" }: BrandLogoProps) {
  const [imgSrc, setImgSrc] = useState(LOCAL_LOGO);

  return (
    <img
      src={imgSrc}
      alt={alt}
      onError={() => {
        if (imgSrc !== FALLBACK_LOGO) {
          setImgSrc(FALLBACK_LOGO);
        }
      }}
      className={`object-contain ${className}`}
      style={style}
    />
  );
}
