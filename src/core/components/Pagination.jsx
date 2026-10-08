export const PAGE_SIZE = 10;

export default function Pagination({ page, totalPages, onPrev, onNext }) {
  if (totalPages <= 1) return null;

  return (
    <div className="nb-pagination">
      <button type="button" className="nb-pagination-btn" onClick={onPrev} disabled={page <= 1}>
        Prev
      </button>
      <span className="nb-pagination-info">
        Page {page} of {totalPages}
      </span>
      <button type="button" className="nb-pagination-btn" onClick={onNext} disabled={page >= totalPages}>
        Next
      </button>
    </div>
  );
}
