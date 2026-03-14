#!/usr/bin/env node
/**
 * BasicBit Static Site Generator
 * Simple markdown to HTML converter
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { marked } = require('marked');

// Extract headings from markdown for TOC
function extractHeadings(md) {
  const headings = [];

  // Remove code blocks to avoid extracting headings from code comments
  const mdWithoutCodeBlocks = md.replace(/```[\s\S]*?```/g, '');

  // Match markdown headers (##, ###, or ####)
  const mdHeadingRegex = /^(#{1,4})\s+(.+)$/gm;
  let match;
  while ((match = mdHeadingRegex.exec(mdWithoutCodeBlocks)) !== null) {
    const level = match[1].length; // 1 = h1, 2 = h2, 3 = h3, 4 = h4
    const text = match[2].trim();
    const slug = text.toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]+/g, '-');
    headings.push({ level, text, slug });
  }

  // Match HTML headers (<h1> to <h4>) - already in HTML after processing, use original md
  const htmlHeadingRegex = /<(h[1-4])[^>]*>([^<]+)<\/\1>/gi;
  while ((match = htmlHeadingRegex.exec(md)) !== null) {
    const level = parseInt(match[1].charAt(1)); // 1-4
    const text = match[2].trim();
    const slug = text.toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]+/g, '-');
    headings.push({ level, text, slug });
  }

  return headings;
}

// Custom renderer to add IDs to headings and lazy loading to images
const renderer = {
  heading({ tokens, depth }) {
    const text = this.parser.parseInline(tokens);
    const plainText = text.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\u4e00-\u9fa5a-z0-9]+/g, '-');
    return `<h${depth} id="${plainText}">${text}</h${depth}>`;
  },
  image({ href, title, text }) {
    // Add loading="lazy" to all images, but use loading="eager" for images in the first paragraph
    return `<img src="${href}"${title ? ` title="${title}"` : ''} alt="${text}" loading="lazy">`;
  }
};

marked.use({ renderer });

// Post-process HTML to add IDs to h1-h4 that weren't processed by marked
function addHeadingIds(html) {
  let idCounter = {};
  return html.replace(/<(h[1-4])>([^<]+)<\/\1>/gi, (match, tag, text) => {
    let slug = text.toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]+/g, '-');
    if (idCounter[slug]) {
      idCounter[slug]++;
      slug = `${slug}-${idCounter[slug]}`;
    } else {
      idCounter[slug] = 1;
    }
    // Only add ID if not already present
    if (!match.includes('id="')) {
      return `<${tag} id="${slug}">${text}</${tag}>`;
    }
    return match;
  });
}

// Load site config
let siteConfig = {};
try {
  const configContent = fs.readFileSync(path.join(__dirname, '_hexo_config.yml'), 'utf8');
  siteConfig = yaml.load(configContent) || {};
} catch (e) {
  console.log('Using default config');
}

// Configure marked options
marked.setOptions({
  gfm: true,
  breaks: true
});

// Use marked for markdown parsing
function parseMarkdown(md) {
  if (!md) return '';
  return marked.parse(md);
}

// Configuration
const config = {
  source: 'source',
  public: 'public',
  postsDir: 'source/_posts',
  pagesDir: 'source',
  themeDir: 'themes/basicbit',
  adsense: siteConfig.adsense || { enabled: false },
  url: siteConfig.url || 'https://basicbit.cn',
  postsPerPage: 10
};

// Categories and tags data
const categoriesData = [
  { id: 'reverse-engineering', name: '逆向工程', description: '逆向分析技术文章' },
  { id: 'malware-analysis', name: '恶意软件分析', description: '恶意代码分析' },
  { id: 'vulnerability-research', name: '漏洞研究', description: '漏洞挖掘与利用' },
  { id: 'ctf', name: 'CTF', description: 'CTF比赛Writeup' },
  { id: 'exploitation', name: '漏洞利用', description: '漏洞利用技术' }
];

// Parse frontmatter from markdown
function parseFrontmatter(content) {
  // Handle BOM and trim start for robust matching
  content = content.replace(/^\uFEFF/, '').trimStart();
  
  if (!content.startsWith('---')) {
    return { meta: {}, content: content };
  }

  const parts = content.split(/^---\r?\n/m);
  if (parts.length >= 3) {
    const frontmatter = parts[1];
    const body = parts.slice(2).join('---\n');
    try {
      const meta = yaml.load(frontmatter);
      return { meta: meta || {}, content: body };
    } catch (e) {
      return { meta: {}, content: body };
    }
  }

  return { meta: {}, content: content };
}

// Get all posts
function getPosts() {
  const postsDir = path.join(__dirname, config.postsDir);

  if (!fs.existsSync(postsDir)) {
    return [];
  }

  const files = fs.readdirSync(postsDir).filter(f => f.endsWith('.md'));

  const posts = files.map(file => {
    const content = fs.readFileSync(path.join(postsDir, file), 'utf8');
    const { meta, content: body } = parseFrontmatter(content);

    // Skip empty posts (no body content)
    const trimmedBody = body ? body.trim() : '';
    if (!trimmedBody) {
      console.log(`Skipping empty post: ${file}`);
      return null;
    }

    return {
      slug: file.replace('.md', ''),
      title: meta.title || file,
      date: meta.date || new Date().toISOString(),
      categories: meta.categories || [],
      tags: meta.tags || [],
      author: meta.author || '',
      description: meta.description || '',
      original_url: meta.original_url || meta.url || '',
      rawContent: body,
      content: addHeadingIds(parseMarkdown(body))
    };
  }).filter(post => post !== null);

  return posts.sort((a, b) => new Date(b.date) - new Date(a.date));
}

// Get all pages
function getPages() {
  const pages = [];

  function walk(dir, basePath = '') {
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir);

    files.forEach(file => {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        if (file !== '_posts' && file !== 'images') {
          walk(fullPath, path.join(basePath, file));
        }
      } else if (file.endsWith('.md')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const { meta, content: body } = parseFrontmatter(content);

        const relativePath = path.relative(path.join(__dirname, config.pagesDir), fullPath);
        // Handle index.md files in subdirectories (e.g., about/index.md -> about)
        let slug = relativePath.replace('.md', '').replace(/\\/g, '/');
        if (file === 'index.md' && basePath !== '') {
          // For index.md in subdirectory, use the directory name as slug
          slug = basePath;
        } else if (slug === 'index') {
          slug = '';
        }

        pages.push({
          slug: slug,
          title: meta.title || file,
          content: parseMarkdown(body)
        });
      }
    });
  }

  walk(path.join(__dirname, config.pagesDir));
  return pages;
}

// Minify CSS - remove comments and whitespace
function minifyCSS(css) {
  return css
    // Remove comments
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Remove unnecessary whitespace
    .replace(/\s+/g, ' ')
    // Remove whitespace around punctuation
    .replace(/\s*([{}:;,>+~])\s*/g, '$1')
    // Remove trailing semicolons before closing braces
    .replace(/;}/g, '}')
    // Remove leading/trailing whitespace
    .trim();
}

