import './PageHeader.css';

export default function PageHeader({ title, subtitle, onBack, right }) {
  return (
    <div className="ph-header">
      <button className="ph-back" onClick={onBack}>
        ← Back
      </button>
      <div className="ph-titles">
        <h1 className="ph-title">{title}</h1>
        {subtitle && <p className="ph-subtitle">{subtitle}</p>}
      </div>
      <div className="ph-right">
        {right}
      </div>
    </div>
  );
}
