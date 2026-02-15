// ========================================
// CARTAZ DE OFERTA — JavaScript v3.0
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initial Render
    updatePreview();

    // 2. High-Frequency Input Listeners
    // Attaching directly to document to catch dynamically added or existing inputs
    const handleInput = (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
            // Using requestAnimationFrame to keep UI smooth during re-renders
            requestAnimationFrame(updatePreview);
        }
    };

    document.addEventListener('input', handleInput);
    document.addEventListener('change', handleInput);

    // 3. Ensure fonts are ready then refresh
    if (document.fonts) {
        document.fonts.ready.then(() => {
            updatePreview();
        });
    }
});

// --- UI HELPERS ---

function toggleProduct2() {
    const checkbox = document.getElementById('enableProduct2');
    const panel = document.getElementById('product2-panel');
    if (panel) {
        panel.style.display = checkbox.checked ? 'block' : 'none';
    }
    updatePreview();
}

function clearForm() {
    if (!confirm('Deseja limpar todos os campos?')) return;

    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    };

    // Product 1 Defaults
    setVal('bannerText', 'OFERTA');
    setVal('productLine1', 'CERVEJA');
    setVal('productLine2', 'MARCA');
    setVal('productDetail', 'LATA 350ML');
    setVal('unitLabel', 'UNIDADE');
    setVal('unitReais', '4');
    setVal('unitCentavos', '99');
    setVal('unitTemp', 'GELADA');
    setVal('packLabel', 'PACK C/ 24 UN');
    setVal('packReais', '143');
    setVal('packCentavos', '90');
    setVal('packTemp', 'NATURAL QUENTE');

    // Product 2 Defaults
    const s = '_2';
    setVal('bannerText' + s, 'OFERTA');
    setVal('productLine1' + s, 'PRODUTO 2');
    setVal('productLine2' + s, 'MARCA 2');
    setVal('productDetail' + s, 'DETALHE 2');
    setVal('unitLabel' + s, 'UNIDADE');
    setVal('unitReais' + s, '0');
    setVal('unitCentavos' + s, '00');
    setVal('unitTemp' + s, 'GELADA');
    setVal('packLabel' + s, 'PACK C/ 24 UN');
    setVal('packReais' + s, '0');
    setVal('packCentavos' + s, '00');
    setVal('packTemp' + s, 'NATURAL QUENTE');

    // Toggles
    document.getElementById('showUnit').checked = true;
    document.getElementById('showPack').checked = true;
    document.getElementById('enableProduct2').checked = false;

    toggleProduct2();
    updatePreview();
    showToast('✨ Limpo com sucesso!');
}

// --- DATA FETCHING ---

function getData(isP2 = false) {
    const suffix = isP2 ? '_2' : '';

    // Explicit value fetcher (no fallback to P1 to avoid confusion)
    const val = (id) => {
        const el = document.getElementById(id + suffix);
        return el ? el.value : '';
    };

    // Global checkboxes (P1 and P2 share these layout configs)
    const showUnit = document.getElementById('showUnit').checked;
    const showPack = document.getElementById('showPack').checked;

    return {
        banner: val('bannerText') || 'OFERTA',
        product: val('productLine1'),
        brand: val('productLine2'),
        detail: val('productDetail'),
        unitLabel: val('unitLabel'),
        unitReais: val('unitReais') || '0',
        unitCentavos: (val('unitCentavos') || '0').padStart(2, '0'),
        unitTemp: val('unitTemp'),
        packLabel: val('packLabel'),
        packReais: val('packReais') || '0',
        packCentavos: (val('packCentavos') || '0').padStart(2, '0'),
        packTemp: val('packTemp'),
        showUnit: showUnit,
        showPack: showPack
    };
}

// --- RENDER LOGIC ---

function applyLayoutClasses(el, d) {
    el.className = 'cartaz';
    if (d.showUnit && !d.showPack) el.classList.add('only-unit');
    else if (!d.showUnit && d.showPack) el.classList.add('only-pack');
    else if (!d.showUnit && !d.showPack) el.classList.add('only-product');
}