// Minify JS - remove comments and whitespace
function minifyJS(js) {
  return js
    // Remove single-line comments
    .replace(/\/\/[^\n]*/g, '')
    // Remove multi-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Remove unnecessary whitespace
    .replace(/\s+/g, ' ')
    // Remove whitespace around punctuation
    .replace(/\s*([{}()\[\]=<>+*/&-,:;])\s*/g, '$1')
    // Remove leading/trailing whitespace
    .trim();
}

// Generate main CSS
function generateCSS() {
  const css = fs.readFileSync(path.join(__dirname, config.themeDir, 'source/css/style.css'), 'utf8');
  return minifyCSS(css);
}

// Generate main JS
function generateJS() {
  const js = fs.readFileSync(path.join(__dirname, config.themeDir, 'source/js/main.js'), 'utf8');
  return minifyJS(js);
}

// Generate AdSense code
function generateAdSense() {
  const adsense = config.adsense;
  if (!adsense || !adsense.enabled) {
    return { head: '', top: '', bottom: '', sidebar: '' };
  }

  // Google official async loading - no custom detection
  const head = `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsense.client}" crossorigin="anonymous"></script>`;

  const top = adsense.slot_top ? `
  <div class="adsense adsense-top">
    <ins class="adsbygoogle"
         style="display:block"
         data-ad-client="${adsense.client}"
         data-ad-slot="${adsense.slot_top}"
         data-ad-format="auto"
         data-full-width-responsive="true"></ins>
  </div>
  ` : '';

  const bottom = adsense.slot_bottom ? `
  <div class="adsense adsense-bottom">
    <ins class="adsbygoogle"
         style="display:block"
         data-ad-client="${adsense.client}"
         data-ad-slot="${adsense.slot_bottom}"
         data-ad-format="auto"
         data-full-width-responsive="true"></ins>
  </div>
  ` : '';

  const sidebar = adsense.slot_sidebar ? `
  <div class="widget adsense-widget">
    <h3 class="widget-title">广告</h3>
    <ins class="adsbygoogle"
         style="display:block; width: 100%; height: 250px;"
         data-ad-client="${adsense.client}"
         data-ad-slot="${adsense.slot_sidebar}"
         data-ad-format="fluid"
         data-full-width-responsive="true"></ins>
  </div>
  ` : '';

  return { head, top, bottom, sidebar };
}

// Generate pagination HTML
function generatePagination(baseUrl, currentPage, totalPages) {
  if (totalPages <= 1) return '';

  // Handle index page (baseUrl = '/') differently
  let prevUrl, nextUrl;
  if (baseUrl === '/') {
    // Index page pagination
    prevUrl = currentPage > 1 ? (currentPage === 2 ? '/' : `/page/${currentPage - 1}/`) : '';
    nextUrl = currentPage < totalPages ? `/page/${currentPage + 1}/` : '';
  } else {
    // Category/tag pagination
    prevUrl = currentPage > 1 ? (currentPage === 2 ? baseUrl : `${baseUrl}${currentPage - 1}.html`) : '';
    nextUrl = currentPage < totalPages ? `${baseUrl}${currentPage + 1}.html` : '';
  }

  return `
<nav class="pagination">
  ${currentPage > 1 ? `<a href="${prevUrl}" class="prev">上一页</a>` : '<span class="disabled">上一页</span>'}
  <span class="page-info">${currentPage} / ${totalPages}</span>
  ${currentPage < totalPages ? `<a href="${nextUrl}" class="next">下一页</a>` : '<span class="disabled">下一页</span>'}
</nav>`;
}

