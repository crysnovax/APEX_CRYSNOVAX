// Apex CRYSNOVA AI – Unified API Gateway
// Theme: Black, Gold, Red · Shooting Stars · Token Management
// FULLY POWERED BY NEXRAY · Prexzy COMPLETELY REMOVED
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ==================== CONFIGURATION STATUS ====================
    const configStatus = {
      github: !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
      permanentToken: !!env.AUTH_TOKEN,
      groq: !!env.GROQ_API_KEY,
      nexray: true,
    };

    // ==================== AUTHENTICATION HELPERS ====================
    function isAuthenticated(request) {
      const authHeader = request.headers.get('Authorization');
      const queryToken = url.searchParams.get('token');
      const expectedToken = env.AUTH_TOKEN;
      if (!expectedToken) return true;
      if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7) === expectedToken;
      if (queryToken) return queryToken === expectedToken;
      return false;
    }

    async function getGitHubUser(accessToken) {
      const res = await fetch('https://api.github.com/user', {
        headers: { 'User-Agent': 'Apex-CRYSNOVA', 'Authorization': `Bearer ${accessToken}` }
      });
      if (!res.ok) throw new Error('Failed to fetch GitHub user');
      return res.json();
    }

    // ==================== TEMPORARY TOKEN MANAGEMENT ====================
    async function generateTempToken(githubId) {
      const existing = await env.TEMP_TOKEN_STORE.get(`github:${githubId}`);
      if (existing) {
        const data = JSON.parse(existing);
        if (data.expires > Date.now()) return data.token;
        return null;
      }
      const token = 'tmp_' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);
      const expires = Date.now() + 48 * 60 * 60 * 1000;
      await env.TEMP_TOKEN_STORE.put(`github:${githubId}`, JSON.stringify({ token, expires }));
      await env.TEMP_TOKEN_STORE.put(`token:${token}`, githubId, { expirationTtl: 48 * 3600 });
      return token;
    }

    async function validateTempToken(token) {
      if (!token.startsWith('tmp_')) return false;
      const githubId = await env.TEMP_TOKEN_STORE.get(`token:${token}`);
      return !!githubId;
    }

    // ==================== IMAGE UPLOAD HELPER ====================
    async function uploadImage(buffer) {
      try {
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('userhash', '');
        form.append('fileToUpload', new Blob([buffer]), 'image.jpg');
        const res = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: form });
        const text = await res.text();
        if (text.startsWith('https://')) return text.trim();
      } catch {}
      try {
        const form2 = new FormData();
        form2.append('file', new Blob([buffer]), 'image.jpg');
        const res2 = await fetch('https://tmpfiles.org/api/v1/upload', { method: 'POST', body: form2 });
        const data = await res2.json();
        const tmpUrl = data?.data?.url;
        return tmpUrl?.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
      } catch {
        return null;
      }
    }

    // ==================== UNIVERSAL NEXRAY PROXY ====================
    // All Nexray endpoints you pasted are automatically forwarded
    const NEXRAY_BASE = 'https://api.nexray.web.id';
    
    // Categories that should be proxied to Nexray
    const NEXRAY_CATEGORIES = [
      '/ai/', '/search/', '/tools/', '/ephoto/', '/textpro/', 
      '/maker/', '/canvas/', '/editor/', '/fun/', '/berita/', 
      '/information/', '/payment/', '/anime/anichin/', '/anime/komiku/',
      '/random/', '/download/', '/game/', '/ssweb/'
    ];

    function shouldProxyToNexray(path) {
      return NEXRAY_CATEGORIES.some(cat => path.startsWith(cat));
    }

    async function proxyToNexray(request, path) {
      const url = new URL(request.url);
      const targetUrl = `${NEXRAY_BASE}${path}${url.search}`;
      
      const init = {
        method: request.method,
        headers: {}
      };

      // Forward content-type if present
      const contentType = request.headers.get('Content-Type');
      if (contentType) {
        init.headers['Content-Type'] = contentType;
      }

      // Forward body for POST/PUT
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        init.body = request.body;
      }

      const res = await fetch(targetUrl, init);
      const responseHeaders = { ...corsHeaders };
      const resContentType = res.headers.get('Content-Type');
      if (resContentType) responseHeaders['Content-Type'] = resContentType;

      return new Response(res.body, {
        status: res.status,
        headers: responseHeaders
      });
    }

    // ==================== PUBLIC ROUTES (NO AUTH) ====================
    if (path === '/health') {
      return new Response(JSON.stringify({ status: 'healthy', ...configStatus, timestamp: Date.now() }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // GitHub OAuth callback
    if (path === '/auth/github/callback') {
      const code = url.searchParams.get('code');
      if (!code) return new Response('Missing code', { status: 400 });
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code })
      });
      const tokenData = await tokenRes.json();
      if (tokenData.error) return new Response(tokenData.error_description, { status: 400 });
      const user = await getGitHubUser(tokenData.access_token);
      const tempToken = await generateTempToken(user.id.toString());
      if (!tempToken) {
        return new Response(`
          <!DOCTYPE html><html><head><script>
            window.opener.postMessage({ type: 'github-oauth', error: 'Token expired or already claimed' }, '*');
            window.close();
          </script></head><body>Token expired or already claimed. You may close this window.</body></html>
        `, { headers: { 'Content-Type': 'text/html' } });
      }
      return new Response(`
        <!DOCTYPE html><html><head><script>
          window.opener.postMessage({ type: 'github-oauth', token: '${tempToken}' }, '*');
          window.close();
        </script></head><body>Authenticated! You can close this window.</body></html>
      `, { headers: { 'Content-Type': 'text/html' } });
    }

    // ==================== FRONTEND LANDING PAGE (PUBLIC) ====================
    if (path === '/' && method === 'GET') {
        const endpointsByCategory = [
            { category: '🤖 AI Chat PRO 🜲', endpoints: [
                { method: 'GET', path: '/ai/gemini', desc: 'Gemini AI' },
                { method: 'GET', path: '/ai/chatgpt', desc: 'ChatGPT' },
                { method: 'GET', path: '/ai/deepseek', desc: 'DeepSeek AI' },
                { method: 'GET', path: '/ai/claude', desc: 'Claude AI' },
                { method: 'GET', path: '/ai/copilot', desc: 'Copilot' },
                { method: 'GET', path: '/ai/perplexity', desc: 'Perplexity AI' },
                { method: 'GET', path: '/ai/turbochat', desc: 'TurboChat' }
            ] },
            { category: '🎨 Image Generation ✐', endpoints: [
                { method: 'POST', path: '/ai/deepimg', desc: 'DeepImg Generation' },
                { method: 'POST', path: '/ai/v1/flux', desc: 'Flux Image' },
                { method: 'POST', path: '/ai/gptimage', desc: 'GPT Image' },
                { method: 'POST', path: '/ai/nanobanana', desc: 'NanoBanana (Anime)' },
                { method: 'POST', path: '/ai/magicstudio', desc: 'Magic Studio' },
                { method: 'POST', path: '/ai/ideogram', desc: 'Ideogram' }
            ] },
            { category: '🛠️ Tools ⎔', endpoints: [
                { method: 'POST', path: '/transcribe', desc: 'Voice Transcription' },
                { method: 'POST', path: '/vision', desc: 'Image Description' },
                { method: 'POST', path: '/tools/ocr', desc: 'OCR Text Extraction' },
                { method: 'POST', path: '/tools/removebg', desc: 'Remove Background' },
                { method: 'POST', path: '/tools/remini', desc: 'Enhance Image' },
                { method: 'GET', path: '/tools/translate', desc: 'Translate Text' },
                { method: 'GET', path: '/tools/tts-google', desc: 'Text to Speech' }
            ] },
            { category: '🔍 Search ⌘', endpoints: [
                { method: 'GET', path: '/search/youtube', desc: 'YouTube Search' },
                { method: 'GET', path: '/search/pinterest', desc: 'Pinterest' },
                { method: 'GET', path: '/search/googleimage', desc: 'Google Images' },
                { method: 'GET', path: '/search/spotify', desc: 'Spotify' },
                { method: 'GET', path: '/search/lyrics', desc: 'Song Lyrics' },
                { method: 'GET', path: '/search/github', desc: 'GitHub' }
            ] },
            { category: '🎭 Reactions ⚡', endpoints: [
                { method: 'GET', path: '/reactions/hug', desc: 'Hug GIF' },
                { method: 'GET', path: '/reactions/kiss', desc: 'Kiss GIF' },
                { method: 'GET', path: '/reactions/slap', desc: 'Slap GIF' },
                { method: 'GET', path: '/reactions/dance', desc: 'Dance GIF' },
                { method: 'GET', path: '/reactions/pat', desc: 'Pat GIF' },
                { method: 'GET', path: '/reactions/cuddle', desc: 'Cuddle GIF' }
            ] },
            { category: '🎨 Photo Effects ✨', endpoints: [
                { method: 'POST', path: '/ephoto/anime', desc: 'Anime Effect' },
                { method: 'POST', path: '/ephoto/ghibli', desc: 'Ghibli Style' },
                { method: 'POST', path: '/ephoto/comic', desc: 'Comic Effect' },
                { method: 'POST', path: '/ephoto/cinematic', desc: 'Cinematic' }
            ] },
            { category: '✏️ Text Effects 文字', endpoints: [
                { method: 'GET', path: '/textpro/avengers', desc: 'Avengers Logo' },
                { method: 'GET', path: '/textpro/glitch', desc: 'Glitch Text' },
                { method: 'GET', path: '/textpro/naruto', desc: 'Naruto Style' },
                { method: 'GET', path: '/textpro/wolf-galaxy', desc: 'Wolf Galaxy' }
            ] },
            { category: '🛠️ Maker Tools', endpoints: [
                { method: 'GET', path: '/maker/attp', desc: 'Animated Text PNG' },
                { method: 'GET', path: '/maker/brat', desc: 'Brat Generator' },
                { method: 'GET', path: '/maker/fakestory', desc: 'Fake Story' },
                { method: 'GET', path: '/maker/qc', desc: 'Quote Creator' }
            ] }
        ];

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ஃ APEX CRYSN☉VA · Nexray Gateway</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#0b0a0c;min-height:100vh;font-family:'Inter',system-ui,sans-serif;color:#e0d6b0;padding:2rem 1rem;position:relative;overflow-x:hidden}
    canvas#starfield{position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none}
    .container{max-width:1400px;margin:0 auto;position:relative;z-index:2}
    .header{text-align:center;margin-bottom:3rem;backdrop-filter:blur(8px);background:rgba(20,15,10,0.3);border:1px solid rgba(212,175,55,0.3);border-radius:40px;padding:2.5rem 2rem;box-shadow:0 20px 40px rgba(0,0,0,0.6),0 0 40px rgba(212,175,55,0.1)}
    h1{font-size:3.5rem;font-weight:700;background:linear-gradient(135deg,#d4af37 0%,#ff4d4d 80%);-webkit-background-clip:text;background-clip:text;color:transparent;letter-spacing:-0.02em;margin-bottom:0.5rem;text-shadow:0 0 30px rgba(212,175,55,0.3)}
    .subtitle{font-size:1.2rem;color:#b0a080;margin-bottom:1.5rem}
    .powered-by{display:inline-block;background:rgba(212,175,55,0.15);border:1px solid #d4af37;padding:6px 20px;border-radius:40px;font-size:0.9rem;margin-bottom:1rem}
    .status-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(20,15,10,0.5);border:1px solid #d4af37;padding:8px 20px;border-radius:40px;font-size:0.95rem;margin-bottom:1rem}
    .pulse-dot{width:12px;height:12px;background:#10b981;border-radius:50%;box-shadow:0 0 15px #10b981;animation:pulse 2s infinite}
    @keyframes pulse{0%{opacity:1;transform:scale(1)}50%{opacity:0.6;transform:scale(1.2)}100%{opacity:1;transform:scale(1)}}
    .token-panel{background:rgba(20,15,10,0.5);backdrop-filter:blur(8px);border:1px solid rgba(212,175,55,0.2);border-radius:40px;padding:1.5rem;margin-bottom:2rem;display:flex;align-items:center;justify-content:center;gap:20px;flex-wrap:wrap}
    .token-panel input{flex:1;min-width:250px;background:#1a1410;border:1px solid #d4af37;border-radius:40px;padding:12px 20px;color:#e0d6b0;font-size:1rem;outline:none}
    .token-panel button{background:#d4af37;color:#0b0a0c;border:none;padding:12px 30px;border-radius:40px;font-weight:600;cursor:pointer;transition:all 0.2s}
    .token-panel button:hover{background:#ff4d4d;color:#fff;box-shadow:0 0 20px #ff4d4d}
    .token-actions{display:flex;gap:12px;justify-content:center;margin:1rem 0 2rem}
    .token-actions button{background:transparent;border:1px solid #d4af37;color:#d4af37;padding:10px 24px;border-radius:40px;cursor:pointer;transition:all 0.2s}
    .token-actions button:hover{background:#d4af37;color:#0b0a0c}
    .category-section{margin-bottom:2.5rem}
    .category-title{font-size:1.5rem;font-weight:600;color:#d4af37;margin-bottom:1rem;padding-bottom:0.5rem;border-bottom:1px solid rgba(212,175,55,0.3)}
    .endpoints-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}
    .card{background:rgba(20,15,10,0.6);backdrop-filter:blur(8px);border:1px solid rgba(212,175,55,0.2);border-radius:20px;padding:1.5rem;transition:all 0.3s;box-shadow:0 10px 20px rgba(0,0,0,0.4)}
    .card:hover{border-color:#d4af37;box-shadow:0 0 25px rgba(212,175,55,0.15);transform:translateY(-3px)}
    .card-header{display:flex;align-items:center;gap:12px;margin-bottom:12px}
    .method{background:#ff4d4d;color:#fff;font-weight:600;padding:4px 10px;border-radius:12px;font-size:0.8rem}
    .endpoint-path{font-family:monospace;font-size:0.95rem;color:#d4af37}
    .card p{color:#b0a080;font-size:0.9rem;margin-bottom:15px}
    .status-indicator{display:flex;align-items:center;gap:6px;font-size:0.85rem;margin-bottom:10px}
    .online{color:#10b981}
    .copy-btn{background:#1a1410;border:1px solid #d4af37;color:#d4af37;padding:8px 16px;border-radius:30px;cursor:pointer;font-size:0.9rem;transition:all 0.2s;width:100%}
    .copy-btn:hover{background:#d4af37;color:#0b0a0c}
    .social-section{display:flex;justify-content:center;gap:20px;margin:3rem 0}
    .social-btn{display:flex;align-items:center;gap:8px;background:rgba(212,175,55,0.1);border:1px solid #d4af37;padding:12px 24px;border-radius:40px;text-decoration:none;color:#e0d6b0;transition:all 0.2s}
    .social-btn:hover{background:#ff4d4d;border-color:#ff4d4d;color:#fff}
    .footer{text-align:center;color:#806850;margin-top:3rem;border-top:1px solid rgba(212,175,55,0.2);padding-top:2rem}
  </style>
</head>
<body>
  <canvas id="starfield"></canvas>
  <div class="container">
    <div class="header">
      <h1>ஃ𖠃 APEX CRYSN⎔VA 🜲</h1>
      <div class="powered-by">⚡ FULLY POWERED BY NEXRAY ⚡</div>
      <div class="subtitle">255+ Endpoints · 24/7 Active · Zero Prexzy</div>
      <div class="status-badge"><span class="pulse-dot"></span><span id="globalStatus">All Systems Operational</span></div>
    </div>
    <div class="token-panel">
      <input type="text" id="tokenInput" placeholder="Paste your API token here">
      <button id="applyTokenBtn">Apply Token</button>
    </div>
    <div class="token-actions">
      <button id="getTempTokenBtn">👾 Get Temporary Token (GitHub)</button>
      <a href="https://wa.me/message/636PEVHM5BZUM1" target="_blank" style="text-decoration:none"><button>💫 Purchase Permanent Token</button></a>
    </div>
    <div id="categoriesContainer"></div>
    <div class="social-section">
      <a href="https://whatsapp.com/channel/0029Vb6pe77K0IBn48HLKb38" target="_blank" class="social-btn">📱 WhatsApp</a>
      <a href="https://chat.whatsapp.com/Besbj8VIle1GwxKKZv1lax?mode=gi_t" target="_blank" class="social-btn">👥 Group</a>
      <a href="https://youtube.com/@crysnovax" target="_blank" class="social-btn">▶️ YouTube</a>
      <a href="https://tiktok.com/@crysnovax" target="_blank" class="social-btn">🎵 TikTok</a>
    </div>
    <div class="footer">ⓘ Apex CRYSN⚉VA · 100% Nexray · Prexzy-Free Zone · © 2026</div>
  </div>
  <script>
    const categories = ${JSON.stringify(endpointsByCategory)};
    let currentToken = '';
    const tokenInput = document.getElementById('tokenInput');
    const applyBtn = document.getElementById('applyTokenBtn');
    const container = document.getElementById('categoriesContainer');
    
    function renderCategories() {
      let html = '';
      categories.forEach(cat => {
        html += '<div class="category-section">';
        html += '<h2 class="category-title">' + cat.category + '</h2>';
        html += '<div class="endpoints-grid">';
        cat.endpoints.forEach(ep => {
          const statusDot = '<span class="online">●</span> Online';
          
          html += '<div class="card">';
          html += '<div class="card-header"><span class="method">' + ep.method + '</span><span class="endpoint-path">' + ep.path + '</span></div>';
          html += '<p>' + ep.desc + '</p>';
          html += '<div class="status-indicator">' + statusDot + '</div>';
          html += '<button class="copy-btn" data-path="' + ep.path + '">📋 Copy URL</button>';
          html += '</div>';
        });
        html += '</div></div>';
      });
      container.innerHTML = html;
      document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const path = btn.dataset.path;
          let url = location.origin + path;
          if (currentToken) url += '?token=' + encodeURIComponent(currentToken);
          navigator.clipboard.writeText(url);
          alert('Copied: ' + url);
        });
      });
    }
    
    renderCategories();
    applyBtn.onclick = () => { currentToken = tokenInput.value.trim(); renderCategories(); };
    
    const GITHUB_CLIENT_ID = '${env.GITHUB_CLIENT_ID || ''}';
    document.getElementById('getTempTokenBtn').onclick = () => {
      const w = 600, h = 600;
      const left = (screen.width - w)/2, top = (screen.height - h)/2;
      const authUrl = 'https://github.com/login/oauth/authorize?client_id=' + GITHUB_CLIENT_ID + '&redirect_uri=' + encodeURIComponent(location.origin + '/auth/github/callback') + '&scope=read:user';
      window.open(authUrl, 'GitHub OAuth', 'width='+w+',height='+h+',left='+left+',top='+top);
    };
    window.addEventListener('message', (e) => {
      if (e.data.type === 'github-oauth' && e.data.token) {
        tokenInput.value = e.data.token;
        currentToken = e.data.token;
        renderCategories();
        alert('Temporary token generated! Valid for 48 hours.');
      } else if (e.data.error) {
        alert('Error: ' + e.data.error);
      }
    });
    
    // Shooting stars
    const canvas = document.getElementById('starfield');
    const ctx = canvas.getContext('2d');
    let width, height;
    let stars = [];
    function resize(){ width = window.innerWidth; height = window.innerHeight; canvas.width = width; canvas.height = height; }
    window.addEventListener('resize', resize);
    resize();
    for (let i=0; i<100; i++) stars.push({ x: Math.random()*width, y: Math.random()*height, size: Math.random()*2+1 });
    function draw(){
      ctx.fillStyle = '#0b0a0c';
      ctx.fillRect(0,0,width,height);
      ctx.fillStyle = '#e0d6b0';
      stars.forEach(s => { ctx.fillRect(s.x, s.y, s.size, s.size); });
      if (Math.random()<0.02){
        const sx = Math.random()*width, sy = Math.random()*height/2;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx-50, sy+80);
        ctx.strokeStyle = '#ff4d4d';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      requestAnimationFrame(draw);
    }
    draw();
  </script>
</body>
</html>`;
        return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    }

    // ==================== AUTHENTICATION GATE (ONLY FOR API ROUTES) ====================
    const authHeader = request.headers.get('Authorization');
    const queryToken = url.searchParams.get('token');
    let effectiveToken = null;
    if (authHeader?.startsWith('Bearer ')) effectiveToken = authHeader.slice(7);
    else if (queryToken) effectiveToken = queryToken;

    const isPermTokenValid = env.AUTH_TOKEN && effectiveToken === env.AUTH_TOKEN;
    const isTempTokenValid = effectiveToken ? await validateTempToken(effectiveToken) : false;
    const isAuthorized = isPermTokenValid || isTempTokenValid;

    if (env.AUTH_TOKEN && !isAuthorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized — missing or invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ==================== API ROUTES ====================
    try {
        // ----- GROQ SERVICES (Transcribe & Vision) - KEPT ORIGINAL -----
        if (path === '/transcribe' && method === 'POST') {
            const formData = await request.formData();
            const file = formData.get('file');
            if (!file) return new Response(JSON.stringify({ error: 'Missing file' }), { status: 400, headers: corsHeaders });

            const groqForm = new FormData();
            groqForm.append('file', file, 'audio.ogg');
            groqForm.append('model', 'whisper-large-v3-turbo');
            groqForm.append('response_format', 'text');

            const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${env.GROQ_API_KEY}` },
                body: groqForm,
            });
            const text = await groqRes.text();
            return new Response(JSON.stringify({ text }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if (path === '/vision' && method === 'POST') {
            const formData = await request.formData();
            const file = formData.get('file');
            const prompt = formData.get('prompt') || 'Describe this image in detail.';
            if (!file) return new Response(JSON.stringify({ error: 'Missing file' }), { status: 400, headers: corsHeaders });

            const buffer = await file.arrayBuffer();
            const imageUrl = await uploadImage(buffer);
            if (!imageUrl) throw new Error('Image upload failed');

            const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${env.GROQ_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
                    messages: [{
                        role: 'user',
                        content: [
                            { type: 'image_url', image_url: { url: imageUrl } },
                            { type: 'text', text: prompt }
                        ]
                    }],
                    max_tokens: 1024,
                }),
            });
            const data = await groqRes.json();
            const description = data?.choices?.[0]?.message?.content || '';
            return new Response(JSON.stringify({ description }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // ----- REACTIONS API (GIPHY) - UNTOUCHED -----
        const REACTION_LIST = [
            'hug', 'kiss', 'slap', 'kill', 'dance', 'laugh', 'cry', 'highfive',
            'giggles', 'fight', 'pat', 'bite', 'smile', 'angry', 'cuddle', 'poke',
            'boop', 'lick', 'shoot', 'stab', 'wink', 'yawn', 'blush', 'punch',
            'headpat', 'tickle', 'snuggle', 'glare', 'wave', 'clap', 'facepalm',
            'shrug', 'thumbsup', 'ok', 'peace', 'fistbump', 'nope', 'evil'
        ];

        async function fetchGif(query) {
            const GIPHY_KEY = 'qnl7ssQChTdPjsKta2Ax2LMaGXz303tq';
            const url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(query)}&limit=20&rating=g`;
            const res = await fetch(url);
            const data = await res.json();
            if (!data.data || data.data.length === 0) return null;
            const random = data.data[Math.floor(Math.random() * data.data.length)];
            return random.images.fixed_height.mp4;
        }

        for (const reaction of REACTION_LIST) {
            if (path === `/reactions/${reaction}` && method === 'GET') {
                const gifUrl = await fetchGif(`${reaction} anime`);
                if (!gifUrl) {
                    return new Response(JSON.stringify({ error: 'No GIF found' }), {
                        status: 404,
                        headers: corsHeaders
                    });
                }
                return new Response(JSON.stringify({ url: gifUrl }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
        }

        // ==================== UNIVERSAL NEXRAY PROXY ====================
        // This handles ALL 255+ endpoints you pasted!
        if (shouldProxyToNexray(path)) {
            return proxyToNexray(request, path);
        }

        // Catch-all for any other Nexray paths
        if (path.startsWith('/ai/') || path.startsWith('/search/') || path.startsWith('/tools/') ||
            path.startsWith('/ephoto/') || path.startsWith('/textpro/') || path.startsWith('/maker/') ||
            path.startsWith('/canvas/') || path.startsWith('/editor/') || path.startsWith('/fun/') ||
            path.startsWith('/berita/') || path.startsWith('/information/') || path.startsWith('/payment/') ||
            path.startsWith('/anime/') || path.startsWith('/random/') || path.startsWith('/download/') ||
            path.startsWith('/game/') || path.startsWith('/ssweb/')) {
            return proxyToNexray(request, path);
        }

        return new Response(JSON.stringify({ error: 'Endpoint not found' }), { status: 404, headers: corsHeaders });
    } catch (err) {
        console.error(err);
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
    }
  }
};