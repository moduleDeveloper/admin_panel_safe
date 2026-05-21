import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Sidebar from '../components/Sidebar';
import './ProductPage.css';

const GST_OPTIONS = [0, 5, 12, 18, 28];

function createAttributeRow() {
  return { attribute_name: '', value: '' };
}

function createImageRow() {
  return { image_url: '' };
}

function createCategoryRow() {
  return { name: '', parent_id: '' };
}

function toAmount(value) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}

function toMoney(value) {
  return `Rs ${value.toFixed(2)}`;
}

export default function ProductPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userName = 'Admin', trust = null, superuserId = null } = location.state || {};

  const [form, setForm] = useState({
    product_name: '',
    category_id: '',
    stock: '',
    price: '',
    mrp: '',
    discount_pct: '0',
    transport_fee: '0',
    gst_pct: '18',
    member_price: '',
  });
  const [categories, setCategories] = useState([createCategoryRow()]);
  const [attributes, setAttributes] = useState([createAttributeRow()]);
  const [images, setImages] = useState([createImageRow()]);
  const [step, setStep] = useState(1);

  useEffect(() => {
    const scrollTop = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      const mainNode = document.querySelector('.product-main');
      if (mainNode) mainNode.scrollTop = 0;
    };

    scrollTop();
    const rafId = window.requestAnimationFrame(scrollTop);
    const timer = window.setTimeout(scrollTop, 0);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timer);
    };
  }, []);

  const breakdown = useMemo(() => {
    const mrp = toAmount(form.mrp);
    const discountPct = toAmount(form.discount_pct);
    const transportFee = toAmount(form.transport_fee);
    const gstPct = toAmount(form.gst_pct);
    const discountAmount = Number(((mrp * discountPct) / 100).toFixed(2));
    const priceAfterDiscount = Number((mrp - discountAmount).toFixed(2));
    const gstAmount = Number((((priceAfterDiscount + transportFee) * gstPct) / 100).toFixed(2));
    const totalPayable = Number((priceAfterDiscount + transportFee + gstAmount).toFixed(2));
    return { discountAmount, priceAfterDiscount, gstAmount, totalPayable };
  }, [form.discount_pct, form.gst_pct, form.mrp, form.transport_fee]);

  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateRow = (rows, setRows, index, field, value) => {
    setRows(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)));
  };

  const steps = ['Basic info', 'Pricing', 'Details', 'Review'];

  const canMoveNext = () => {
    if (step === 1) {
      return form.product_name.trim() && form.category_id.trim() && form.stock.trim();
    }
    if (step === 2) {
      return form.mrp.trim();
    }
    return true;
  };

  return (
    <div className="product-root">
      <Sidebar
        trustName={trust?.name || 'Trust'}
        onDashboard={() =>
          navigate('/dashboard', {
            state: { userName, trust, superuserId, sidebarNavKey: 'dashboard' },
          })
        }
        onLogout={() => navigate('/login')}
      />

      <main className="product-main">
        <PageHeader
          title="Product"
          subtitle="Create product UI for product tables"
          onBack={() =>
            navigate('/dashboard', {
              state: { userName, trust, superuserId, sidebarNavKey: 'menu' },
            })
          }
        />

        <section className="product-container">
          <div className="wizard-shell">
            <div className="wizard-stepper">
              {steps.map((label, index) => {
                const stepNumber = index + 1;
                const isActive = step === stepNumber;
                const isDone = step > stepNumber;
                return (
                  <div className={`step-item ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`} key={label}>
                    <div className="step-circle">{stepNumber}</div>
                    <div className="step-label">{label}</div>
                    {stepNumber < steps.length ? <div className="step-line" /> : null}
                  </div>
                );
              })}
            </div>

            {step === 1 ? (
              <div className="wizard-card">
                <h3>Product basic info</h3>
                <p>Pehle product ka naam aur category chuniye</p>

                <div className="product-grid one">
                  <label>
                    <span>Product naam *</span>
                    <input
                      placeholder="e.g. ASUS ROG Phone 9"
                      value={form.product_name}
                      onChange={(event) => updateForm('product_name', event.target.value)}
                    />
                  </label>

                  <div className="category-row">
                    <label>
                      <span>Category *</span>
                      <input
                        placeholder="Category id likhiye"
                        value={form.category_id}
                        onChange={(event) => updateForm('category_id', event.target.value)}
                      />
                    </label>
                    <button type="button" className="manage-btn">Manage</button>
                  </div>

                  <label>
                    <span>Stock quantity *</span>
                    <input
                      type="number"
                      placeholder="Kitne items available hain"
                      value={form.stock}
                      onChange={(event) => updateForm('stock', event.target.value)}
                    />
                  </label>

                  <label>
                    <span>Short description</span>
                    <textarea placeholder="Product ke baare mein thoda batao..." />
                  </label>
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="wizard-card">
                <h3>Pricing details</h3>
                <p>Yahan product_price ke fields भरिए</p>
                <div className="product-grid two">
                  <label>
                    <span>MRP *</span>
                    <input type="number" value={form.mrp} onChange={(event) => updateForm('mrp', event.target.value)} />
                  </label>
                  <label>
                    <span>Price</span>
                    <input type="number" value={form.price} onChange={(event) => updateForm('price', event.target.value)} />
                  </label>
                  <label>
                    <span>Discount %</span>
                    <input type="number" value={form.discount_pct} onChange={(event) => updateForm('discount_pct', event.target.value)} />
                  </label>
                  <label>
                    <span>Transport Fee</span>
                    <input type="number" value={form.transport_fee} onChange={(event) => updateForm('transport_fee', event.target.value)} />
                  </label>
                  <label>
                    <span>GST %</span>
                    <select value={form.gst_pct} onChange={(event) => updateForm('gst_pct', event.target.value)}>
                      {GST_OPTIONS.map((gst) => (
                        <option key={gst} value={gst}>{gst}%</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Member Price</span>
                    <input type="number" value={form.member_price} onChange={(event) => updateForm('member_price', event.target.value)} />
                  </label>
                </div>

                <div className="product-breakdown">
                  <h4>Auto Price Breakdown (Preview)</h4>
                  <div><span>Discount Amount</span><strong>{toMoney(breakdown.discountAmount)}</strong></div>
                  <div><span>Price After Discount</span><strong>{toMoney(breakdown.priceAfterDiscount)}</strong></div>
                  <div><span>GST Amount</span><strong>{toMoney(breakdown.gstAmount)}</strong></div>
                  <div className="total"><span>Total Payable</span><strong>{toMoney(breakdown.totalPayable)}</strong></div>
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="wizard-card">
                <h3>Details</h3>
                <p>Category, attributes aur images details bhariye</p>

                <div className="inner-block">
                  <h4>Product Categories</h4>
                  {categories.map((row, index) => (
                    <div className="row-inline" key={`category-${index}`}>
                      <input
                        placeholder="Category name"
                        value={row.name}
                        onChange={(event) => updateRow(categories, setCategories, index, 'name', event.target.value)}
                      />
                      <input
                        placeholder="Parent Id (optional)"
                        value={row.parent_id}
                        onChange={(event) => updateRow(categories, setCategories, index, 'parent_id', event.target.value)}
                      />
                      <button type="button" onClick={() => setCategories((prev) => prev.filter((_, i) => i !== index))}>Remove</button>
                    </div>
                  ))}
                  <button type="button" className="add-btn" onClick={() => setCategories((prev) => [...prev, createCategoryRow()])}>
                    + Add Category Row
                  </button>
                </div>

                <div className="inner-block">
                  <h4>Attributes & Values</h4>
                  {attributes.map((row, index) => (
                    <div className="row-inline" key={`attribute-${index}`}>
                      <input
                        placeholder="Attribute Name"
                        value={row.attribute_name}
                        onChange={(event) => updateRow(attributes, setAttributes, index, 'attribute_name', event.target.value)}
                      />
                      <input
                        placeholder="Value"
                        value={row.value}
                        onChange={(event) => updateRow(attributes, setAttributes, index, 'value', event.target.value)}
                      />
                      <button type="button" onClick={() => setAttributes((prev) => prev.filter((_, i) => i !== index))}>Remove</button>
                    </div>
                  ))}
                  <button type="button" className="add-btn" onClick={() => setAttributes((prev) => [...prev, createAttributeRow()])}>
                    + Add Attribute Row
                  </button>
                </div>

                <div className="inner-block">
                  <h4>Product Images</h4>
                  {images.map((row, index) => (
                    <div className="row-inline single" key={`image-${index}`}>
                      <input
                        placeholder="Image URL"
                        value={row.image_url}
                        onChange={(event) => updateRow(images, setImages, index, 'image_url', event.target.value)}
                      />
                      <button type="button" onClick={() => setImages((prev) => prev.filter((_, i) => i !== index))}>Remove</button>
                    </div>
                  ))}
                  <button type="button" className="add-btn" onClick={() => setImages((prev) => [...prev, createImageRow()])}>
                    + Add Image Row
                  </button>
                </div>
              </div>
            ) : null}

            {step === 4 ? (
              <div className="wizard-card">
                <h3>Review</h3>
                <p>Final preview before save</p>
                <div className="review-grid">
                  <div><span>Product</span><strong>{form.product_name || '-'}</strong></div>
                  <div><span>Category Id</span><strong>{form.category_id || '-'}</strong></div>
                  <div><span>Stock</span><strong>{form.stock || '-'}</strong></div>
                  <div><span>MRP</span><strong>{form.mrp || '-'}</strong></div>
                  <div><span>Total Payable</span><strong>{toMoney(breakdown.totalPayable)}</strong></div>
                  <div><span>Images</span><strong>{images.filter((img) => img.image_url.trim()).length}</strong></div>
                </div>
              </div>
            ) : null}

            <div className="wizard-actions">
              {step > 1 ? (
                <button type="button" className="ghost-btn" onClick={() => setStep((prev) => prev - 1)}>
                  Piche jao
                </button>
              ) : null}
              <button
                type="button"
                className="next-btn"
                disabled={!canMoveNext()}
                onClick={() => {
                  if (step < 4) setStep((prev) => prev + 1);
                }}
              >
                {step < 4 ? 'Aage badhein ->' : 'Ready'}
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