// Generate robots.txt
function generateRobotsTxt() {
  const siteUrl = config.url.replace(/\/$/, '');
  return `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml

# Disallow admin and private pages
Disallow: /admin/
Disallow: /api/
`;
}

// Generate header HTML
function generateHeader(activePage = '') {
  return `
  <header class="site-header">
    <div class="header-container">
      <div class="site-logo">
        <a href="/">
          <svg class="logo-icon" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="40" height="40" rx="10" fill="url(#logo-gradient)"/>
            <path d="M12 12H28M12 20H24M12 28H20" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
            <circle cx="30" cy="30" r="6" fill="#10b981"/>
            <defs>
              <linearGradient id="logo-gradient" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                <stop stop-color="#4f46e5"/>
                <stop offset="1" stop-color="#312e81"/>
              </linearGradient>
            </defs>
          </svg>
          <span class="logo-text">BasicBit</span>
        </a>
      </div>
      <button class="mobile-menu-btn" aria-label="菜单" onclick="document.querySelector('.site-nav').classList.toggle('active')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <line x1="3" y1="12" x2="21" y2="12"></line>
          <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
      </button>
      <nav class="site-nav">
        <ul class="nav-list">
          <li><a href="/" class="${activePage === 'home' ? 'active' : ''}">首页</a></li>
          <li><a href="/category.html" class="${activePage === 'category' ? 'active' : ''}">分类</a></li>
          <li><a href="/tags.html" class="${activePage === 'tags' ? 'active' : ''}">标签</a></li>
          <li><a href="/about.html" class="${activePage === 'about' ? 'active' : ''}">关于</a></li>
        </ul>
      </nav>
      <div class="search-wrapper">
        <div class="search-box">
          <form action="/search" method="get" class="search-form" onsubmit="return handleSearchSubmit(this)">
            <input type="text" name="q" placeholder="搜索文章..." class="search-input">
            <button type="button" class="search-btn" onclick="handleSearchClick(this)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
              </svg>
            </button>
          </form>
        </div>
      </div>
    </div>
  </header>
  <!-- Mobile Search Button - Outside header for proper fixed positioning -->
  <button class="mobile-search-btn" aria-label="搜索" onclick="document.querySelector('.mobile-search-modal').classList.add('active')">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="8"></circle>
      <path d="m21 21-4.35-4.35"></path>
    </svg>
  </button>
  <!-- Mobile Search Modal -->
  <div class="mobile-search-modal" onclick="if(event.target === this) this.classList.remove('active')">
    <div class="mobile-search-content" onclick="event.stopPropagation()">
      <form action="/search" method="get" class="mobile-search-form" onsubmit="this.action='/search?q='+encodeURIComponent(this.q.value);">
        <input type="text" name="q" placeholder="搜索文章..." class="mobile-search-input" autofocus>
        <button type="submit" class="mobile-search-submit">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
        </button>
      </form>
    </div>
  </div>`;
}

// Generate footer HTML
function generateFooter() {
  return `
  <footer class="site-footer">
    <div class="footer-container">
      <div class="footer-content">
        <p>&copy; ${new Date().getFullYear()} BasicBit. All rights reserved.</p>
        <p>安全逆向技术文章博客</p>
      </div>
    </div>
  </footer>`;
}

// Generate sidebar
function generateSidebar(posts) {
  const categoryCounts = {};
  const tagCounts = {};

  posts.forEach(post => {
    post.categories.forEach(cat => {
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });
    post.tags.forEach(tag => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });

  // Get dynamic categories and tags from posts
  const allCategories = Object.keys(categoryCounts).sort((a, b) => categoryCounts[b] - categoryCounts[a]);
  const allTags = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]);

  // Category display names (can be extended)
  const categoryNames = {
    'reverse-engineering': '逆向工程',
    'malware-analysis': '恶意软件分析',
    'vulnerability-research': '漏洞研究',
    'ctf': 'CTF',
    'exploitation': '漏洞利用'
  };

  return `
  <aside class="sidebar">
    <div class="widget">
      <h3 class="widget-title">分类</h3>
      <ul class="category-list">
        ${allCategories.length > 0 ? allCategories.map(cat => `
        <li>
          <a href="/category/${cat}.html">${categoryNames[cat] || cat}</a>
          <span class="category-count">${categoryCounts[cat]}</span>
        </li>
        `).join('') : '<li><span class="category-count">暂无分类</span></li>'}
      </ul>
    </div>
    <div class="widget">
      <h3 class="widget-title">热门标签</h3>
      <div class="tag-cloud">
        ${allTags.length > 0 ? allTags.slice(0, 12).map(tag => `
        <a href="/tag/${tag}.html">${tag}</a>
        `).join('') : '<span class="category-count">暂无标签</span>'}
      </div>
    </div>
  </aside>`;
}

