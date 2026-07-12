/** 將 design tokens 注入 document，只注入一次 */
let injected = false

export function ensureTokens(): void {
  if (injected || typeof document === 'undefined') return
  if (document.getElementById('sigil-tokens')) {
    injected = true
    return
  }
  const style = document.createElement('style')
  style.id = 'sigil-tokens'
  // 與 tokens.css 同步的精簡內嵌，避免打包需額外 CSS loader
  style.textContent = `
:root,.sigil-app{--sigil-color-bg:#f1f5f9;--sigil-color-surface:#fff;--sigil-color-surface-2:#f8fafc;--sigil-color-border:#e2e8f0;--sigil-color-border-strong:#cbd5e1;--sigil-color-text:#0f172a;--sigil-color-muted:#64748b;--sigil-color-accent:#4f46e5;--sigil-color-accent-hover:#4338ca;--sigil-color-accent-soft:rgba(79,70,229,.1);--sigil-color-danger:#dc2626;--sigil-color-danger-soft:#fef2f2;--sigil-color-focus:#6366f1;--sigil-color-canvas:#fff;--sigil-radius-sm:6px;--sigil-radius-md:10px;--sigil-space-1:4px;--sigil-space-2:8px;--sigil-space-3:12px;--sigil-space-4:16px;--sigil-font-sans:system-ui,-apple-system,"Segoe UI",sans-serif;--sigil-font-size-sm:12px;--sigil-font-size-md:13px;--sigil-font-size-lg:15px;--sigil-shadow-sm:0 1px 2px rgba(15,23,42,.06);--sigil-shadow-md:0 4px 12px rgba(15,23,42,.08);--sigil-topbar-h:48px;--sigil-status-h:32px;--sigil-sidebar-w:200px;--sigil-inspector-w:280px;--sigil-z-overlay:20}
.sigil-app{box-sizing:border-box;display:flex;flex-direction:column;height:100%;min-height:560px;font-family:var(--sigil-font-sans);font-size:var(--sigil-font-size-md);color:var(--sigil-color-text);background:var(--sigil-color-bg);border:1px solid var(--sigil-color-border);border-radius:var(--sigil-radius-md);overflow:hidden;box-shadow:var(--sigil-shadow-md)}
.sigil-app *,.sigil-app *::before,.sigil-app *::after{box-sizing:border-box}
.sigil-topbar{display:flex;align-items:center;gap:var(--sigil-space-2);min-height:var(--sigil-topbar-h);padding:0 var(--sigil-space-3);background:var(--sigil-color-surface);border-bottom:1px solid var(--sigil-color-border);flex-shrink:0}
.sigil-topbar-brand{font-weight:700;font-size:var(--sigil-font-size-lg);letter-spacing:-.02em;margin-right:var(--sigil-space-2);color:var(--sigil-color-accent)}
.sigil-topbar-group{display:flex;align-items:center;gap:var(--sigil-space-1)}
.sigil-topbar-spacer{flex:1}
.sigil-topbar-sep{width:1px;height:20px;background:var(--sigil-color-border);margin:0 var(--sigil-space-1)}
.sigil-body{display:flex;flex:1;min-height:0}
.sigil-sidebar{width:var(--sigil-sidebar-w);flex-shrink:0;display:flex;flex-direction:column;gap:var(--sigil-space-2);padding:var(--sigil-space-3);background:var(--sigil-color-surface);border-right:1px solid var(--sigil-color-border);overflow:auto}
.sigil-sidebar-title{margin:0;font-size:var(--sigil-font-size-sm);font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--sigil-color-muted)}
.sigil-canvas-wrap{flex:1;min-width:0;display:flex;flex-direction:column;padding:var(--sigil-space-3);background:var(--sigil-color-bg);position:relative}
.sigil-canvas-host{flex:1;min-height:0;background:var(--sigil-color-surface-2);border-radius:var(--sigil-radius-md);padding:var(--sigil-space-3);box-shadow:inset 0 0 0 1px var(--sigil-color-border)}
.sigil-inspector-wrap{width:var(--sigil-inspector-w);flex-shrink:0;display:flex;flex-direction:column;background:var(--sigil-color-surface);border-left:1px solid var(--sigil-color-border);overflow:hidden}
.sigil-layers-box{height:160px;overflow:auto;border-bottom:1px solid var(--sigil-color-border);padding:var(--sigil-space-2)}
.sigil-inspector{flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden}
.sigil-inspector-body{flex:1;overflow:auto;padding:var(--sigil-space-3)}
.sigil-inspector-head{font-size:var(--sigil-font-size-sm);color:var(--sigil-color-muted);margin-bottom:var(--sigil-space-3);word-break:break-all}
.sigil-status{display:flex;align-items:center;gap:var(--sigil-space-3);min-height:var(--sigil-status-h);padding:0 var(--sigil-space-3);font-size:var(--sigil-font-size-sm);color:var(--sigil-color-muted);background:var(--sigil-color-surface);border-top:1px solid var(--sigil-color-border);flex-shrink:0}
.sigil-status-dirty{color:var(--sigil-color-accent);font-weight:600}
.sigil-btn{appearance:none;border:1px solid var(--sigil-color-border);background:var(--sigil-color-surface);color:var(--sigil-color-text);border-radius:var(--sigil-radius-sm);padding:5px 10px;font-size:var(--sigil-font-size-sm);font-family:inherit;cursor:pointer;line-height:1.3;box-shadow:var(--sigil-shadow-sm)}
.sigil-btn:hover:not(:disabled){border-color:var(--sigil-color-border-strong);background:var(--sigil-color-surface-2)}
.sigil-btn:disabled{opacity:.45;cursor:not-allowed}
.sigil-btn--primary{background:var(--sigil-color-accent);border-color:var(--sigil-color-accent);color:#fff}
.sigil-btn--primary:hover:not(:disabled){background:var(--sigil-color-accent-hover);border-color:var(--sigil-color-accent-hover)}
.sigil-btn--ghost{box-shadow:none;background:transparent}
.sigil-btn--ghost[aria-pressed=true],.sigil-btn--active{background:var(--sigil-color-accent-soft);border-color:var(--sigil-color-accent);color:var(--sigil-color-accent);font-weight:600}
.sigil-btn--danger{background:var(--sigil-color-danger-soft);border-color:#fecaca;color:var(--sigil-color-danger)}
.sigil-input{width:100%;border:1px solid var(--sigil-color-border);border-radius:var(--sigil-radius-sm);padding:6px 8px;font:inherit;font-size:var(--sigil-font-size-sm);background:var(--sigil-color-surface);color:var(--sigil-color-text)}
.sigil-input:focus{outline:2px solid var(--sigil-color-focus);outline-offset:1px}
.sigil-field{display:flex;flex-direction:column;gap:4px;margin-bottom:var(--sigil-space-3)}
.sigil-field-label{font-size:var(--sigil-font-size-sm);color:var(--sigil-color-muted)}
.sigil-section-title{margin:var(--sigil-space-2) 0;font-size:var(--sigil-font-size-sm);font-weight:600}
.sigil-muted{color:var(--sigil-color-muted);font-size:var(--sigil-font-size-sm);margin:0}
.sigil-empty{padding:var(--sigil-space-4) var(--sigil-space-2);text-align:center}
.sigil-tabs{display:flex;border-bottom:1px solid var(--sigil-color-border);background:var(--sigil-color-surface-2);flex-shrink:0}
.sigil-tab{flex:1;border:none;background:transparent;padding:10px 6px;font:inherit;font-size:var(--sigil-font-size-sm);color:var(--sigil-color-muted);cursor:pointer;border-bottom:2px solid transparent}
.sigil-tab--active{color:var(--sigil-color-accent);font-weight:600;border-bottom-color:var(--sigil-color-accent);background:var(--sigil-color-surface)}
.sigil-blocks-panel{display:flex;flex-direction:column;gap:var(--sigil-space-2);flex:1;min-height:0}
.sigil-blocks-list{display:flex;flex-direction:column;gap:6px;overflow:auto}
.sigil-blocks-category{font-size:11px;font-weight:600;color:var(--sigil-color-muted);text-transform:uppercase;letter-spacing:.04em;margin:8px 0 4px}
.sigil-block-item{display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--sigil-color-border);border-radius:var(--sigil-radius-sm);background:var(--sigil-color-surface-2);cursor:grab;user-select:none;font-size:var(--sigil-font-size-sm)}
.sigil-block-item:hover{border-color:var(--sigil-color-accent);background:var(--sigil-color-accent-soft)}
.sigil-block-icon{flex-shrink:0;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:14px;background:var(--sigil-color-surface);border-radius:4px;border:1px solid var(--sigil-color-border)}
.sigil-block-label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sigil-help-panel{position:absolute;right:var(--sigil-space-4);top:calc(var(--sigil-topbar-h) + var(--sigil-space-2));z-index:var(--sigil-z-overlay);width:260px;padding:var(--sigil-space-3);background:var(--sigil-color-surface);border:1px solid var(--sigil-color-border);border-radius:var(--sigil-radius-md);box-shadow:var(--sigil-shadow-md);font-size:var(--sigil-font-size-sm);line-height:1.5}
.sigil-help-panel h4{margin:0 0 var(--sigil-space-2)}
.sigil-help-panel ul{margin:0;padding-left:1.1em}
.sigil-export-out{width:100%;min-height:72px;margin-top:var(--sigil-space-2);font-family:ui-monospace,monospace;font-size:11px;border:1px solid var(--sigil-color-border);border-radius:var(--sigil-radius-sm);padding:var(--sigil-space-2);resize:vertical}
.sigil-field-row{display:flex;gap:6px;align-items:center}
.sigil-field-row .sigil-input{flex:1}
.sigil-img-preview{max-width:100%;max-height:120px;object-fit:contain;border:1px solid var(--sigil-color-border);border-radius:var(--sigil-radius-sm);background:var(--sigil-color-surface-2)}
.sigil-media-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;z-index:1000}
.sigil-media-panel{width:min(520px,92vw);max-height:80vh;overflow:auto;background:var(--sigil-color-surface);border-radius:var(--sigil-radius-md);box-shadow:var(--sigil-shadow-md);padding:var(--sigil-space-3);display:flex;flex-direction:column;gap:var(--sigil-space-3)}
.sigil-media-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.sigil-media-head h3{margin:0;font-size:var(--sigil-font-size-lg)}
.sigil-media-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px}
.sigil-media-card{border:1px solid var(--sigil-color-border);border-radius:var(--sigil-radius-sm);background:var(--sigil-color-surface-2);padding:6px;cursor:pointer;display:flex;flex-direction:column;gap:4px;font:inherit;color:inherit}
.sigil-media-card img{width:100%;height:72px;object-fit:cover;border-radius:4px}
.sigil-media-card span{font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sigil-media-card--active,.sigil-media-card:hover{border-color:var(--sigil-color-accent);background:var(--sigil-color-accent-soft)}
.sigil-media-actions{display:flex;gap:8px}
`
  document.head.appendChild(style)
  injected = true
}
