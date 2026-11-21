import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context';
import { Barcode, ErrorBox, Label, LabelPreviewModal, Modal, PriceSourceTag, Spinner, Tag } from '../components/ui';
import { get, patch, post, uploadImage } from '../api';
import { MobileShell } from './MobileHome';
import type { Batch, Classification, Garment, PriceSource, Sample } from '../types';

type Step = 'batch' | 'camera' | 'intake' | 'barcode';

export function AddGarmentScreen() {
  const { categories, money, catName, refreshMeta, bumpDataVersion, toast } = useApp();
  const nav = useNavigate();

  const [step, setStep] = useState<Step>('batch');
  const [batches, setBatches] = useState<Batch[]>([]);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [newBatchName, setNewBatchName] = useState('');
  const [newBatchRef, setNewBatchRef] = useState('');
  const [newBatchPrice, setNewBatchPrice] = useState('');
  const [creatingBatch, setCreatingBatch] = useState(false);

  // Camera / Image state
  const [imageRef, setImageRef] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageLabel, setImageLabel] = useState('');
  const [liveCamOpen, setLiveCamOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopLiveCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setLiveCamOpen(false);
  };

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // AI & Classification state
  const [classifying, setClassifying] = useState(false);
  const [aiResult, setAiResult] = useState<Classification | null>(null);
  const [aiError, setAiError] = useState('');
  const userEditedCategory = useRef(false);
  const classifyAbort = useRef<AbortController | null>(null);

  // Garment form state
  const [categoryId, setCategoryId] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [size, setSize] = useState('M');
  const [color, setColor] = useState('');
  const [brand, setBrand] = useState('');
  const [notes, setNotes] = useState('');
  const [showOptional, setShowOptional] = useState(false);

  // Pricing state
  const [priceMode, setPriceMode] = useState<PriceSource>('category');
  const [overrideInput, setOverrideInput] = useState('');
  const [batchPriceInput, setBatchPriceInput] = useState('');
  const [savingBatchPrice, setSavingBatchPrice] = useState(false);

  // Review & Save state
  const [showReview, setShowReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [createdGarment, setCreatedGarment] = useState<Garment | null>(null);
  const [showLabelModal, setShowLabelModal] = useState(false);

  const leafCategories = categories.filter(c => c.is_leaf && c.active);
  const currentBatch = batches.find(b => b.id === selectedBatchId) ?? null;
  const currentCategory = categories.find(c => c.id === categoryId) ?? null;

  useEffect(() => {
    Promise.all([
      get<{ batches: Batch[] }>('/api/v1/batches'),
      get<{ samples: Sample[] }>('/api/v1/demo/samples'),
    ]).then(([b, s]) => {
      setBatches(b.batches);
      if (b.batches.length > 0) {
        setSelectedBatchId(b.batches[0].id);
        setBatchPriceInput(b.batches[0].default_price != null ? String(b.batches[0].default_price) : '');
      }
      setSamples(s.samples.filter(x => x.intake));
    });
  }, []);

  const selectBatch = (b: Batch) => {
    setSelectedBatchId(b.id);
    setBatchPriceInput(b.default_price != null ? String(b.default_price) : '');
  };

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBatchName.trim()) return;
    setCreatingBatch(true);
    try {
      const dp = newBatchPrice.trim() !== '' ? Number(newBatchPrice) : null;
      const b = await post<Batch>('/api/v1/batches', {
        name: newBatchName.trim(),
        reference: newBatchRef.trim(),
        default_price: dp,
      });
      setBatches(prev => [b, ...prev]);
      selectBatch(b);
      setNewBatchName('');
      setNewBatchRef('');
      setNewBatchPrice('');
      toast(`Batch "${b.name}" ready`);
      setStep('camera');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setCreatingBatch(false);
    }
  };

  const runClassification = async (ref: string) => {
    classifyAbort.current?.abort();
    const ac = new AbortController();
    classifyAbort.current = ac;
    setClassifying(true);
    setAiError('');
    setAiResult(null);
    userEditedCategory.current = false;

    try {
      const res = await post<Classification>('/api/v1/garments/classify', { image_ref: ref }, ac.signal);
      setAiResult(res);
      // SRS §8.3: Do not replace an employee's chosen category with a delayed AI result
      if (!userEditedCategory.current) {
        setCategoryId(res.category);
        if (res.attributes?.color) setColor(res.attributes.color);
      }
      // Set default price mode based on whether batch has default price
      if (currentBatch?.default_price != null) {
        setPriceMode('batch');
      } else {
        setPriceMode('category');
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setAiError((err as Error).message || 'AI suggestion timed out — choose a category manually below.');
      if (!userEditedCategory.current && leafCategories.length > 0 && !categoryId) {
        setCategoryId(leafCategories[0].id);
      }
    } finally {
      setClassifying(false);
    }
  };

  const skipAiAndChooseManual = () => {
    classifyAbort.current?.abort();
    setClassifying(false);
    setAiError('Manual fallback selected — choose the garment category below.');
    if (!categoryId && leafCategories.length > 0) {
      setCategoryId(leafCategories[0].id);
    }
  };

  const chooseSample = (s: Sample) => {
    const ref = `sample:${s.id}`;
    setImageRef(ref);
    setImageUrl(s.image_url);
    setImageLabel(s.label);
    setStep('intake');
    runClassification(ref);
  };

  const onFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const up = await uploadImage(file);
      setImageRef(up.image_ref);
      setImageUrl(up.image_url);
      setImageLabel(file.name);
      setStep('intake');
      runClassification(up.image_ref);
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const startLiveCamera = async () => {
    setLiveCamOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      toast('Device camera unavailable — use sample gallery or file upload', 'info');
      stopLiveCamera();
    }
  };

  const captureLiveFrame = async () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 400;
    canvas.height = videoRef.current.videoHeight || 400;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    stopLiveCamera();
    canvas.toBlob(async blob => {
      if (!blob) return;
      try {
        const up = await uploadImage(blob);
        setImageRef(up.image_ref);
        setImageUrl(up.image_url);
        setImageLabel('Camera capture');
        setStep('intake');
        runClassification(up.image_ref);
      } catch (err) {
        toast((err as Error).message, 'error');
      }
    }, 'image/jpeg', 0.85);
  };

  const handleSelectCategory = (id: string) => {
    userEditedCategory.current = true;
    setCategoryId(id);
    setSubcategory('');
  };

  const updateCurrentBatchPrice = async () => {
    if (!currentBatch) return;
    setSavingBatchPrice(true);
    try {
      const val = batchPriceInput.trim() === '' ? null : Number(batchPriceInput);
      const updated = await patch<Batch>(`/api/v1/batches/${currentBatch.id}`, { default_price: val });
      setBatches(prev => prev.map(b => (b.id === updated.id ? updated : b)));
      if (val != null) {
        setPriceMode('batch');
        toast(`Batch default price set to ${money(val)}`);
      } else {
        if (priceMode === 'batch') setPriceMode('category');
        toast('Batch default price cleared');
      }
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSavingBatchPrice(false);
    }
  };

  // Compute live effective price
  const categoryPrice = currentCategory?.default_price ?? 0;
  const batchPrice = currentBatch?.default_price ?? null;
  const overrideNum = overrideInput.trim() !== '' ? Number(overrideInput) : null;

  let effectivePrice = categoryPrice;
  let effectiveSource: PriceSource = 'category';
  if (priceMode === 'individual' && overrideNum != null && !Number.isNaN(overrideNum)) {
    effectivePrice = overrideNum;
    effectiveSource = 'individual';
  } else if (priceMode === 'batch' && batchPrice != null) {
    effectivePrice = batchPrice;
    effectiveSource = 'batch';
  } else {
    effectivePrice = categoryPrice;
    effectiveSource = 'category';
  }

  const handleCreateGarment = async () => {
    setSaveErr('');
    if (!categoryId) {
      setSaveErr('Please select a garment category');
      return;
    }
    if (priceMode === 'individual' && (overrideNum == null || Number.isNaN(overrideNum) || overrideNum < 0)) {
      setSaveErr('Enter a valid non-negative individual override price');
      return;
    }
    setSaving(true);
    try {
      const attrs: Record<string, string> = {};
      if (size) attrs.size = size;
      if (color) attrs.color = color;
      if (brand) attrs.brand = brand;
      if (subcategory) attrs.subcategory = subcategory;
      if (notes) attrs.notes = notes;

      const created = await post<Garment>('/api/v1/garments', {
        category_id: categoryId,
        batch_id: selectedBatchId,
        image_ref: imageRef,
        price_mode: effectiveSource,
        override_price: effectiveSource === 'individual' ? overrideNum : undefined,
        attributes: attrs,
        ai: aiResult ? {
          suggested: aiResult.category,
          confidence: aiResult.confidence,
          source: aiResult.source,
        } : undefined,
      });
      setCreatedGarment(created);
      setShowReview(false);
      setStep('barcode');
      bumpDataVersion();
      refreshMeta().catch(() => {});
      toast(`Created ${created.barcode}`);
    } catch (err) {
      setSaveErr((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const resetForNextGarment = () => {
    setImageRef('');
    setImageUrl('');
    setImageLabel('');
    setAiResult(null);
    setAiError('');
    setCreatedGarment(null);
    setOverrideInput('');
    setNotes('');
    setBrand('');
    setSubcategory('');
    setStep('camera');
  };

  return (
    <MobileShell title="Add Garment">
      <div className="stack">
        {/* Stepper pill bar */}
        <div className="stepper">
          <button type="button" className={`step-pill ${step === 'batch' ? 'active' : 'done'}`} onClick={() => setStep('batch')}>
            1. Batch
          </button>
          <button
            type="button"
            className={`step-pill ${step === 'camera' ? 'active' : imageRef ? 'done' : ''}`}
            disabled={!selectedBatchId}
            onClick={() => selectedBatchId && setStep('camera')}
          >
            2. Photo
          </button>
          <button
            type="button"
            className={`step-pill ${step === 'intake' ? 'active' : createdGarment ? 'done' : ''}`}
            disabled={!imageRef}
            onClick={() => imageRef && setStep('intake')}
          >
            3. AI &amp; Price
          </button>
          <button
            type="button"
            className={`step-pill ${step === 'barcode' ? 'active' : ''}`}
            disabled={!createdGarment}
            onClick={() => createdGarment && setStep('barcode')}
          >
            4. Barcode
          </button>
        </div>

        {/* STEP 1: BATCH SETUP */}
        {step === 'batch' && (
          <div className="stack" data-testid="step-batch">
            <div className="card">
              <h3>Select Registration Batch</h3>
              <p className="muted small">Group garments registered together and optionally apply a batch default price.</p>
              <div className="batch-list mt-sm">
                {batches.map(b => (
                  <button
                    type="button"
                    key={b.id}
                    data-testid={`select-batch-${b.id}`}
                    className={`batch-item ${selectedBatchId === b.id ? 'selected' : ''}`}
                    onClick={() => selectBatch(b)}
                  >
                    <div className="row between center-v">
                      <b>{b.name}</b>
                      {b.default_price != null ? (
                        <Tag kind="info">Batch default: {money(b.default_price)}</Tag>
                      ) : (
                        <Tag kind="muted">Uses category defaults</Tag>
                      )}
                    </div>
                    <div className="muted tiny mt-xs">
                      {b.branch_name} {b.reference ? `· Ref ${b.reference}` : ''} · {b.garment_count} items
                    </div>
                  </button>
                ))}
              </div>
              <div className="row end mt-sm">
                <button
                  type="button"
                  data-testid="continue-to-camera"
                  className="btn primary full"
                  disabled={!selectedBatchId}
                  onClick={() => setStep('camera')}
                >
                  Continue with "{currentBatch?.name}" →
                </button>
              </div>
            </div>

            <form onSubmit={handleCreateBatch} className="card">
              <h3>Or Create New Demo Batch</h3>
              <div className="stack-sm mt-xs">
                <label className="field">
                  <span>Batch Name *</span>
                  <input
                    data-testid="new-batch-name"
                    value={newBatchName}
                    onChange={e => setNewBatchName(e.target.value)}
                    placeholder="e.g. Weekend Clearance Rack"
                  />
                </label>
                <div className="grid-2">
                  <label className="field">
                    <span>Reference (optional)</span>
                    <input
                      data-testid="new-batch-ref"
                      value={newBatchRef}
                      onChange={e => setNewBatchRef(e.target.value)}
                      placeholder="WK-12"
                    />
                  </label>
                  <label className="field">
                    <span>Batch Default Price (optional)</span>
                    <input
                      data-testid="new-batch-price"
                      type="number"
                      min="0"
                      step="1"
                      value={newBatchPrice}
                      onChange={e => setNewBatchPrice(e.target.value)}
                      placeholder="e.g. 350"
                    />
                  </label>
                </div>
                <button type="submit" data-testid="create-batch-btn" className="btn secondary" disabled={creatingBatch || !newBatchName.trim()}>
                  {creatingBatch ? 'Creating…' : '+ Create & Select Batch'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* STEP 2: CAMERA / SAMPLE SELECTION */}
        {step === 'camera' && (
          <div className="stack" data-testid="step-camera">
            <div className="card">
              <div className="row between center-v">
                <div>
                  <h3>Capture or Select Garment Photo</h3>
                  <p className="muted small">Batch: <b>{currentBatch?.name}</b></p>
                </div>
                <button className="btn xs ghost" onClick={() => setStep('batch')}>Change Batch</button>
              </div>

              <div className="camera-actions mt-sm">
                <button type="button" className="cam-big-btn" onClick={startLiveCamera}>
                  <span className="cam-icon">📸</span>
                  <b>Open Live Camera</b>
                  <span className="muted tiny">Take photograph with device camera</span>
                </button>
                <label className="cam-upload-btn">
                  <span>🖼️ Upload Photo File</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onFileUpload} hidden />
                </label>
              </div>

              {liveCamOpen && (
                <Modal title="Capture Garment Photo" onClose={stopLiveCamera}>
                  <div className="scanner"><video ref={videoRef} muted playsInline /></div>
                  <div className="row end gap mt-sm">
                    <button className="btn ghost" onClick={stopLiveCamera}>Cancel</button>
                    <button className="btn primary" onClick={captureLiveFrame}>📸 Capture Photo</button>
                  </div>
                </Modal>
              )}
            </div>

            <div className="card">
              <div className="row between center-v">
                <h3>Prepared Demo Sample Garments</h3>
                <Tag kind="info">Pitch Ready</Tag>
              </div>
              <p className="muted small">Select any prepared sample image for a fast 20–30 second guided demo.</p>
              <div className="sample-grid mt-sm">
                {samples.map(s => (
                  <button
                    type="button"
                    key={s.id}
                    data-testid={`sample-${s.id}`}
                    className="sample-card"
                    onClick={() => chooseSample(s)}
                  >
                    <img src={s.image_url} alt={s.label} />
                    <div className="sample-label">{s.label}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: AI SUGGESTION + GARMENT DETAILS + PRICING + REVIEW */}
        {step === 'intake' && (
          <div className="stack" data-testid="step-intake">
            {/* Image preview bar */}
            <div className="card row between center-v">
              <div className="row gap center-v">
                <img src={imageUrl} alt={imageLabel} className="thumb-lg" />
                <div>
                  <b>{imageLabel}</b>
                  <div className="muted tiny">Batch: {currentBatch?.name}</div>
                </div>
              </div>
              <button type="button" className="btn xs ghost" onClick={() => setStep('camera')}>Retake / Change</button>
            </div>

            {/* AI Suggestion Panel (SRS §8) */}
            <div className="card ai-card" data-testid="ai-suggestion-panel">
              <div className="row between center-v">
                <div className="row gap-xs center-v">
                  <span className="ai-spark">✨</span>
                  <h3>AI Suggestion</h3>
                </div>
                {aiResult && (
                  <Tag kind={aiResult.is_fallback ? 'warn' : 'info'}>
                    {aiResult.source === 'vision_api' ? 'Vision API' : aiResult.is_fallback ? 'Demo Fallback' : 'Demo Mock Data'}
                  </Tag>
                )}
              </div>

              {classifying && (
                <div className="ai-loading" data-testid="ai-loading">
                  <Spinner label="Analyzing garment image…" />
                  <button type="button" className="btn xs ghost" onClick={skipAiAndChooseManual}>
                    Skip &amp; choose manually
                  </button>
                </div>
              )}

              {aiError && <ErrorBox message={aiError} onRetry={() => runClassification(imageRef)} />}

              {aiResult && !classifying && (
                <div className="stack-sm mt-xs">
                  <div className="ai-notice" data-testid="ai-notice">{aiResult.notice}</div>

                  <div className="ai-recommended">
                    <div className="muted tiny">RECOMMENDED CATEGORY (MODEL ESTIMATE — NOT A GUARANTEE)</div>
                    <div className="row between center-v mt-xs">
                      <button
                        type="button"
                        data-testid={`ai-pick-${aiResult.category}`}
                        className={`ai-main-chip ${categoryId === aiResult.category ? 'selected' : ''}`}
                        onClick={() => handleSelectCategory(aiResult.category)}
                      >
                        <b>{catName(aiResult.category)}</b>
                        <span className="conf-badge">Est. {Math.round(aiResult.confidence * 100)}%</span>
                      </button>
                      {categoryId !== aiResult.category && (
                        <Tag kind="warn">Overridden by employee</Tag>
                      )}
                    </div>
                  </div>

                  {aiResult.alternatives.length > 0 && (
                    <div>
                      <div className="muted tiny">TOP ALTERNATIVES (TAP TO SWITCH)</div>
                      <div className="row wrap gap-xs mt-xs">
                        {aiResult.alternatives.map(alt => (
                          <button
                            type="button"
                            key={alt.category}
                            data-testid={`ai-alt-${alt.category}`}
                            className={`chip ${categoryId === alt.category ? 'selected' : ''}`}
                            onClick={() => handleSelectCategory(alt.category)}
                          >
                            {catName(alt.category)} <span className="muted tiny">({Math.round(alt.score * 100)}%)</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Manual Category Selector (Always visible per SRS §8.3) */}
              <div className="mt-sm pt-sm border-top">
                <label className="field">
                  <span>Manual Category Selection (Employee Control)</span>
                  <select
                    data-testid="manual-category-select"
                    value={categoryId}
                    onChange={e => handleSelectCategory(e.target.value)}
                  >
                    <option value="" disabled>Select category…</option>
                    {leafCategories.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} — Default {money(c.default_price)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {/* Pricing Panel (SRS §9: Category default, Batch default, Individual override) */}
            <div className="card" data-testid="pricing-panel">
              <div className="row between center-v">
                <h3>Pricing Mode</h3>
                <PriceSourceTag source={effectiveSource} />
              </div>
              <p className="muted tiny">AI never sets the price. Choose category default, batch default or individual override.</p>

              <div className="pricing-modes mt-sm">
                {/* 1. Category default */}
                <button
                  type="button"
                  data-testid="price-mode-category"
                  className={`price-mode-card ${effectiveSource === 'category' ? 'selected' : ''}`}
                  onClick={() => setPriceMode('category')}
                >
                  <div className="row between">
                    <b>1. Category Default</b>
                    <b>{money(categoryPrice)}</b>
                  </div>
                  <div className="muted tiny">Default configured for {currentCategory?.name ?? 'selected category'}</div>
                </button>

                {/* 2. Batch default */}
                <div className={`price-mode-card ${effectiveSource === 'batch' ? 'selected' : ''}`}>
                  <div
                    className="row between clickable"
                    data-testid="price-mode-batch"
                    onClick={() => batchPrice != null && setPriceMode('batch')}
                  >
                    <b>2. Batch Default ({currentBatch?.name})</b>
                    <b>{batchPrice != null ? money(batchPrice) : 'Not set'}</b>
                  </div>
                  <div className="row gap-xs mt-xs">
                    <input
                      data-testid="batch-price-input"
                      type="number"
                      min="0"
                      step="1"
                      value={batchPriceInput}
                      onChange={e => setBatchPriceInput(e.target.value)}
                      placeholder="Set batch price (e.g. 350)"
                      className="input-sm"
                    />
                    <button
                      type="button"
                      data-testid="apply-batch-price-btn"
                      className="btn xs secondary"
                      disabled={savingBatchPrice}
                      onClick={updateCurrentBatchPrice}
                    >
                      {savingBatchPrice ? '…' : 'Set Batch Default'}
                    </button>
                  </div>
                </div>

                {/* 3. Individual override */}
                <div className={`price-mode-card ${effectiveSource === 'individual' ? 'selected' : ''}`}>
                  <div
                    className="row between clickable"
                    data-testid="price-mode-individual"
                    onClick={() => setPriceMode('individual')}
                  >
                    <b>3. Individual Override</b>
                    <b>{overrideNum != null && !Number.isNaN(overrideNum) ? money(overrideNum) : 'Enter below'}</b>
                  </div>
                  <div className="row gap-xs mt-xs">
                    <input
                      data-testid="individual-override-input"
                      type="number"
                      min="0"
                      step="1"
                      value={overrideInput}
                      onFocus={() => setPriceMode('individual')}
                      onChange={e => {
                        setOverrideInput(e.target.value);
                        setPriceMode('individual');
                      }}
                      placeholder="Override price for this item only"
                      className="input-sm"
                    />
                    {effectiveSource === 'individual' && (
                      <button
                        type="button"
                        className="btn xs ghost"
                        onClick={() => {
                          setOverrideInput('');
                          setPriceMode(batchPrice != null ? 'batch' : 'category');
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="effective-price-bar mt-sm" data-testid="effective-price-bar">
                <div>
                  <div className="muted tiny">FINAL EFFECTIVE PRICE (SAVED SNAPSHOT)</div>
                  <div className="effective-price-val" data-testid="effective-price-value">{money(effectivePrice)}</div>
                </div>
                <PriceSourceTag source={effectiveSource} />
              </div>
            </div>

            {/* Garment Attributes (Progressively disclosed per SRS §13) */}
            <div className="card">
              <div className="row between center-v">
                <h3>Garment Details</h3>
                <button type="button" className="btn xs ghost" onClick={() => setShowOptional(v => !v)}>
                  {showOptional ? 'Hide optional fields' : '+ Brand, Subcategory & Notes'}
                </button>
              </div>
              <div className="grid-2 mt-xs">
                <label className="field">
                  <span>Size</span>
                  <select data-testid="attr-size" value={size} onChange={e => setSize(e.target.value)}>
                    {['XS', 'S', 'M', 'L', 'XL', 'XXL', '28', '30', '32', '34', '36', 'Free'].map(sz => (
                      <option key={sz} value={sz}>{sz}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Colour</span>
                  <input data-testid="attr-color" value={color} onChange={e => setColor(e.target.value)} placeholder="e.g. blue" />
                </label>
              </div>

              {showOptional && (
                <div className="stack-sm mt-xs">
                  <div className="grid-2">
                    <label className="field">
                      <span>Subcategory</span>
                      <select value={subcategory} onChange={e => setSubcategory(e.target.value)}>
                        <option value="">— Optional —</option>
                        {(currentCategory?.subcategories ?? []).map(sc => (
                          <option key={sc} value={sc}>{sc}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Brand</span>
                      <input data-testid="attr-brand" value={brand} onChange={e => setBrand(e.target.value)} placeholder="e.g. Levi's" />
                    </label>
                  </div>
                  <label className="field">
                    <span>Condition / Notes</span>
                    <input data-testid="attr-notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional inspection note" />
                  </label>
                </div>
              )}
            </div>

            {saveErr && <ErrorBox message={saveErr} />}

            <div className="sticky-cta">
              <button
                type="button"
                data-testid="open-review-btn"
                className="btn secondary"
                disabled={!categoryId || saving}
                onClick={() => setShowReview(true)}
              >
                Review Summary
              </button>
              <button
                type="button"
                data-testid="create-garment-btn"
                className="btn primary grow"
                disabled={!categoryId || saving}
                onClick={handleCreateGarment}
              >
                {saving ? 'Creating Garment…' : `✓ Create Garment · ${money(effectivePrice)}`}
              </button>
            </div>

            {showReview && (
              <Modal title="Review & Save Garment" onClose={() => setShowReview(false)}>
                <div className="stack-sm">
                  <div className="row gap center-v">
                    <img src={imageUrl} alt={imageLabel} className="thumb-lg" />
                    <div>
                      <b>{currentCategory?.name}</b>
                      <div className="muted small">Batch: {currentBatch?.name}</div>
                      <div className="muted small">Size: {size || '—'} · Colour: {color || '—'} {brand ? `· ${brand}` : ''}</div>
                    </div>
                  </div>
                  <div className="effective-price-bar">
                    <div>
                      <div className="muted tiny">COMMITTED PRICE</div>
                      <div className="effective-price-val">{money(effectivePrice)}</div>
                    </div>
                    <PriceSourceTag source={effectiveSource} />
                  </div>
                  {saveErr && <ErrorBox message={saveErr} />}
                  <div className="row end gap">
                    <button className="btn ghost" onClick={() => setShowReview(false)}>Back</button>
                    <button
                      data-testid="confirm-create-garment-btn"
                      className="btn primary"
                      disabled={saving}
                      onClick={handleCreateGarment}
                    >
                      {saving ? 'Saving…' : 'Create Garment & Generate Barcode'}
                    </button>
                  </div>
                </div>
              </Modal>
            )}
          </div>
        )}

        {/* STEP 4: BARCODE RESULT & LABEL PREVIEW */}
        {step === 'barcode' && createdGarment && (
          <div className="stack" data-testid="step-barcode">
            <div className="card center">
              <Tag kind="ok">Garment Registered</Tag>
              <h2 className="mt-xs" data-testid="created-garment-code">{createdGarment.barcode}</h2>
              <p className="muted small">
                {createdGarment.category_name} · {money(createdGarment.price)} (<PriceSourceTag source={createdGarment.price_source} />)
              </p>
              <div className="barcode-box mt-sm">
                <Barcode code={createdGarment.barcode} height={74} />
              </div>

              <div className="grid-2 gap mt-md">
                <button
                  type="button"
                  data-testid="open-label-preview-btn"
                  className="btn secondary"
                  onClick={() => setShowLabelModal(true)}
                >
                  🏷️ Preview Label / Demo Print
                </button>
                <button
                  type="button"
                  data-testid="add-next-garment-btn"
                  className="btn primary"
                  onClick={resetForNextGarment}
                >
                  + Add Next in Batch
                </button>
              </div>

              <div className="row center gap mt-sm">
                <button
                  type="button"
                  data-testid="goto-inventory-item-btn"
                  className="btn xs ghost"
                  onClick={() => nav(`/m/inventory/${createdGarment.id}`)}
                >
                  View in Inventory →
                </button>
                <button
                  type="button"
                  data-testid="goto-checkout-with-item-btn"
                  className="btn xs ghost"
                  onClick={() => nav(`/m/checkout?code=${encodeURIComponent(createdGarment.barcode)}`)}
                >
                  Send to Checkout →
                </button>
              </div>
            </div>

            <div className="card">
              <h3>Physical Sticker Preview</h3>
              <p className="muted tiny">Shows the exact Code 128 barcode stored on the garment record.</p>
              <div className="label-stage mt-xs">
                <Label garment={createdGarment} />
              </div>
            </div>

            {showLabelModal && (
              <LabelPreviewModal garment={createdGarment} onClose={() => setShowLabelModal(false)} />
            )}
          </div>
        )}
      </div>
    </MobileShell>
  );
}