// Generate index page
function generateIndex(posts, pageNum = 1) {
  const css = generateCSS();
  const js = generateJS();

  const totalPages = Math.ceil(posts.length / config.postsPerPage);
  pageNum = Math.min(Math.max(1, pageNum), totalPages || 1);
  const startIdx = (pageNum - 1) * config.postsPerPage;
  const pagePosts = posts.slice(startIdx, startIdx + config.postsPerPage);

  const postsHTML = pagePosts.map(post => `
    <article class="post-card fade-in">
      <div style="margin-bottom: 1.5rem; border-radius: 12px; overflow: hidden; height: 200px; background: var(--color-bg-secondary);">
        <img src="/images/default-cover.svg" alt="Cover" style="width: 100%; height: 100%; object-fit: cover; opacity: 0.9; transition: transform 0.3s ease;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
      </div>
      <h2 class="post-title">
        <a href="/posts/${post.slug}.html">${post.title}</a>
      </h2>
      <div class="post-meta">
        <span>${new Date(post.date).toLocaleDateString('zh-CN')}</span>
        ${post.author ? `<span>${post.author}</span>` : ''}
        ${post.categories.length ? `<span>${post.categories[0]}</span>` : ''}
      </div>
      <div class="post-excerpt">
        ${post.description || post.content.replace(/<[^>]+>/g, '').substring(0, 150)}...
      </div>
      <div style="margin-top: 1.5rem;">
        <a href="/posts/${post.slug}.html" class="read-more">
          阅读全文
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14M12 5l7 7-7 7"></path>
          </svg>
        </a>
      </div>
    </article>
  `).join('');

  const pageTitle = pageNum > 1 ? `第${pageNum}页 - BasicBit` : 'BasicBit - 安全逆向技术文章翻译博客';
  const pagination = generatePagination('/', pageNum, totalPages);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pageTitle}</title>
  <meta name="description" content="安全逆向技术文章博客 - 逆向工程、恶意软件分析、漏洞研究">
  <link rel="icon" type="image/svg+xml" href="/images/favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
  <noscript><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet"></noscript>
  <style>${css}</style>
</head>
<body>
  ${generateHeader('home')}
  <main>
    <section class="home-hero">
      <div class="container">
        <h1 class="hero-title">思考，在此发生</h1>
        <p class="hero-subtitle">记录技术点滴，分享生活感悟。在这里，我们一起探索代码背后的逻辑与美学。</p>
      </div>
    </section>
    <div class="main-container">
      <div class="post-list">
${postsHTML || '<div class="no-results"><p>暂无文章，敬请期待...</p></div>'}
${pagination}
      </div>
${generateSidebar(posts)}
    </div>
  </main>
  ${generateFooter()}
  <script>${js}</script>
</body>
</html>`;
}

// Generate post page
function generatePost(post, allPosts) {
  const css = generateCSS();
  const js = generateJS();
  const adsense = generateAdSense();

  // Extract headings for TOC
  const headings = extractHeadings(post.rawContent || '');

  // Determine the minimum level in headings (to normalize for display)
  const minLevel = headings.length > 0 ? Math.min(...headings.map(h => h.level)) : 0;

  // Build TOC with hierarchical structure and fold support
  const tocHtml = headings.length > 0 ? (() => {
    // Group headings by their parent h1
    const tocItems = [];
    let currentH1 = null;

    headings.forEach((h, idx) => {
      const displayLevel = h.level - minLevel; // 0, 1, 2, 3

      if (displayLevel === 0) {
        // New h1 section
        currentH1 = {
          item: h,
          children: [],
          id: idx
        };
        tocItems.push(currentH1);
      } else if (currentH1) {
        // Child of current h1
        currentH1.children.push(h);
      }
    });

    return `
    <nav class="post-toc">
      <div class="toc-title">目录</div>
      <ul class="toc-list">
        ${tocItems.map((section, idx) => `
          <li class="toc-item toc-level-0${section.children.length > 0 ? ' has-children' : ''}">
            <a href="#${section.item.slug}" class="toc-link">
              <span class="toc-text">${section.item.text}</span>
              ${section.children.length > 0 ? `
                <button class="toc-fold-btn" onclick="toggleTocSection(this)" title="折叠/展开">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>
              ` : ''}
            </a>
            ${section.children.length > 0 ? `
              <ul class="toc-sublist">
                ${section.children.map(child => {
                  const childLevel = child.level - minLevel;
                  return `
                  <li class="toc-item toc-level-${childLevel}">
                    <a href="#${child.slug}" class="toc-link">${child.text}</a>
                  </li>
                `}).join('')}
              </ul>
            ` : ''}
          </li>
        `).join('')}
      </ul>
    </nav>
    `;
  })() : '';

  const actionButtons = post.original_url ? `
    <div class="article-actions">
      <a href="${post.original_url}" class="action-btn primary" target="_blank" rel="noopener">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
          <polyline points="15 3 21 3 21 9"></polyline>
          <line x1="10" y1="14" x2="21" y2="3"></line>
        </svg>
        访问原始链接
      </a>
      <a href="https://translate.google.com/translate?sl=auto&tl=zh-CN&u=${encodeURIComponent(post.original_url)}" class="action-btn secondary" target="_blank" rel="noopener">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="2" y1="12" x2="22" y2="12"></line>
        </svg>
        Google 翻译
      </a>
    </div>
  ` : '';

  const tagsSection = post.tags.length ? `
  <div class="post-tags">
    <span>标签:</span>
    ${post.tags.map(t => `<a href="/tag/${t}.html" class="tag-link">#${t}</a>`).join(' ')}
  </div>
  ` : '';

  const hasToc = headings.length > 0;

  // TOC toggle script
  const tocScript = `
    <script>
      function toggleTocSection(btn) {
        btn.classList.toggle('collapsed');
        const sublist = btn.closest('.toc-item').querySelector('.toc-sublist');
        if (sublist) {
          sublist.classList.toggle('collapsed');
        }
      }
    </script>
  `;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${post.title} - BasicBit</title>
  <meta name="description" content="${post.description || post.title}">
  <link rel="icon" type="image/svg+xml" href="/images/favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
  <noscript><link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet"></noscript>
  ${adsense.head}
  <style>${css}</style>
</head>
<body>
  ${generateHeader()}
  <main>
    <div class="main-container${hasToc ? ' post-page-with-toc' : ' post-page-no-toc'}">
      <article class="post-content">
        <header class="post-header">
          <h1 class="post-title">${post.title}</h1>
          <div class="article-meta">
            <span class="meta-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              ${new Date(post.date).toLocaleDateString('zh-CN')}
            </span>
            ${post.author ? `<span class="meta-item">${post.author}</span>` : ''}
            ${post.categories.length ? `<span class="meta-item">${post.categories.join(', ')}</span>` : ''}
          </div>
        </header>
        ${adsense.top}
        ${actionButtons}
        <div class="post-body">
          ${post.content}
        </div>
        ${tagsSection}
        ${adsense.bottom}
      </article>
      ${tocHtml}
    </div>
  </main>
  ${generateFooter()}
  <script>${js}</script>
  ${tocScript || ''}
</body>
</html>`;
}

