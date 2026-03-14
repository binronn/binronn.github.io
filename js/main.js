// BasicBit - Main JavaScript

document.addEventListener('DOMContentLoaded', function() {
  // Mobile menu toggle
  const menuToggle = document.querySelector('.mobile-menu-btn');
  const siteNav = document.querySelector('.site-nav');
  if (menuToggle && siteNav) {
    menuToggle.addEventListener('click', function() {
      const isExpanded = this.getAttribute('aria-expanded') === 'true';
      this.setAttribute('aria-expanded', !isExpanded);
      siteNav.classList.toggle('active');
    });
  }

  // Mobile search modal
  const mobileSearchBtn = document.querySelector('.mobile-search-btn');
  const mobileSearchModal = document.querySelector('.mobile-search-modal');
  const mobileSearchClose = document.querySelector('.mobile-search-close');
  const mobileSearchInput = document.querySelector('.mobile-search-input');

  if (mobileSearchBtn && mobileSearchModal) {
    // Open modal
    mobileSearchBtn.addEventListener('click', function() {
      mobileSearchModal.classList.add('active');
      mobileSearchBtn.setAttribute('aria-expanded', 'true');
      if (mobileSearchInput) {
        setTimeout(() => mobileSearchInput.focus(), 100);
      }
    });

    // Close modal
    if (mobileSearchClose) {
      mobileSearchClose.addEventListener('click', function() {
        mobileSearchModal.classList.remove('active');
        mobileSearchBtn.setAttribute('aria-expanded', 'false');
      });
    }

    // Close on backdrop click
    mobileSearchModal.addEventListener('click', function(e) {
      if (e.target === mobileSearchModal) {
        mobileSearchModal.classList.remove('active');
        mobileSearchBtn.setAttribute('aria-expanded', 'false');
      }
    });

    // Close on ESC key
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && mobileSearchModal.classList.contains('active')) {
        mobileSearchModal.classList.remove('active');
        mobileSearchBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      if (href !== '#') {
        e.preventDefault();
        const target = document.querySelector(href);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });
  });

  // Handle Enter key on search input
  const searchInput = document.querySelector('.search-input');
  if (searchInput) {
    searchInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const query = this.value.trim();
        if (query) {
          window.location.href = '/search?q=' + encodeURIComponent(query);
        } else {
          alert('请输入搜索关键词');
        }
      }
    });

    // Handle search button click
    const searchBtn = document.querySelector('.search-btn');
    if (searchBtn) {
      searchBtn.addEventListener('click', function(e) {
        e.preventDefault();
        const query = searchInput.value.trim();
        if (query) {
          window.location.href = '/search?q=' + encodeURIComponent(query);
        } else {
          alert('请输入搜索关键词');
        }
      });
    }
  }

  // Initialize search on search page
  initSearchOnPage();

  // Highlight code blocks
  initCodeHighlighting();
});

// Search functionality for search page
function initSearchOnPage() {
  const searchResults = document.getElementById('search-results');
  if (!searchResults) return;

  const params = new URLSearchParams(window.location.search);
  const query = params.get('q');

  if (query) {
    searchResults.innerHTML = '<div class="loading">搜索中...</div>';
    performSearch(query, searchResults);
  } else {
    searchResults.innerHTML = '<div class="no-results">请在顶部搜索框输入关键词搜索文章</div>';
  }
}

function performSearch(query, container) {
  if (!container) {
    container = document.getElementById('search-results');
  }

  // Fetch search index
  fetch('/search.json')
    .then(response => response.json())
    .then(data => {
      const results = data.filter(item => {
        const searchText = (item.title + ' ' + item.excerpt + ' ' + item.tags.join(' ')).toLowerCase();
        return searchText.includes(query.toLowerCase());
      });
      displaySearchResults(results, container);
    })
    .catch(err => {
      console.log('Search error:', err);
      container.innerHTML = '<div class="no-results">搜索加载失败，请刷新页面重试</div>';
    });
}

function displaySearchResults(results, container) {
  if (!container) {
    container = document.getElementById('search-results');
  }
  if (!container) return;

  if (results.length === 0) {
    container.innerHTML = '<div class="no-results">没有找到相关文章</div>';
    return;
  }

  container.innerHTML = results.map(result => `
    <article class="post-card fade-in">
      <h2 class="post-title">
        <a href="${result.url}">${result.title}</a>
      </h2>
      <div class="post-excerpt">
        <p>${result.excerpt || ''}</p>
      </div>
      <a href="${result.url}" class="read-more">
        阅读全文
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M5 12h14M12 5l7 7-7 7"></path>
        </svg>
      </a>
    </article>
  `).join('');
}

// Search button click handler
function handleSearchClick(btn) {
  const searchInput = document.querySelector('.search-input');
  if (searchInput) {
    const query = searchInput.value.trim();
    if (query) {
      window.location.href = '/search?q=' + encodeURIComponent(query);
    } else {
      alert('请输入搜索关键词');
    }
  }
}

// Code highlighting placeholder
function initCodeHighlighting() {
  // Code highlighting can be added with Prism.js or highlight.js
}

// URL params helper
function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const urlParams = {};
  for (const [key, value] of params) {
    urlParams[key] = value;
  }
  return urlParams;
}