function updatePreview() {
    const stage = document.getElementById('preview-stage');
    if (!stage) return;

    const layout = document.getElementById('printLayout').value;
    const useP2 = document.getElementById('enableProduct2').checked;
    const showP2 = (layout !== '1up' || useP2);

    // Data
    const d1 = getData(false);
    const d2 = getData(true);

    // Poster 1
    const cartaz1 = document.getElementById('cartaz');
    if (cartaz1) {
        if (layout === '2up-split') {
            cartaz1.className = 'cartaz split-layout';
            const dataP2 = useP2 ? d2 : d1;
            cartaz1.innerHTML = `
                <div class="product-half">${buildCartazHTML(d1)}</div>
                <div class="product-half">${buildCartazHTML(dataP2)}</div>
            `;
        } else {
            applyLayoutClasses(cartaz1, d1);
            cartaz1.innerHTML = buildCartazHTML(d1);
        }
        cartaz1.style.transform = 'scale(1)';
    }

    // Poster 2 (Only for non-integrated side-by-side modes)
    let cartaz2 = document.getElementById('cartaz2');
    const isIntegrated = (layout === '2up-split');
    const showSecondary = (layout !== '1up' && !isIntegrated) || (layout === '1up' && useP2 && !isIntegrated);

    if (showSecondary) {
        if (!cartaz2) {
            cartaz2 = document.createElement('div');
            cartaz2.id = 'cartaz2';
            cartaz2.className = 'cartaz';
            stage.appendChild(cartaz2);
        }
        const dataP2 = useP2 ? d2 : d1;
        applyLayoutClasses(cartaz2, dataP2);
        cartaz2.innerHTML = buildCartazHTML(dataP2);
        cartaz2.style.display = 'flex';
        cartaz2.style.transform = 'scale(1)';
    } else if (cartaz2) {
        cartaz2.style.display = 'none';
    }

    // Positioning and Scaling
    const useColumn = (layout === '2up-stacked');
    stage.style.flexDirection = useColumn ? 'column' : 'row';
    const GAP = 0;
    stage.style.gap = GAP + 'px';

    // Auto-scale to fit preview area
    const scale = (layout === '1up' && !useP2) ? 0.4 : 0.25;
    stage.style.transform = `scale(${scale})`;

    // Adjust wrapper height to remove empty space below scaled content
    const wrapper = stage.parentElement;
    if (wrapper) {
        const A4_W = 210 * 3.78; // ~794px
        const A4_H = 297 * 3.78; // ~1123px
        const GAP_VAL = 0;
        const PADDING = 20; // 10px each side

        let contentW = A4_W;
        let contentH = A4_H;

        // Determination of content size
        const twoSeparateVisible = showSecondary;

        if (twoSeparateVisible) {
            if (layout === '2up-stacked') {
                contentH = (A4_H * 2) + GAP_VAL;
            } else {
                contentW = (A4_W * 2) + GAP_VAL;
            }
        } else if (isIntegrated) {
            // Already A4
            contentW = A4_W;
            contentH = A4_H;
        }

        // Set stage size explicitly
        stage.style.width = contentW + 'px';
        stage.style.height = contentH + 'px';

        // Wrapper dimensions (scaled content + padding)
        wrapper.style.width = (contentW * scale + PADDING) + 'px';
        wrapper.style.height = (contentH * scale + PADDING) + 'px';
        wrapper.style.display = 'block';

        // Ensure stage is at the top-left of the wrapper (considering padding)
        stage.style.position = 'absolute';
        stage.style.left = '10px';
        stage.style.top = '10px';
        wrapper.style.position = 'relative';
    }
}

function buildCartazHTML(d) {
    const brushSVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100%25' height='100%25' fill='%23ffff00'/%3E%3C/svg%3E";

    // Re-check for empty labels to hide them
    const unitLabelHTML = d.unitLabel ? `<div class="unit-label">${esc(d.unitLabel)}</div>` : '';
    const packLabelHTML = d.packLabel ? `<div class="pack-label">${esc(d.packLabel)}</div>` : '';

    let html = `
        <div class="banner-container">
            <img class="banner-bg" src="${brushSVG}">
            <div class="banner-text">${esc(d.banner)}</div>
        </div>
        <div class="product-line-1">${esc(d.product)}</div>
        <div class="product-line-2">${esc(d.brand)}</div>
        <div class="product-detail">${esc(d.detail)}</div>
        <div class="separator-line"></div>
    `;

    if (d.showUnit) {
        html += `
        <div class="unit-section">
            ${unitLabelHTML}
            <div class="unit-price-container">
                <img class="unit-price-bg" src="${brushSVG}">
                <div class="unit-price-text">${esc(d.unitReais)},${esc(d.unitCentavos)}</div>
            </div>
            <div class="temp-label">${esc(d.unitTemp)}</div>
        </div>`;
    }

    if (d.showPack) {
        html += `
        <div class="pack-section">
            ${packLabelHTML}
            <div class="pack-price-container">
                <img class="pack-price-bg" src="${brushSVG}">
                <div class="pack-price-text">${esc(d.packReais)},${esc(d.packCentavos)}</div>
            </div>
            <div class="temp-label">${esc(d.packTemp)}</div>
        </div>`;
    }

    return html;
}