// Generate page
function generatePage(page, posts) {
  const css = generateCSS();

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${page.title} - BasicBit</title>
  <link rel="icon" type="image/svg+xml" href="/images/favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
  <noscript><link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet"></noscript>
  <style>${css}</style>
</head>
<body>
  ${generateHeader(page.slug === 'about' ? 'about' : '')}
  <main>
    <div class="about-content">
      ${page.content}
    </div>
  </main>
  ${generateFooter()}
</body>
</html>`;
}

// Generate category page
function generateCategory(categoryId, posts, pageNum = 1) {
  const category = categoriesData.find(c => c.id === categoryId) || { name: categoryId, description: '' };
  const categoryPosts = posts.filter(p => p.categories.includes(categoryId));

  const totalPages = Math.ceil(categoryPosts.length / config.postsPerPage);
  pageNum = Math.min(Math.max(1, pageNum), totalPages || 1);
  const startIdx = (pageNum - 1) * config.postsPerPage;
  const pagePosts = categoryPosts.slice(startIdx, startIdx + config.postsPerPage);

  const css = generateCSS();

  const postsHTML = pagePosts.map(post => `
    <article class="post-card fade-in">
      <h2 class="post-title">
        <a href="/posts/${post.slug}.html">${post.title}</a>
      </h2>
      <div class="post-meta">
        <span>${new Date(post.date).toLocaleDateString('zh-CN')}</span>
        ${post.author ? `<span>${post.author}</span>` : ''}
      </div>
      <div class="post-excerpt">
        <p>${post.description || post.content.replace(/<[^>]+>/g, '').substring(0, 150)}...</p>
      </div>
      <a href="/posts/${post.slug}.html" class="read-more">阅读全文</a>
    </article>
  `).join('');

  const pageTitle = pageNum > 1 ? `${category.name} - 第${pageNum}页` : category.name;
  const pagination = generatePagination(`/category/${categoryId}/`, pageNum, totalPages);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pageTitle} - BasicBit</title>
  <link rel="icon" type="image/svg+xml" href="/images/favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
  <noscript><link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet"></noscript>
  <style>${css}</style>
</head>
<body>
  ${generateHeader('category')}
  <main>
    <div class="main-container">
      <div class="post-list">
        <div class="page-header">
          <h1>${category.name}</h1>
          <p>${category.description} (${categoryPosts.length} 篇文章)</p>
        </div>
${postsHTML || '<div class="no-results"><p>该分类下暂无文章</p></div>'}
${pagination}
      </div>
${generateSidebar(posts)}
    </div>
  </main>
  ${generateFooter()}
</body>
</html>`;
}

// Generate tag page
function generateTag(tagName, posts, pageNum = 1) {
  const tagPosts = posts.filter(p => p.tags.includes(tagName));

  const totalPages = Math.ceil(tagPosts.length / config.postsPerPage);
  pageNum = Math.min(Math.max(1, pageNum), totalPages || 1);
  const startIdx = (pageNum - 1) * config.postsPerPage;
  const pagePosts = tagPosts.slice(startIdx, startIdx + config.postsPerPage);

  const css = generateCSS();

  const postsHTML = pagePosts.map(post => `
    <article class="post-card fade-in">
      <h2 class="post-title">
        <a href="/posts/${post.slug}.html">${post.title}</a>
      </h2>
      <div class="post-meta">
        <span>${new Date(post.date).toLocaleDateString('zh-CN')}</span>
        ${post.author ? `<span>${post.author}</span>` : ''}
      </div>
      <div class="post-excerpt">
        <p>${post.description || post.content.replace(/<[^>]+>/g, '').substring(0, 150)}...</p>
      </div>
      <a href="/posts/${post.slug}.html" class="read-more">阅读全文</a>
    </article>
  `).join('');

  const pageTitle = pageNum > 1 ? `#${tagName} - 第${pageNum}页` : `#${tagName}`;
  const pagination = generatePagination(`/tag/${tagName}/`, pageNum, totalPages);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pageTitle} - BasicBit</title>
  <link rel="icon" type="image/svg+xml" href="/images/favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
  <noscript><link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet"></noscript>
  <style>${css}</style>
