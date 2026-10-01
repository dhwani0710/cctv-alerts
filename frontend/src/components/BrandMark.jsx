export default function BrandMark({ size = 40, withName = false }) {
  return (
    <div className="brandmark">
      <span
        className="brandmark__tile"
        style={{ width: size, height: size, fontSize: size * 0.6 }}
        aria-hidden="true"
      >
        e
      </span>
      {withName && <span className="brandmark__name">eSamyak</span>}
    </div>
  );
}