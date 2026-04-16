import alphaGraphLogo from "../alphagraphlogo.png";

export function BrandLogo({
  size,
  radius,
}: {
  size: number;
  radius?: number;
}) {
  return (
    <img
      src={alphaGraphLogo}
      alt="AlphaGraph logo"
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        borderRadius: radius ?? Math.round(size * 0.26),
        objectFit: "cover",
        flexShrink: 0,
        display: "block",
      }}
    />
  );
}
