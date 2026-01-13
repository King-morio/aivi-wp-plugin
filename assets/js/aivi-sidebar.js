(function(wp, config) {
    const { createElement, useState, useEffect } = wp.element || {};
    const { registerPlugin } = wp.plugins || {};
    const { PluginSidebar } = wp.editPost || {};
    const { PanelBody, Button, Spinner, Notice, TextControl } = wp.components || {};
    const { select } = wp.data || {};
    const restBase = config.restBase || '/wp-json/aivi/v1';
    const nonce = config.nonce || '';

    // Helper: call REST with nonce
    async function callRest( path, method, body ) {
        const url = restBase.replace(/\/$/, '') + path;
        const headers = {
            'Content-Type': 'application/json',
            'X-WP-Nonce': nonce
        };
        const opts = { method: method || 'GET', headers: headers };
        if ( body ) opts.body = JSON.stringify(body);
        const resp = await fetch( url, opts );
        const text = await resp.text();
        let data = null;
        try { data = JSON.parse( text ); } catch(e){ data = text; }
        return { status: resp.status, ok: resp.ok, data: data };
    }

    // Editor content reader (works for Gutenberg and falls back)
    function readEditorPost() {
        try {
            if ( select && select('core/editor') && typeof select('core/editor').getCurrentPost === 'function' ) {
                const post = select('core/editor').getCurrentPost();
                if ( post ) {
                    const content = ( typeof post.content === 'string' ) ? post.content : (post.content && post.content.raw ? post.content.raw : (post.raw || '') );
                    const title = (post.title && (typeof post.title === 'string' ? post.title : (post.title.raw || ''))) || '';
                    return { id: post.id || null, title: title || '', content: content || '', author: post.author || 0 };
                }
            }
        } catch(e) {
            // ignore and fallback
        }
        // Classic fallback
        try {
            const titleEl = document.getElementById('title');
            const contentEl = document.getElementById('content');
            return { id: (document.getElementById('post_ID') ? parseInt(document.getElementById('post_ID').value,10) : null), title: titleEl ? titleEl.value : '', content: contentEl ? contentEl.value : '', author: 0 };
        } catch(e) {
            return null;
        }
    }

    // Highlight helper (non-destructive)
    function highlightEditorRange( nodeSelector ) {
        try {
            const el = document.querySelector(nodeSelector) || document.querySelector('.editor-post-title') || document.querySelector('.wp-block p');
            if ( el ) {
                el.classList.add('aivi-highlight-temp');
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(()=> el.classList.remove('aivi-highlight-temp'), 3500);
            }
        } catch(e) { console.warn('AiVI highlight failed', e); }
    }

    // Render-ready components (minimal)
    function Circle( props ) {
        const isPlaceholder = !!props.placeholder;
        const value = Number.isFinite(props.value) ? props.value : 0;
        const max = props.max || 100;
        const pct = Math.round( (value / max) * 100 );
        const radius = props.radius || 36;
        const circumference = 2 * Math.PI * radius;
        const stroke = Math.round( (pct / 100) * circumference );
        const rest = Math.max(0, circumference - stroke);
        const color = props.color || '#16a34a';
        const size = props.size || 84;
        
        return createElement('div', { 
            className: 'aivi-circle' + (props.size === 'large' ? ' aivi-circle-large' : ''), 
            'aria-label': props.label || '' 
        },
            createElement('svg', { width:size, height:size, viewBox:'0 0 ' + size + ' ' + size, role:'img' },
                createElement('circle', { 
                    cx:size/2, 
                    cy:size/2, 
                    r:radius, 
                    stroke:'#f3f4f6', 
                    'stroke-width': props.strokeWidth || 8, 
                    fill:'none' 
                }),
                !isPlaceholder && createElement('circle', { 
                    cx:size/2, 
                    cy:size/2, 
                    r:radius, 
                    stroke: color, 
                    'stroke-width': props.strokeWidth || 8, 
                    fill:'none', 
                    'stroke-dasharray': stroke + ' ' + rest, 
                    'stroke-linecap':'round',
                    style: { transition: 'stroke-dasharray 0.5s ease-in-out' }
                })
            ),
            createElement('div', { className:'aivi-score-label' },
                createElement('div', { className: 'aivi-score-value' }, isPlaceholder ? '—' : pct + '%' ),
                createElement('div', { className:'aivi-small' }, isPlaceholder ? props.label : (props.label + ' <span class="aivi-score-detail">(' + value + '/' + max + ')</span>') )
            )
        );
    }

    // Global Score Card Component
    function GlobalScoreCard( props ) {
        const isPlaceholder = !!props.placeholder;
        const value = Number.isFinite(props.value) ? props.value : 0;
        const max = props.max || 100;
        const pct = Math.round( (value / max) * 100 );
        
        // Color based on score thresholds
        let color = '#ef4444'; // Red for poor
        if (pct >= 80) color = '#16a34a'; // Green for good
        else if (pct >= 60) color = '#f59e0b'; // Yellow for okay
        
        return createElement('div', { className: 'aivi-global-card' },
            createElement('div', { className: 'aivi-global-header' },
                createElement('h3', null, 'Global Score'),
                !isPlaceholder && createElement('div', { className: 'aivi-grade-badge' }, 
                    pct >= 90 ? 'A' : pct >= 80 ? 'B' : pct >= 70 ? 'C' : pct >= 60 ? 'D' : 'F'
                )
            ),
            createElement('div', { className: 'aivi-global-score' },
                createElement(Circle, { 
                    label: 'Overall', 
                    placeholder: isPlaceholder, 
                    value: value, 
                    max: max, 
                    color: color,
                    size: 120,
                    radius: 50,
                    strokeWidth: 10
                })
            ),
            !isPlaceholder && createElement('div', { className: 'aivi-score-breakdown' },
                createElement('div', null, 'AEO: ' + (props.aeo || 0) + '/' + (props.aeoMax || 55)),
                createElement('div', null, 'GEO: ' + (props.geo || 0) + '/' + (props.geoMax || 45))
            )
        );
    }

    // Main sidebar UI (state-managed)
    function AiviSidebar() {
        const [state, setState] = useState('idle'); // idle | preflighting | analyzing | aborted | success
        const [banner, setBanner] = useState(null);
        const [report, setReport] = useState(null);
        const [openCats, setOpenCats] = useState({});

        // Clear cache (client-side stub). Antigravity should wire a real endpoint if caching is implemented server-side.
        function clearCache() {
            setBanner({ type:'info', text: 'Cache cleared (local stub).' });
            // small ephemeral banner
            setTimeout(()=> setBanner(null), 3000);
        }

        async function runAnalysis() {
            setBanner(null);
            setReport(null);

            // read post
            const post = readEditorPost();
            if ( ! post ) {
                setBanner({ type: 'error', text: config.text.no_editor || 'Editor not available' });
                return;
            }

            // Preflight
            setState('preflighting');
            const pre = await callRest('/preflight', 'POST', { title: post.title, content: post.content } );
            if ( ! pre.ok ) {
                // show instructive message (too long or other)
                const data = pre.data || {};
                if ( data && data.reason === 'too_long' ) {
                    setBanner({ type:'error', text: data.message || config.text.preflight_too_long });
                } else {
                    setBanner({ type:'error', text: data && data.message ? data.message : 'Preflight failed.' });
                }
                setState('aborted');
                return;
            }

            // Preflight ok. Try AI analyze
            setState('analyzing');
            const analysis = await callRest('/analyze', 'POST', { title: post.title, content: post.content, manifest: pre.data && pre.data.manifest ? pre.data.manifest : {} } );
            if ( ! analysis.ok ) {
                // AI unavailable or error -> abort and show banner. NO CARDS.
                const data = analysis.data || {};
                setBanner({ type:'error', text: data && data.message ? data.message : config.text.ai_unavailable || 'AI analysis unavailable' });
                setState('aborted');
                return;
            }

            // If we get here, analysis.ok == true and analysis.data must contain the aggregator JSON
            setReport( analysis.data );
            setState('success');
        }

        // UI render branches
        return createElement( PluginSidebar, { name:'aivi-sidebar', title: config.text.title || 'AiVI', icon: 'visibility' },
            createElement( PanelBody, { initialOpen: true },
                // Global Score Card (full width)
                state !== 'success' && createElement( GlobalScoreCard, { placeholder: true } ),
                state === 'success' && report && createElement( GlobalScoreCard, { 
                    placeholder: false, 
                    value: (report.scores ? (report.scores.AEO||0) + (report.scores.GEO||0) : 0), 
                    max: 100,
                    aeo: report.scores ? report.scores.AEO || 0 : 0,
                    aeoMax: 55,
                    geo: report.scores ? report.scores.GEO || 0 : 0,
                    geoMax: 45
                } ),

                // Sub-scores row (AEO & GEO)
                state !== 'success' && createElement( 'div', { className: 'aivi-subscores' },
                    createElement( 'div', { className: 'aivi-subscore-card' },
                        createElement( 'div', { className: 'aivi-subscore-label' }, 'AEO Score' ),
                        createElement( Circle, { label:'Answer Engine', placeholder: true, max:55, color:'#16a34a', size: 80, radius: 32, strokeWidth: 6 } )
                    ),
                    createElement( 'div', { className: 'aivi-subscore-card' },
                        createElement( 'div', { className: 'aivi-subscore-label' }, 'GEO Score' ),
                        createElement( Circle, { label:'Generative Engine', placeholder: true, max:45, color:'#2563eb', size: 80, radius: 32, strokeWidth: 6 } )
                    )
                ),
                state === 'success' && report && createElement( 'div', { className: 'aivi-subscores' },
                    createElement( 'div', { className: 'aivi-subscore-card' },
                        createElement( 'div', { className: 'aivi-subscore-label' }, 'AEO Score' ),
                        createElement( Circle, { label:'Answer Engine', value: (report.scores ? report.scores.AEO || 0 : 0), max:55, color:'#16a34a', size: 80, radius: 32, strokeWidth: 6 } )
                    ),
                    createElement( 'div', { className: 'aivi-subscore-card' },
                        createElement( 'div', { className: 'aivi-subscore-label' }, 'GEO Score' ),
                        createElement( Circle, { label:'Generative Engine', value: (report.scores ? report.scores.GEO || 0 : 0), max:45, color:'#2563eb', size: 80, radius: 32, strokeWidth: 6 } )
                    )
                ),

                // CTA section: Analyze button (full width) + Clear Cache (secondary below)
                createElement( 'div', { className: 'aivi-cta-section' },
                    createElement( Button, { 
                        isPrimary: true, 
                        onClick: runAnalysis, 
                        isBusy: (state === 'preflighting' || state === 'analyzing'),
                        className: 'aivi-analyze-button',
                        disabled: (state === 'preflighting' || state === 'analyzing')
                    }, 
                        state === 'preflighting' ? 'Running Preflight...' : 
                        state === 'analyzing' ? 'Analyzing with AI...' : 
                        config.text.analyze || 'Analyze Content' 
                    ),
                    createElement( 'button', { 
                        className: 'aivi-clear-cache', 
                        onClick: clearCache, 
                        title: 'Clear AiVI cache (client-side stub)',
                        disabled: (state === 'preflighting' || state === 'analyzing')
                    }, config.text.clear_cache || 'Clear Cache' )
                ),

                // small meta line
                createElement( 'div', { className:'aivi-meta' }, 'AiVI runs a single-pass AI analysis (if backend configured).' ),

                // Banner / state messages
                state === 'preflighting' && createElement( 'div', { style:{ marginTop:10 } }, createElement( Spinner, null ), createElement( 'div', { style:{ marginTop:8 } }, 'Preflight running (token estimate)...' ) ),
                state === 'analyzing' && createElement( 'div', { style:{ marginTop:10 } }, createElement( Spinner, null ), createElement( 'div', { style:{ marginTop:8 } }, 'Analyzing with AI…' ) ),
                state === 'aborted' && banner && createElement( 'div', { style:{ marginTop:10 } }, createElement( 'div', { className: 'aivi-banner' }, banner.text ) ),

                // Results area shown only on success
                state === 'success' && report && createElement( 'div', { style:{ marginTop:12 } },
                    createElement( 'h3', null, 'Checks' ),
                    (report && report.checks && Array.isArray(report.checks)) ? report.checks.map( (c,i) => {
                        const cls = 'aivi-check ' + ( c.verdict === 'pass' ? 'aivi-pass' : (c.verdict === 'partial' ? 'aivi-medium' : 'aivi-high') );
                        return createElement('div', { key: 'chk-'+i, className: cls, role:'button', tabIndex:0, onClick: function(){ if (c.highlights && c.highlights.length) highlightEditorRange(c.highlights[0].node_ref || '.wp-block p'); } },
                            createElement('div', { className:'aivi-title' }, (c.verdict === 'pass' ? '✓ ' : '• ') + (c.title || c.id)),
                            createElement('div', { className:'aivi-msg' }, c.explanation || ( c.verdict === 'pass' ? 'Passed' : 'Issue detected' ) ),
                            createElement('div', { className:'aivi-small' }, c.provenance ? ('Provenance: ' + c.provenance + ' — confidence: ' + (Math.round((c.confidence||0)*100)) + '%') : null )
                        );
                    }) : createElement('div', null, 'No checks returned by AI.')
                ),

                // Top-level FAQ JSON-LD suggestion panel (if AI returned schema snippet)
                state === 'success' && report && report.schema_suggestions && report.schema_suggestions.faq_jsonld ? createElement('div', { style:{ marginTop:12 } },
                    createElement('h4', null, 'FAQ JSON-LD suggestion'),
                    createElement('pre', { style:{ maxHeight:200, overflow:'auto', background:'#f8f9fb', padding:8, borderRadius:4 } }, JSON.stringify(report.schema_suggestions.faq_jsonld, null, 2) ),
                    createElement( Button, { isSecondary: true, onClick: function(){ navigator.clipboard && navigator.clipboard.writeText(JSON.stringify(report.schema_suggestions.faq_jsonld)); alert('Copied FAQ JSON-LD to clipboard'); } }, 'Copy JSON-LD' )
                ) : null
            )
        );
    }

    // Register plugin only if registerPlugin is available
    if ( registerPlugin && typeof registerPlugin === 'function' ) {
        try {
            registerPlugin( 'aivi-plugin', { render: AiviSidebar, icon: 'visibility' } );
        } catch(e) {
            console.info('AiVI: registerPlugin failed', e);
        }
    }

    // Also mount Classic meta UI (if present)
    document.addEventListener('DOMContentLoaded', function() {
        try {
            var root = document.getElementById('aivi-meta-ui');
            if ( root ) {
                // Create the same UI structure as Gutenberg
                var state = 'idle';
                var banner = null;
                var report = null;
                
                function renderClassicUI() {
                    var html = '<div class="aivi-classic-container">';
                    
                    // Global Score Card
                    if (state !== 'success') {
                        html += '<div class="aivi-global-card">';
                        html += '<div class="aivi-global-header"><h3>Global Score</h3></div>';
                        html += '<div class="aivi-global-score">';
                        html += '<div class="aivi-circle aivi-circle-large" style="width:120px;height:120px">';
                        html += '<svg width="120" height="120" viewBox="0 0 120 120" role="img">';
                        html += '<circle cx="60" cy="60" r="50" stroke="#f3f4f6" stroke-width="10" fill="none"></circle>';
                        html += '</svg>';
                        html += '<div class="aivi-score-label">';
                        html += '<div class="aivi-score-value">—</div>';
                        html += '<div class="aivi-small">Overall</div>';
                        html += '</div>';
                        html += '</div>';
                        html += '</div>';
                        html += '</div>';
                    } else if (report && report.scores) {
                        var total = (report.scores.AEO||0) + (report.scores.GEO||0);
                        var pct = Math.round((total / 100) * 100);
                        var color = '#ef4444';
                        if (pct >= 80) color = '#16a34a';
                        else if (pct >= 60) color = '#f59e0b';
                        var grade = pct >= 90 ? 'A' : pct >= 80 ? 'B' : pct >= 70 ? 'C' : pct >= 60 ? 'D' : 'F';
                        var stroke = Math.round((pct / 100) * 314);
                        
                        html += '<div class="aivi-global-card">';
                        html += '<div class="aivi-global-header"><h3>Global Score</h3><div class="aivi-grade-badge">' + grade + '</div></div>';
                        html += '<div class="aivi-global-score">';
                        html += '<div class="aivi-circle aivi-circle-large" style="width:120px;height:120px">';
                        html += '<svg width="120" height="120" viewBox="0 0 120 120" role="img">';
                        html += '<circle cx="60" cy="60" r="50" stroke="#f3f4f6" stroke-width="10" fill="none"></circle>';
                        html += '<circle cx="60" cy="60" r="50" stroke="' + color + '" stroke-width="10" fill="none" stroke-dasharray="' + stroke + ' ' + (314-stroke) + '" stroke-linecap="round"></circle>';
                        html += '</svg>';
                        html += '<div class="aivi-score-label">';
                        html += '<div class="aivi-score-value">' + pct + '%</div>';
                        html += '<div class="aivi-small">Overall <span class="aivi-score-detail">(' + total + '/100)</span></div>';
                        html += '</div>';
                        html += '</div>';
                        html += '<div class="aivi-score-breakdown">';
                        html += '<div>AEO: ' + (report.scores.AEO || 0) + '/55</div>';
                        html += '<div>GEO: ' + (report.scores.GEO || 0) + '/45</div>';
                        html += '</div>';
                        html += '</div>';
                        html += '</div>';
                    }
                    
                    // Sub-scores
                    html += '<div class="aivi-subscores">';
                    if (state !== 'success') {
                        html += '<div class="aivi-subscore-card">';
                        html += '<div class="aivi-subscore-label">AEO Score</div>';
                        html += '<div class="aivi-circle" style="width:80px;height:80px">';
                        html += '<svg width="80" height="80" viewBox="0 0 80 80">';
                        html += '<circle cx="40" cy="40" r="32" stroke="#f3f4f6" stroke-width="6" fill="none"></circle>';
                        html += '</svg>';
                        html += '<div class="aivi-score-label">';
                        html += '<div class="aivi-score-value">—</div>';
                        html += '<div class="aivi-small">Answer Engine <span class="aivi-score-detail">(/55)</span></div>';
                        html += '</div>';
                        html += '</div>';
                        html += '</div>';
                        html += '<div class="aivi-subscore-card">';
                        html += '<div class="aivi-subscore-label">GEO Score</div>';
                        html += '<div class="aivi-circle" style="width:80px;height:80px">';
                        html += '<svg width="80" height="80" viewBox="0 0 80 80">';
                        html += '<circle cx="40" cy="40" r="32" stroke="#f3f4f6" stroke-width="6" fill="none"></circle>';
                        html += '</svg>';
                        html += '<div class="aivi-score-label">';
                        html += '<div class="aivi-score-value">—</div>';
                        html += '<div class="aivi-small">Generative Engine <span class="aivi-score-detail">(/45)</span></div>';
                        html += '</div>';
                        html += '</div>';
                        html += '</div>';
                    } else if (report && report.scores) {
                        var aeoPct = Math.round(((report.scores.AEO||0) / 55) * 100);
                        var aeoStroke = Math.round((aeoPct / 100) * 201);
                        var geoPct = Math.round(((report.scores.GEO||0) / 45) * 100);
                        var geoStroke = Math.round((geoPct / 100) * 201);
                        
                        html += '<div class="aivi-subscore-card">';
                        html += '<div class="aivi-subscore-label">AEO Score</div>';
                        html += '<div class="aivi-circle" style="width:80px;height:80px">';
                        html += '<svg width="80" height="80" viewBox="0 0 80 80">';
                        html += '<circle cx="40" cy="40" r="32" stroke="#f3f4f6" stroke-width="6" fill="none"></circle>';
                        html += '<circle cx="40" cy="40" r="32" stroke="#16a34a" stroke-width="6" fill="none" stroke-dasharray="' + aeoStroke + ' ' + (201-aeoStroke) + '" stroke-linecap="round"></circle>';
                        html += '</svg>';
                        html += '<div class="aivi-score-label">';
                        html += '<div class="aivi-score-value">' + aeoPct + '%</div>';
                        html += '<div class="aivi-small">Answer Engine <span class="aivi-score-detail">(' + (report.scores.AEO||0) + '/55)</span></div>';
                        html += '</div>';
                        html += '</div>';
                        html += '</div>';
                        html += '<div class="aivi-subscore-card">';
                        html += '<div class="aivi-subscore-label">GEO Score</div>';
                        html += '<div class="aivi-circle" style="width:80px;height:80px">';
                        html += '<svg width="80" height="80" viewBox="0 0 80 80">';
                        html += '<circle cx="40" cy="40" r="32" stroke="#f3f4f6" stroke-width="6" fill="none"></circle>';
                        html += '<circle cx="40" cy="40" r="32" stroke="#2563eb" stroke-width="6" fill="none" stroke-dasharray="' + geoStroke + ' ' + (201-geoStroke) + '" stroke-linecap="round"></circle>';
                        html += '</svg>';
                        html += '<div class="aivi-score-label">';
                        html += '<div class="aivi-score-value">' + geoPct + '%</div>';
                        html += '<div class="aivi-small">Generative Engine <span class="aivi-score-detail">(' + (report.scores.GEO||0) + '/45)</span></div>';
                        html += '</div>';
                        html += '</div>';
                        html += '</div>';
                    }
                    html += '</div>';
                    
                    // CTA Section
                    html += '<div class="aivi-cta-section">';
                    var buttonText = config.text.analyze || 'Analyze Content';
                    if (state === 'preflighting') buttonText = 'Running Preflight...';
                    else if (state === 'analyzing') buttonText = 'Analyzing with AI...';
                    
                    html += '<button id="aivi-classic-analyze" class="aivi-analyze-button button button-primary"' + (state === 'preflighting' || state === 'analyzing' ? ' disabled' : '') + '>' + buttonText + '</button>';
                    html += '<button id="aivi-classic-clear" class="aivi-clear-cache button"' + (state === 'preflighting' || state === 'analyzing' ? ' disabled' : '') + '>' + (config.text.clear_cache || 'Clear Cache') + '</button>';
                    html += '</div>';
                    
                    // Meta line
                    html += '<div class="aivi-meta">AiVI runs a single-pass AI analysis (if backend configured).</div>';
                    
                    // Status messages
                    if (state === 'preflighting') {
                        html += '<div style="margin-top:10px"><span class="is-spinner"></span><div style="margin-top:8px">Preflight running (token estimate)...</div></div>';
                    } else if (state === 'analyzing') {
                        html += '<div style="margin-top:10px"><span class="is-spinner"></span><div style="margin-top:8px">Analyzing with AI…</div></div>';
                    } else if (state === 'aborted' && banner) {
                        html += '<div style="margin-top:10px"><div class="aivi-banner">' + banner.text + '</div></div>';
                    }
                    
                    // Results
                    if (state === 'success' && report) {
                        html += '<div style="margin-top:12px"><h3>Checks</h3>';
                        if (report.checks && Array.isArray(report.checks)) {
                            report.checks.forEach(function(c, i) {
                                var cls = 'aivi-check ' + (c.verdict === 'pass' ? 'aivi-pass' : (c.verdict === 'partial' ? 'aivi-medium' : 'aivi-high'));
                                html += '<div class="' + cls + '" role="button" tabindex="0">';
                                html += '<div class="aivi-title">' + (c.verdict === 'pass' ? '✓ ' : '• ') + (c.title || c.id) + '</div>';
                                html += '<div class="aivi-msg">' + (c.explanation || (c.verdict === 'pass' ? 'Passed' : 'Issue detected')) + '</div>';
                                html += '<div class="aivi-small">' + (c.provenance ? 'Provenance: ' + c.provenance + ' — confidence: ' + (Math.round((c.confidence||0)*100)) + '%' : '') + '</div>';
                                html += '</div>';
                            });
                        } else {
                            html += '<div>No checks returned by AI.</div>';
                        }
                        html += '</div>';
                        
                        // FAQ JSON-LD
                        if (report.schema_suggestions && report.schema_suggestions.faq_jsonld) {
                            html += '<div style="margin-top:12px">';
                            html += '<h4>FAQ JSON-LD suggestion</h4>';
                            html += '<pre style="maxHeight:200; overflow:auto; background:#f8f9fb; padding:8px; borderRadius:4">' + JSON.stringify(report.schema_suggestions.faq_jsonld, null, 2) + '</pre>';
                            html += '<button class="button" onclick="navigator.clipboard.writeText(JSON.stringify(report.schema_suggestions.faq_jsonld)); alert(\'Copied FAQ JSON-LD to clipboard\');">Copy JSON-LD</button>';
                            html += '</div>';
                        }
                    }
                    
                    html += '</div>';
                    root.innerHTML = html;
                    
                    // Re-attach event listeners
                    var btn = document.getElementById('aivi-classic-analyze');
                    var clearBtn = document.getElementById('aivi-classic-clear');
                    
                    btn && btn.addEventListener('click', runClassicAnalysis);
                    clearBtn && clearBtn.addEventListener('click', function(){
                        banner = { type:'info', text: 'Cache cleared (local stub).' };
                        setTimeout(function(){ banner = null; renderClassicUI(); }, 3000);
                    });
                }
                
                async function runClassicAnalysis() {
                    banner = null;
                    report = null;
                    state = 'preflighting';
                    renderClassicUI();
                    
                    // read title & content
                    var title = (document.getElementById('title') && document.getElementById('title').value) || '';
                    var content = (document.getElementById('content') && document.getElementById('content').value) || '';
                    
                    var pre = await callRest('/preflight','POST', { title: title, content: content } );
                    if ( ! pre.ok ) {
                        var dat = pre.data || {};
                        banner = { type:'error', text: dat && dat.message ? dat.message : 'Preflight failed' };
                        state = 'aborted';
                        renderClassicUI();
                        return;
                    }
                    
                    // attempt analyze
                    state = 'analyzing';
                    renderClassicUI();
                    var analysis = await callRest('/analyze','POST', { title: title, content: content, manifest: pre.data && pre.data.manifest ? pre.data.manifest : {} } );
                    if ( ! analysis.ok ) {
                        var dat2 = analysis.data || {};
                        banner = { type:'error', text: dat2 && dat2.message ? dat2.message : (config.text.ai_unavailable || 'AI analysis unavailable') };
                        state = 'aborted';
                        renderClassicUI();
                        return;
                    }
                    
                    // success
                    report = analysis.data;
                    state = 'success';
                    renderClassicUI();
                }
                
                // Initial render
                renderClassicUI();
            }
        } catch(e) {
            console.info('AiVI classic mount error', e);
        }
    });

})(window.wp || {}, window.AIVI_CONFIG || {});
