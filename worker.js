// Apex CRYSNOVA AI – Unified API Gateway
// Theme: Black, Gold, Red · Shooting Stars · Token Management
// FULLY POWERED BY NEXRAY · Prexzy COMPLETELY REMOVED · 255+ Endpoints
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
    const NEXRAY_BASE = 'https://api.nexray.web.id';
    
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

      const contentType = request.headers.get('Content-Type');
      if (contentType) {
        init.headers['Content-Type'] = contentType;
      }

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

    // ==================== FRONTEND LANDING PAGE (PUBLIC) - COMPLETE ====================
    if (path === '/' && method === 'GET') {
        const endpointsByCategory = [
            { category: '🤖 AI Chat (52)', endpoints: [
                { method: 'GET', path: '/ai/gemini', desc: 'Gemini AI' },
                { method: 'GET', path: '/ai/bypass', desc: 'AI Bypass' },
                { method: 'GET', path: '/ai/chatgpt', desc: 'ChatGPT' },
                { method: 'GET', path: '/ai/claude', desc: 'Claude AI' },
                { method: 'GET', path: '/ai/copilot', desc: 'Copilot' },
                { method: 'GET', path: '/ai/deepseek', desc: 'DeepSeek AI' },
                { method: 'GET', path: '/ai/dgaf', desc: 'DGAF AI' },
                { method: 'GET', path: '/ai/epsilon', desc: 'Epsilon AI' },
                { method: 'GET', path: '/ai/felo', desc: 'Felo AI' },
                { method: 'GET', path: '/ai/gitagpt', desc: 'GitaGPT' },
                { method: 'GET', path: '/ai/gpt-3.5-turbo', desc: 'GPT-3.5 Turbo' },
                { method: 'GET', path: '/ai/islamic', desc: 'Islamic AI' },
                { method: 'GET', path: '/ai/kimi', desc: 'Kimi AI' },
                { method: 'GET', path: '/ai/mathgpt', desc: 'MathGPT' },
                { method: 'GET', path: '/ai/openai', desc: 'OpenAI' },
                { method: 'GET', path: '/ai/overchat', desc: 'OverChat' },
                { method: 'GET', path: '/ai/perplexity', desc: 'Perplexity' },
                { method: 'GET', path: '/ai/quillbot', desc: 'QuillBot' },
                { method: 'GET', path: '/ai/schoolhub', desc: 'SchoolHub' },
                { method: 'GET', path: '/ai/turbochat', desc: 'TurboChat' },
                { method: 'GET', path: '/ai/turboseek', desc: 'TurboSeek' },
                { method: 'GET', path: '/ai/dolphin?template=logical', desc: 'Dolphin (Logical)' },
                { method: 'GET', path: '/ai/dolphin?template=creative', desc: 'Dolphin (Creative)' },
                { method: 'GET', path: '/ai/dolphin?template=summarize', desc: 'Dolphin (Summarize)' },
                { method: 'GET', path: '/ai/dolphin?template=code-advanced', desc: 'Dolphin (Code)' },
                { method: 'GET', path: '/ai/duck?model=claude-haiku-4-5', desc: 'Duck (Claude Haiku)' },
                { method: 'GET', path: '/ai/duck?model=gpt-4o-mini', desc: 'Duck (GPT-4o Mini)' },
                { method: 'GET', path: '/ai/duck?model=gpt-5-mini', desc: 'Duck (GPT-5 Mini)' },
                { method: 'GET', path: '/ai/glm?model=glm-4.6', desc: 'GLM 4.6' },
                { method: 'GET', path: '/ai/glm?model=glm-4.6v', desc: 'GLM 4.6V (Vision)' },
                { method: 'GET', path: '/ai/glm?model=glm-4.5', desc: 'GLM 4.5' },
                { method: 'GET', path: '/ai/glm?model=chatglm', desc: 'ChatGLM' },
                { method: 'GET', path: '/ai/hammer?model=Sleepy', desc: 'Hammer (Sleepy)' },
                { method: 'GET', path: '/ai/hammer?model=Sarah', desc: 'Hammer (Sarah)' },
                { method: 'GET', path: '/ai/hammer?model=Aiko', desc: 'Hammer (Aiko)' },
                { method: 'GET', path: '/ai/heck?model=openai/gpt-5-nano', desc: 'Heck (GPT-5 Nano)' },
                { method: 'GET', path: '/ai/heck?model=google/gemini-2.0-flash-001', desc: 'Heck (Gemini Flash)' },
                { method: 'GET', path: '/ai/llamacoder?model=qwen3-coder', desc: 'LlamaCoder (Qwen)' },
                { method: 'GET', path: '/ai/llamacoder?model=deepseek-v3.1', desc: 'LlamaCoder (DeepSeek)' },
                { method: 'GET', path: '/ai/llamacoder?model=kimi-k2.1', desc: 'LlamaCoder (Kimi)' },
                { method: 'GET', path: '/ai/story?mode=Any+genre&length=Short&creative=Medium', desc: 'Story (Short/Med)' },
                { method: 'GET', path: '/ai/story?mode=Any+genre&length=Novel&creative=High', desc: 'Story (Novel/High)' },
                { method: 'GET', path: '/ai/dreamanalyze', desc: 'Dream Analyzer' },
                { method: 'GET', path: '/ai/grammarcheck', desc: 'Grammar Check' }
            ] },
            { category: '🎨 AI Image Generation (12)', endpoints: [
                { method: 'POST', path: '/ai/deepimg', desc: 'DeepImg' },
                { method: 'POST', path: '/ai/v1/flux', desc: 'Flux v1' },
                { method: 'POST', path: '/ai/gptimage', desc: 'GPT Image' },
                { method: 'POST', path: '/ai/ideogram', desc: 'Ideogram' },
                { method: 'POST', path: '/ai/lumin', desc: 'Lumin' },
                { method: 'POST', path: '/ai/magicstudio', desc: 'Magic Studio' },
                { method: 'POST', path: '/ai/nanobanana', desc: 'NanoBanana' },
                { method: 'POST', path: '/ai/v1/text2image', desc: 'Text2Image v1' },
                { method: 'POST', path: '/ai/writecreamimg?ratio=1:1', desc: 'WriteCream (1:1)' },
                { method: 'POST', path: '/ai/writecreamimg?ratio=9:16', desc: 'WriteCream (9:16)' }
            ] },
            { category: '🎵 AI Audio/Video (5)', endpoints: [
                { method: 'GET', path: '/ai/gemini-tts', desc: 'Gemini TTS' },
                { method: 'GET', path: '/ai/suno', desc: 'Suno AI Music' },
                { method: 'GET', path: '/ai/veo2', desc: 'Veo 2 Video' },
                { method: 'GET', path: '/ai/veo3', desc: 'Veo 3 Video' },
                { method: 'GET', path: '/ai/deepsearch', desc: 'DeepSearch' }
            ] },
            { category: '🎭 Reactions (39)', endpoints: [
                { method: 'GET', path: '/reactions/hug', desc: 'Hug GIF' },
                { method: 'GET', path: '/reactions/kiss', desc: 'Kiss GIF' },
                { method: 'GET', path: '/reactions/slap', desc: 'Slap GIF' },
                { method: 'GET', path: '/reactions/kill', desc: 'Kill GIF' },
                { method: 'GET', path: '/reactions/dance', desc: 'Dance GIF' },
                { method: 'GET', path: '/reactions/laugh', desc: 'Laugh GIF' },
                { method: 'GET', path: '/reactions/cry', desc: 'Cry GIF' },
                { method: 'GET', path: '/reactions/highfive', desc: 'High Five' },
                { method: 'GET', path: '/reactions/giggles', desc: 'Giggles' },
                { method: 'GET', path: '/reactions/fight', desc: 'Fight' },
                { method: 'GET', path: '/reactions/pat', desc: 'Pat' },
                { method: 'GET', path: '/reactions/bite', desc: 'Bite' },
                { method: 'GET', path: '/reactions/smile', desc: 'Smile' },
                { method: 'GET', path: '/reactions/angry', desc: 'Angry' },
                { method: 'GET', path: '/reactions/cuddle', desc: 'Cuddle' },
                { method: 'GET', path: '/reactions/poke', desc: 'Poke' },
                { method: 'GET', path: '/reactions/boop', desc: 'Boop' },
                { method: 'GET', path: '/reactions/lick', desc: 'Lick' },
                { method: 'GET', path: '/reactions/shoot', desc: 'Shoot' },
                { method: 'GET', path: '/reactions/stab', desc: 'Stab' },
                { method: 'GET', path: '/reactions/wink', desc: 'Wink' },
                { method: 'GET', path: '/reactions/yawn', desc: 'Yawn' },
                { method: 'GET', path: '/reactions/blush', desc: 'Blush' },
                { method: 'GET', path: '/reactions/punch', desc: 'Punch' },
                { method: 'GET', path: '/reactions/headpat', desc: 'Headpat' },
                { method: 'GET', path: '/reactions/tickle', desc: 'Tickle' },
                { method: 'GET', path: '/reactions/snuggle', desc: 'Snuggle' },
                { method: 'GET', path: '/reactions/glare', desc: 'Glare' },
                { method: 'GET', path: '/reactions/wave', desc: 'Wave' },
                { method: 'GET', path: '/reactions/clap', desc: 'Clap' },
                { method: 'GET', path: '/reactions/facepalm', desc: 'Facepalm' },
                { method: 'GET', path: '/reactions/shrug', desc: 'Shrug' },
                { method: 'GET', path: '/reactions/thumbsup', desc: 'Thumbs Up' },
                { method: 'GET', path: '/reactions/ok', desc: 'OK' },
                { method: 'GET', path: '/reactions/peace', desc: 'Peace' },
                { method: 'GET', path: '/reactions/fistbump', desc: 'Fist Bump' },
                { method: 'GET', path: '/reactions/nope', desc: 'Nope' },
                { method: 'GET', path: '/reactions/evil', desc: 'Evil Grin' }
            ] },
            { category: '🛠️ Core Services (6)', endpoints: [
                { method: 'POST', path: '/transcribe', desc: 'Voice Transcription (Groq)' },
                { method: 'POST', path: '/vision', desc: 'Image Description (Groq)' }
            ] },
            { category: '🛠️ Nexray Tools (30+)', endpoints: [
                { method: 'POST', path: '/tools/ocr', desc: 'OCR Text Extract' },
                { method: 'POST', path: '/tools/removebg', desc: 'Remove Background' },
                { method: 'POST', path: '/tools/remini', desc: 'Enhance Image' },
                { method: 'GET', path: '/tools/translate', desc: 'Translate Text' },
                { method: 'GET', path: '/tools/tts-google', desc: 'Google TTS' },
                { method: 'GET', path: '/tools/tts-tokohpresiden?tokoh=jokowi', desc: 'Jokowi TTS' },
                { method: 'GET', path: '/tools/trackip', desc: 'IP Tracker' },
                { method: 'GET', path: '/tools/cekresi', desc: 'Cek Resi' },
                { method: 'GET', path: '/information/cuaca', desc: 'Weather' },
                { method: 'GET', path: '/information/gempa', desc: 'Earthquake Info' },
                { method: 'GET', path: '/information/jadwalsholat', desc: 'Prayer Times' },
                { method: 'GET', path: '/information/jadwalbola', desc: 'Football Schedule' },
                { method: 'GET', path: '/information/jadwaltv', desc: 'TV Schedule' },
                { method: 'GET', path: '/information/hari-libur', desc: 'Holidays' },
                { method: 'GET', path: '/information/cektagihanpln', desc: 'PLN Bill Check' },
                { method: 'GET', path: '/information/check-rekening', desc: 'Bank Account Check' },
                { method: 'GET', path: '/tools/ssweb', desc: 'Screenshot Web' },
                { method: 'GET', path: '/tools/v1/ssweb?full_page=true', desc: 'Full Page SS' },
                { method: 'GET', path: '/tools/webtozip', desc: 'Web to ZIP' },
                { method: 'GET', path: '/tools/yt-transcribe', desc: 'YouTube Transcribe' },
                { method: 'GET', path: '/tools/v1/youtube-summarize', desc: 'YT Summarize v1' },
                { method: 'GET', path: '/tools/v2/youtube-summarize', desc: 'YT Summarize v2' },
                { method: 'GET', path: '/tools/whatsmusic', desc: 'What\'s Music' },
                { method: 'GET', path: '/tools/tiktokearnings', desc: 'TikTok Earnings' },
                { method: 'GET', path: '/tools/tiktokhashtags', desc: 'TikTok Hashtags' },
                { method: 'GET', path: '/tools/subdomainfinder', desc: 'Subdomain Finder' },
                { method: 'GET', path: '/tools/nikparse', desc: 'NIK Parser' },
                { method: 'GET', path: '/tools/nsfw-checker', desc: 'NSFW Checker' },
                { method: 'GET', path: '/tools/spamngl', desc: 'Spam NGL' },
                { method: 'GET', path: '/tools/telegram-sticker', desc: 'Telegram Sticker' },
                { method: 'GET', path: '/tools/vcc?type=american-express', desc: 'VCC Generator' }
            ] },
            { category: '👤 Username Generator (8)', endpoints: [
                { method: 'GET', path: '/tools/usernamegen?mode=instans&theme=action', desc: 'Username (Action)' },
                { method: 'GET', path: '/tools/usernamegen?mode=instans&theme=adventure', desc: 'Username (Adventure)' },
                { method: 'GET', path: '/tools/usernamegen?mode=instans&theme=fantasy', desc: 'Username (Fantasy)' },
                { method: 'GET', path: '/tools/usernamegen?mode=instans&theme=historical', desc: 'Username (Historical)' },
                { method: 'GET', path: '/tools/usernamegen?mode=instans&theme=mythology', desc: 'Username (Mythology)' },
                { method: 'GET', path: '/tools/usernamegen?mode=instans&theme=sci-fi', desc: 'Username (Sci-Fi)' },
                { method: 'GET', path: '/tools/usernamegen?mode=ai&theme=sci-fi', desc: 'Username AI (Sci-Fi)' },
                { method: 'GET', path: '/tools/usernamegen?mode=ai&theme=horror', desc: 'Username AI (Horror)' }
            ] },
            { category: '🖼️ Image Enhancement (10+)', endpoints: [
                { method: 'POST', path: '/tools/upscale?resolusi=1', desc: 'Upscale 1x' },
                { method: 'POST', path: '/tools/upscale?resolusi=4', desc: 'Upscale 4x' },
                { method: 'POST', path: '/tools/upscale?resolusi=16', desc: 'Upscale 16x' },
                { method: 'POST', path: '/tools/v1/upscale', desc: 'Upscale v1' },
                { method: 'POST', path: '/tools/v2/upscale', desc: 'Upscale v2' },
                { method: 'POST', path: '/tools/v3/upscale', desc: 'Upscale v3' },
                { method: 'POST', path: '/tools/v4/upscale?resolusi=2', desc: 'Upscale v4 (2x)' },
                { method: 'POST', path: '/tools/v4/upscale?resolusi=4', desc: 'Upscale v4 (4x)' },
                { method: 'POST', path: '/tools/v5/upscale', desc: 'Upscale v5' },
                { method: 'POST', path: '/tools/enhancer?resolusi=16', desc: 'Enhancer 16x' },
                { method: 'POST', path: '/tools/enhancer?resolusi=8', desc: 'Enhancer 8x' },
                { method: 'POST', path: '/tools/enhancer?resolusi=4', desc: 'Enhancer 4x' },
                { method: 'POST', path: '/tools/v1/enhancer', desc: 'Enhancer v1' },
                { method: 'POST', path: '/tools/v2/enhancer?type=ultra', desc: 'Enhancer v2 (Ultra)' },
                { method: 'POST', path: '/tools/v2/enhancer?type=fast', desc: 'Enhancer v2 (Fast)' },
                { method: 'POST', path: '/tools/v2/enhancer?type=restore', desc: 'Enhancer v2 (Restore)' },
                { method: 'POST', path: '/tools/colorize', desc: 'Colorize B&W' },
                { method: 'POST', path: '/tools/unblur', desc: 'Unblur Image' },
                { method: 'POST', path: '/tools/blurface', desc: 'Blur Face' }
            ] },
            { category: '🎬 Video Tools (6)', endpoints: [
                { method: 'POST', path: '/tools/hdvideo', desc: 'HD Video Enhance' },
                { method: 'POST', path: '/tools/v1/hdvideo?resolusi=hd', desc: 'HD Video (HD)' },
                { method: 'POST', path: '/tools/v1/hdvideo?resolusi=full-hd', desc: 'HD Video (Full HD)' },
                { method: 'POST', path: '/tools/v1/hdvideo?resolusi=2k', desc: 'HD Video (2K)' },
                { method: 'POST', path: '/tools/v1/hdvideo?resolusi=4k', desc: 'HD Video (4K)' },
                { method: 'POST', path: '/tools/dewatermark', desc: 'Remove Watermark' }
            ] },
            { category: '🎨 Ephoto Effects (25)', endpoints: [
                { method: 'POST', path: '/ephoto/anime', desc: 'Anime Effect' },
                { method: 'POST', path: '/ephoto/art', desc: 'Art Effect' },
                { method: 'POST', path: '/ephoto/asci', desc: 'ASCII Effect' },
                { method: 'POST', path: '/ephoto/borealis', desc: 'Borealis' },
                { method: 'POST', path: '/ephoto/botak', desc: 'Bald Effect' },
                { method: 'POST', path: '/ephoto/bravegreen', desc: 'Brave Green' },
                { method: 'POST', path: '/ephoto/cinematic', desc: 'Cinematic' },
                { method: 'POST', path: '/ephoto/chibi', desc: 'Chibi Style' },
                { method: 'POST', path: '/ephoto/comic', desc: 'Comic Effect' },
                { method: 'POST', path: '/ephoto/fairglow', desc: 'Fair Glow' },
                { method: 'POST', path: '/ephoto/v1/figure', desc: 'Figure v1' },
                { method: 'POST', path: '/ephoto/v2/figure', desc: 'Figure v2' },
                { method: 'POST', path: '/ephoto/ghibli', desc: 'Ghibli Style' },
                { method: 'POST', path: '/ephoto/hitam', desc: 'Black Effect' },
                { method: 'POST', path: '/ephoto/luminare', desc: 'Luminare' },
                { method: 'POST', path: '/ephoto/mafia', desc: 'Mafia Style' },
                { method: 'POST', path: '/ephoto/mirror', desc: 'Mirror Effect' },
                { method: 'POST', path: '/ephoto/mountain', desc: 'Mountain' },
                { method: 'POST', path: '/ephoto/monochrome', desc: 'Monochrome' },
                { method: 'POST', path: '/ephoto/nft', desc: 'NFT Style' },
                { method: 'POST', path: '/ephoto/playlist', desc: 'Playlist' },
                { method: 'POST', path: '/ephoto/qin', desc: 'Qin Effect' },
                { method: 'POST', path: '/ephoto/real', desc: 'Realistic' },
                { method: 'POST', path: '/ephoto/statue', desc: 'Statue Effect' },
                { method: 'POST', path: '/ephoto/street', desc: 'Street Style' }
            ] },
            { category: '✏️ TextPro Effects (13)', endpoints: [
                { method: 'GET', path: '/textpro/avengers', desc: 'Avengers Logo' },
                { method: 'GET', path: '/textpro/cartoon-graffiti', desc: 'Cartoon Graffiti' },
                { method: 'GET', path: '/textpro/comic', desc: 'Comic Text' },
                { method: 'GET', path: '/textpro/glitch', desc: 'Glitch Text' },
                { method: 'GET', path: '/textpro/dragonball', desc: 'Dragon Ball' },
                { method: 'GET', path: '/textpro/marvel?background=logo-1', desc: 'Marvel Logo' },
                { method: 'GET', path: '/textpro/foggy-glass?background=bear', desc: 'Foggy Glass' },
                { method: 'GET', path: '/textpro/wolf-galaxy', desc: 'Wolf Galaxy' },
                { method: 'GET', path: '/textpro/wetglass', desc: 'Wet Glass' },
                { method: 'GET', path: '/textpro/painting', desc: 'Painting Style' },
                { method: 'GET', path: '/textpro/pixel-glitch', desc: 'Pixel Glitch' },
                { method: 'GET', path: '/textpro/mascot', desc: 'Mascot Logo' },
                { method: 'GET', path: '/textpro/naruto', desc: 'Naruto Style' }
            ] },
            { category: '🛠️ Maker Tools (14)', endpoints: [
                { method: 'GET', path: '/maker/bratanime', desc: 'Brat Anime' },
                { method: 'GET', path: '/maker/attp', desc: 'Animated Text PNG' },
                { method: 'GET', path: '/maker/brat', desc: 'Brat Generator' },
                { method: 'GET', path: '/maker/balogo', desc: 'BA Logo' },
                { method: 'GET', path: '/maker/ttp', desc: 'Text to Picture' },
                { method: 'GET', path: '/maker/msg?icon=warning', desc: 'Message Generator' },
                { method: 'GET', path: '/maker/smeme', desc: 'Meme Generator' },
                { method: 'GET', path: '/maker/ustadz', desc: 'Ustadz Text' },
                { method: 'GET', path: '/maker/nulis', desc: 'Handwriting' },
                { method: 'GET', path: '/maker/qc', desc: 'Quote Creator' },
                { method: 'GET', path: '/maker/fakestory', desc: 'Fake Story' },
                { method: 'GET', path: '/maker/fakethreads', desc: 'Fake Threads' },
                { method: 'GET', path: '/maker/bratvid', desc: 'Brat Video' },
                { method: 'GET', path: '/maker/brathd', desc: 'Brat HD' }
            ] },
            { category: '🎮 Canvas (9)', endpoints: [
                { method: 'GET', path: '/canvas/youtube', desc: 'YouTube Banner' },
                { method: 'GET', path: '/canvas/v2/welcomeleave', desc: 'Welcome/Leave v2' },
                { method: 'GET', path: '/canvas/v1/welcomeleave', desc: 'Welcome/Leave v1' },
                { method: 'GET', path: '/canvas/rankcard?status=online', desc: 'Rank Card' },
                { method: 'GET', path: '/canvas/quotly', desc: 'Quote Card' },
                { method: 'GET', path: '/canvas/musiccard', desc: 'Music Card' },
                { method: 'GET', path: '/canvas/mpls', desc: 'MPLS Card' },
                { method: 'GET', path: '/canvas/jmk', desc: 'JMK Card' },
                { method: 'GET', path: '/canvas/gura', desc: 'Gura Style' }
            ] },
            { category: '🔍 Search (18)', endpoints: [
                { method: 'GET', path: '/search/youtube', desc: 'YouTube Search' },
                { method: 'GET', path: '/search/wikipedia', desc: 'Wikipedia' },
                { method: 'GET', path: '/search/tiktoktrend', desc: 'TikTok Trends' },
                { method: 'GET', path: '/search/tiktokuser', desc: 'TikTok User' },
                { method: 'GET', path: '/search/tiktok', desc: 'TikTok Search' },
                { method: 'GET', path: '/search/tiktokphoto', desc: 'TikTok Photo' },
                { method: 'GET', path: '/search/terabox', desc: 'Terabox Search' },
                { method: 'GET', path: '/search/stickerly', desc: 'Stickerly' },
                { method: 'GET', path: '/search/v1/spotify', desc: 'Spotify v1' },
                { method: 'GET', path: '/search/spotify', desc: 'Spotify' },
                { method: 'GET', path: '/search/pinterest', desc: 'Pinterest' },
                { method: 'GET', path: '/search/playstore', desc: 'Play Store' },
                { method: 'GET', path: '/search/npmjs', desc: 'NPM Search' },
                { method: 'GET', path: '/search/lyrics', desc: 'Lyrics' },
                { method: 'GET', path: '/search/googleimage', desc: 'Google Images' },
                { method: 'GET', path: '/search/github', desc: 'GitHub' },
                { method: 'GET', path: '/search/bingimage', desc: 'Bing Images' },
                { method: 'GET', path: '/search/capcut', desc: 'CapCut Templates' }
            ] },
            { category: '📰 Berita/News (10)', endpoints: [
                { method: 'GET', path: '/berita/antara', desc: 'Antara News' },
                { method: 'GET', path: '/berita/cnn', desc: 'CNN News' },
                { method: 'GET', path: '/berita/ffnews', desc: 'FF News' },
                { method: 'GET', path: '/berita/cnbcindonesia', desc: 'CNBC Indonesia' },
                { method: 'GET', path: '/berita/sindonews', desc: 'Sindo News' },
                { method: 'GET', path: '/berita/suara', desc: 'Suara News' },
                { method: 'GET', path: '/berita/merdeka', desc: 'Merdeka News' },
                { method: 'GET', path: '/berita/mlbb', desc: 'MLBB News' },
                { method: 'GET', path: '/berita/jkt48', desc: 'JKT48 News' },
                { method: 'GET', path: '/berita/kompas', desc: 'Kompas News' }
            ] },
            { category: '📥 Downloader (8)', endpoints: [
                { method: 'GET', path: '/download/aio', desc: 'All-in-One' },
                { method: 'GET', path: '/download/capcut', desc: 'CapCut' },
                { method: 'GET', path: '/download/twitter', desc: 'Twitter/X' },
                { method: 'GET', path: '/download/terabox', desc: 'Terabox' },
                { method: 'GET', path: '/download/threads', desc: 'Threads' },
                { method: 'GET', path: '/download/facebookv2', desc: 'Facebook' },
                { method: 'GET', path: '/download/saveweb2zip', desc: 'Save Web as ZIP' },
                { method: 'GET', path: '/download/ytinfo', desc: 'YouTube Info' }
            ] },
            { category: '🎲 Random & Fun (5)', endpoints: [
                { method: 'GET', path: '/random/anime?type=waifu', desc: 'Random Waifu' },
                { method: 'GET', path: '/fun/livefunfact', desc: 'Live Fun Fact' },
                { method: 'GET', path: '/fun/alay', desc: 'Alay Text Generator' },
                { method: 'GET', path: '/information/growagarden', desc: 'Grow a Garden' },
                { method: 'GET', path: '/tools/emojigif', desc: 'Emoji GIF' },
                { method: 'GET', path: '/tools/emojimix', desc: 'Emoji Mix' }
            ] },
            { category: '💰 Payment (2)', endpoints: [
                { method: 'POST', path: '/payment/saweria/create', desc: 'Create Saweria' },
                { method: 'GET', path: '/payment/saweria/check', desc: 'Check Saweria' }
            ] },
            { category: '🎬 Editor (2)', endpoints: [
                { method: 'POST', path: '/editor/wanted', desc: 'Wanted Poster' },
                { method: 'POST', path: '/editor/wasted', desc: 'Wasted Effect (GTA)' }
            ] },
            { category: '🎮 Game (2)', endpoints: [
                { method: 'GET', path: '/game/quizcategories', desc: 'Quiz Categories' },
                { method: 'GET', path: '/game/quizguess', desc: 'Quiz Game' }
            ] },
            { category: '🖥️ Screenshot (3)', endpoints: [
                { method: 'GET', path: '/ssweb/webss', desc: 'Web Screenshot' },
                { method: 'GET', path: '/ssweb/apiFlash', desc: 'ApiFlash' },
                { method: 'GET', path: '/ssweb/screenshotLayer', desc: 'Screenshot Layer' }
            ] },
            { category: '🎵 Anime/Manga (9)', endpoints: [
                { method: 'GET', path: '/anime/anichin/detail', desc: 'Anime Detail' },
                { method: 'GET', path: '/anime/anichin/search', desc: 'Anime Search' },
                { method: 'GET', path: '/anime/anichin/stream', desc: 'Anime Stream' },
                { method: 'GET', path: '/anime/anichin/genres', desc: 'Anime Genres' },
                { method: 'GET', path: '/anime/komiku/detail', desc: 'Manga Detail' },
                { method: 'GET', path: '/anime/komiku/search', desc: 'Manga Search' },
                { method: 'GET', path: '/anime/komiku/chapter', desc: 'Manga Chapter' },
                { method: 'GET', path: '/anime/komiku/popular', desc: 'Popular Manga' }
            ] },
            { category: '🔧 Code Tools (4)', endpoints: [
                { method: 'GET', path: '/tools/codeconvert?mode=esm', desc: 'Code Convert (ESM)' },
                { method: 'GET', path: '/tools/codeconvert?mode=cjs', desc: 'Code Convert (CJS)' },
                { method: 'GET', path: '/tools/compilejs', desc: 'Compile JS' },
                { method: 'GET', path: '/tools/html2img', desc: 'HTML to Image' }
            ] },
            { category: '🛡️ Security Tools (3)', endpoints: [
                { method: 'GET', path: '/tools/bypass/cf?mode=waf-session', desc: 'Cloudflare Bypass' },
                { method: 'POST', path: '/tools/faceswap', desc: 'Face Swap' },
                { method: 'GET', path: '/tools/v1/dewatermark', desc: 'Dewatermark v1' },
                { method: 'GET', path: '/tools/v2/dewatermark', desc: 'Dewatermark v2' }
            ] }
        ];

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ஃ APEX CRYSN☉VA · 255+ Nexray Endpoints</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#0b0a0c;min-height:100vh;font-family:'Inter',system-ui,sans-serif;color:#e0d6b0;padding:2rem 1rem;position:relative;overflow-x:hidden}
    canvas#starfield{position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none}
    .container{max-width:1600px;margin:0 auto;position:relative;z-index:2}
    .header{text-align:center;margin-bottom:3rem;backdrop-filter:blur(8px);background:rgba(20,15,10,0.3);border:1px solid rgba(212,175,55,0.3);border-radius:40px;padding:2.5rem 2rem;box-shadow:0 20px 40px rgba(0,0,0,0.6),0 0 40px rgba(212,175,55,0.1)}
    h1{font-size:3.5rem;font-weight:700;background:linear-gradient(135deg,#d4af37 0%,#ff4d4d 80%);-webkit-background-clip:text;background-clip:text;color:transparent;letter-spacing:-0.02em;margin-bottom:0.5rem;text-shadow:0 0 30px rgba(212,175,55,0.3)}
    .subtitle{font-size:1.2rem;color:#b0a080;margin-bottom:1.5rem}
    .powered-by{display:inline-block;background:rgba(212,175,55,0.15);border:1px solid #d4af37;padding:6px 20px;border-radius:40px;font-size:0.9rem;margin-bottom:1rem}
    .status-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(20,15,10,0.5);border:1px solid #d4af37;padding:8px 20px;border-radius:40px;font-size:0.95rem;margin-bottom:1rem}
    .pulse-dot{width:12px;height:12px;background:#10b981;border-radius:50%;box-shadow:0 0 15px #10b981;animation:pulse 2s infinite}
    @keyframes pulse{0%{opacity:1;transform:scale(1)}50%{opacity:0.6;transform:scale(1.2)}100%{opacity:1;transform:scale(1)}}
    .endpoint-count{display:inline-block;background:#d4af37;color:#0b0a0c;padding:4px 12px;border-radius:20px;font-size:0.9rem;font-weight:600;margin-left:10px}
    .token-panel{background:rgba(20,15,10,0.5);backdrop-filter:blur(8px);border:1px solid rgba(212,175,55,0.2);border-radius:40px;padding:1.5rem;margin-bottom:2rem;display:flex;align-items:center;justify-content:center;gap:20px;flex-wrap:wrap}
    .token-panel input{flex:1;min-width:250px;background:#1a1410;border:1px solid #d4af37;border-radius:40px;padding:12px 20px;color:#e0d6b0;font-size:1rem;outline:none}
    .token-panel button{background:#d4af37;color:#0b0a0c;border:none;padding:12px 30px;border-radius:40px;font-weight:600;cursor:pointer;transition:all 0.2s}
    .token-panel button:hover{background:#ff4d4d;color:#fff;box-shadow:0 0 20px #ff4d4d}
    .token-actions{display:flex;gap:12px;justify-content:center;margin:1rem 0 2rem;flex-wrap:wrap}
    .token-actions button{background:transparent;border:1px solid #d4af37;color:#d4af37;padding:10px 24px;border-radius:40px;cursor:pointer;transition:all 0.2s}
    .token-actions button:hover{background:#d4af37;color:#0b0a0c}
    .search-box{width:100%;max-width:400px;margin:0 auto 2rem}
    .search-box input{width:100%;background:#1a1410;border:1px solid #d4af37;border-radius:40px;padding:12px 20px;color:#e0d6b0;font-size:1rem;outline:none}
    .category-section{margin-bottom:2.5rem}
    .category-title{font-size:1.5rem;font-weight:600;color:#d4af37;margin-bottom:1rem;padding-bottom:0.5rem;border-bottom:1px solid rgba(212,175,55,0.3);display:flex;align-items:center;cursor:pointer}
    .category-title:hover{color:#ff4d4d}
    .toggle-icon{margin-right:10px;transition:transform 0.3s}
    .toggle-icon.collapsed{transform:rotate(-90deg)}
    .endpoints-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:15px;transition:all 0.3s}
    .endpoints-grid.collapsed{display:none}
    .card{background:rgba(20,15,10,0.6);backdrop-filter:blur(8px);border:1px solid rgba(212,175,55,0.2);border-radius:15px;padding:1rem;transition:all 0.3s;box-shadow:0 5px 15px rgba(0,0,0,0.3)}
    .card:hover{border-color:#d4af37;box-shadow:0 0 20px rgba(212,175,55,0.15);transform:translateY(-2px)}
    .card-header{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}
    .method{background:#ff4d4d;color:#fff;font-weight:600;padding:3px 8px;border-radius:10px;font-size:0.7rem}
    .endpoint-path{font-family:'Monaco','Menlo',monospace;font-size:0.8rem;color:#d4af37;word-break:break-all}
    .card p{color:#b0a080;font-size:0.8rem;margin-bottom:12px}
    .copy-btn{background:#1a1410;border:1px solid #d4af37;color:#d4af37;padding:6px 12px;border-radius:20px;cursor:pointer;font-size:0.8rem;transition:all 0.2s;width:100%}
    .copy-btn:hover{background:#d4af37;color:#0b0a0c}
    .social-section{display:flex;justify-content:center;gap:20px;margin:3rem 0;flex-wrap:wrap}
    .social-btn{display:flex;align-items:center;gap:8px;background:rgba(212,175,55,0.1);border:1px solid #d4af37;padding:12px 24px;border-radius:40px;text-decoration:none;color:#e0d6b0;transition:all 0.2s}
    .social-btn:hover{background:#ff4d4d;border-color:#ff4d4d;color:#fff}
    .footer{text-align:center;color:#806850;margin-top:3rem;border-top:1px solid rgba(212,175,55,0.2);padding-top:2rem}
    .back-to-top{position:fixed;bottom:30px;right:30px;background:#d4af37;color:#0b0a0c;width:50px;height:50px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:24px;box-shadow:0 0 20px rgba(212,175,55,0.5);z-index:100;opacity:0;transition:opacity 0.3s}
    .back-to-top.visible{opacity:1}
    .category-nav{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px;justify-content:center}
    .nav-btn{background:transparent;border:1px solid rgba(212,175,55,0.3);color:#b0a080;padding:6px 14px;border-radius:20px;font-size:0.8rem;cursor:pointer;transition:all 0.2s}
    .nav-btn:hover{background:rgba(212,175,55,0.2);color:#d4af37;border-color:#d4af37}
  </style>
</head>
<body>
  <canvas id="starfield"></canvas>
  <div class="container">
    <div class="header">
      <h1>ஃ𖠃 APEX CRYSN⎔VA 🜲</h1>
      <div class="powered-by">⚡ 100% NEXRAY POWERED · ZERO PREXZY ⚡</div>
      <div class="subtitle">255+ Endpoints · 24/7 Active · One Gateway to Rule Them All</div>
      <div class="status-badge"><span class="pulse-dot"></span><span id="globalStatus">🌐 All Systems Operational</span></div>
    </div>
    
    <div class="token-panel">
      <input type="text" id="tokenInput" placeholder="🔑 Paste your API token here">
      <button id="applyTokenBtn">Apply Token</button>
    </div>
    <div class="token-actions">
      <button id="getTempTokenBtn">👾 Get Temporary Token (GitHub)</button>
      <a href="https://wa.me/message/636PEVHM5BZUM1" target="_blank" style="text-decoration:none"><button>💫 Purchase Permanent Token</button></a>
      <button id="expandAllBtn">📂 Expand All</button>
      <button id="collapseAllBtn">📁 Collapse All</button>
    </div>
    
    <div class="search-box">
      <input type="text" id="searchInput" placeholder="🔍 Search endpoints...">
    </div>
    
    <div class="category-nav" id="categoryNav"></div>
    <div id="categoriesContainer"></div>
    
    <div class="social-section">
      <a href="https://whatsapp.com/channel/0029Vb6pe77K0IBn48HLKb38" target="_blank" class="social-btn">📱 WhatsApp Channel</a>
      <a href="https://chat.whatsapp.com/Besbj8VIle1GwxKKZv1lax?mode=gi_t" target="_blank" class="social-btn">👥 WhatsApp Group</a>
      <a href="https://youtube.com/@crysnovax" target="_blank" class="social-btn">▶️ YouTube</a>
      <a href="https://tiktok.com/@crysnovax" target="_blank" class="social-btn">🎵 TikTok</a>
    </div>
    <div class="footer">ⓘ Apex CRYSN⚉VA AI · Secure Token Gateway · 100% Nexray · © 2026</div>
  </div>
  <div class="back-to-top" id="backToTop">↑</div>
  
  <script>
    const categories = ${JSON.stringify(endpointsByCategory)};
    let currentToken = '';
    const tokenInput = document.getElementById('tokenInput');
    const applyBtn = document.getElementById('applyTokenBtn');
    const container = document.getElementById('categoriesContainer');
    const categoryNav = document.getElementById('categoryNav');
    const searchInput = document.getElementById('searchInput');
    
    // Calculate total endpoints
    let totalEndpoints = 0;
    categories.forEach(cat => totalEndpoints += cat.endpoints.length);
    
    function renderCategories() {
      let html = '';
      let navHtml = '';
      
      categories.forEach((cat, index) => {
        const categoryId = 'category-' + index;
        navHtml += '<button class="nav-btn" data-category="' + categoryId + '">' + cat.category.replace(/\\s*\\([0-9]+\\)/, '') + '</button>';
        
        html += '<div class="category-section" id="' + categoryId + '">';
        html += '<h2 class="category-title" data-target="grid-' + index + '">';
        html += '<span class="toggle-icon" id="icon-' + index + '">▼</span>';
        html += cat.category;
        html += '<span class="endpoint-count">' + cat.endpoints.length + '</span>';
        html += '</h2>';
        html += '<div class="endpoints-grid" id="grid-' + index + '">';
        
        cat.endpoints.forEach(ep => {
          html += '<div class="card" data-searchable="' + ep.path.toLowerCase() + ' ' + ep.desc.toLowerCase() + ' ' + cat.category.toLowerCase() + '">';
          html += '<div class="card-header"><span class="method">' + ep.method + '</span>';
          html += '<span class="endpoint-path">' + ep.path + '</span></div>';
          html += '<p>' + ep.desc + '</p>';
          html += '<button class="copy-btn" data-path="' + ep.path + '">📋 Copy URL</button>';
          html += '</div>';
        });
        
        html += '</div></div>';
      });
      
      container.innerHTML = html;
      categoryNav.innerHTML = navHtml;
      
      // Update total in subtitle
      document.querySelector('.subtitle').innerHTML = totalEndpoints + '+ Endpoints · 24/7 Active · One Gateway to Rule Them All';
      
      // Attach event listeners
      document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const path = btn.dataset.path;
          let url = location.origin + path;
          if (currentToken) url += '?token=' + encodeURIComponent(currentToken);
          navigator.clipboard.writeText(url).then(() => {
            btn.textContent = '✅ Copied!';
            setTimeout(() => btn.textContent = '📋 Copy URL', 1500);
          });
        });
      });
      
      // Category toggle
      document.querySelectorAll('.category-title').forEach((title, index) => {
        title.addEventListener('click', () => {
          const grid = document.getElementById('grid-' + index);
          const icon = document.getElementById('icon-' + index);
          grid.classList.toggle('collapsed');
          icon.classList.toggle('collapsed');
        });
      });
      
      // Nav buttons
      document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const categoryId = btn.dataset.category;
          document.getElementById(categoryId).scrollIntoView({ behavior: 'smooth' });
        });
      });
    }
    
    renderCategories();
    
    // Search functionality
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      document.querySelectorAll('.card').forEach(card => {
        const searchable = card.dataset.searchable;
        if (searchable.includes(query)) {
          card.style.display = 'block';
        } else {
          card.style.display = 'none';
        }
      });
      
      // Show/hide empty categories
      document.querySelectorAll('.category-section').forEach(section => {
        const visibleCards = section.querySelectorAll('.card[style="display: block;"]').length;
        if (visibleCards === 0 && query) {
          section.style.display = 'none';
        } else {
          section.style.display = 'block';
        }
      });
    });
    
    applyBtn.onclick = () => { currentToken = tokenInput.value.trim(); };
    
    // Expand/Collapse all
    document.getElementById('expandAllBtn').onclick = () => {
      document.querySelectorAll('.endpoints-grid').forEach(grid => grid.classList.remove('collapsed'));
      document.querySelectorAll('.toggle-icon').forEach(icon => icon.classList.remove('collapsed'));
    };
    
    document.getElementById('collapseAllBtn').onclick = () => {
      document.querySelectorAll('.endpoints-grid').forEach(grid => grid.classList.add('collapsed'));
      document.querySelectorAll('.toggle-icon').forEach(icon => icon.classList.add('collapsed'));
    };
    
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
        alert('✅ Temporary token generated! Valid for 48 hours.');
      } else if (e.data.error) {
        alert('❌ Error: ' + e.data.error);
      }
    });
    
    // Back to top
    const backToTop = document.getElementById('backToTop');
    window.addEventListener('scroll', () => {
      if (window.scrollY > 300) {
        backToTop.classList.add('visible');
      } else {
        backToTop.classList.remove('visible');
      }
    });
    backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    
    // Shooting stars
    const canvas = document.getElementById('starfield');
    const ctx = canvas.getContext('2d');
    let width, height;
    let stars = [];
    function resize(){ width = window.innerWidth; height = window.innerHeight; canvas.width = width; canvas.height = height; }
    window.addEventListener('resize', resize);
    resize();
    for (let i=0; i<150; i++) stars.push({ x: Math.random()*width, y: Math.random()*height, size: Math.random()*2+1, speed: Math.random()*2+0.5 });
    function draw(){
      ctx.fillStyle = '#0b0a0c';
      ctx.fillRect(0,0,width,height);
      ctx.fillStyle = '#e0d6b0';
      stars.forEach(s => { 
        ctx.fillRect(s.x, s.y, s.size, s.size);
        s.y += s.speed * 0.1;
        if (s.y > height) { s.y = 0; s.x = Math.random() * width; }
      });
      if (Math.random()<0.03){
        const sx = Math.random()*width, sy = Math.random()*height/3;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx-80, sy+120);
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