</head>
<body>
  ${generateHeader('tags')}
  <main>
    <div class="main-container">
      <div class="post-list">
        <div class="page-header">
          <h1>#${tagName}</h1>
          <p>${tagPosts.length} 篇文章</p>
        </div>
${postsHTML || '<div class="no-results"><p>该标签下暂无文章</p></div>'}
${pagination}
      </div>
${generateSidebar(posts)}
    </div>
  </main>
  ${generateFooter()}
</body>
</html>`;
}

// Generate category index
function generateCategoryIndex(posts) {
  const css = generateCSS();

  // Get unique categories from posts
  const categorySet = new Set();
  posts.forEach(post => {
    post.categories.forEach(cat => {
      categorySet.add(cat);
    });
  });

  const allCategories = Array.from(categorySet);

  const categoryCounts = {};
  const categoryDescriptions = {
    'reverse-engineering': '逆向分析技术文章',
    'malware-analysis': '恶意代码分析',
    'vulnerability-research': '漏洞挖掘与研究',
    'ctf': 'CTF比赛Writeup',
    'exploitation': '漏洞利用技术'
  };

  posts.forEach(post => {
    post.categories.forEach(cat => {
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });
  });

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>分类 - BasicBit</title>
  <link rel="icon" type="image/svg+xml" href="/images/favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
  <noscript><link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet"></noscript>
  <style>${css}</style>
</head>
<body>
  ${generateHeader('category')}
  <main>
    <div class="main-container">
      <div class="post-list">
        <div class="page-header">
          <h1>所有分类</h1>
          <p>按分类浏览文章 (${allCategories.length} 个分类)</p>
        </div>
        <div class="category-grid">
          ${allCategories.map(cat => `
          <article class="post-card">
            <h2 class="post-title">
              <a href="/category/${cat}.html">${cat}</a>
            </h2>
            <p class="post-excerpt">${categoryDescriptions[cat] || '分类文章集合'}</p>
            <span class="category-count">${categoryCounts[cat] || 0} 篇文章</span>
          </article>
          `).join('')}
        </div>
      </div>
      ${generateSidebar(posts)}
    </div>
  </main>
  ${generateFooter()}
</body>
</html>`;
}

// Generate tags index
function generateTagsIndex(posts) {
  const css = generateCSS();

  const tagCounts = {};
  posts.forEach(post => {
    post.tags.forEach(tag => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });

  const allTags = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]);

  // Tag descriptions (optional - can be extended)
  const tagDescriptions = {
    'vulnerability': '漏洞研究相关文章',
    'exploit': '漏洞利用技术文章',
    'Make zeroday hard.': 'Project Zero 安全研究'
  };

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>标签 - BasicBit</title>
  <link rel="icon" type="image/svg+xml" href="/images/favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
  <noscript><link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet"></noscript>
  <style>${css}</style>
</head>
<body>
  ${generateHeader('tags')}
  <main>
    <div class="main-container">
      <div class="post-list">
        <div class="page-header">
          <h1>所有标签</h1>
          <p>按标签浏览文章 (${allTags.length} 个标签)</p>
        </div>
        <div class="category-grid">
          ${allTags.map(tag => `
          <article class="post-card">
            <h2 class="post-title">
              <a href="/tag/${tag}.html">#${tag}</a>
            </h2>
            <p class="post-excerpt">${tagDescriptions[tag] || '标签文章集合'}</p>
            <span class="category-count">${tagCounts[tag]} 篇文章</span>
          </article>
          `).join('')}
        </div>
      </div>
      ${generateSidebar(posts)}
    </div>
  </main>
  ${generateFooter()}
</body>
</html>`;
}

// Generate search page
function generateSearchPage(query, posts) {
  const css = generateCSS();
  const js = generateJS();

  const results = query
    ? posts.filter(p => {
        const searchText = (p.title + ' ' + p.description + ' ' + p.tags.join(' ')).toLowerCase();
        return searchText.includes(query.toLowerCase());
      })
    : [];

  const resultsHTML = results.map(post => `
    <article class="post-card fade-in">
      <h2 class="post-title">
        <a href="/posts/${post.slug}.html">${post.title}</a>
      </h2>
      <div class="post-meta">
        <span>${new Date(post.date).toLocaleDateString('zh-CN')}</span>
      </div>
      <div class="post-excerpt">
        <p>${post.description || post.content.replace(/<[^>]+>/g, '').substring(0, 150)}...</p>
      </div>
      <a href="/posts/${post.slug}.html" class="read-more">阅读全文</a>
    </article>
  `).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>搜索 - BasicBit</title>
  <link rel="icon" type="image/svg+xml" href="/images/favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
  <noscript><link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet"></noscript>
  <style>${css}</style>
</head>
<body>
  ${generateHeader()}
  <main>
    <div class="main-container">
      <div class="post-list">
        <div class="page-header">
          <h1>搜索结果</h1>
          <p>请在顶部搜索框输入关键词搜索文章</p>
        </div>
        <div id="search-results" class="search-results">
          <div class="loading">加载搜索数据...</div>
        </div>
      </div>
      ${generateSidebar(posts)}
    </div>
  </main>
  ${generateFooter()}
  <script>${js}</script>
</body>
</html>`;
}

