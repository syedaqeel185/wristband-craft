import { Link } from "react-router-dom";
import logo from "@/assets/euw/logo.png";

/**
 * EUW brand logo for page headers. Transparent PNG (navy/blue art) — sits on
 * any light header. Links to home by default; pass `to={null}` for a plain image.
 */
export function BrandLogo({
  className = "h-9 md:h-10 w-auto",
  to = "/" as string | null,
}: {
  className?: string;
  to?: string | null;
}) {
  const img = <img src={logo} alt="EUW — Europe Wristbands" className={className} />;
  if (!to) return img;
  return (
    <Link to={to} className="inline-flex items-center shrink-0">
      {img}
    </Link>
  );
}
