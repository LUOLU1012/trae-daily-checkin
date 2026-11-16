const puppeteer = require('puppeteer');
const TRAE_URL = 'https://www.trae.cn/agent';

function log(message) {
  const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log(`[${timestamp}] ${message}`);
}

function parseCookieString(cookieStr, domain) {
  const cookies = [];
  const pairs = cookieStr.split(';').map(p => p.trim()).filter(p => p);
  for (const pair of pairs) {
    const eqIndex = pair.indexOf('=');
    if (eqIndex === -1) continue;
    const name = pair.substring(0, eqIndex).trim();
    const value = pair.substring(eqIndex + 1).trim();
    if (name && value) {
      cookies.push({ name, value, domain: domain, path: '/', httpOnly: false, secure: false, sameSite: 'Lax' });
    }
  }
  return cookies;
}

async function main() {
  log('=== TRAE 每日签到开始 ===');
  const cookieString = process.env.TRAE_COOKIE_STRING;
  if (!cookieString) { log('❌ 未找到 TRAE_COOKIE_STRING'); process.exit(1); }

  let browser;
  try {
    log('🚀 启动浏览器...');
    browser = await puppeteer.launch({
      headless: 'new',
      defaultViewport: { width: 1280, height: 800 },
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    log('🍪 加载登录状态...');
    await page.goto('https://www.trae.cn', { waitUntil: 'domcontentloaded' });
    const cookies = parseCookieString(cookieString, '.trae.cn');
    await page.setCookie(...cookies);
    log(`   已加载 ${cookies.length} 个 Cookie`);

    log('🌐 打开 TRAE 工作台...');
    await page.goto(TRAE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForTimeout(3000);

    log('🔍 检查登录状态...');
    const pageText = await page.evaluate(() => document.body.innerText);
    const hasLoginButton = pageText.includes('登录') && pageText.indexOf('登录') < 200;

    if (hasLoginButton) {
      log('❌ 登录状态失效，请更新 Cookie');
      await browser.close();
      process.exit(1);
    }

    log('✅ 已登录，查找签到入口...');

    const checkinResult = await page.evaluate(() => {
      const allElements = document.querySelectorAll('*');
      
      // 检查是否已签到
      for (const el of allElements) {
        if (el.children.length > 0) continue;
        const text = el.textContent.trim();
        if (text.includes('已签到') && el.offsetParent !== null) {
          return { status: 'already', text: text };
        }
      }
      
      // 点击签到按钮
      for (const el of allElements) {
        if (el.children.length > 0) continue;
        const text = el.textContent.trim();
        if (text === '签到' && el.offsetParent !== null) {
          let clickable = el;
          for (let i = 0; i < 5; i++) {
            if (clickable.tagName === 'BUTTON' || clickable.style.cursor === 'pointer') break;
            if (clickable.parentElement) clickable = clickable.parentElement;
            else break;
          }
          clickable.click();
          return { status: 'clicked', text: text };
        }
      }
      
      // 尝试点击包含"签到"的元素
      for (const el of allElements) {
        if (el.children.length > 0) continue;
        const text = el.textContent.trim();
        if (text.includes('签到') && !text.includes('已签到') && el.offsetParent !== null) {
          el.click();
          return { status: 'clicked_any', text: text };
        }
      }
      
      return { status: 'notfound' };
    });

    await page.waitForTimeout(2000);

    if (checkinResult.status === 'already') {
      log('ℹ️  今日已签到');
    } else if (checkinResult.status.startsWith('clicked')) {
      log('✅ 签到成功！');
    } else {
      log('⚠️  未找到签到按钮');
      try { await page.screenshot({ path: '/tmp/debug.png', fullPage: true }); } catch (e) {}
    }

    log('=== 完成 ===');

  } catch (error) {
    log(`❌ 出错: ${error.message}`);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

main();