// Copy directory recursively
function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;

  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Build function
function build() {
  console.log('Building BasicBit site...');

  // Clean public directory
  if (fs.existsSync(config.public)) {
    fs.rmSync(config.public, { recursive: true });
  }
  fs.mkdirSync(config.public, { recursive: true });

  // Create .nojekyll to prevent GitHub Pages from using Jekyll
  fs.writeFileSync(path.join(config.public, '.nojekyll'), '');

  // Generate robots.txt
  fs.writeFileSync(path.join(config.public, 'robots.txt'), generateRobotsTxt());
  console.log('Generated robots.txt');

  // Generate CNAME
  fs.writeFileSync(path.join(config.public, 'CNAME'), 'basicbit.cn');
  console.log('Generated CNAME');

  // Generate ads.txt
  const adsense = config.adsense;
  if (adsense && adsense.enabled && adsense.client) {
    // Extract numeric ID from ca-pub-XXXXXXXX format
    const adsenseId = adsense.client.replace('ca-pub-', '');
    fs.writeFileSync(path.join(config.public, 'ads.txt'), `google.com, pub-${adsenseId}, DIRECT, f08c47fec0942fa0\n`);
    console.log('Generated ads.txt');
  }

  // Copy images directory
  copyDir(path.join(config.source, 'images'), path.join(config.public, 'images'));
  console.log('Copied images directory');

  // Get content
  const posts = getPosts();
  const pages = getPages();

  console.log(`Found ${posts.length} posts and ${pages.length} pages`);

  // Generate index with pagination
  const totalIndexPages = Math.ceil(posts.length / config.postsPerPage);
  for (let page = 1; page <= totalIndexPages; page++) {
    const pagePath = page === 1
      ? path.join(config.public, 'index.html')
      : path.join(config.public, 'page', `${page}`, 'index.html');

    // Ensure directory exists
    if (page > 1) {
      const pageDir = path.join(config.public, 'page', `${page}`);
      if (!fs.existsSync(pageDir)) {
        fs.mkdirSync(pageDir, { recursive: true });
      }
    }

    fs.writeFileSync(pagePath, generateIndex(posts, page));
  }
  console.log(`Generated ${totalIndexPages} index pages`);

  // Generate posts
  posts.forEach(post => {
    const postDir = path.join(config.public, 'posts');
    if (!fs.existsSync(postDir)) {
      fs.mkdirSync(postDir, { recursive: true });
    }
    fs.writeFileSync(path.join(postDir, `${post.slug}.html`), generatePost(post, posts));
  });
  console.log(`Generated ${posts.length} posts`);

  // Generate pages
  pages.forEach(page => {
    const pagePath = page.slug ? page.slug.split('/') : [];
    const dir = path.join(config.public, ...pagePath.slice(0, -1));

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filename = page.slug === '' || page.slug === 'about' ? 'index.html' : `${page.slug.split('/').pop()}.html`;
    const filePath = page.slug ? path.join(dir, filename) : path.join(config.public, 'index.html');

    if (page.slug !== '' && page.slug !== 'about') {
      fs.writeFileSync(filePath, generatePage(page, posts));
    }
  });

  // Generate about page if not exists
  if (!fs.existsSync(path.join(config.public, 'about.html'))) {
    const aboutPage = pages.find(p => p.slug === 'about');
    if (aboutPage) {
      fs.writeFileSync(path.join(config.public, 'about.html'), generatePage(aboutPage, posts));
      console.log('Generated about.html');
    }
  }

  // Generate category index
  fs.writeFileSync(path.join(config.public, 'category.html'), generateCategoryIndex(posts));
  console.log('Generated category.html');

  // Generate categories with pagination - dynamic from posts
  let totalCategoryPages = 0;

  // Get unique categories from all posts
  const postCategories = new Set();
  posts.forEach(post => {
    post.categories.forEach(cat => postCategories.add(cat));
  });

  // Generate pages for each category found in posts
  postCategories.forEach(catId => {
    const categoryPosts = posts.filter(p => p.categories.includes(catId));
    const totalPages = Math.ceil(categoryPosts.length / config.postsPerPage);
    totalCategoryPages += totalPages;

    const catDir = path.join(config.public, 'category');
    if (!fs.existsSync(catDir)) {
      fs.mkdirSync(catDir, { recursive: true });
    }

    for (let page = 1; page <= totalPages; page++) {
      const pagePath = page === 1
        ? path.join(catDir, `${catId}.html`)
        : path.join(catDir, `${catId}`, `${page}.html`);

      // Ensure directory exists for pages > 1
      if (page > 1) {
        const pageDir = path.join(catDir, `${catId}`);
        if (!fs.existsSync(pageDir)) {
          fs.mkdirSync(pageDir, { recursive: true });
        }
      }

      fs.writeFileSync(pagePath, generateCategory(catId, posts, page));
    }
  });
  console.log(`Generated ${totalCategoryPages} category pages`);

  // Generate tags index
  fs.writeFileSync(path.join(config.public, 'tags.html'), generateTagsIndex(posts));
  console.log('Generated tags.html');

  // Generate tag pages with pagination
  const allTags = new Set();
  posts.forEach(post => post.tags.forEach(tag => allTags.add(tag)));

  let totalTagPages = 0;
  allTags.forEach(tag => {
    const tagPosts = posts.filter(p => p.tags.includes(tag));
    const totalPages = Math.ceil(tagPosts.length / config.postsPerPage);
    totalTagPages += totalPages;

    const tagDir = path.join(config.public, 'tag');
    if (!fs.existsSync(tagDir)) {
      fs.mkdirSync(tagDir, { recursive: true });
    }

    for (let page = 1; page <= totalPages; page++) {
      const pagePath = page === 1
        ? path.join(tagDir, `${tag}.html`)
        : path.join(tagDir, `${tag}`, `${page}.html`);

      // Ensure directory exists for pages > 1
      if (page > 1) {
        const pageDir = path.join(tagDir, `${tag}`);
        if (!fs.existsSync(pageDir)) {
          fs.mkdirSync(pageDir, { recursive: true });
        }
      }

      fs.writeFileSync(pagePath, generateTag(tag, posts, page));
    }
  });
  console.log(`Generated ${totalTagPages} tag pages`);

  // Generate search page
  fs.writeFileSync(path.join(config.public, 'search.html'), generateSearchPage('', posts));
  console.log('Generated search.html');

  // Generate search index JSON
  generateSearchIndex(posts);

  // Generate sitemap.xml
  generateSitemapXml(posts, pages);

  console.log('Build complete!');
}