// --- PRINTING ---

async function printA4() {
    const btn = document.querySelector('.btn-print');
    if (btn.disabled) return;

    const d1 = getData(false);
    const d2 = getData(true);
    const useP2 = document.getElementById('enableProduct2').checked;
    const layout = document.getElementById('printLayout').value;

    btn.disabled = true;
    btn.innerHTML = '⌛ Processando...';
    showToast('🖨️ Preparando alta qualidade...');

    const hiddenTarget = document.getElementById('hidden-capture-target');

    const capture = async (data, isDual = false) => {
        if (isDual) {
            hiddenTarget.className = 'cartaz split-layout';
            const d2Local = useP2 ? d2 : d1;
            hiddenTarget.innerHTML = `
                <div class="product-half">${buildCartazHTML(d1)}</div>
                <div class="product-half">${buildCartazHTML(d2Local)}</div>
            `;
        } else {
            applyLayoutClasses(hiddenTarget, data);
            hiddenTarget.innerHTML = buildCartazHTML(data);
        }

        await document.fonts.ready;
        await new Promise(r => setTimeout(r, 100));

        const canvas = await html2canvas(hiddenTarget, {
            scale: 3,
            useCORS: true,
            backgroundColor: null,
            width: 794,
            height: 1122
        });
        return canvas.toDataURL('image/png');
    };

    try {
        if (layout === '2up-split') {
            const imgCombined = await capture(d1, true);
            const printWindow = window.open('', '_blank');
            if (printWindow) {
                const style = '@page { size: A4 portrait; margin: 0; } body { margin: 0; padding: 0; } img { width: 100%; height: 100%; object-fit: contain; }';
                printWindow.document.write(`<html><head><style>${style}</style></head><body>
                    <img src="${imgCombined}">
                    <script>window.onload=()=>{ setTimeout(()=>{window.print(); window.close();}, 500); };</script>
                </body></html>`);
                printWindow.document.close();
            }
            return;
        }

        const img1 = await capture(d1);
        const img2 = useP2 ? await capture(d2) : img1;

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert('Popup bloqueado! Por favor permita popups.');
        } else {
            let style = '';
            if (layout === '2up') {
                // Side-by-side on Landscape A4
                style = '@page { size: A4 landscape; margin: 0; } html, body { margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; height: 100vh; gap: 0; } img { width: 50%; height: 100%; object-fit: contain; }';
            } else if (layout === '2up-stacked') {
                // Top/Bottom on Portrait A4
                style = '@page { size: A4 portrait; margin: 0; } html, body { margin: 0; padding: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; gap: 0; } img { height: 50%; width: 100%; object-fit: contain; }';
            } else {
                // Full A4
                style = '@page { size: A4 portrait; margin: 0; } body { margin: 0; padding: 0; } img { width: 100%; height: 100%; object-fit: contain; }';
            }

            printWindow.document.write(`<html><head><style>${style}</style></head><body>
                <img src="${img1}">${(layout !== '1up') ? `<img src="${img2}">` : ''}
                <script>window.onload=()=>{ setTimeout(()=>{window.print(); window.close();}, 500); };</script>
            </body></html>`);
            printWindow.document.close();
        }
    } catch (e) {
        console.error(e);
        alert('Erro ao gerar impressão.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '🖨️ Imprimir A4';
        const t = document.getElementById('toast');
        if (t) t.classList.remove('show');
        updatePreview(); // Final sync
    }
}

// --- UTILS ---

function esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

function showToast(msg) {
    const t = document.getElementById('toast');
    const m = document.getElementById('toastMsg');
    if (t && m) {
        m.textContent = msg;
        t.classList.add('show');
        clearTimeout(window._tt);
        window._tt = setTimeout(() => t.classList.remove('show'), 4000);
    }
}
