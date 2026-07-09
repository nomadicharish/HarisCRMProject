const BRAND_LOGO_SRC = "/talent-acquisition-logo.png";

function BrandLogo({ className = "", showText = true }) {
  return (
    <>
      <img className={className} src={BRAND_LOGO_SRC} alt="" aria-hidden="true" />
      {showText ? <span>Talent Acquisition</span> : null}
    </>
  );
}

export default BrandLogo;