// Generate search index JSON
function generateSearchIndex(posts) {
  const searchData = posts.map(post => ({
    title: post.title,
    url: `/posts/${post.slug}.html`,
    excerpt: post.description || post.content.replace(/<[^>]+>/g, '').substring(0, 200),
    date: post.date,
    categories: post.categories,
    tags: post.tags
  }));

  fs.writeFileSync(
    path.join(config.public, 'search.json'),
    JSON.stringify(searchData, null, 2)
  );
  console.log('Generated search.json');
}

// Generate sitemap.xml
function generateSitemapXml(posts, pages) {
  const siteUrl = config.url.replace(/\/$/, '');
  const today = new Date().toISOString().split('T')[0];

  let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;

  // Helper function to add URL entry
  function addUrl(loc, priority, changefreq = 'monthly') {
    sitemap += `  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>
`;
  }

  // Home page (index)
  const totalIndexPages = Math.ceil(posts.length / config.postsPerPage);
  addUrl(`${siteUrl}/`, '1.0', 'daily');

  // Home pagination pages
  for (let page = 2; page <= totalIndexPages; page++) {
    addUrl(`${siteUrl}/page/${page}/`, '0.8', 'weekly');
  }

  // Category index
  addUrl(`${siteUrl}/category.html`, '0.8', 'weekly');

  // Categories with pagination - dynamic from posts
  const allCategories = new Set();
  posts.forEach(post => post.categories.forEach(cat => allCategories.add(cat)));

  allCategories.forEach(catId => {
    const categoryPosts = posts.filter(p => p.categories.includes(catId));
    const totalCategoryPages = Math.ceil(categoryPosts.length / config.postsPerPage);

    // Category pagination pages
    for (let page = 2; page <= totalCategoryPages; page++) {
      addUrl(`${siteUrl}/category/${catId}/${page}.html`, '0.7', 'weekly');
    }
  });

  // Tags index
  addUrl(`${siteUrl}/tags.html`, '0.8', 'weekly');

  // Tags with pagination
  const allTags = new Set();
  posts.forEach(post => post.tags.forEach(tag => allTags.add(tag)));

  allTags.forEach(tag => {
    const tagPosts = posts.filter(p => p.tags.includes(tag));
    const totalTagPages = Math.ceil(tagPosts.length / config.postsPerPage);

    // Tag pagination pages
    for (let page = 2; page <= totalTagPages; page++) {
      addUrl(`${siteUrl}/tag/${tag}/${page}.html`, '0.7', 'weekly');
    }
  });

  // About page
  addUrl(`${siteUrl}/about.html`, '0.6', 'monthly');

  // Add posts
  posts.forEach(post => {
    const postDate = new Date(post.date).toISOString().split('T')[0];
    sitemap += `  <url>
    <loc>${siteUrl}/posts/${post.slug}.html</loc>
    <lastmod>${postDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
`;
  });

  // Add custom pages
  pages.forEach(page => {
    if (page.slug && page.slug !== '' && page.slug !== 'about') {
      const pageUrl = page.slug.endsWith('/') ? page.slug : page.slug + '/';
      sitemap += `  <url>
    <loc>${siteUrl}/${pageUrl}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
`;
    }
  });

  sitemap += '</urlset>';

  fs.writeFileSync(path.join(config.public, 'sitemap.xml'), sitemap);
  console.log('Generated sitemap.xml with pagination support');
}

build();
